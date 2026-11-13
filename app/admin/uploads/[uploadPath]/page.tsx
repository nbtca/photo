import { PARAM_UPLOAD_TITLE, PATH_ADMIN } from '@/app/path';
import { extractImageDataFromBlobPath } from '@/photo/server';
import { redirect } from 'next/navigation';
import {
  getUniqueCamerasCached,
  getUniqueFilmsCached,
  getUniqueLensesCached,
  getUniqueRecipesCached,
  getUniqueTagsCached,
} from '@/photo/cache';
import UploadPageClient from '@/photo/UploadPageClient';
import {
  BLUR_ENABLED,
} from '@/app/config';
import ErrorNote from '@/components/ErrorNote';
import { getRecipeTitleForData } from '@/photo/query';
import { getAlbumsWithMeta } from '@/album/query';
import AppGrid from '@/components/AppGrid';
import { getStorageUrlsForPrefix } from '@/platforms/storage';
import { suggestTitle } from '@/admin/upload';
import { generateLocalTakenAt } from '@/utility/date';

export const maxDuration = 60;

interface Params {
  params: Promise<{ uploadPath: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function UploadPage({ params, searchParams }: Params) {
  const uploadPath = (await params).uploadPath;
  const title = (await searchParams)[PARAM_UPLOAD_TITLE];

  const [
    albums,
    uniqueRecipes,
    uniqueFilms,
    uniqueTags,
    uniqueCameras,
    uniqueLenses, {
      blobId,
      formDataFromExif,
      shouldStripGpsData,
      error,
    },
    [upload],
  ] = await Promise.all([
    getAlbumsWithMeta(),
    getUniqueRecipesCached(),
    getUniqueFilmsCached(),
    getUniqueTagsCached(),
    getUniqueCamerasCached(true),
    getUniqueLensesCached(true),
    extractImageDataFromBlobPath(uploadPath, {
      includeInitialPhotoFields: true,
      generateBlurData: BLUR_ENABLED,
    }),
    getStorageUrlsForPrefix(
      decodeURIComponent(uploadPath).split('/').pop(),
    ).catch(() => []),
  ]);

  const isDataMissing = !formDataFromExif;

  if (isDataMissing && !error) {
    // Only redirect if there's no error to report
    redirect(PATH_ADMIN);
  }

  const recipeTitle = formDataFromExif?.recipeData && formDataFromExif.film
    ? await getRecipeTitleForData(
      formDataFromExif.recipeData,
      formDataFromExif.film,
    )
    : undefined;

  if (formDataFromExif) {
    if (recipeTitle) {
      formDataFromExif.recipeTitle = recipeTitle;
    }
    formDataFromExif.title = typeof title === 'string'
      ? title
      : formDataFromExif.title || suggestTitle(upload?.originalName);
    if (!formDataFromExif.takenAt && upload?.modifiedAt) {
      const { takenAtLocal, takenAtNaiveLocal } =
        generateLocalTakenAt(upload.modifiedAt);
      formDataFromExif.takenAt = takenAtLocal;
      formDataFromExif.takenAtNaive = takenAtNaiveLocal;
    }
  }

  return (
    !isDataMissing
      ? <UploadPageClient {...{
        blobId,
        formDataFromExif,
        albums,
        uniqueTags,
        uniqueRecipes,
        uniqueFilms,
        uniqueCameras,
        uniqueLenses,
        shouldStripGpsData,
        albumTitles: upload?.folder ? [upload.folder] : undefined,
      }} />
      : <AppGrid contentMain={
        <ErrorNote>
          {error ?? 'Unknown error'}
        </ErrorNote>
      }/>
  );
};
