# photo

The members-only photo album of NBTCA, served from `photo.nbtca.space`.

It is a fork of [exif-photo-blog](https://github.com/sambecker/exif-photo-blog) and keeps its interface. Upstream is a Next.js app that renders on a server and talks to Postgres. This fork builds the same interface as a static app and moves everything else into one Cloudflare Worker, so it runs on the Workers free plan.

## What changed from upstream

- **Rendering**: Vite builds the app as static files. `spa/` holds the router and stand-ins for the `next/*` modules. Server components and server actions run in the browser.
- **Data**: `worker/` ports the Postgres schema and queries to [D1](https://developers.cloudflare.com/d1/).
- **Storage**: photos live in a private [R2](https://developers.cloudflare.com/r2/) bucket and are only served to signed-in members.
- **Image processing**: the browser re-encodes every photo to WebP on a canvas, so stored files carry no EXIF or GPS data. Camera settings are read before that and kept in D1.
- **Access**: [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/) guards the whole site, and every member can upload.
- **Removed**: AI text, color analysis, share preview images, feeds, the configuration and insights pages, and re-syncing a photo from its file.

## Access

Cloudflare Access sits in front of `photo.nbtca.space` and signs members in through Logto. Its policy decides who is a member. The Worker verifies the token Access attaches to each request and uses the email in it as the identity, so a request that bypasses Access gets nothing.

| Who | Can do |
| --- | --- |
| Anyone the Access policy admits | Browse, upload, edit and delete their own photos |
| Emails in `ADMIN_EMAILS` | Everything above for every photo, and manage albums, tags, recipes |

Private photos and unfinished uploads are visible to their owner and to admins.

Each member can store `USER_QUOTA_MB` of files and the whole album stops accepting uploads at `TOTAL_QUOTA_MB`, which keeps the bucket inside the R2 free tier. Admins are exempt from the per-member limit. A daily cron removes files that never became photos within `PENDING_UPLOAD_TTL` seconds.

## Access setup

In Zero Trust, add a self-hosted application for `photo.nbtca.space` with Logto as the identity provider and a policy that admits members. Put its Application Audience (AUD) tag in `ACCESS_AUD` and the admins' emails, comma-separated, in `ADMIN_EMAILS` in `wrangler.jsonc`. Until `ACCESS_AUD` is set the Worker rejects every request.

## Development

```sh
pnpm install
pnpm test        # builds, then runs the Worker with test-signed Access tokens
pnpm test:unit   # upstream's unit tests
pnpm typecheck
pnpm lint
```

Access only runs in production. The tests stand in for it by signing tokens with their own key.

Site settings such as the title and locale are the `NEXT_PUBLIC_*` values in `vite.config.ts`.

## Deployment

```sh
wrangler d1 create photo               # copy the ID into wrangler.jsonc
wrangler r2 bucket create photo
wrangler d1 migrations apply photo --remote
pnpm deploy
```
