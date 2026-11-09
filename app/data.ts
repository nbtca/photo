import { getPhotos } from '@/photo/query';
import { GRID_HOMEPAGE_ENABLED } from '@/app/config';
import { getDataForCategoriesCached } from '@/category/cache';
import { getPhotosMetaCached } from '@/photo/cache';
import { FEED_META_QUERY_OPTIONS, feedQueryOptions } from '@/feed';

export const getHomePhotos = () => getPhotos(feedQueryOptions({
  isGrid: GRID_HOMEPAGE_ENABLED,
}));

export const getHomeFeedCount = () =>
  getPhotosMetaCached(FEED_META_QUERY_OPTIONS);

export const getHomeCount = () => getPhotosMetaCached();

export const prefetch = () => {
  getHomePhotos().catch(() => {});
  getHomeFeedCount().catch(() => {});
  getHomeCount().catch(() => {});
  if (GRID_HOMEPAGE_ENABLED) { getDataForCategoriesCached().catch(() => {}); }
};
