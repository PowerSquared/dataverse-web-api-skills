# Dataverse Web API Skill

A GitHub Copilot skill for authenticating to a user-selected Microsoft Dataverse environment and making authenticated Dataverse Web API requests.

It reuses the encrypted sign-in cache created by the Power Apps CLI, so access tokens are acquired silently and never need to be copied into the workspace.

## What it provides

- A Copilot skill at `.agents/skills/dataverse-web-api/SKILL.md`
- Environment URL and cloud validation
- Silent token acquisition from the Power Apps CLI token cache
- An authenticated client for Dataverse Web API `v9.2`
- URL containment that rejects requests outside the selected environment's Web API

The client supports `GET`, `POST`, `PATCH`, `PUT`, and `DELETE` requests, including same-environment absolute OData links such as pagination URLs.

## Prerequisites

- Node.js 22 or later
- A Power Platform account with access to the target Dataverse environment
- Power Apps CLI authentication

Install the dependencies:

```sh
npm install
```

Sign in to the Power Apps CLI:

```sh
npx pa auth login
```

Check the signed-in account:

```sh
npx pa auth status
```

When several accounts are cached, select the intended account explicitly:

```sh
npx pa auth switch --account you@example.com
```

## Use with GitHub Copilot

Keep the `.agents` directory in your workspace. Copilot discovers the skill and, before any Dataverse request, asks for the environment URL and cloud. The environment is selected per operation and is not read from environment variables, `.env` files, or project configuration.

For write or metadata operations, review the planned change and confirm destructive work before the request is sent.

## Programmatic usage

```js
import {
  createClient,
  getAccessToken,
  validateEnvironment,
} from './.agents/skills/dataverse-web-api/dataverse-client.mjs';

const environment = validateEnvironment({
  orgUrl: 'https://contoso.crm.dynamics.com',
  cloud: 'public',
});

const { accessToken } = await getAccessToken(environment);
const client = createClient({ orgUrl: environment.orgUrl, accessToken });

const response = await client.get('/accounts?$select=name&$top=10');
console.log(response.data.value);
```

Supported clouds are `public`, `usgov`, `usgovhigh`, `usgovdod`, and `china`. Use relative paths such as `/solutions`, `/accounts`, `/EntityDefinitions`, and `/RelationshipDefinitions` for Dataverse Web API operations.

## Security and compatibility

The client only permits HTTPS environment URLs without paths, credentials, queries, or fragments. It sends requests only to `/api/data/v9.2` within the selected environment; external URLs and protocol-relative URLs are rejected.

Your Dataverse security roles determine the operations the client can perform. The client does not increase privileges or store access tokens.

The Power Apps CLI token-cache integration mirrors `@microsoft/power-apps-cli` version `0.15.1`. Upgrade that dependency or the MSAL packages only after validating cache compatibility.

## Development

Run the tests:

```sh
npm test
```

The test suite validates environment URL handling, API URL containment, authorization headers, and error behavior.