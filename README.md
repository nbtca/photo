# photo

The members-only photo album of NBTCA, served from `photo.nbtca.space`.

It is a fork of [exif-photo-blog](https://github.com/sambecker/exif-photo-blog) and keeps its interface. Upstream is a Next.js app that renders on a server and talks to Postgres. This fork builds the same interface as a static app and moves everything else into one Cloudflare Worker, so it runs on the Workers free plan.

## What changed from upstream

- **Rendering**: Vite builds the app as static files. `spa/` holds the router and stand-ins for the `next/*` modules. Server components and server actions run in the browser.
- **Data**: `worker/` ports the Postgres schema and queries to [D1](https://developers.cloudflare.com/d1/).
- **Storage**: photos live in a private [R2](https://developers.cloudflare.com/r2/) bucket and are only served to signed-in members.
- **Image processing**: the browser re-encodes every photo to WebP on a canvas, so stored files carry no EXIF or GPS data. Camera settings are read before that and kept in D1.
- **Access**: sign-in goes through Logto, and every member can upload.
- **Removed**: AI text, color analysis, share preview images, feeds, the configuration and insights pages, and re-syncing a photo from its file.

## Access

Sign-in goes through Logto at `auth.app.nbtca.space`. Roles are read once at sign-in and a session lasts 24 hours, so removing a role takes effect within a day.

| Logto role    | Can do                                                             |
| ------------- | ------------------------------------------------------------------ |
| `Member`      | Browse, upload, edit and delete their own photos                   |
| `Photo Admin` | Everything above for every photo, and manage albums, tags, recipes |

Private photos and unfinished uploads are visible to their owner and to admins.

Each member can store `USER_QUOTA_MB` of files and the whole album stops accepting uploads at `TOTAL_QUOTA_MB`, which keeps the bucket inside the R2 free tier. Admins are exempt from the per-member limit. A daily cron removes files that never became photos within `PENDING_UPLOAD_TTL` seconds.

## Logto setup

Create a Traditional Web application with:

- Redirect URI: `https://photo.nbtca.space/auth/callback`
- Post sign-out redirect URI: `https://photo.nbtca.space`

Create the two roles above and assign them to users. Put the app ID in `LOGTO_CLIENT_ID` in `wrangler.jsonc`.

## Development

```sh
pnpm install
pnpm test        # builds, then runs the Worker against a stub OIDC issuer
pnpm test:unit   # upstream's unit tests
pnpm typecheck
pnpm lint
```

`pnpm dev` serves the built app on `http://localhost:8787`. It needs a `.dev.vars` file with `LOGTO_CLIENT_ID`, `LOGTO_CLIENT_SECRET` and `SESSION_SECRET`, and `http://localhost:8787/auth/callback` registered as a redirect URI in Logto.

Site settings such as the title and locale are the `NEXT_PUBLIC_*` values in `vite.config.ts`.

## Deployment

```sh
wrangler d1 create photo               # copy the ID into wrangler.jsonc
wrangler r2 bucket create photo
wrangler d1 migrations apply photo --remote
wrangler secret put LOGTO_CLIENT_SECRET
wrangler secret put SESSION_SECRET     # openssl rand -base64 32
pnpm deploy
```
