import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

const LOCALE = 'zh-cn';

const ENV: Record<string, string> = {
  NODE_ENV: process.env.NODE_ENV ?? 'production',
  NEXT_PUBLIC_LOCALE: LOCALE,
  NEXT_PUBLIC_DOMAIN: 'photo.nbtca.space',
  NEXT_PUBLIC_META_TITLE: 'NBTCA 相册',
  NEXT_PUBLIC_META_DESCRIPTION: '宁波工程学院计算机协会相册',
  NEXT_PUBLIC_NAV_TITLE: 'NBTCA 相册',
  NEXT_PUBLIC_GRID_HOMEPAGE: '1',
  NEXT_PUBLIC_GEO_PRIVACY: '1',
  NEXT_PUBLIC_HIDE_SOCIAL: '1',
  NEXT_PUBLIC_HIDE_REPO_LINK: '1',
  NEXT_PUBLIC_SITE_FEEDS: '0',
};

const src = (file: string) => path.resolve(__dirname, 'src', file);
const spa = (file: string) => path.resolve(__dirname, 'spa', file);

// Server components are async functions. In the browser they run through
// wrapAsync, which suspends on their result.
const asyncComponents = (): Plugin => ({
  name: 'async-components',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('.tsx') || id.includes('node_modules')) { return; }
    const match = code.match(/export default async function (\w+)/);
    if (!match) { return; }
    const [declaration, name] = match;
    return [
      'import { wrapAsync as __wrapAsync } from \'@spa/async\';',
      code.replace(declaration, `async function ${name}`),
      `export default __wrapAsync(${name}, ${JSON.stringify(name)});`,
    ].join('\n');
  },
});

// Modules that only run on the server upstream, mapped to browser stand-ins
// that call the Worker. Exports a stand-in omits reject when called.
const REPLACED_MODULES: Record<string, string> = {
  'photo/query.ts': 'server/photo-query.ts',
  'album/query.ts': 'server/album-query.ts',
  'photo/actions.ts': 'server/photo-actions.ts',
  'admin/actions.ts': 'server/admin-actions.ts',
  'auth/actions.ts': 'server/auth-actions.ts',
  'category/actions.ts': 'server/category-actions.ts',
  'i18n/state/AppTextProvider.tsx': 'AppTextProvider.tsx',
  'platforms/storage/index.ts': 'server/storage.ts',
  'platforms/next-image.ts': 'server/next-image.ts',
  'platforms/redis.ts': 'server/redis.ts',
  'platforms/postgres.ts': 'server/postgres.ts',
  'auth/server.ts': 'server/auth-server.ts',
};

const EXPORT_NAME = /^export (?:const|let|function|async function|class) (\w+)/gm;

const replaceServerModules = (): Plugin => {
  const replacements = new Map(Object.entries(REPLACED_MODULES)
    .map(([original, replacement]) => [src(original), spa(replacement)]));
  const originals = new Map([...replacements].map(([a, b]) => [b, a]));
  return {
    name: 'replace-server-modules',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer) { return; }
      const resolved =
        await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved && replacements.get(resolved.id);
    },
    load(id) {
      const original = originals.get(id);
      if (!original) { return; }
      const code = fs.readFileSync(id, 'utf8');
      const provided = new Set([...code.matchAll(EXPORT_NAME)].map(m => m[1]));
      const missing = [...fs.readFileSync(original, 'utf8').matchAll(EXPORT_NAME)]
        .map(m => m[1])
        .filter(name => !provided.has(name));
      return [
        code,
        ...missing.map(name => `export const ${name} = (...args) => ` +
          `Promise.reject(new Error('${name} is not available'));`),
      ].join('\n');
    },
  };
};

const next = (specifier: string, file: string) => ({
  find: new RegExp(`^${specifier.replace(/[/.]/g, '\\$&')}$`),
  replacement: spa(file),
});

export default defineConfig({
  plugins: [replaceServerModules(), asyncComponents(), react()],
  define: {
    'process.env': JSON.stringify(ENV),
    'process.version': JSON.stringify(''),
  },
  resolve: {
    alias: [
      next('next/link', 'next/link.tsx'),
      next('next/image', 'next/image.tsx'),
      next('next/navigation', 'next/navigation.ts'),
      next('next/cache', 'next/cache.ts'),
      {
        find: './date-fns-locale-alias',
        replacement: src(`i18n/locales/${LOCALE}`),
      },
      { find: /^@spa\//, replacement: `${spa('')}/` },
      { find: /^@\//, replacement: `${src('')}/` },
    ],
  },
  build: { outDir: 'dist' },
});
