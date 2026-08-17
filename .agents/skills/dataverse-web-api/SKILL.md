---
name: dataverse-web-api
description: Authenticate to a user-selected Dataverse environment and use the Dataverse Web API for solutions, tables, records, relationships, and other Dataverse operations.
metadata:
  version: "1.0.0"
  argument-hint: <Dataverse request>
---

# Dataverse Web API

This workspace provides authentication and a small authenticated Web API client. The agent supplies
the operation-specific Dataverse knowledge and should perform the requested work directly through the
Dataverse Web API. Do not create separate scaffold, seed, or record-operation skills for individual
Dataverse tasks.

## Choose the environment first

Before making any Dataverse request, ask the user:

> Which Dataverse environment should I use? Please provide its environment URL, for example `https://org.crm.dynamics.com`.

Do not infer or silently reuse an environment from a previous request. Do not read the URL from a
`.env` file, process environment variable, or project configuration. The selected URL is used only
for the current operation. Ask for the cloud when the environment is not in the public cloud; use
`public`, `usgov`, `usgovhigh`, `usgovdod`, or `china`.

## Authenticate

Check the Power Apps CLI account before the Web API request:

```text
npx pa auth status
```

If the user is not signed in, ask them to complete:

```text
npx pa auth login
```

If multiple cached accounts are present, ask which account to use and switch explicitly:

```text
npx pa auth switch --account <email>
```

Never print, copy, or store access tokens in the workspace.

## Connect to Dataverse

Pass the environment selected in the current conversation to the shared client. The client reuses
the encrypted token cache created by the Power Apps CLI and acquires a token silently for the selected
environment.

The client mirrors the Power Apps CLI `0.15.1` token-cache implementation, and the project pins that
version. Do not upgrade the CLI or MSAL packages without rechecking the cache compatibility boundary.

```js
import {
  validateEnvironment,
  getAccessToken,
  createClient,
} from './.agents/skills/dataverse-web-api/dataverse-client.mjs';

const environment = validateEnvironment({
  orgUrl: userSelectedEnvironmentUrl,
  cloud: userSelectedCloud,
});
const { accessToken, account } = await getAccessToken(environment);
const client = createClient({ orgUrl: environment.orgUrl, accessToken });
```

Use relative Web API paths such as `/solutions` and `/accounts`, or the metadata endpoints under
`/EntityDefinitions` and `/RelationshipDefinitions`. The client targets `/api/data/v9.2`, sends the
required OData headers, and supports `GET`, `POST`, `PATCH`, `PUT`, and `DELETE`. Absolute OData links
are accepted only when they remain under the selected environment's Web API; external URLs are rejected.

The token's effective permissions come from the user's Dataverse security roles and environment access.
The client does not grant additional privileges. If silent acquisition fails because the cached token
cannot be renewed, refresh the Power Apps CLI sign-in and retry.

For requests that write data or metadata, explain the intended change and confirm any destructive
operation with the user before sending it. Follow the Dataverse Web API contract for payloads,
solution headers, table metadata, lookups, choice values, and record updates.