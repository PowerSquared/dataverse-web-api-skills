/*
 * dataverse-client.mjs — shared authentication and Dataverse Web API transport.
 *
 * Reuses the sign-in created by the Power Apps CLI (`npx pa auth login`). The CLI
 * persists its tokens with MSAL in an encrypted cache. We rebuild an MSAL
 * PublicClientApplication with the same client id and cache settings, then acquire
 * a Dataverse token silently.
 *
 * The CLI does not expose a supported token API, so the cache path, client id, and
 * active-account format below are a compatibility boundary with
 * @microsoft/power-apps-cli 0.15.1.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { PublicClientApplication } from '@azure/msal-node';
import {
  DataProtectionScope,
  PersistenceCachePlugin,
  PersistenceCreator,
} from '@azure/msal-node-extensions';

// Mirrored from @microsoft/power-apps-cli 0.15.1.
const CLI_CLIENT_ID = '9cee029c-6210-4654-90bb-17e6e9d36617';
const CLI_CONFIG_DIRECTORY =
  process.env.PA_CLI_CONFIG_DIR || path.join(os.homedir(), '.powerapps-cli');
const AUTH_CACHE_DIRECTORY = path.join(CLI_CONFIG_DIRECTORY, 'cache', 'auth');
const ACTIVE_ACCOUNT_FILE = path.join(AUTH_CACHE_DIRECTORY, 'active-account.json');

const CLOUDS = new Map([
  ['public', 'public'],
  ['usgov', 'usgov'],
  ['usgovhigh', 'usgovhigh'],
  ['usgovdod', 'usgovdod'],
  ['china', 'china'],
]);

function normalizeCloud(value = 'public') {
  const key = String(value).trim().toLowerCase();
  const cloud = CLOUDS.get(key);
  if (!cloud) {
    throw new Error(
      `Unsupported Dataverse cloud '${value}'. Use: ${[...CLOUDS.keys()].join(', ')}.`
    );
  }
  return cloud;
}

/** Pick the Microsoft Entra login host for the Dataverse cloud. */
function getAuthority(cloud, tenantId = 'organizations') {
  switch (cloud) {
    case 'usgovhigh':
    case 'usgovdod':
      return `https://login.microsoftonline.us/${tenantId}`;
    case 'china':
      return `https://login.partner.microsoftonline.cn/${tenantId}`;
    default:
      return `https://login.microsoftonline.com/${tenantId}`;
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return undefined;
  }
}

/** Validate the environment selected for the current operation. */
export function validateEnvironment({ orgUrl, cloud = 'public' } = {}) {
  const orgUrlValue = String(orgUrl ?? '').trim();
  if (!orgUrlValue) {
    throw new Error(
      'A Dataverse environment URL is required. Ask the user which environment to use, then pass its HTTPS URL.'
    );
  }
  const normalizedOrgUrl = orgUrlValue.replace(/\/+$/, '');
  let parsedUrl;
  try {
    parsedUrl = new URL(normalizedOrgUrl);
  } catch {
    throw new Error('Dataverse environment URL must be an absolute URL.');
  }
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Dataverse environment URL must use HTTPS.');
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('Dataverse environment URL must not include credentials.');
  }
  if (parsedUrl.pathname !== '/' || parsedUrl.search || parsedUrl.hash) {
    throw new Error('Dataverse environment URL must not include a path, query string, or fragment.');
  }

  return { orgUrl: parsedUrl.origin, cloud: normalizeCloud(cloud) };
}

/** Read the CLI's active-account pointer (matches ActiveAccountStore). */
function readActiveAccount() {
  const parsed = readJson(ACTIVE_ACCOUNT_FILE);
  if (parsed && typeof parsed.homeAccountId === 'string' && parsed.homeAccountId.length > 0) {
    return parsed;
  }
  return undefined;
}

/** Mirror of NodeMsalAuthenticationProvider._pickActiveAccount. */
function pickActiveAccount(accounts) {
  if (accounts.length === 0) return undefined;
  if (accounts.length === 1) return accounts[0];
  const active = readActiveAccount();
  if (!active) return undefined;
  return accounts.find((a) => a.homeAccountId === active.homeAccountId);
}

/**
 * Acquire a Dataverse access token silently for `<orgUrl>/.default`, reusing the
 * tokens written by `npx pa auth login`. This scope matches the Power Apps CLI's
 * own public-client token implementation. Throws an actionable error if the user
 * is not signed in or the token can't be renewed without interaction.
 */
