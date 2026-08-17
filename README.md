# Dataverse Web API Skill

Use GitHub Copilot Chat to work with your Microsoft Dataverse environment in plain language. Ask Copilot to look up tables, find records, inspect solutions, or make a change, and it uses your existing Power Apps sign-in to carry out the request.

You do not need to copy access tokens, write API requests, or share a password with Copilot.

## Before you start

You need:

- Visual Studio Code with GitHub Copilot Chat enabled
- Access to the Dataverse environment you want to use
- A Power Platform account that has permission to do the work you ask for

Open this repository as a folder in Visual Studio Code. The skill is included in the `.agents` folder and Copilot Chat finds it automatically.

The first time you use the skill on a computer, open the VS Code terminal and run:

```sh
npm install
npx pa auth login
```

Follow the sign-in window to connect your Power Platform account. You only need to do this again if your sign-in expires or you want to use a different account.

## Ask Copilot Chat

Open Copilot Chat in VS Code and describe what you want to do. Start with a question or a small read-only task while you get familiar with the skill.

Examples:

- `List the solutions in my Dataverse environment.`
- `Show me the columns on the Account table.`
- `Find the five most recently created contacts.`
- `Find records in the Accounts table where the name contains Contoso.`
- `What relationships does the Case table have?`
- `Create a new column on the Project table called Project Code.`

Copilot will ask which Dataverse environment to use before every request. Paste the environment URL from your Power Platform environment, for example:

```text
https://contoso.crm.dynamics.com
```

If your environment is not in the public Microsoft cloud, tell Copilot which cloud it uses: `usgov`, `usgovhigh`, `usgovdod`, or `china`.

## Making changes

Copilot can help create, update, and delete Dataverse data and metadata when your account has the required permissions. Before it makes a change, it explains the intended action. Read that summary and confirm only when it is correct.

For destructive requests, be especially specific about the table, records, and outcome you intend. For example:

```text
Delete the test contact named Example Contact. First show me the matching record and ask for confirmation before deleting it.
```

Your Dataverse security roles still apply. This skill cannot grant access that your account does not already have.

## Keep your account safe

- Do not paste passwords, access tokens, or client secrets into Copilot Chat.
- Use an environment URL only when Copilot asks for it.
- Check the environment name and planned change before confirming write or delete operations.
- Sign in with the Power Apps CLI again if Copilot says your session has expired.

## Troubleshooting

**Copilot says you are not signed in**

Open the VS Code terminal and run `npx pa auth login`, then complete the sign-in process.

**You have more than one Power Platform account**

Ask Copilot which account it is using, then run this in the VS Code terminal to switch accounts:

```sh
npx pa auth switch --account you@example.com
```

**Copilot cannot perform an action**

Your account may not have the necessary Dataverse permissions. Contact the environment administrator and describe the task you need to complete.
