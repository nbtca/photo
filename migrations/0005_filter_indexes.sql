-- Every filtered listing scanned the whole photos table; these let each filter read only its own photos.
CREATE INDEX photos_camera ON photos (make_slug, model_slug, hidden, taken_at DESC);
CREATE INDEX photos_lens ON photos (lens_make_slug, lens_model_slug, hidden, taken_at DESC);
CREATE INDEX photos_film ON photos (film, hidden, taken_at DESC);
CREATE INDEX photos_recipe_title ON photos (recipe_title, hidden, taken_at DESC);
CREATE INDEX photos_recipe_data ON photos (recipe_data, film);
CREATE INDEX photos_focal ON photos (focal_length, hidden, taken_at DESC);
