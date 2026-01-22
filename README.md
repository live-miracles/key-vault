# key-vault

A safer way to store &amp; manage stream keys for big events.

This simple web UI uses AppScript for hosting. After creating and configuring AppScript project
you will be able to:

- Create Events.
- Add stream keys for the event.
- Add roles based access management to restrict which keys a user can access.

## How to use

1. Create a Spreadsheet with tabs:
    - Role: "ID", "Event", "Email", "Role", "Language", "Remarks"
    - Event: "ID", "Name"
    - Key: "ID", "Event", "Name", "Type", "Language", "Server URL", "Key", "Remarks"
2. Create an AppScript and add a `SPREADSHEET_ID` property.
3. Create "Code.gs", "and "Index.html" files in the project and copy this code.
