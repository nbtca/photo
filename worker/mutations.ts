import type { AppEnv, Session } from './auth';
import { type Handler, all, slug } from './query';

type Input = Record<string, unknown>;

const MAX_TAGS = 30;
const MAX_BLUR_LENGTH = 16384;

const forbidden = () => new Response('Forbidden', { status: 403 });
const invalid = (message: string) => new Response(message, { status: 400 });

const now = () => new Date().toISOString();
const text = (value: unknown, limit = 255) =>
  (typeof value === 'string' && value.trim().slice(0, limit)) || null;
const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const json = (value: unknown, limit = 8000) => {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return serialized && serialized !== 'null' && serialized.length <= limit ? serialized : null;
};
const strings = (value: unknown, limit: number) =>
  Array.isArray(value)
    ? [...new Set(value.map((item) => text(item)).filter((item) => item !== null))].slice(0, limit)
    : [];
const tagsOf = (value: unknown) => JSON.stringify(strings(value, MAX_TAGS));
const slugOf = (value: string | null) => (value ? slug(value) : null);
const placeholders = (values: unknown[]) => values.map(() => '?').join(', ');

const admin = (session: Session) => {
  if (!session.admin) throw forbidden();
};

async function owned(env: AppEnv, session: Session, ids: string[]) {
  const list = strings(ids, 500);
  if (!list.length) return [];
  const rows = await all<{ id: string; owner_sub: string }>(
    env,
    `SELECT id, owner_sub FROM photos WHERE id IN (${placeholders(list)})`,
    list,
  );
  if (!session.admin && rows.some(({ owner_sub }) => owner_sub !== session.sub)) throw forbidden();
  return rows.map(({ id }) => id);
}

async function ownsFile(env: AppEnv, session: Session, url: string | null) {
  const name = url?.match(/^\/img\/(photo-[\w.-]+)$/)?.[1];
  if (!name) return false;
  const [file] = await all<{ owner_sub: string }>(
    env,
    'SELECT owner_sub FROM files WHERE name = ?',
    [name],
  );
  return !!file && (session.admin || file.owner_sub === session.sub);
}

function columns(photo: Input) {
  const takenAt = new Date(text(photo.takenAt) ?? '');
  if (Number.isNaN(takenAt.getTime())) throw invalid('Invalid takenAt');
  const takenAtNaive = text(photo.takenAtNaive);
  if (!takenAtNaive) throw invalid('Invalid takenAtNaive');
  const blurData = text(photo.blurData, MAX_BLUR_LENGTH);
  const make = text(photo.make);
  const model = text(photo.model);
  const lensMake = text(photo.lensMake);
  const lensModel = text(photo.lensModel);
  return {
    extension: text(photo.url)?.split('.').pop() ?? 'webp',
    width: number(photo.width),
    height: number(photo.height),
    aspect_ratio: number(photo.aspectRatio) ?? 1.5,
    blur_data: blurData?.startsWith('data:image/') ? blurData : null,
    title: text(photo.title),
    caption: text(photo.caption, 4000),
    semantic_description: text(photo.semanticDescription, 4000),
    tags: tagsOf(photo.tags),
    make,
    model,
    make_slug: slugOf(make),
    model_slug: slugOf(model),
    focal_length: number(photo.focalLength),
    focal_length_in_35mm_format: number(photo.focalLengthIn35MmFormat),
    lens_make: lensMake,
    lens_model: lensModel,
    lens_make_slug: slugOf(lensMake),
    lens_model_slug: slugOf(lensModel),
    f_number: number(photo.fNumber),
    iso: number(photo.iso),
    exposure_time: number(photo.exposureTime),
    exposure_compensation: number(photo.exposureCompensation),
    film: text(photo.film),
    recipe_title: text(photo.recipeTitle),
    recipe_data: json(photo.recipeData),
    color_data: json(photo.colorData),
    color_sort: number(photo.colorSort),
    priority_order: number(photo.priorityOrder),
    taken_at: takenAt.toISOString(),
    taken_at_naive: takenAtNaive,
    exclude_from_feeds: photo.excludeFromFeeds === true ? 1 : 0,
    hidden: photo.hidden === true ? 1 : 0,
    updated_at: now(),
  };
}

const removeEmptyAlbums = (env: AppEnv) =>
  env.DB.prepare('DELETE FROM albums WHERE id NOT IN (SELECT album_id FROM album_photo)');

