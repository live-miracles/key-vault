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
    - Event: "id", "name"
    - Key: "id", "event", "name", "type", "language", "server", "key", "color", "remarks"
2. Create an AppScript and add a `SPREADSHEET_ID` property.
3. Create "Code.gs", "and "Index.html" files in the project and copy this code.

## Roles

- Super Admin - can edit any event and assign Global Admins.
- Global Admin - can edit any event and assign Event Admins.
- Event Admin - can edit and add other Event Admins for one event.
- Event Editor - can edit one event.
- Language Editor - can edit one event, but can't share access with others.
- Event/Language Viewer - can only view one event.
