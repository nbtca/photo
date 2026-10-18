CREATE INDEX photos_url ON photos (url);

CREATE TABLE storage (
  owner_sub TEXT PRIMARY KEY,
  bytes INTEGER NOT NULL
);

INSERT INTO storage (owner_sub, bytes) SELECT owner_sub, SUM(bytes) FROM files GROUP BY owner_sub;

CREATE TRIGGER files_storage_insert AFTER INSERT ON files BEGIN
  INSERT INTO storage (owner_sub, bytes) VALUES (NEW.owner_sub, NEW.bytes)
  ON CONFLICT (owner_sub) DO UPDATE SET bytes = bytes + NEW.bytes;
END;

CREATE TRIGGER files_storage_update AFTER UPDATE OF bytes ON files BEGIN
  UPDATE storage SET bytes = bytes + NEW.bytes - OLD.bytes WHERE owner_sub = NEW.owner_sub;
END;

CREATE TRIGGER files_storage_delete AFTER DELETE ON files BEGIN
  UPDATE storage SET bytes = bytes - OLD.bytes WHERE owner_sub = OLD.owner_sub;
END;