export const mutations: Record<string, Handler> = {
  async insertPhoto(env, session, photo: Input) {
    const id = text(photo?.id);
    const url = text(photo?.url);
    if (!id || !/^\w{8}$/.test(id)) throw invalid('Invalid id');
    if (!(await ownsFile(env, session, url))) throw forbidden();
    const row = {
      id,
      owner_sub: session.sub,
      owner_name: session.name,
      url,
      ...columns(photo),
      created_at: now(),
    };
    const names = Object.keys(row);
    await env.DB.prepare(
      `INSERT INTO photos (${names.join(', ')}) VALUES (${placeholders(names)})`,
    )
      .bind(...Object.values(row))
      .run();
  },

  async updatePhoto(env, session, photo: Input) {
    const [id] = await owned(env, session, [String(photo?.id)]);
    if (!id) throw invalid('Unknown photo');
    const url = text(photo.url);
    const [{ url: currentUrl }] = await all<{ url: string }>(
      env,
      'SELECT url FROM photos WHERE id = ?',
      [id],
    );
    if (url !== currentUrl && !(await ownsFile(env, session, url))) throw forbidden();
    const row = { url, ...columns(photo) };
    await env.DB.prepare(
      `UPDATE photos SET ${Object.keys(row)
        .map((name) => `${name} = ?`)
        .join(', ')} WHERE id = ?`,
    )
      .bind(...Object.values(row), id)
      .run();
  },

  async deletePhoto(env, session, photoId: string) {
    const [id] = await owned(env, session, [String(photoId)]);
    if (!id) return;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(id),
      removeEmptyAlbums(env),
    ]);
  },

  async setPhotoVisibilityForIds(
    env,
    session,
    photoIds: string[],
    hidden: boolean,
    excludeFromFeeds: boolean,
  ) {
    const ids = await owned(env, session, photoIds);
    if (!ids.length) return;
    await env.DB.prepare(
      `UPDATE photos SET hidden = ?, exclude_from_feeds = ?, updated_at = ? WHERE id IN (${placeholders(ids)})`,
    )
      .bind(hidden === true ? 1 : 0, excludeFromFeeds === true ? 1 : 0, now(), ...ids)
      .run();
  },

  async addTagsToPhotos(env, session, tags: string[], photoIds: string[]) {
    const ids = await owned(env, session, photoIds);
    const added = strings(tags, MAX_TAGS);
    if (!ids.length || !added.length) return;
    const rows = await all<{ id: string; tags: string }>(
      env,
      `SELECT id, tags FROM photos WHERE id IN (${placeholders(ids)})`,
      ids,
    );
    await env.DB.batch(
      rows.map((row) =>
        env.DB.prepare('UPDATE photos SET tags = ?, updated_at = ? WHERE id = ?').bind(
          tagsOf([...JSON.parse(row.tags), ...added]),
          now(),
          row.id,
        ),
      ),
    );
  },

  async updatePhotoTitleCaption(
    env,
    session,
    photoIds: string[],
    titles: (string | null)[],
    captions: (string | null)[],
  ) {
    const ids = new Set(await owned(env, session, photoIds));
    const statements = strings(photoIds, 500)
      .map((id, index) => ({ id, title: titles?.[index], caption: captions?.[index] }))
      .filter(({ id }) => ids.has(id))
      .map(({ id, title, caption }) =>
        env.DB.prepare(
          'UPDATE photos SET title = ?, caption = ?, updated_at = ? WHERE id = ?',
        ).bind(text(title), text(caption, 4000), now(), id),
      );
    if (statements.length) await env.DB.batch(statements);
  },

  async deletePhotoTagGlobally(env, session, tag: string) {
    admin(session);
    await renameTag(env, String(tag));
  },

  async renamePhotoTagGlobally(env, session, tag: string, updatedTag: string) {
    admin(session);
    await renameTag(env, String(tag), text(updatedTag) ?? undefined);
  },

  async deletePhotoRecipeGlobally(env, session, recipe: string) {
    admin(session);
    await env.DB.prepare('UPDATE photos SET recipe_title = NULL WHERE recipe_title = ?')
      .bind(String(recipe))
      .run();
  },

  async renamePhotoRecipeGlobally(env, session, recipe: string, updatedRecipe: string) {
    admin(session);
    await env.DB.prepare('UPDATE photos SET recipe_title = ? WHERE recipe_title = ?')
      .bind(text(updatedRecipe), String(recipe))
      .run();
  },

  async getRecipeTitleForData(env, _session, data: unknown, film: string) {
    const [row] = await all<{ recipe_title: string }>(
      env,
      'SELECT recipe_title FROM photos WHERE hidden = 0 AND recipe_data = ? AND film = ? AND recipe_title IS NOT NULL LIMIT 1',
      [json(data) ?? '', String(film)],
    );
    return row?.recipe_title ?? null;
  },

  async getRecipeDataForTitle(env, _session, title: string) {
    const [row] = await all<{ recipe_data: string }>(
      env,
      'SELECT recipe_data FROM photos WHERE hidden = 0 AND recipe_title = ? AND recipe_data IS NOT NULL ORDER BY taken_at DESC LIMIT 1',
      [String(title)],
    );
    return row?.recipe_data ?? null;
  },

  async getPhotosNeedingRecipeTitleCount(
    env,
    session,
    data: string,
    film: string,
    photoIdToExclude?: string,
  ) {
    const [{ count }] = await all<{ count: number }>(
      env,
      'SELECT COUNT(*) AS count FROM photos WHERE recipe_title IS NULL AND recipe_data = ? AND film = ? AND id <> ? AND (? OR owner_sub = ?)',
      [String(data), String(film), String(photoIdToExclude ?? ''), session.admin ? 1 : 0, session.sub],
    );
    return count;
  },

  async updateAllMatchingRecipeTitles(env, session, title: string, data: string, film: string) {
    await env.DB.prepare(
      'UPDATE photos SET recipe_title = ? WHERE recipe_title IS NULL AND recipe_data = ? AND film = ? AND (? OR owner_sub = ?)',
    )
      .bind(text(title), String(data), String(film), session.admin ? 1 : 0, session.sub)
      .run();
  },

  async upsertLibrary(env, session, library: Input) {
    admin(session);
    const photoId = async (value: unknown) => {
      const id = text(value);
      const [photo] = id
        ? await all(env, 'SELECT id FROM photos WHERE id = ?', [id])
        : [];
      return photo ? id : null;
    };
    await env.DB.prepare(
      `INSERT INTO library (id, title, subhead, description, photo_id_avatar, photo_id_hero, updated_at, created_at)
      VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?6)
      ON CONFLICT (id) DO UPDATE SET
        title = excluded.title,
        subhead = excluded.subhead,
        description = excluded.description,
        photo_id_avatar = excluded.photo_id_avatar,
        photo_id_hero = excluded.photo_id_hero,
        updated_at = excluded.updated_at`,
    )
      .bind(
        text(library?.title),
        text(library?.subhead, 1000),
        text(library?.description, 4000),
        await photoId(library?.photoIdAvatar),
        await photoId(library?.photoIdHero),
        now(),
      )
      .run();
    return 1;
  },

  async insertAlbum(env, _session, album: Input) {
    const title = text(album?.title);
    if (!title) throw invalid('Invalid album');
    const albumSlug = slug(text(album.slug) ?? title);
    await env.DB.prepare(
      'INSERT INTO albums (id, title, slug, subhead, description, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (slug) DO NOTHING',
    )
      .bind(
        crypto.randomUUID(),
        title,
        albumSlug,
        text(album.subhead, 1000),
        text(album.description, 4000),
        now(),
        now(),
      )
      .run();
    const [{ id }] = await all<{ id: string }>(env, 'SELECT id FROM albums WHERE slug = ?', [
      albumSlug,
    ]);
    return id;
  },

  async updateAlbum(env, session, album: Input) {
    admin(session);
    await env.DB.prepare(
      'UPDATE albums SET title = ?, slug = ?, subhead = ?, description = ?, updated_at = ? WHERE id = ?',
    )
      .bind(
        text(album.title),
        slug(text(album.slug) ?? ''),
        text(album.subhead, 1000),
        text(album.description, 4000),
        now(),
        String(album.id),
      )
      .run();
  },

  async deleteAlbum(env, session, id: string) {
    admin(session);
    await env.DB.prepare('DELETE FROM albums WHERE id = ?').bind(String(id)).run();
  },

  async clearPhotoAlbumIds(env, session, photoId: string) {
    const [id] = await owned(env, session, [String(photoId)]);
    if (!id) return;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM album_photo WHERE photo_id = ?').bind(id),
      removeEmptyAlbums(env),
    ]);
  },

  async addPhotoAlbumIds(env, session, photoIds: string[], albumIds: string[]) {
    const ids = await owned(env, session, photoIds);
    const albums = strings(albumIds, 20);
    if (!ids.length || !albums.length) return;
    await env.DB.batch(
      albums.flatMap((albumId) =>
        ids.map((photoId) =>
          env.DB.prepare(
            'INSERT OR IGNORE INTO album_photo (album_id, photo_id) SELECT id, ? FROM albums WHERE id = ?',
          ).bind(photoId, albumId),
        ),
      ),
    );
  },

  async getStorageUrlsForPrefix(env, session, prefix = '') {
    const rows = await all<{ name: string; bytes: number; created_at: string }>(
      env,
      'SELECT name, bytes, created_at FROM files WHERE name LIKE ? ESCAPE \'\\\' AND (? OR owner_sub = ?) ORDER BY created_at DESC LIMIT 1000',
      [`${String(prefix).replace(/[\\%_]/g, '\\$&')}%`, session.admin ? 1 : 0, session.sub],
    );
    return rows.map(({ name, bytes, created_at }) => ({
      url: `/img/${name}`,
      fileName: name,
      uploadedAt: created_at,
      bytes,
    }));
  },
};

async function renameTag(env: AppEnv, tag: string, replacement?: string) {
  const rows = await all<{ id: string; tags: string }>(
    env,
    'SELECT p.id, p.tags FROM photos p WHERE EXISTS (SELECT 1 FROM json_each(p.tags) WHERE value = ?)',
    [tag],
  );
  if (!rows.length) return;
  await env.DB.batch(
    rows.map((row) =>
      env.DB.prepare('UPDATE photos SET tags = ? WHERE id = ?').bind(
        tagsOf(
          (JSON.parse(row.tags) as string[]).flatMap((item) =>
            item === tag ? (replacement ? [replacement] : []) : [item],
          ),
        ),
        row.id,
      ),
    ),
  );
}
