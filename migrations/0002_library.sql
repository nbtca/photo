CREATE TABLE library (
  id INTEGER PRIMARY KEY,
  title TEXT,
  subhead TEXT,
  description TEXT,
  photo_id_avatar TEXT REFERENCES photos (id) ON DELETE SET NULL,
  photo_id_hero TEXT REFERENCES photos (id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
