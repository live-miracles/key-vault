# key-vault

A safer way to store &amp; manage stream keys for big events.

This simple web UI uses AppScript for hosting. After creating and configuring AppScript project
you will be able to:

- Create Events.
- Add stream keys for the event.
- Add roles based access management to restrict which keys a user can access.

## How to use

1. Create a Spreadsheet with tabs:
    - Role: "id", "event", "email", "type", "language", "remarks"
    - Event: "id", "name", "status"
    - Key: "id", "event", "name", "language", "server", "key", "server2", "key2", "color", "remarks"
2. Create an AppScript and add a `SPREADSHEET_ID` property.
3. Create "Code.gs", "and "Index.html" files in the project and copy this code.

## Roles

- Owner - can edit any event and assign Event Admins.
- Admin - can edit an event and add Viewers/Editors.
- Editor - can edit an event (can be restricted to languages).
- Viewer - can only view an event (can be restricted to languages).