export async function getAccessToken(environment) {
  const { orgUrl, cloud } = validateEnvironment(environment);
  if (!fs.existsSync(path.join(AUTH_CACHE_DIRECTORY, 'msal_cache.json'))) {
    throw new Error(
      'No Power Apps CLI sign-in found. Sign in first with:\n  npx pa auth login'
    );
  }

  const persistence = await PersistenceCreator.createPersistence({
    cachePath: path.join(AUTH_CACHE_DIRECTORY, 'msal_cache.json'),
    dataProtectionScope: DataProtectionScope.CurrentUser,
    serviceName: 'power-apps',
    accountName: 'power-apps',
    usePlaintextFileOnLinux: false,
  });

  const pca = new PublicClientApplication({
    auth: { authority: getAuthority(cloud), clientId: CLI_CLIENT_ID },
    cache: { cachePlugin: new PersistenceCachePlugin(persistence) },
  });

  const cache = pca.getTokenCache();
  const accounts = await cache.getAllAccounts();
  if (accounts.length === 0) {
    throw new Error('No cached accounts. Sign in with:  npx pa auth login');
  }
  const account = pickActiveAccount(accounts);
  if (!account) {
    const names = accounts.map((a) => `  - ${a.username}`).join('\n');
    throw new Error(
      `Multiple accounts are cached and none is marked active:\n${names}\n` +
        'Select one with:  npx pa auth switch --account <email>'
    );
  }

  const scope = `${orgUrl.replace(/\/+$/, '')}/.default`;
  try {
    const result = await pca.acquireTokenSilent({ account, scopes: [scope] });
    return { accessToken: result.accessToken, account, expiresOn: result.expiresOn };
  } catch (err) {
    throw new Error(
      `Could not get a Dataverse token silently for ${orgUrl}.\n` +
        `Reason: ${err?.message ?? err}\n` +
        'Refresh the Power Apps CLI sign-in, then retry:\n' +
        '  npx pa auth login'
    );
  }
}

/**
 * A tiny authenticated Dataverse Web API client. Paths are relative to
 * `<orgUrl>/api/data/v9.2` unless they start with http(s).
 */
export function createClient({ orgUrl, accessToken, apiVersion = 'v9.2' }) {
  const { orgUrl: normalizedOrgUrl } = validateEnvironment({ orgUrl });
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new Error('A Dataverse access token is required to create the client.');
  }
  if (!/^v\d+\.\d+$/.test(apiVersion)) {
    throw new Error(`Unsupported Dataverse Web API version '${apiVersion}'.`);
  }

  const apiRoot = new URL(`${normalizedOrgUrl}/api/data/${apiVersion}/`);
  const base = apiRoot.toString().replace(/\/$/, '');
  const apiPath = apiRoot.pathname.replace(/\/$/, '');

  function ensureApiUrl(url) {
    if (url.origin !== apiRoot.origin || (url.pathname !== apiPath && !url.pathname.startsWith(`${apiPath}/`))) {
      throw new Error('Dataverse requests must stay within the selected environment Web API.');
    }
    return url.toString();
  }

  function resolveRequestUrl(requestPath) {
    if (typeof requestPath !== 'string' || requestPath.length === 0) {
      throw new TypeError('Dataverse request path must be a non-empty string.');
    }
    if (requestPath.startsWith('//')) {
      throw new Error('Dataverse request paths cannot be protocol-relative URLs.');
    }
    if (/^https?:\/\//i.test(requestPath)) {
      return ensureApiUrl(new URL(requestPath));
    }

    const relativePath = requestPath.startsWith('/') ? requestPath.slice(1) : requestPath;
    return ensureApiUrl(new URL(relativePath, `${base}/`));
  }

  async function request(method, p, body, extraHeaders = {}) {
    const url = resolveRequestUrl(p);
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    };
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg = data?.error?.message ?? res.statusText ?? text;
      const e = new Error(`${method} ${url} → ${res.status} ${msg}`);
      e.status = res.status;
      e.data = data;
      throw e;
    }
    return { status: res.status, data, headers: res.headers };
  }

  return {
    base,
    get: (p, h) => request('GET', p, undefined, h),
    post: (p, b, h) => request('POST', p, b, h),
    patch: (p, b, h) => request('PATCH', p, b, h),
    put: (p, b, h) => request('PUT', p, b, h),
    del: (p, h) => request('DELETE', p, undefined, h),
    request,
  };
}