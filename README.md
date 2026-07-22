# BFG Special Events

Google Apps Script backend that processes special event requests submitted by chapter houses (steak dinners, philanthropic events, etc.), checks each house's contract entitlements in Airtable, generates a formatted Google Doc summary, logs the event to Airtable, and notifies the team in Google Chat.

## What it does

1. Receives a form submission via `doPost(e)` (JSON body).
2. Looks up the submitting house's record in Airtable (`Houses` table) to confirm it's under an active contract.
3. Checks the house's `Special Events Agreements` record for the current school year to determine whether this event type (Philanthropic / Steak Dinner / Special Event / Other) is already covered by contract ("In Agreement") or should be billed separately ("Extra Billable").
4. Creates a styled Google Doc summarizing the event (details, contacts, budget, planning notes), saves it to the shared Events Drive folder, and grants edit access to the chef, submitter, and Christina.
5. Writes a new record to the `Special Events` Airtable table linking back to the House and Agreement records.
6. Posts a summary notification to a Google Chat space.

## Stack

- Google Apps Script (V8 runtime), deployed as a web app
- Airtable (base `appnsTUTkpXhgycnG`) for house/contract/event data
- Google Docs + Drive for the generated event summary
- Google Chat webhook for notifications

## Files

| File | Purpose |
|---|---|
| `Code.js` | Entire backend: `doPost`, Airtable helpers, doc generation, Chat notification |
| `appsscript.json` | Manifest — timezone, web app deploy settings (executes as the deploying user, accessible anonymously) |

## Secrets

Stored in this project's Script Properties (Apps Script editor → Project Settings), never in code:

- `AIRTABLE_TOKEN` — Airtable API token
- `CHAT_WEBHOOK` — Google Chat webhook URL for notifications

See `DEPLOYMENT.md` for how to set/rotate these.

## Where the frontend lives

This repo only contains the Apps Script backend (`doPost` handler). The submission form that calls it is a separate, external front end — not part of this project.
