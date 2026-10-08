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
import { unstable_cache } from 'next/cache';

const load = unstable_cache(() => Promise.all([
  fetch('/api/me').then(response => response.json() as Promise<{
    admin: boolean
  }>),
  getUniqueRecipesCached().then(recipes => recipes.length).catch(() => 0),
  getAppText(),
]));

// Albums, tags and recipes are shared by everyone, so only admins manage them.
export default function AdminNav() {
  const [{ admin }, countRecipes, appText] = use(load());

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
