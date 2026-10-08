import { rpc } from '@spa/data';
import {
  Photo,
  PhotoDateRangePostgres,
  PhotoDb,
  PhotoDbInsert,
  parsePhotoFromDb,
} from '@/photo';
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

type Row = Omit<PhotoDb, 'takenAt' | 'updatedAt' | 'createdAt'> & {
  taken_at: string
  updated_at: string
  created_at: string
};

// Postgres returns timestamps as dates, and the app relies on that.
const parse = (row: Row) => parsePhotoFromDb({
  ...row,
  taken_at: new Date(row.taken_at),
  updated_at: new Date(row.updated_at),
  created_at: new Date(row.created_at),
} as unknown as PhotoDb);

const pass = <A extends unknown[], R = void>(name: string) =>
  (...args: A) => rpc<R>(name, ...args);

export const createPhotosTable = async () => {};

export const insertPhoto = pass<[PhotoDbInsert]>('insertPhoto');
export const updatePhoto = pass<[PhotoDbInsert]>('updatePhoto');
export const deletePhoto = pass<[string]>('deletePhoto');
export const setPhotoVisibilityForIds =
  pass<[string[], boolean, boolean]>('setPhotoVisibilityForIds');
export const addTagsToPhotos = pass<[string[], string[]]>('addTagsToPhotos');
export const updatePhotoTitleCaption =
  pass<[string[], (string | null)[], (string | null)[]]>(
    'updatePhotoTitleCaption',
  );
export const deletePhotoTagGlobally = pass<[string]>('deletePhotoTagGlobally');
export const renamePhotoTagGlobally =
  pass<[string, string]>('renamePhotoTagGlobally');
export const deletePhotoRecipeGlobally =
  pass<[string]>('deletePhotoRecipeGlobally');
export const renamePhotoRecipeGlobally =
  pass<[string, string]>('renamePhotoRecipeGlobally');
export const getPhotosNeedingRecipeTitleCount =
  pass<[string, string, string?], number>('getPhotosNeedingRecipeTitleCount');
export const updateAllMatchingRecipeTitles =
  pass<[string, string, string]>('updateAllMatchingRecipeTitles');
export const getPhotoIds =
  pass<[PhotoQueryOptions?], string[]>('getPhotoIds');

export const getRecipeTitleForData = (data: string | object, film: string) =>
  rpc<string | null>('getRecipeTitleForData', data, film)
    .then(title => title ?? undefined);

export const getRecipeDataForTitle = (title: string) =>
  rpc<string | null>('getRecipeDataForTitle', title)
    .then(data => data ?? undefined);

export const getColorDataForPhotos = async () => [];
export const updateColorDataForPhoto = async (..._args: unknown[]) => {};

export const getPhotosInNeedOfUpdate = async (): Promise<Photo[]> => [];

export const getPhotos = (options: PhotoQueryOptions = {}) =>
  rpc<Row[]>('getPhotos', options).then(rows => rows.map(parse));

export const getPhotoCount = (options: PhotoQueryOptions = {}) =>
  rpc<number>('getPhotoCount', options);

export const getPhotosNearId = (photoId: string, options: PhotoQueryOptions) =>
  rpc<{ photos: Row[], indexNumber?: number }>(
    'getPhotosNearId',
    photoId,
    options,
  ).then(({ photos, indexNumber }) => ({
    photos: photos.map(parse),
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
  rpc<Row | null>('getPhoto', id, includeHidden)
    .then(row => row ? parse(row) : undefined);

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
