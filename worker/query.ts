import type { AppEnv, Session } from './auth';

type Value = string | number;

interface Options {
  sortBy?: string
  sortWithPriority?: boolean
  limit?: number
  offset?: number
  query?: string
  maximumAspectRatio?: number
  takenBefore?: string
  takenAfterInclusive?: string
  updatedBefore?: string
  excludeFromFeeds?: boolean
  hidden?: 'exclude' | 'include' | 'only'
  recent?: boolean
  year?: string
  album?: { id?: string }
  tag?: string
  camera?: { make?: string; model?: string }
  lens?: { make?: string; model?: string }
  film?: string
  recipe?: string
  focal?: number
  photoIds?: string[]
}

type Row = Record<string, unknown>;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 2000;
const NOW = 'strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\'';
const NEWEST = '(SELECT MAX(created_at) FROM photos)';

// Mirrors `parameterize` in src/utility/string.ts.
export const slug = (value: string) =>
  value
    .trim()
    .replaceAll(/[\s_–—+&|]/g, '-')
    .replaceAll(/['"!@#$%^*()=[\]{};:/?,<>\\`~]/g, '')
    .toLocaleLowerCase();

const parse = (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : null);

export const present =
  (session: Session) =>
    ({
      owner_sub,
      make_slug,
      model_slug,
      lens_make_slug,
      lens_model_slug,
      ...row
    }: Row): Row => ({
      ...row,
      tags: parse(row.tags),
      recipe_data: parse(row.recipe_data),
      color_data: parse(row.color_data),
      hidden: !!row.hidden,
      exclude_from_feeds: !!row.exclude_from_feeds,
      editable: session.admin || owner_sub === session.sub,
    });

export function conditions(options: Options, session: Session) {
  const wheres = ['1 = 1'];
  const values: Value[] = [];
  const where = (clause: string, ...bound: Value[]) => {
    wheres.push(clause);
    values.push(...bound);
  };

  const hidden = options.hidden ?? 'exclude';
  if (hidden === 'exclude') where('p.hidden = 0');
  if (hidden === 'only') where('p.hidden = 1');
  if (hidden !== 'exclude' && !session.admin) where('p.owner_sub = ?', session.sub);

  if (options.excludeFromFeeds) where('p.exclude_from_feeds = 0');
  if (options.takenBefore) where('p.taken_at < ?', options.takenBefore);
  if (options.takenAfterInclusive) where('p.taken_at >= ?', options.takenAfterInclusive);
  if (options.updatedBefore) where('p.updated_at < ?', options.updatedBefore);
  if (options.query) {
    where(
      '(COALESCE(p.title, \'\') || \' \' || COALESCE(p.caption, \'\') || \' \' || COALESCE(p.semantic_description, \'\')) LIKE ?',
      `%${options.query}%`,
    );
  }
  if (options.maximumAspectRatio) where('p.aspect_ratio <= ?', options.maximumAspectRatio);
  if (options.recent) {
    where(`${NEWEST} >= ${NOW}, '-14 days')`);
    where(`p.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', ${NEWEST}, '-7 days')`);
  }
  if (options.year) where('strftime(\'%Y\', p.taken_at) = ?', String(options.year));
  if (options.camera?.make) where('p.make_slug = ?', slug(options.camera.make));
  if (options.camera?.model) where('p.model_slug = ?', slug(options.camera.model));
  if (options.lens?.make) where('p.lens_make_slug = ?', slug(options.lens.make));
  if (options.lens?.model) {
    where('p.lens_model_slug = ?', slug(options.lens.model));
    if (!options.lens.make) where('p.lens_make IS NULL');
  }
  if (options.album?.id) where('ap.album_id = ?', options.album.id);
  if (options.tag) {
    where('EXISTS (SELECT 1 FROM json_each(p.tags) WHERE value = ?)', options.tag);
  }
  if (options.film) where('p.film = ?', options.film);
  if (options.recipe) where('p.recipe_title = ?', options.recipe);
  if (options.focal !== undefined && options.focal !== null) {
    where('p.focal_length = ?', options.focal);
  }
  if (options.photoIds?.length) {
    where(`p.id IN (${options.photoIds.map(() => '?').join(', ')})`, ...options.photoIds);
  }

  return {
    from: `FROM photos p${options.album?.id ? ' JOIN album_photo ap ON ap.photo_id = p.id' : ''} WHERE ${wheres.join(' AND ')}`,
    values,
  };
}

const limitOf = ({ limit = DEFAULT_LIMIT }: Options) =>
  Math.max(1, Math.min(MAX_LIMIT, Math.floor(Number(limit)) || DEFAULT_LIMIT));

function orderBy(options: Options) {
  const priority = options.sortWithPriority ? 'p.priority_order ASC NULLS LAST, ' : '';
  switch (options.sortBy) {
    case 'takenAtAsc':
      return `ORDER BY ${priority}p.taken_at ASC`;
    case 'createdAt':
      return `ORDER BY ${priority}p.created_at DESC`;
    case 'createdAtAsc':
      return `ORDER BY ${priority}p.created_at ASC`;
    case 'color':
      return `ORDER BY ${priority}p.color_sort DESC, p.taken_at DESC`;
    case 'colorAsc':
      return `ORDER BY ${priority}p.color_sort ASC, p.taken_at ASC`;
    case 'random': {
      const stride = Math.max(2, limitOf(options) * 2);
      return `ORDER BY (ROW_NUMBER() OVER (ORDER BY p.taken_at DESC, p.id) - 1) % ${stride}, p.taken_at DESC, p.id`;
    }
    default:
      return `ORDER BY ${priority}p.taken_at DESC`;
  }
}

export const all = async <T = Row>(env: AppEnv, sql: string, values: Value[] = []) =>
  (await env.DB.prepare(sql).bind(...values).all<T>()).results;

const VISIBLE = 'hidden = 0';
const COUNTED = 'COUNT(*) AS count, MAX(updated_at) AS last_modified';

export type Handler = (env: AppEnv, session: Session, ...args: any[]) => Promise<unknown>;

export const queries: Record<string, Handler> = {
  async getPhotos(env, session, options: Options = {}) {
    const { from, values } = conditions(options, session);
    const rows = await all(
      env,
      `SELECT p.* ${from} ${orderBy(options)} LIMIT ? OFFSET ?`,
      [...values, limitOf(options), Math.max(0, Math.floor(Number(options.offset)) || 0)],
    );
    return rows.map(present(session));
  },

  async getPhotoIds(env, session, options: Options = {}) {
    const { from, values } = conditions(options, session);
    const rows = await all<{ id: string }>(
      env,
      `SELECT p.id ${from} ${orderBy(options)} LIMIT ? OFFSET ?`,
      [...values, limitOf(options), Math.max(0, Math.floor(Number(options.offset)) || 0)],
    );
    return rows.map(({ id }) => id);
  },

  async getPhotoCount(env, session, options: Options = {}) {
    const { from, values } = conditions(options, session);
    const [{ count }] = await all<{ count: number }>(env, `SELECT COUNT(*) AS count ${from}`, values);
    return count;
  },

  async getPhotosNearId(env, session, photoId: string, options: Options = {}) {
    const { from, values } = conditions(options, session);
    const rows = await all(
      env,
      `WITH twi AS (
        SELECT p.*, ROW_NUMBER() OVER (${orderBy(options)}) AS row_number ${from}
      ),
      current AS (SELECT row_number FROM twi WHERE id = ?)
      SELECT twi.* FROM twi, current
      WHERE twi.row_number >= current.row_number - 1
      ORDER BY twi.row_number
      LIMIT ?`,
      [...values, String(photoId), limitOf(options)],
    );
    const indexNumber = rows.find(({ id }) => id === photoId)?.row_number;
    return {
      photos: rows.map(({ row_number, ...row }) => present(session)(row)),
      indexNumber,
    };
  },

  async getPhotosMeta(env, session, options: Options = {}) {
    const { from, values } = conditions(options, session);
    const [row] = await all<Record<string, string | number | null>>(
      env,
      `SELECT COUNT(*) AS count,
        MIN(p.taken_at_naive) AS start, MAX(p.taken_at_naive) AS end,
        MIN(p.created_at) AS start_created_at, MAX(p.created_at) AS end_created_at
      ${from}`,
      values,
    );
    return {
      count: row.count,
      ...(row.start && row.end && { dateRange: { start: row.start, end: row.end } }),
      ...(row.start_created_at &&
        row.end_created_at && {
        dateRangeCreatedAt: { start: row.start_created_at, end: row.end_created_at },
      }),
    };
  },

  async getPhoto(env, session, id: string, includeHidden?: boolean) {
    const [row] = await all(
      env,
      'SELECT * FROM photos WHERE id = ? AND (hidden = 0 OR (? AND (? OR owner_sub = ?)))',
      [String(id), includeHidden ? 1 : 0, session.admin ? 1 : 0, session.sub],
    );
    return row ? present(session)(row) : null;
  },

  async getPhotosMostRecentUpdate(env) {
    const [row] = await all<{ updated_at: string }>(
      env,
      'SELECT updated_at FROM photos ORDER BY updated_at DESC LIMIT 1',
    );
    return row?.updated_at ?? null;
  },

  async getAllPublicPhotoIds(env, _session, limit?: number) {
    const rows = await all<{ id: string }>(
      env,
      `SELECT id FROM photos WHERE ${VISIBLE} LIMIT ?`,
      [limitOf({ limit: limit ?? MAX_LIMIT })],
    );
    return rows.map(({ id }) => id);
  },

  getAllPhotoIdsWithUpdatedAt: (env) =>
    all(env, `SELECT id, updated_at FROM photos WHERE ${VISIBLE}`),

  getUniqueCameras: (env) =>
    all(
      env,
      `SELECT MIN(make) AS make, MIN(model) AS model, ${COUNTED} FROM photos
      WHERE ${VISIBLE} AND TRIM(make) <> '' AND TRIM(model) <> ''
      GROUP BY make_slug, model_slug ORDER BY 1, 2`,
    ),

  getUniqueLenses: (env) =>
    all(
      env,
      `SELECT MIN(lens_make) AS lens_make, MIN(lens_model) AS lens_model, ${COUNTED} FROM photos
      WHERE ${VISIBLE} AND TRIM(lens_model) <> ''
      GROUP BY lens_make_slug, lens_model_slug ORDER BY 1, 2`,
    ),

  getUniqueTags: (env) =>
    all(
      env,
      `SELECT tags.value AS tag, COUNT(*) AS count, MAX(p.updated_at) AS last_modified
      FROM photos p, json_each(p.tags) AS tags
      WHERE p.hidden = 0
      GROUP BY tags.value ORDER BY tags.value ASC`,
    ),

  getUniqueRecipes: (env) =>
    all(
      env,
      `SELECT recipe_title, ${COUNTED} FROM photos
      WHERE ${VISIBLE} AND recipe_title IS NOT NULL
      GROUP BY recipe_title ORDER BY recipe_title ASC`,
    ),

  getUniqueYears: (env) =>
    all(
      env,
      `SELECT strftime('%Y', taken_at) AS year, ${COUNTED} FROM photos
      WHERE ${VISIBLE} GROUP BY year ORDER BY year DESC`,
    ),

  getUniqueFilms: (env) =>
    all(
      env,
      `SELECT film, ${COUNTED} FROM photos
      WHERE ${VISIBLE} AND film IS NOT NULL
      GROUP BY film ORDER BY film ASC`,
    ),

  getUniqueFocalLengths: (env) =>
    all(
      env,
      `SELECT focal_length, ${COUNTED} FROM photos
      WHERE ${VISIBLE} AND focal_length > 0
      GROUP BY focal_length ORDER BY focal_length ASC`,
    ),

  async getAlbumFromSlug(env, _session, albumSlug: string) {
    const [row] = await all(env, 'SELECT * FROM albums WHERE slug = ?', [String(albumSlug)]);
    return row ?? null;
  },

  getAlbumsWithMeta: (env) =>
    all(
      env,
      `SELECT a.*, COUNT(p.id) AS count FROM albums a
      JOIN album_photo ap ON a.id = ap.album_id
      JOIN photos p ON p.id = ap.photo_id AND p.hidden = 0
      GROUP BY a.id ORDER BY a.created_at DESC`,
    ),

  async getAlbumTitlesForPhoto(env, _session, photoId: string) {
    const rows = await all<{ title: string }>(
      env,
      'SELECT a.title FROM albums a JOIN album_photo ap ON a.id = ap.album_id WHERE ap.photo_id = ?',
      [String(photoId)],
    );
    return rows.map(({ title }) => title);
  },

  async getTagsForAlbum(env, _session, albumId: string) {
    const rows = await all<{ tag: string }>(
      env,
      `SELECT DISTINCT tags.value AS tag FROM photos p
      JOIN album_photo ap ON p.id = ap.photo_id, json_each(p.tags) AS tags
      WHERE ap.album_id = ? AND p.hidden = 0`,
      [String(albumId)],
    );
    return rows.map(({ tag }) => tag);
  },
};
