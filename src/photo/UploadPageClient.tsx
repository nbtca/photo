'use client';

import AdminChildPage from '@/components/AdminChildPage';
import { PATH_ADMIN_UPLOADS } from '@/app/path';
import {
  PhotoFormData,
  generateTakenAtFields,
} from './form';
import PhotoForm from './form/PhotoForm';
import { Tags } from '@/tag';
import usePhotoFormParent from './form/usePhotoFormParent';
import { useMemo } from 'react';
import { Recipes } from '@/recipe';
import { Films } from '@/film';
import { Albums } from '@/album';
import { Cameras } from '@/camera';
import { Lenses } from '@/lens';
import { useAppText } from '@/i18n/state/client';

export default function UploadPageClient({
  blobId,
  formDataFromExif,
  albums,
  uniqueTags,
  uniqueRecipes,
  uniqueFilms,
  uniqueCameras,
  uniqueLenses,
  shouldStripGpsData,
  albumTitles,
}: {
  blobId?: string
  formDataFromExif: Partial<PhotoFormData>
  albums: Albums
  uniqueTags: Tags
  uniqueRecipes: Recipes
  uniqueFilms: Films
  uniqueCameras: Cameras
  uniqueLenses: Lenses
  shouldStripGpsData?: boolean
  albumTitles?: string[]
}) {
  const appText = useAppText();

  const {
    pending,
    setIsPending,
    updatedTitle,
    setUpdatedTitle,
  } = usePhotoFormParent();

  const initialPhotoForm = useMemo(() => ({
    ...formDataFromExif,
    // Generate missing dates on client to avoid timezone issues
    ...generateTakenAtFields(formDataFromExif),
  }), [formDataFromExif]);

  return (
    <AdminChildPage
      backPath={PATH_ADMIN_UPLOADS}
      backLabel={appText.admin.uploadPlural}
      breadcrumb={pending && updatedTitle
        ? updatedTitle
        : blobId}
      breadcrumbEllipsis
      isLoading={pending}
    >
      <PhotoForm
        initialPhotoForm={initialPhotoForm}
        albums={albums}
        uniqueTags={uniqueTags}
        uniqueRecipes={uniqueRecipes}
        uniqueFilms={uniqueFilms}
        uniqueCameras={uniqueCameras}
        uniqueLenses={uniqueLenses}
        shouldStripGpsData={shouldStripGpsData}
        photoAlbumTitles={albumTitles}
        onTitleChange={setUpdatedTitle}
        onFormStatusChange={setIsPending}
      />
    </AdminChildPage>
  );
}
