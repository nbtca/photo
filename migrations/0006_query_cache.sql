-- Cache API does not run behind Cloudflare Access, so read results are cached here instead.
CREATE TABLE cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  epoch TEXT NOT NULL,
  expires INTEGER NOT NULL
);

INSERT INTO cache (key, value, epoch, expires) VALUES ('epoch', '0', '', 9007199254740991);
