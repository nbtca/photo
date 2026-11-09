import { generateOgImageMetaForPhotos } from '@/photo';
import PhotosEmptyState from '@/photo/PhotosEmptyState';
import { Metadata } from 'next/types';
import { GRID_HOMEPAGE_ENABLED, USER_DEFAULT_SORT_OPTIONS } from '@/app/config';
import { NULL_CATEGORY_DATA } from '@/category/data';
import PhotoExpressivePage from '@/photo/PhotoExpressivePage';
import PhotoGridPage from '@/photo/PhotoGridPage';
import { getDataForCategoriesCached } from '@/category/cache';
import { getHomeCount, getHomeFeedCount, getHomePhotos } from './data';

export const dynamic = 'force-static';
export const maxDuration = 60;

export async function generateMetadata(): Promise<Metadata> {
  const photos = await getHomePhotos()
    .catch(() => []);
  return generateOgImageMetaForPhotos(photos);
}

export default async function HomePage() {
  const [
    photos,
    photosCount,
    photosCountWithExcludes,
    categories,
  ] = await Promise.all([
    getHomePhotos()
      .catch(() => []),
    getHomeFeedCount()
      .then(({ count }) => count)
      .catch(() => 0),
    getHomeCount()
      .then(({ count }) => count)
      .catch(() => 0),
    GRID_HOMEPAGE_ENABLED
      ? getDataForCategoriesCached()
      : NULL_CATEGORY_DATA,
  ]);

  return (
    photos.length > 0
      ? GRID_HOMEPAGE_ENABLED
        ? <PhotoGridPage
          {...{
            photos,
            photosCount,
            photosCountWithExcludes,
            ...USER_DEFAULT_SORT_OPTIONS,
            ...categories,
          }}
        />
        : <PhotoExpressivePage {...{
          photos,
          photosCount,
          ...USER_DEFAULT_SORT_OPTIONS,
        }} />
      : <PhotosEmptyState />
  );
}
