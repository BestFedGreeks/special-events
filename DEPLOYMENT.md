# Deployment — BFG Special Events

## Local setup (one-time, per machine)

```
npm install -g @google/clasp
clasp login
```

## Making a change

```
cd ~/bfg-scripts/special-events
clasp pull          # grab any edits made directly in the browser editor
# ...edit files...
node --check Code.js   # sanity-check syntax before pushing
clasp push           # deploy to the live Apps Script project
git add .
git commit -m "describe the change"
git push origin main
```

`clasp push` updates the live script's code. If this project is deployed as a **web app** (which it is — see `appsscript.json`), pushing code updates the underlying script, but an existing web app deployment URL keeps serving the version it was deployed with until you create a new deployment version. To roll out a code change to the live web app URL:

1. `clasp push`
2. In the Apps Script editor: Deploy → Manage deployments → edit the active deployment → select "New version" → Deploy.

(Or `clasp deploy` from the CLI if you prefer — same effect.)

## Secrets — Script Properties

Set in the Apps Script editor → gear icon (Project Settings) → Script Properties. Never commit these to git.

| Property | What it is |
|---|---|
| `AIRTABLE_TOKEN` | Airtable personal access token used for all Airtable reads/writes |
| `CHAT_WEBHOOK` | Google Chat incoming webhook URL for the notification |

**Rotating a secret:** generate a new token/webhook at the source (Airtable → Developer Hub → tokens; Google Chat → space → Apps & integrations → webhooks), update the Script Property value, done — no code change needed.

## Script ID

`1kMICbEMGtCQzZ378-Lxtne04iXr8yUr10yXyT3pSEtfrOqddFqpp_sQj` (stored in `.clasp.json`, not secret, just an identifier)
