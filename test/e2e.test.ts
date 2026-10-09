import assert from 'node:assert/strict';
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { type KeyObject, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const WRANGLER = 'node_modules/.bin/wrangler';
const PORT = 8799;
const BASE = `http://localhost:${PORT}`;
const QUOTA_BYTES = 500;
const AUD = 'test-audience';
const KID = 'test-key';
const WEBP = Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP'), Buffer.alloc(32)]);

const access = generateKeyPairSync('rsa', { modulusLength: 2048 });
const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 });

let team: Server;
let teamUrl: string;
let worker: ChildProcess;
let state: string;

before(async () => {
  team = createServer((req, res) => {
    if (req.url === '/cdn-cgi/access/certs') {
      const jwk = { ...access.publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256' };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ keys: [jwk] }));
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => team.listen(0, '127.0.0.1', resolve));
  teamUrl = `http://127.0.0.1:${(team.address() as AddressInfo).port}`;

  state = mkdtempSync(join(tmpdir(), 'photo-test-'));
  execFileSync(WRANGLER, ['d1', 'migrations', 'apply', 'photo', '--local', '--persist-to', state], {
    stdio: 'ignore',
    env: { ...process.env, CI: '1' },
  });
  const vars = {
    ACCESS_TEAM_DOMAIN: teamUrl,
    ACCESS_AUD: AUD,
    ADMIN_EMAILS: 'Admin@nbtca.space, root@nbtca.space',
    USER_QUOTA_MB: String(QUOTA_BYTES / 1024 / 1024),
    PENDING_UPLOAD_TTL: '0',
  };
  worker = spawn(
    WRANGLER,
    [
      'dev',
      '--port',
      String(PORT),
      '--local-upstream',
      `localhost:${PORT}`,
      '--persist-to',
      state,
      ...Object.entries(vars).flatMap(([key, value]) => ['--var', `${key}:${value}`]),
    ],
    { stdio: 'ignore', detached: true },
  );
  for (let attempt = 0; ; attempt++) {
    try {
      await fetch(BASE);
      break;
    } catch (error) {
      if (attempt > 100) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
});

after(() => {
  if (worker?.pid) process.kill(-worker.pid);
  team?.close();
  if (state) rmSync(state, { recursive: true, force: true });
});

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

function issue(
  claims: object,
  { key = access.privateKey, header = {} }: { key?: KeyObject; header?: object } = {},
) {
  const body = `${encode({ alg: 'RS256', kid: KID, ...header })}.${encode(claims)}`;
  return `${body}.${sign('sha256', Buffer.from(body), key).toString('base64url')}`;
}

const claimsFor = (user: string) => ({
  aud: [AUD],
  iss: teamUrl,
  email: `${user}@nbtca.space`,
  exp: Math.floor(Date.now() / 1000) + 3600,
});

const signIn = async (user: string) => ({ session: issue(claimsFor(user)) });

const call = (session: string, path: string, init: RequestInit = {}) =>
  fetch(BASE + path, {
    ...init,
    headers: { 'Cf-Access-Jwt-Assertion': session, Origin: BASE, ...init.headers },
  });

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const randomId = (length: number) =>
  Array.from({ length }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

const send = (session: string, name: string, ...args: unknown[]) =>
  call(session, `/api/rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });

async function rpc<T = any>(session: string, name: string, ...args: unknown[]): Promise<T> {
  const res = await send(session, name, ...args);
  assert.equal(res.status, 200, name);
  return res.json() as Promise<T>;
}

async function store(session: string, prefix = 'photo') {
  const base = `${prefix}-${randomId(16)}`;
  for (const suffix of prefix === 'photo' ? ['', '-sm', '-md', '-lg'] : ['']) {
    const res = await call(session, `/img/${base}${suffix}.webp`, { method: 'PUT', body: WEBP });
    assert.equal(res.status, 201);
  }
  return { base, url: `/img/${base}.webp` };
}

async function upload(session: string, meta: Record<string, unknown> = {}) {
  const { albums, ...photo } = meta;
  const { base, url } = await store(session);
  const id = randomId(8);
  await rpc(session, 'insertPhoto', {
    id,
    url,
    extension: 'webp',
    aspectRatio: 1.5,
    takenAt: '2026-05-01T08:00:00.000Z',
    takenAtNaive: '2026-05-01 08:00:00',
    ...photo,
  });
  for (const title of (albums as string[] | undefined) ?? []) {
    const albumId = await rpc(session, 'insertAlbum', { title });
    await rpc(session, 'addPhotoAlbumIds', [id], [albumId]);
  }
  return { id, base, url };
}

async function remove(session: string, ...photos: { id: string; base: string }[]) {
  for (const { id, base } of photos) {
    await rpc(session, 'deletePhoto', id);
    const files = await rpc<{ fileName: string }[]>(session, 'getStorageUrlsForPrefix', base);
    for (const { fileName } of files) {
      assert.equal((await call(session, `/img/${fileName}`, { method: 'DELETE' })).status, 204);
    }
  }
}

const FILE_BYTES = WEBP.length * 4;

test('serves the app shell but no data without a token', async () => {
  const shell = await fetch(BASE);
  assert.equal(shell.status, 200);
  assert.match(shell.headers.get('Content-Type')!, /text\/html/);
  for (const path of ['/api/me', '/img/photo-aaaaaaaaaaaaaaaa.webp', '/img/nope']) {
    assert.equal((await fetch(BASE + path)).status, 401, path);
  }
  const query = await fetch(`${BASE}/api/rpc/getPhotos`, {
    method: 'POST',
    body: '[]',
    headers: { Origin: BASE },
  });
  assert.equal(query.status, 401);
});

test('accepts only tokens that Access issued for this application', async () => {
  const valid = claimsFor('alice');
  const [header, payload, signature] = issue(valid).split('.');
  const rejected = {
    'signed by another key': issue(valid, { key: stranger.privateKey }),
    'another application': issue({ ...valid, aud: ['other-audience'] }),
    'another team': issue({ ...valid, iss: 'https://evil.cloudflareaccess.com' }),
    expired: issue({ ...valid, exp: Math.floor(Date.now() / 1000) - 1 }),
    'no expiry': issue({ ...valid, exp: undefined }),
    'no email': issue({ ...valid, email: undefined }),
    'unknown key': issue(valid, { header: { kid: 'other-key' } }),
    'unsigned': `${encode({ alg: 'none', kid: KID })}.${payload}.`,
    'edited payload': `${header}.${encode({ ...valid, email: 'admin@nbtca.space' })}.${signature}`,
    garbage: 'not-a-token',
  };
  for (const [reason, token] of Object.entries(rejected)) {
    assert.equal((await call(token, '/api/me')).status, 401, reason);
  }

  const viaCookie = await fetch(`${BASE}/api/me`, {
    headers: { Cookie: `other=1; CF_Authorization=${issue(valid)}` },
  });
  assert.equal(viaCookie.status, 200);
});

test('treats listed emails as admins, ignoring case', async () => {
  const me = async (user: string) =>
    (await (await call(issue(claimsFor(user)), '/api/me')).json()) as { name: string; admin: boolean };
  assert.deepEqual(await me('ALICE'), { name: 'alice@nbtca.space', admin: false, used: 0, quota: QUOTA_BYTES });
  assert.equal((await me('admin')).admin, true);
  assert.equal((await me('root')).admin, true);
  assert.equal((await me('administrator')).admin, false);
});

test('members upload, browse and manage their own photos', async () => {
  const alice = (await signIn('alice')).session!;
  const bob = (await signIn('bob')).session!;
  const admin = (await signIn('admin')).session!;

  assert.deepEqual(await (await call(admin, '/api/me')).json(), {
    name: 'admin@nbtca.space',
    admin: true,
    used: 0,
    quota: null,
  });

  const photo = await upload(alice, { make: 'FUJIFILM', iso: 400, fNumber: 'bad', title: ' 合影 ' });
  const { id, url } = photo;

  const [row] = await rpc(bob, 'getPhotos', {});
  assert.equal(row.id, id);
  assert.equal(row.url, url);
  assert.equal(row.extension, 'webp');
  assert.equal(row.title, '合影');
  assert.equal(row.owner_name, 'alice@nbtca.space');
  assert.equal(row.make, 'FUJIFILM');
  assert.equal(row.iso, 400);
  assert.equal(row.f_number, null);
  assert.equal(row.taken_at, '2026-05-01T08:00:00.000Z');
  assert.equal(row.taken_at_naive, '2026-05-01 08:00:00');
  assert.deepEqual(row.tags, []);
  assert.equal(row.hidden, false);
  assert.equal(row.editable, false);
  for (const secret of ['owner_sub', 'make_slug']) assert.equal(secret in row, false, secret);
  assert.equal((await rpc(alice, 'getPhoto', id)).editable, true);
  assert.equal((await rpc(admin, 'getPhoto', id)).editable, true);
  assert.equal(await rpc(bob, 'getPhoto', 'missing1'), null);

  const image = await call(bob, url);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('Content-Type'), 'image/webp');
  assert.match(image.headers.get('Cache-Control')!, /^private/);
  assert.equal(image.headers.get('Vary'), 'Cookie');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), WEBP);
  const cached = await call(bob, url, { headers: { 'If-None-Match': image.headers.get('ETag')! } });
  assert.equal(cached.status, 304);

  const edit = { id, url, takenAt: row.taken_at, takenAtNaive: row.taken_at_naive, title: '新标题', tags: ['team-photo'] };
  assert.equal((await send(bob, 'updatePhoto', edit)).status, 403);
  assert.equal((await send(bob, 'deletePhoto', id)).status, 403);
  assert.equal((await send(bob, 'setPhotoVisibilityForIds', [id], true, false)).status, 403);
  assert.equal((await send(bob, 'addTagsToPhotos', ['x'], [id])).status, 403);
  assert.equal((await send(bob, 'updatePhotoTitleCaption', [id], ['x'], [null])).status, 403);
  assert.equal((await send(bob, 'clearPhotoAlbumIds', id)).status, 403);
  assert.equal((await call(bob, url, { method: 'PUT', body: WEBP })).status, 403);
  assert.equal((await call(bob, url, { method: 'DELETE' })).status, 403);
  assert.equal((await call(alice, url, { method: 'DELETE' })).status, 409);
  assert.equal((await rpc(bob, 'getPhoto', id)).title, '合影');

  await rpc(alice, 'updatePhoto', edit);
  const edited = await rpc(bob, 'getPhoto', id);
  assert.equal(edited.title, '新标题');
  assert.deepEqual(edited.tags, ['team-photo']);
  assert.equal(edited.owner_name, 'alice@nbtca.space');

  await rpc(alice, 'addTagsToPhotos', ['favs', 'team-photo'], [id]);
  assert.deepEqual((await rpc(bob, 'getPhoto', id)).tags, ['team-photo', 'favs']);
  await rpc(alice, 'updatePhotoTitleCaption', [id], ['合影'], ['说明']);
  assert.equal((await rpc(bob, 'getPhoto', id)).caption, '说明');

  await remove(admin, photo);
  assert.equal(await rpc(bob, 'getPhoto', id), null);
  assert.equal((await call(bob, url)).status, 404);
  assert.equal((await call(bob, `/img/${photo.base}-sm.webp`)).status, 404);
  assert.equal(((await (await call(alice, '/api/me')).json()) as { used: number }).used, 0);
});

test('keeps private photos and pending uploads to their owner', async () => {
  const alice = (await signIn('alice')).session!;
  const bob = (await signIn('bob')).session!;
  const admin = (await signIn('admin')).session!;
  const mine = await upload(alice, { hidden: true });
  const theirs = await upload(bob);
  const ids = async (session: string, options: object) =>
    (await rpc<{ id: string }[]>(session, 'getPhotos', options)).map(({ id }) => id);

  assert.deepEqual(await ids(bob, {}), [theirs.id]);
  assert.deepEqual(await ids(bob, { hidden: 'only' }), []);
  assert.deepEqual(await ids(bob, { hidden: 'include' }), [theirs.id]);
  assert.deepEqual(await ids(alice, { hidden: 'only' }), [mine.id]);
  assert.deepEqual(await ids(alice, { hidden: 'include' }), [mine.id]);
  assert.deepEqual((await ids(admin, { hidden: 'include' })).sort(), [mine.id, theirs.id].sort());
  assert.equal(await rpc(bob, 'getPhoto', mine.id, true), null);
  assert.equal(await rpc(alice, 'getPhoto', mine.id), null);
  assert.equal((await rpc(alice, 'getPhoto', mine.id, true)).id, mine.id);
  assert.equal((await rpc(admin, 'getPhoto', mine.id, true)).id, mine.id);

  await rpc(alice, 'setPhotoVisibilityForIds', [mine.id], false, true);
  assert.deepEqual((await ids(bob, {})).sort(), [mine.id, theirs.id].sort());
  assert.deepEqual(await ids(bob, { excludeFromFeeds: true }), [theirs.id]);

  const pending = await store(alice, 'upload');
  assert.equal((await call(alice, pending.url)).status, 200);
  assert.equal((await call(bob, pending.url)).status, 404);
  assert.equal((await call(admin, pending.url)).status, 200);
  assert.deepEqual(await rpc(bob, 'getStorageUrlsForPrefix', 'upload-'), []);
  const [listed] = await rpc(alice, 'getStorageUrlsForPrefix', 'upload-');
  assert.equal(listed.url, pending.url);
  assert.equal(listed.bytes, WEBP.length);
  assert.equal((await send(bob, 'insertPhoto', { id: randomId(8), url: pending.url, takenAt: '2026-01-01', takenAtNaive: 'x' })).status, 403);
  assert.equal((await send(bob, 'insertPhoto', { id: randomId(8), url: theirs.url.replace('photo-', 'photo-zz'), takenAt: '2026-01-01', takenAtNaive: 'x' })).status, 403);
  assert.equal((await send(bob, 'insertPhoto', { id: randomId(8), url: mine.url, takenAt: '2026-01-01', takenAtNaive: 'x' })).status, 403);
  assert.equal((await call(alice, pending.url, { method: 'DELETE' })).status, 204);

  await remove(alice, mine);
  await remove(bob, theirs);
});

test('filters and groups photos the way the interface asks', async () => {
  const alice = (await signIn('alice')).session!;
  const admin = (await signIn('admin')).session!;
  const fuji = await upload(alice, {
    takenAt: '2025-03-01T00:00:00.000Z',
    takenAtNaive: '2025-03-01 00:00:00',
    make: 'FUJIFILM',
    model: 'X-T5',
    lensMake: 'FUJIFILM',
    lensModel: 'XF35mmF1.4 R',
    focalLength: 35,
    film: 'classic-neg',
    recipeTitle: 'pacific-blue',
    recipeData: '{"a":1}',
    tags: ['favs', 'welcome'],
    albums: ['2026 秋季招新'],
    title: 'Opening Night',
    aspectRatio: 1.5,
  });
  const canon = await upload(alice, {
    takenAt: '2026-06-01T00:00:00.000Z',
    takenAtNaive: '2026-06-01 00:00:00',
    make: 'Canon',
    model: 'Canon EOS R6',
    lensModel: 'RF50mm F1.8 STM',
    focalLength: 50,
    tags: ['favs'],
    albums: ['2026 秋季招新', 'LAN Party'],
    caption: 'late night',
    aspectRatio: 0.66,
  });
  const hidden = await upload(alice, {
    takenAt: '2026-07-01T00:00:00.000Z',
    takenAtNaive: '2026-07-01 00:00:00',
    hidden: true,
  });

  const ids = async (options: object, session = alice) =>
    (await rpc<{ id: string }[]>(session, 'getPhotos', options)).map(({ id }) => id);

  assert.deepEqual(await ids({}), [canon.id, fuji.id]);
  assert.deepEqual(await ids({ sortBy: 'takenAtAsc' }), [fuji.id, canon.id]);
  assert.deepEqual(await ids({ limit: 1, offset: 1 }), [fuji.id]);
  assert.deepEqual(await ids({ hidden: 'include' }, admin), [hidden.id, canon.id, fuji.id]);
  assert.deepEqual(await ids({ year: '2025' }), [fuji.id]);
  assert.deepEqual(await ids({ camera: { make: 'fujifilm', model: 'x-t5' } }), [fuji.id]);
  assert.deepEqual(await ids({ camera: { make: 'canon', model: 'canon-eos-r6' } }), [canon.id]);
  assert.deepEqual(await ids({ lens: { make: 'fujifilm', model: 'xf35mmf1.4-r' } }), [fuji.id]);
  assert.deepEqual(await ids({ lens: { model: 'rf50mm-f1.8-stm' } }), [canon.id]);
  assert.deepEqual(await ids({ tag: 'favs' }), [canon.id, fuji.id]);
  assert.deepEqual(await ids({ tag: 'welcome' }), [fuji.id]);
  assert.deepEqual(await ids({ film: 'classic-neg' }), [fuji.id]);
  assert.deepEqual(await ids({ recipe: 'pacific-blue' }), [fuji.id]);
  assert.deepEqual(await ids({ focal: 50 }), [canon.id]);
  assert.deepEqual(await ids({ query: 'opening' }), [fuji.id]);
  assert.deepEqual(await ids({ query: 'LATE' }), [canon.id]);
  assert.deepEqual(await ids({ maximumAspectRatio: 1 }), [canon.id]);
  assert.deepEqual(await ids({ takenBefore: '2026-01-01T00:00:00.000Z' }), [fuji.id]);
  assert.deepEqual(await ids({ photoIds: [fuji.id, hidden.id] }), [fuji.id]);
  assert.deepEqual(await ids({ recent: true }), [canon.id, fuji.id]);
  assert.deepEqual(await ids({ tag: 'x\' OR 1=1 --' }), []);
  assert.equal(await rpc(alice, 'getPhotoCount', { tag: 'favs' }), 2);
  assert.deepEqual(await rpc(alice, 'getPhotoIds', { tag: 'favs' }), [canon.id, fuji.id]);

  const album = await rpc(alice, 'getAlbumFromSlug', '2026-秋季招新');
  assert.equal(album.title, '2026 秋季招新');
  assert.deepEqual(await ids({ album }), [canon.id, fuji.id]);
  assert.deepEqual(await rpc(alice, 'getAlbumTitlesForPhoto', fuji.id), ['2026 秋季招新']);
  assert.deepEqual((await rpc<string[]>(alice, 'getTagsForAlbum', album.id)).sort(), ['favs', 'welcome']);
  const albums = await rpc<{ title: string; count: number }[]>(alice, 'getAlbumsWithMeta');
  assert.deepEqual(
    albums.map(({ title, count }) => [title, count]).sort(),
    [
      ['2026 秋季招新', 2],
      ['LAN Party', 1],
    ],
  );

  const meta = await rpc(alice, 'getPhotosMeta', {});
  assert.equal(meta.count, 2);
  assert.deepEqual(meta.dateRange, { start: '2025-03-01 00:00:00', end: '2026-06-01 00:00:00' });

  const near = await rpc(alice, 'getPhotosNearId', fuji.id, { limit: 3 });
  assert.equal(near.indexNumber, 2);
  assert.deepEqual(near.photos.map(({ id }: { id: string }) => id), [canon.id, fuji.id]);
  assert.equal('row_number' in near.photos[0], false);

  const group = async (name: string, key: string) =>
    (await rpc<Record<string, unknown>[]>(alice, name)).map((row) => [row[key], row.count]);
  assert.deepEqual(await group('getUniqueTags', 'tag'), [['favs', 2], ['welcome', 1]]);
  assert.deepEqual(await group('getUniqueYears', 'year'), [['2026', 1], ['2025', 1]]);
  assert.deepEqual(await group('getUniqueCameras', 'model'), [['Canon EOS R6', 1], ['X-T5', 1]]);
  assert.deepEqual(await group('getUniqueLenses', 'lens_model'), [['RF50mm F1.8 STM', 1], ['XF35mmF1.4 R', 1]]);
  assert.deepEqual(await group('getUniqueFilms', 'film'), [['classic-neg', 1]]);
  assert.deepEqual(await group('getUniqueFocalLengths', 'focal_length'), [[35, 1], [50, 1]]);
  assert.deepEqual(await group('getUniqueRecipes', 'recipe_title'), [['pacific-blue', 1]]);
  assert.equal(await rpc(alice, 'getRecipeDataForTitle', 'pacific-blue'), '{"a":1}');
  assert.equal(await rpc(alice, 'getRecipeTitleForData', '{"a":1}', 'classic-neg'), 'pacific-blue');

  assert.equal((await send(alice, 'renamePhotoTagGlobally', 'favs', 'best')).status, 403);
  assert.equal((await send(alice, 'deleteAlbum', album.id)).status, 403);
  await rpc(admin, 'renamePhotoTagGlobally', 'welcome', 'hello');
  assert.deepEqual(await ids({ tag: 'hello' }), [fuji.id]);
  await rpc(admin, 'deletePhotoTagGlobally', 'hello');
  assert.deepEqual((await rpc(alice, 'getPhoto', fuji.id)).tags, ['favs']);

  await rpc(alice, 'clearPhotoAlbumIds', canon.id);
  const remaining = await rpc<{ title: string }[]>(alice, 'getAlbumsWithMeta');
  assert.deepEqual(remaining.map(({ title }) => title), ['2026 秋季招新']);

  await remove(alice, fuji, canon, hidden);
  assert.deepEqual(await rpc(alice, 'getAlbumsWithMeta'), []);
  assert.equal(await rpc(alice, 'getAlbumFromSlug', '2026-秋季招新'), null);
});

test('rejects unknown calls and malformed arguments', async () => {
  const alice = (await signIn('alice')).session!;
  const post = (name: string, body: string) =>
    call(alice, `/api/rpc/${name}`, { method: 'POST', body });
  assert.equal((await post('dropEverything', '[]')).status, 404);
  assert.equal((await post('constructor', '[]')).status, 404);
  assert.equal((await post('getPhotos', '{}')).status, 400);
  assert.equal((await post('getPhotos', 'nope')).status, 400);
  assert.equal((await post('insertPhoto', '[{"id":"../../x"}]')).status, 400);
  assert.equal((await post('insertPhoto', '[null]')).status, 400);
});

test('rejects invalid files', async () => {
  const alice = (await signIn('alice')).session!;
  const put = (name: string, body: BodyInit) => call(alice, `/img/${name}`, { method: 'PUT', body });
  assert.equal((await put('photo-aaaaaaaaaaaaaaaa.webp', '<html>')).status, 415);
  assert.equal((await put('photo-aaaaaaaaaaaaaaaa.html', WEBP)).status, 404);
  assert.equal((await put('secret-aaaaaaaaaaaaaaaa.webp', WEBP)).status, 404);
  assert.equal((await put('photo-aaaaaaaaaaaaaaaa.webp', Buffer.alloc(13 * 1024 * 1024))).status, 413);
  assert.deepEqual(await rpc(alice, 'getStorageUrlsForPrefix', 'photo-'), []);
});

test('rejects cross-origin writes', async () => {
  const alice = (await signIn('alice')).session!;
  for (const headers of [{ Origin: 'https://evil.example' }, { Origin: '' }]) {
    const put = await fetch(`${BASE}/img/photo-aaaaaaaaaaaaaaaa.webp`, {
      method: 'PUT',
      body: WEBP,
      headers: { 'Cf-Access-Jwt-Assertion': alice, ...headers },
    });
    assert.equal(put.status, 403);
    const post = await fetch(`${BASE}/api/rpc/getPhotos`, {
      method: 'POST',
      body: '[]',
      headers: { 'Cf-Access-Jwt-Assertion': alice, ...headers },
    });
    assert.equal(post.status, 403);
  }
});

test('stops uploads once a member reaches their quota', async () => {
  const carol = (await signIn('carol')).session!;
  const admin = (await signIn('admin')).session!;
  const put = (session: string) =>
    call(session, `/img/upload-${randomId(16)}.webp`, { method: 'PUT', body: WEBP });

  const photos = [];
  while (photos.length * FILE_BYTES < QUOTA_BYTES) photos.push(await upload(carol));
  const me = (await (await call(carol, '/api/me')).json()) as { used: number };
  assert.equal(me.used, photos.length * FILE_BYTES);
  assert.equal((await put(carol)).status, 507);
  assert.equal((await put(admin)).status, 201);

  await remove(carol, photos.pop()!);
  assert.equal((await put(carol)).status, 201);
  await remove(carol, ...photos);
});

test('removes abandoned files on schedule', async () => {
  const alice = (await signIn('alice')).session!;
  const kept = await upload(alice);
  const pending = await store(alice, 'upload');
  const orphan = await store(alice);

  assert.equal((await fetch(`${BASE}/cdn-cgi/handler/scheduled`)).status, 200);

  assert.equal((await call(alice, pending.url)).status, 404);
  assert.equal((await call(alice, orphan.url)).status, 404);
  assert.equal((await call(alice, `/img/${orphan.base}-sm.webp`)).status, 404);
  assert.equal((await call(alice, kept.url)).status, 200);
  assert.equal((await call(alice, `/img/${kept.base}-lg.webp`)).status, 200);
  const me = (await (await call(alice, '/api/me')).json()) as { used: number };
  assert.equal(me.used, FILE_BYTES);
  await remove(alice, kept);
});

test('lets only admins describe the library', async () => {
  const alice = (await signIn('alice')).session;
  const admin = (await signIn('admin')).session;
  const avatar = await upload(alice);
  assert.equal(await rpc(alice, 'getLibrary'), null);

  const library = { title: '相册', description: '简介', photoIdAvatar: avatar.id, photoIdHero: 'missing1' };
  assert.equal((await send(alice, 'upsertLibrary', library)).status, 403);
  await rpc(admin, 'upsertLibrary', library);
  await rpc(admin, 'upsertLibrary', { ...library, title: '协会相册' });

  const saved = await rpc(alice, 'getLibrary');
  assert.equal(saved.title, '协会相册');
  assert.equal(saved.description, '简介');
  assert.equal(saved.photo_id_avatar, avatar.id);
  assert.equal(saved.photo_id_hero, null);

  await remove(alice, avatar);
  assert.equal((await rpc(alice, 'getLibrary')).photo_id_avatar, null);
});
