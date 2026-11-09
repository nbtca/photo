import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';

// Server code that upstream keeps out of the browser lands in this bundle when ported, so a
// budget catches it before members download it on every visit. It includes the route chunks
// that index.html preloads.
const INITIAL_GZIP_BUDGET = 345_000;

test('keeps the files loaded on every page within budget', () => {
  const html = readFileSync('dist/index.html', 'utf8');
  const files = new Set(html.match(/\/assets\/[^"]+\.(js|css)/g));
  const bytes = [...files].reduce((total, file) => total + gzipSync(readFileSync(`dist${file}`)).length, 0);
  assert.ok(bytes <= INITIAL_GZIP_BUDGET, `${bytes} gzipped bytes exceed ${INITIAL_GZIP_BUDGET}`);
});
