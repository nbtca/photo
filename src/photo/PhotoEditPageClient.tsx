'use client';

import AdminChildPage from '@/components/AdminChildPage';
import { Photo } from '.';
import { PATH_ADMIN_PHOTOS } from '@/app/path';
import {
  PhotoFormData,
  convertPhotoToFormData,
} from './form';
import PhotoForm from './form/PhotoForm';
import { Tags } from '@/tag';
import usePhotoFormParent from './form/usePhotoFormParent';
import { useState } from 'react';
import { Recipes } from '@/recipe';
import { Films } from '@/film';
import { StorageListResponse } from '@/platforms/storage';
import { Albums } from '@/album';
import { Cameras } from '@/camera';
import { Lenses } from '@/lens';

export default function PhotoEditPageClient({
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
}: {
  photo: Photo
  photoStorageUrls?: StorageListResponse
  photoAlbumTitles: string[]
  albums: Albums
  uniqueTags: Tags
  uniqueRecipes: Recipes
  uniqueFilms: Films
  uniqueCameras: Cameras
  uniqueLenses: Lenses
  blurData: string
}) {
  const photoForm = convertPhotoToFormData(photo);

  const {
    pending,
    setIsPending,
    updatedTitle,
    setUpdatedTitle,
  } = usePhotoFormParent();

  const [updatedExifData] =
    useState<Partial<PhotoFormData>>();

  return (
    <AdminChildPage
      backPath={PATH_ADMIN_PHOTOS}
      backLabel="Photos"
      breadcrumb={pending && updatedTitle
        ? updatedTitle
        : photo.title || photo.id}
      breadcrumbEllipsis
      isLoading={pending}
    >
      <PhotoForm
        type="edit"
        initialPhotoForm={photoForm}
        photoStorageUrls={photoStorageUrls}
        updatedExifData={updatedExifData}
        updatedBlurData={blurData}
        photoAlbumTitles={photoAlbumTitles}
        albums={albums}
        uniqueTags={uniqueTags}
        uniqueRecipes={uniqueRecipes}
        uniqueFilms={uniqueFilms}
        uniqueCameras={uniqueCameras}
        uniqueLenses={uniqueLenses}
        onTitleChange={setUpdatedTitle}
        onFormStatusChange={setIsPending}
      />
    </AdminChildPage>
  );
};
