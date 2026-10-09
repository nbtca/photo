import {
  getPhotosMetaCached,
  getUniqueRecipesCached,
  getUniqueTagsCached,
} from '@/photo/cache';
import { getAlbumsWithMetaCached } from '@/album/cache';
import { getStorageUploadUrlsNoStore } from '@/platforms/storage/cache';
import { revalidatePath } from 'next/cache';
import { me } from '@spa/me';

export type AdminData = Awaited<ReturnType<typeof getAdminDataAction>>;

export const revalidateAdminAfterUploadAction = async () =>
  revalidatePath('/admin', 'layout');

const count = <T>(promise: Promise<T[]>) =>
  promise.then(items => items.length).catch(() => 0);

export const getAdminDataAction = async () => {
  const admin = Boolean((await me)?.admin);

  const [
    photosCountTotal,
    photosCountHidden,
    uploadsCount,
    albumsCount,
    tagsCount,
    recipesCount,
  ] = await Promise.all([
    getPhotosMetaCached({ hidden: 'include' })
      .then(({ count }) => count)
      .catch(() => 0),
    getPhotosMetaCached({ hidden: 'only' })
      .then(({ count }) => count)
      .catch(() => 0),
    count(getStorageUploadUrlsNoStore()),
    count(getAlbumsWithMetaCached()),
    count(getUniqueTagsCached()),
    count(getUniqueRecipesCached()),
  ]);

  return {
    photosCount: photosCountTotal - photosCountHidden,
    photosCountHidden,
    photosCountNeedSync: 0,
    photosCountTotal,
    uploadsCount,
    // Albums, tags and recipes are shared, so only admins manage them
    albumsCount: admin ? albumsCount : 0,
    tagsCount: admin ? tagsCount : 0,
    recipesCount: admin ? recipesCount : 0,
    insightsIndicatorStatus: undefined,
  } as const;
};
