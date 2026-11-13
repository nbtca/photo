-- SHA-256 of the file a member picked, before any client-side compression.
ALTER TABLE files ADD COLUMN sha256 TEXT;

CREATE INDEX files_owner_sha256 ON files (owner_sub, sha256) WHERE sha256 IS NOT NULL;
