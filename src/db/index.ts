import { PhotoSetCategory } from '@/category';
import { Camera } from '@/camera';
import { Lens } from '@/lens';
import { SortBy } from '@/photo/sort';
import { Album } from '@/album';
import { getPathComponents } from '@/app/path';
import { getAlbumFromSlug } from '@/album/query';
import { isTagPrivate } from '@/tag';
import { getPhotoCount } from '@/photo/query';

export const GENERATE_STATIC_PARAMS_LIMIT = 1000;

export type PhotoQueryOptions = {
  sortBy?: SortBy
  sortWithPriority?: boolean
  limit?: number
  offset?: number
  query?: string
  maximumAspectRatio?: number
  takenBefore?: Date
  takenAfterInclusive?: Date
  updatedBefore?: Date
  excludeFromFeeds?: boolean
  hidden?: 'exclude' | 'include' | 'only'
} & Omit<PhotoSetCategory, 'camera' | 'lens' | 'album'> & {
  camera?: Partial<Camera>
  lens?: Partial<Lens>
  album?: Album
  photoIds?: string[]
};

export const areOptionsSensitive = (options: PhotoQueryOptions) =>
  options.hidden === 'include' || options.hidden === 'only';

export const getPhotoOptionsCountForPath = async (
  path: string,
): Promise<{ options: PhotoQueryOptions, count: number }> => {
  const { album: albumSlug, tag, ...components } = getPathComponents(path);

  let album: Album | undefined;
  if (albumSlug) {
    album = await getAlbumFromSlug(albumSlug);
  }

  const options: PhotoQueryOptions = {
    album,
    ...isTagPrivate(tag) ? { hidden: 'only' } : { tag },
    ...components,
  };

  const count = await getPhotoCount(options);

  return {
    options: {
      ...options,
      limit: count,
    },
    count,
  };
};
