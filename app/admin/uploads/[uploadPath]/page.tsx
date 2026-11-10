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
    }] = await Promise.all([
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
    if (typeof title === 'string') {
      formDataFromExif.title = title;
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
      }} />
      : <AppGrid contentMain={
        <ErrorNote>
          {error ?? 'Unknown error'}
        </ErrorNote>
      }/>
  );
};
