-- Where an upload came from on the member's device, used to suggest titles, albums and taken times.
ALTER TABLE files ADD COLUMN original_name TEXT;
ALTER TABLE files ADD COLUMN folder TEXT;
ALTER TABLE files ADD COLUMN modified_at TEXT;
