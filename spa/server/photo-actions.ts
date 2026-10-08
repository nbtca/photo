import { PhotoQueryOptions } from '@/db';
import { getPhotos } from '@/photo/query';
import { getPhotosCached } from '@/photo/cache';
import { invalidateData } from '@spa/data';

export const getPhotosAction = async (
  options: PhotoQueryOptions,
  warmOnly?: boolean,
) => warmOnly ? [] : getPhotos(options);

export const getPhotosCachedAction = async (
  options: PhotoQueryOptions,
  warmOnly?: boolean,
) => warmOnly ? [] : getPhotosCached(options);

export const clearCacheAction = async () => invalidateData();

const unsupported = async (..._args: unknown[]): Promise<never> => {
  throw new Error('Not supported');
};

export const deletePhotoTagGloballyAction = unsupported;
export const upgradeTagToAlbumAction = unsupported;
