# Architecture — BFG Special Events

## Flow

```
Form submission (external)
      │  POST JSON
      ▼
doPost(e)
      │
      ▼
processSpecialEvent(d)
      │
      ├─► lookupHouseId(d.house)                 [Airtable: Houses table]
      │        confirms house exists & Contract Status = Active
      │
      ├─► checkAgreement(houseRecId, schoolYear, eventType)
      │        [Airtable: Special Events Agreements table]
      │        reads Included/Used counters for the event type,
      │        returns 'In Agreement' or 'Extra Billable'
      │
      ├─► createEventDoc(d, agreementStatus)
      │        Google Docs — builds a formatted summary doc,
      │        saves into CONFIG.EVENTS_FOLDER (Drive),
      │        shares with chef / submitter / Christina
      │
      ├─► addEventRecord(...)                    [Airtable: Special Events table]
      │        writes the new event record, links House + Agreement
      │
      └─► sendChatNotification(...)               [Google Chat webhook]
               posts a summary card; failures here are caught and
               logged into the doc itself (logDebugToDoc_) rather
               than failing the whole request
```

## Key data model (Airtable base `appnsTUTkpXhgycnG`)

- **Houses** (`tbl7Cbf4tX6BtF4WX`) — one record per chapter house; `Contract Status` gates whether events can be processed.
- **Special Events Agreements** (`tblcLSQQYNQt0UkG3`) — one record per house per school year; tracks `Philanthropic/Steak Dinner/Special Event Included` vs `...Used` counts. This is the entitlement ledger.
- **Special Events** (`tblY9l3p3RB4JGxrg`) — one record per submitted event; the actual log this script writes to.

## Design notes

- Event types not in `EVENT_TYPE_FIELD_MAP` ("Other", or anything unrecognized) are always billed as "Extra Billable" — there's no entitlement bucket to check against.
- If the house isn't found or has no active contract, the event still processes but is automatically "Extra Billable" (`houseRecId` will be `null`).
- The Chat notification is best-effort: a failure there doesn't fail the request, it just appends a debug note to the generated Doc so it's traceable.
- The web app executes as the deploying user (`USER_DEPLOYING`) with anonymous access, meaning the Drive/Docs writes happen under whoever last deployed it, not the person submitting the form.
