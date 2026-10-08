import { rpc } from '@spa/data';
import { Photo, PhotoDateRangePostgres, PhotoDb, parsePhotoFromDb } from '@/photo';
import { PhotoQueryOptions } from '@/db';
import { Cameras, createCameraKey } from '@/camera';
import { Lenses, createLensKey } from '@/lens';
import { Tags } from '@/tag';
import { Films } from '@/film';
import { Recipes } from '@/recipe';
import { FocalLengths } from '@/focal';
import { Years } from '@/year';

interface Counted { count: number, last_modified: string }

const meta = ({ count, last_modified }: Counted) => ({
  count,
  lastModified: new Date(last_modified),
});

export const createPhotosTable = async () => {};

export const getPhotos = (options: PhotoQueryOptions = {}) =>
  rpc<PhotoDb[]>('getPhotos', options)
    .then(rows => rows.map(parsePhotoFromDb));

export const getPhotoCount = (options: PhotoQueryOptions = {}) =>
  rpc<number>('getPhotoCount', options);

export const getPhotosNearId = (photoId: string, options: PhotoQueryOptions) =>
  rpc<{ photos: PhotoDb[], indexNumber?: number }>(
    'getPhotosNearId',
    photoId,
    options,
  ).then(({ photos, indexNumber }) => ({
    photos: photos.map(parsePhotoFromDb),
    indexNumber,
  }));

export const getPhotosMeta = (options: PhotoQueryOptions = {}) =>
  rpc<{
    count: number
    dateRange?: PhotoDateRangePostgres
    dateRangeCreatedAt?: PhotoDateRangePostgres
  }>('getPhotosMeta', options);

export const getPhoto = (
  id: string,
  includeHidden?: boolean,
): Promise<Photo | undefined> =>
  rpc<PhotoDb | null>('getPhoto', id, includeHidden)
    .then(row => row ? parsePhotoFromDb(row) : undefined);

export const getPhotosMostRecentUpdate = () =>
  rpc<string | null>('getPhotosMostRecentUpdate')
    .then(date => date ? new Date(date) : undefined);

export const getPhotosInNeedOfUpdateCount = async () => 0;

export const getAllPublicPhotoIds = ({ limit }: { limit?: number }) =>
  rpc<string[]>('getAllPublicPhotoIds', limit);

export const getAllPhotoIdsWithUpdatedAt = () =>
  rpc<{ id: string, updated_at: string }[]>('getAllPhotoIdsWithUpdatedAt')
    .then(rows => rows.map(({ id, updated_at }) =>
      ({ id, updatedAt: new Date(updated_at) })));

export const getUniqueCameras = (includeHidden?: boolean) =>
  rpc<({ make: string, model: string } & Counted)[]>(
    'getUniqueCameras',
    includeHidden,
  ).then((rows): Cameras => rows.map(({ make, model, ...row }) => ({
    cameraKey: createCameraKey({ make, model }),
    camera: { make, model },
    ...meta(row),
  })));

export const getUniqueLenses = (includeHidden?: boolean) =>
  rpc<({ lens_make: string, lens_model: string } & Counted)[]>(
    'getUniqueLenses',
    includeHidden,
  ).then((rows): Lenses => rows.map(({
    lens_make: make,
    lens_model: model,
    ...row
  }) => ({
    lensKey: createLensKey({ make, model }),
    lens: { make, model },
    ...meta(row),
  })));

export const getUniqueTags = (includeHidden?: boolean) =>
  rpc<({ tag: string } & Counted)[]>('getUniqueTags', includeHidden)
    .then((rows): Tags => rows.map(({ tag, ...row }) =>
      ({ tag, ...meta(row) })));

export const getUniqueRecipes = () =>
  rpc<({ recipe_title: string } & Counted)[]>('getUniqueRecipes')
    .then((rows): Recipes => rows.map(({ recipe_title, ...row }) =>
      ({ recipe: recipe_title, ...meta(row) })));

export const getUniqueYears = () =>
  rpc<({ year: string } & Counted)[]>('getUniqueYears')
    .then((rows): Years => rows.map(({ year, ...row }) =>
      ({ year, ...meta(row) })));

export const getUniqueFilms = () =>
  rpc<({ film: string } & Counted)[]>('getUniqueFilms')
    .then((rows): Films => rows.map(({ film, ...row }) =>
      ({ film, ...meta(row) })));

export const getUniqueFocalLengths = () =>
  rpc<({ focal_length: number } & Counted)[]>('getUniqueFocalLengths')
    .then((rows): FocalLengths => rows.map(({ focal_length, ...row }) =>
      ({ focal: focal_length, ...meta(row) })));
