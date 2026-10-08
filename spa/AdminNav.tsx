import { use } from 'react';
import { getUniqueRecipesCached } from '@/photo/cache';
import {
  PATH_ADMIN_ALBUMS,
  PATH_ADMIN_PHOTOS,
  PATH_ADMIN_RECIPES,
  PATH_ADMIN_TAGS,
  PATH_ADMIN_UPLOADS,
} from '@/app/path';
import AdminNavClient from '@/admin/AdminNavClient';
import { getAppText } from '@/i18n/state/server';
import { useDataVersion } from '@spa/next/navigation';

const load = () => Promise.all([
  fetch('/api/me').then(response => response.json() as Promise<{
    admin: boolean
  }>),
  getUniqueRecipesCached().then(recipes => recipes.length).catch(() => 0),
  getAppText(),
]);

let loaded: { version: number, result: ReturnType<typeof load> } | undefined;

// Albums, tags and recipes are shared by everyone, so only admins manage them.
export default function AdminNav() {
  const version = useDataVersion();
  if (loaded?.version !== version) { loaded = { version, result: load() }; }
  const [{ admin }, countRecipes, appText] = use(loaded.result);

  const items = [{
    label: appText.photo.photoPlural,
    href: PATH_ADMIN_PHOTOS,
  }, {
    label: appText.admin.uploadPlural,
    href: PATH_ADMIN_UPLOADS,
  }];

  if (admin) {
    items.push({
      label: appText.category.albumPlural,
      href: PATH_ADMIN_ALBUMS,
    }, {
      label: appText.category.tagPlural,
      href: PATH_ADMIN_TAGS,
    });
    if (countRecipes > 0) {
      items.push({
        label: appText.category.recipePlural,
        href: PATH_ADMIN_RECIPES,
      });
    }
  }

  return (
    <AdminNavClient {...{
      items,
      includeInsights: false,
    }} />
  );
}
