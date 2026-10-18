CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  owner_sub TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  url TEXT NOT NULL,
  extension TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  aspect_ratio REAL NOT NULL DEFAULT 1.5,
  blur_data TEXT,
  title TEXT,
  caption TEXT,
  semantic_description TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  make TEXT,
  model TEXT,
  make_slug TEXT,
  model_slug TEXT,
  focal_length INTEGER,
  focal_length_in_35mm_format INTEGER,
  lens_make TEXT,
  lens_model TEXT,
  lens_make_slug TEXT,
  lens_model_slug TEXT,
  f_number REAL,
  iso INTEGER,
  exposure_time REAL,
  exposure_compensation REAL,
  film TEXT,
  recipe_title TEXT,
  recipe_data TEXT,
  color_data TEXT,
  color_sort INTEGER,
  priority_order REAL,
  taken_at TEXT NOT NULL,
  taken_at_naive TEXT NOT NULL,
  exclude_from_feeds INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX photos_taken_at ON photos (hidden, taken_at DESC);
CREATE INDEX photos_created_at ON photos (hidden, created_at DESC);
CREATE INDEX photos_owner ON photos (owner_sub);

CREATE TABLE files (
  name TEXT PRIMARY KEY,
  base TEXT NOT NULL,
  owner_sub TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX files_owner ON files (owner_sub);
CREATE INDEX files_base ON files (base);

CREATE TABLE albums (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  subhead TEXT,
  description TEXT,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE album_photo (
  album_id TEXT NOT NULL REFERENCES albums (id) ON DELETE CASCADE,
  photo_id TEXT NOT NULL REFERENCES photos (id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (album_id, photo_id)
);

CREATE INDEX album_photo_photo ON album_photo (photo_id);
