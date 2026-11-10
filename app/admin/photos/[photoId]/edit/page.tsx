import { redirect } from 'next/navigation';
import {
  getPhotoNoStore,
  getUniqueCamerasCached,
  getUniqueFilmsCached,
  getUniqueLensesCached,
  getUniqueRecipesCached,
  getUniqueTagsCached,
} from '@/photo/cache';
import {
  getAlbumTitlesForPhotoCached,
  getAlbumsWithMetaCached,
} from '@/album/cache';
import { PATH_ADMIN } from '@/app/path';
import PhotoEditPageClient from '@/photo/PhotoEditPageClient';
import {
  BLUR_ENABLED,
} from '@/app/config';
import { blurImageFromUrl } from '@/photo/server';
import {
  getOptimizedPhotoUrlForManipulation,
  getStorageUrlsForPhoto,
} from '@/photo/storage';

export default async function PhotoEditPage({
  params,
}: {
  params: Promise<{ photoId: string }>
}) {
  const { photoId } = await params;

  const [
    photo,
    photoAlbumTitles,
    albums,
    uniqueTags,
    uniqueRecipes,
    uniqueFilms,
    uniqueCameras,
    uniqueLenses,
  ] = await Promise.all([
    getPhotoNoStore(photoId, true),
    getAlbumTitlesForPhotoCached(photoId),
    getAlbumsWithMetaCached(),
    getUniqueTagsCached(),
    getUniqueRecipesCached(),
    getUniqueFilmsCached(),
    getUniqueCamerasCached(true),
    getUniqueLensesCached(true),
  ]);

  if (!photo) { redirect(PATH_ADMIN); }

  const photoStorageUrls = await getStorageUrlsForPhoto(photo);


  const blurData = BLUR_ENABLED
    ? await blurImageFromUrl(
      getOptimizedPhotoUrlForManipulation(photo.url),
    )
    : '';

  return (
    <PhotoEditPageClient {...{
      photo,
      photoStorageUrls,
      photoAlbumTitles,
      albums,
      uniqueTags,
      uniqueRecipes,
      uniqueFilms,
      uniqueCameras,
      uniqueLenses,
      blurData,
    }} />
  );
};
