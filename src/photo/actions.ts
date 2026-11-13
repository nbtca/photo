'use server';

import {
  insertPhoto,
  deletePhotoTagGlobally,
  updatePhoto,
  updatePhotoTitleCaption,
  renamePhotoTagGlobally,
  setPhotoVisibilityForIds,
  getPhoto,
  getPhotos,
  addTagsToPhotos,
  deletePhotoRecipeGlobally,
  renamePhotoRecipeGlobally,
  getPhotosNeedingRecipeTitleCount,
  getRecipeDataForTitle,
  updateColorDataForPhoto,
  getColorDataForPhotos,
  getPhotoIds,
} from '@/photo/query';
import {
  PhotoQueryOptions,
  areOptionsSensitive,
  getPhotoOptionsCountForPath,
} from '@/db';
import {
  PhotoFormData,
} from './form';
import { redirect } from 'next/navigation';
import {
  deleteFile,
} from '@/platforms/storage';
import {
  revalidateAdminPaths,
  revalidateAllKeysAndPaths,
  revalidatePhotosKey,
  revalidateRecipesKey,
  revalidateTagsKey,
} from '@/cache';
import { revalidatePhoto, getPhotosCached } from './cache';
import {
  PATH_ADMIN_PHOTOS,
  PATH_ADMIN_RECIPES,
  PATH_ADMIN_TAGS,
  PATH_ROOT,
  pathForPhoto,
  pathForTag,
} from '@/app/path';
import { TAG_FAVS, isPhotoFav, isTagFavs } from '@/tag';
import { convertPhotoToPhotoDbInsert, Photo } from '.';
import { runAuthenticatedAdminServerAction } from '@/auth/server';
import { createStreamableValue } from '@ai-sdk/rsc';
import { UrlAddStatus } from '@/admin/AdminUploadsClient';
import { after } from 'next/server';
import {
  getKeyColorFromColorData,
  getKeyColorFromPhoto,
} from '@/photo/color/client';
import { getAlbumTitlesFromFormData } from '@/album/form';
import {
  addAlbumTitlesToPhoto,
  createAlbumsAndGetIds,
  upgradeTagToAlbum,
} from '@/album/server';
import { addPhotoAlbumIds } from '@/album/query';
import type { VisibilityValue } from './visibility';
import { lazily } from '@/utility/lazily';
import {
  COMMAND_K_PHOTO_LIMIT,
  getPhotosQueryData,
} from '@/query/data';

// Upload processing loads on first use so that pages listing photos stay light
const photoServer = () => import('./server');
const blurImageFromUrl = lazily(photoServer, 'blurImageFromUrl');
const convertFormDataToPhotoDbInsertAndLookupRecipeTitle = lazily(
  photoServer,
  'convertFormDataToPhotoDbInsertAndLookupRecipeTitle',
);
const deletePhotoAndFiles = lazily(photoServer, 'deletePhotoAndFiles');
const extractImageDataFromBlobPath = lazily(
  photoServer,
  'extractImageDataFromBlobPath',
);
const propagateRecipeTitleIfNecessary = lazily(
  photoServer,
  'propagateRecipeTitleIfNecessary',
);
const storageServer = () => import('./storage/server');
const convertUploadToPhoto = lazily(storageServer, 'convertUploadToPhoto');
const colorServer = () => import('@/photo/color/server');
const getColorFieldsForImageUrl = lazily(
  colorServer,
  'getColorFieldsForImageUrl',
);
const getColorFieldsForPhotoDbInsert = lazily(
  colorServer,
  'getColorFieldsForPhotoDbInsert',
);
const updateServer = () => import('./update/server');
const shouldBackfillPhotoStorage = lazily(
  updateServer,
  'shouldBackfillPhotoStorage',
);

// Private actions

export const createPhotoAction = async (
  formData: FormData,
  redirectPath = PATH_ADMIN_PHOTOS,
) =>
  runAuthenticatedAdminServerAction(async () => {
    const shouldStripGpsData = formData.get('shouldStripGpsData') === 'true';

    const photo =
      await convertFormDataToPhotoDbInsertAndLookupRecipeTitle(formData);

    const albumTitles = getAlbumTitlesFromFormData(formData);

    const updatedUrl = await convertUploadToPhoto({
      uploadUrl: photo.url,
      shouldStripGpsData,
    });
    
    if (updatedUrl) {
      photo.url = updatedUrl;
      await insertPhoto(photo);
      await addAlbumTitlesToPhoto(albumTitles, photo.id, false);
      await propagateRecipeTitleIfNecessary(formData, photo);
      revalidateAllKeysAndPaths();
      redirect(redirectPath);
    }
  });

// Helper function for:
// - addUploadAction
// - addUploadsAction
const addUpload = async ({
  url,
  title: _title,
  albumIds = [],
  tags: _tags,
  favorite,
  hidden,
  excludeFromFeeds,
  takenAtLocal,
  takenAtNaiveLocal,
  onStreamUpdate,
  onFinish,
  shouldRevalidateAllKeysAndPaths,
}:{
  url: string
  title?: string
  albumIds?: string[]
  tags?: string
  favorite?: string
  hidden?: string
  excludeFromFeeds?: string
  takenAtLocal: string
  takenAtNaiveLocal: string
  onStreamUpdate?: (
    statusMessage: string,
    status?: UrlAddStatus['status'],
  ) => void
  onFinish?: (url: string) => void
  shouldRevalidateAllKeysAndPaths?: boolean
}) => {
  const {
    formDataFromExif,
    shouldStripGpsData,
    fileBytes,
  } = await extractImageDataFromBlobPath(url, {
    includeInitialPhotoFields: true,
  });

  if (formDataFromExif) {
    const form: Partial<PhotoFormData> = {
      ...formDataFromExif,
      title: _title || formDataFromExif.title,
      tags: _tags || formDataFromExif.tags,
      excludeFromFeeds,
      hidden,
      favorite,
      takenAt: formDataFromExif.takenAt || takenAtLocal,
      takenAtNaive: formDataFromExif.takenAtNaive || takenAtNaiveLocal,
    };

    onStreamUpdate?.('Transferring to photo storage');

    const updatedUrl = await convertUploadToPhoto({
      uploadUrl: url,
      fileBytes,
      shouldStripGpsData,
    });
    if (updatedUrl) {
      const subheadFinal = 'Adding to database';
      onStreamUpdate?.(subheadFinal);
      const photo =
        await convertFormDataToPhotoDbInsertAndLookupRecipeTitle(form);
      photo.url = updatedUrl;
      await insertPhoto(photo);
      if (albumIds.length > 0) {
        await addPhotoAlbumIds([photo.id], albumIds);
      }
      if (shouldRevalidateAllKeysAndPaths) {
        after(revalidateAllKeysAndPaths);
      }
      onFinish?.(url);
      // Re-submit with updated url
      onStreamUpdate?.(subheadFinal, 'added');
    }
  }
};

export const addUploadAction = async (args: Parameters<typeof addUpload>[0]) =>
  runAuthenticatedAdminServerAction(() => addUpload(args));

export const addUploadsAction = async ({
  uploadUrls,
  uploadTitles,
  uploadTakenAts,
  shouldRevalidateAllKeysAndPaths = true,
  albumTitles,
  tags,
  favorite,
  hidden,
  excludeFromFeeds,
}: Omit<
  Parameters<typeof addUpload>[0],
  | 'url'
  | 'onStreamUpdate'
  | 'onFinish'
  | 'albumIds'
  | 'takenAtLocal'
  | 'takenAtNaiveLocal'
> & {
  uploadUrls: string[]
  uploadTitles: string[]
  uploadTakenAts: { takenAtLocal: string, takenAtNaiveLocal: string }[]
  shouldRevalidateAllKeysAndPaths?: boolean
  albumTitles?: string[]
}) =>
  runAuthenticatedAdminServerAction(async () => {
    const PROGRESS_TASK_COUNT = 4;

    const addedUploadUrls: string[] = [];
    let currentUploadUrl = '';
    let progress = 0;

    const stream = createStreamableValue<Omit<UrlAddStatus, 'fileName'>>();

    const streamUpdate = (
      statusMessage: string,
      status: UrlAddStatus['status'] = 'adding',
    ) =>
      stream.update({
        url: currentUploadUrl,
        status,
        statusMessage,
        progress: ++progress / PROGRESS_TASK_COUNT,
      });

    const albumIds = albumTitles
      ? await createAlbumsAndGetIds(albumTitles)
      : [];

    (async () => {
      try {
        for (const [index, url] of uploadUrls.entries()) {
          currentUploadUrl = url;
          progress = 0;
          const title = uploadTitles[index];
          streamUpdate('Parsing EXIF data');

          await addUpload({
            url,
            title,
            albumIds,
            tags,
            favorite,
            hidden,
            excludeFromFeeds,
            ...uploadTakenAts[index],
            onStreamUpdate: streamUpdate,
            onFinish: () => {
              addedUploadUrls.push(url);
            },
          });
        };
      } catch (error: any) {
        // eslint-disable-next-line @stylistic/max-len
        stream.error(`${error.message} (${addedUploadUrls.length} of ${uploadUrls.length} photos successfully added)`);
      }
      stream.done();
    })();

    if (shouldRevalidateAllKeysAndPaths) {
      after(revalidateAllKeysAndPaths);
    }

    return stream.value;
  });

export const updatePhotoAction = async (
  formData: FormData,
  redirectPath = PATH_ADMIN_PHOTOS,
) =>
  runAuthenticatedAdminServerAction(async () => {
    const photo =
      await convertFormDataToPhotoDbInsertAndLookupRecipeTitle(formData);

    const albumTitles = getAlbumTitlesFromFormData(formData);
    await addAlbumTitlesToPhoto(albumTitles, photo.id);
   
    let urlToDelete: string | undefined;
    if (await shouldBackfillPhotoStorage(photo)) {
      const url = await convertUploadToPhoto({
        uploadUrl: photo.url,
        shouldDeleteOrigin: false,
      });
      if (url) {
        urlToDelete = photo.url;
        photo.url = url;
      }
    }

    await updatePhoto(photo)
      .then(async () => {
        if (urlToDelete) {
          await deleteFile(urlToDelete);
        }
        await propagateRecipeTitleIfNecessary(formData, photo);
      });

    revalidateAllKeysAndPaths();
    redirect(redirectPath);
  });

export const toggleFavoritePhotoAction = async (
  photoId: string,
  shouldRedirect?: boolean,
) =>
  runAuthenticatedAdminServerAction(async () => {
    const photo = await getPhoto(photoId);
    if (photo) {
      const { tags } = photo;
      photo.tags = isPhotoFav(photo)
        ? tags.filter(tag => !isTagFavs(tag))
        : [...tags, TAG_FAVS];
      await updatePhoto(convertPhotoToPhotoDbInsert(photo));
      revalidateAllKeysAndPaths();
      if (shouldRedirect) {
        redirect(pathForPhoto({ photo: photoId }));
      }
    }
  });

export const setPhotoVisibilityAction = async (
  photoId: string,
  visibility: VisibilityValue,
  redirectPath?: string,
) =>
  runAuthenticatedAdminServerAction(async () => {
    const photo = await getPhoto(photoId, true);
    if (photo) {
      photo.hidden = visibility === 'private';
      photo.excludeFromFeeds = visibility === 'exclude';
      await updatePhoto(convertPhotoToPhotoDbInsert(photo));
      revalidateAllKeysAndPaths();
    }
    if (redirectPath) { redirect(redirectPath); }
  });

export const deletePhotoAction = async (
  photoId: string,
  photoUrl: string,
  shouldRedirect?: boolean,
) =>
  runAuthenticatedAdminServerAction(async () => {
    await deletePhotoAndFiles(photoId, photoUrl);
    revalidateAllKeysAndPaths();
    if (shouldRedirect) {
      redirect(PATH_ROOT);
    }
  });

export const deletePhotoTagGloballyFormAction = async (formData: FormData) =>
  runAuthenticatedAdminServerAction(async () => {
    const tag = formData.get('tag') as string;
    await deletePhotoTagGlobally(tag);
    revalidatePhotosKey();
    revalidateAdminPaths();
  });

export const deletePhotoTagGloballyAction = async (
  tag: string,
  currentPath?: string,
) =>
  runAuthenticatedAdminServerAction(async () => {
    await deletePhotoTagGlobally(tag);
    revalidateAllKeysAndPaths();
    if (currentPath === pathForTag(tag)) {
      redirect(PATH_ROOT);
    }
  });

export const renamePhotoTagGloballyAction = async (formData: FormData) =>
  runAuthenticatedAdminServerAction(async () => {
    const tag = formData.get('tag') as string;
    const updatedTag = formData.get('updatedTag') as string;

    if (tag && updatedTag && tag !== updatedTag) {
      await renamePhotoTagGlobally(tag, updatedTag);
      revalidatePhotosKey();
      revalidateTagsKey();
      redirect(PATH_ADMIN_TAGS);
    }
  });

export const upgradeTagToAlbumAction = async (tag: string) =>
  runAuthenticatedAdminServerAction(async () =>
    upgradeTagToAlbum(tag).then(revalidateAllKeysAndPaths),
  );

export const getPhotosNeedingRecipeTitleCountAction = async (
  recipeData: string,
  film: string,
  photoIdToExclude?: string,
) =>
  runAuthenticatedAdminServerAction(async () =>
    await getPhotosNeedingRecipeTitleCount(
      recipeData,
      film,
      photoIdToExclude,
    ),
  );

export const getRecipeDataForTitleAction = async (recipeTitle: string) =>
  runAuthenticatedAdminServerAction(async () =>
    await getRecipeDataForTitle(recipeTitle),
  );

export const storeColorDataForPhotoAction = async (
  photoId: string,
  { force }: { force?: boolean } = {},
) =>
  runAuthenticatedAdminServerAction(async () => {
    const photo = await getPhoto(photoId, true);
    if (photo) {
      const oldColor = getKeyColorFromPhoto(photo);
      const colorFields = await getColorFieldsForImageUrl(
        photo.url,
        force ? undefined : photo.colorData,
      );
      if (colorFields) {
        await updatePhoto(convertPhotoToPhotoDbInsert({
          ...photo,
          ...colorFields,
        }));
        revalidatePhoto(photo.id);
        return {
          oldColor,
          newColor: getKeyColorFromColorData(colorFields.colorData),
        };
      }
      revalidatePhoto(photo.id);
    }
  });

export const recalculateColorDataForAllPhotosAction = async () =>
  runAuthenticatedAdminServerAction(async () => {
    const photos = await getColorDataForPhotos();
    for (const { id, url, colorData: _colorData } of photos) {
      const colorFields = await getColorFieldsForPhotoDbInsert(url, _colorData);
      if (colorFields && colorFields.colorSort) {
        await updateColorDataForPhoto(
          id,
          colorFields.colorData,
          colorFields.colorSort,
        );
      }
    }
  });

export const deletePhotoRecipeGloballyAction = async (formData: FormData) =>
  runAuthenticatedAdminServerAction(async () => {
    const recipe = formData.get('recipe') as string;

    await deletePhotoRecipeGlobally(recipe);

    revalidatePhotosKey();
    revalidateAdminPaths();
  });

export const renamePhotoRecipeGloballyAction = async (formData: FormData) =>
  runAuthenticatedAdminServerAction(async () => {
    const recipe = formData.get('recipe') as string;
    const updatedRecipe = formData.get('updatedRecipe') as string;

    if (recipe && updatedRecipe && recipe !== updatedRecipe) {
      await renamePhotoRecipeGlobally(recipe, updatedRecipe);
      revalidatePhotosKey();
      revalidateRecipesKey();
      redirect(PATH_ADMIN_RECIPES);
    }
  });

export const deleteUploadsAction = async (urls: string[]) =>
  runAuthenticatedAdminServerAction(async () => {
    await Promise.all(urls.map(url => deleteFile(url)));
    if (urls.length > 1) {
      // Only refresh state when deleting multiple uploads
      revalidateAdminPaths();
    }
  });

export const clearCacheAction = async () =>
  runAuthenticatedAdminServerAction(revalidateAllKeysAndPaths);

export const getImageBlurAction = async (url: string) =>
  runAuthenticatedAdminServerAction(() => blurImageFromUrl(url));

// Batch actions

export const getPhotoOptionsCountForPathAction = async (path: string) =>
  runAuthenticatedAdminServerAction(async () =>
    getPhotoOptionsCountForPath(path),
  );

export const batchPhotoAction = async ({
  photoIds: _photoIds = [],
  photoOptions,
  tags = [],
  albumTitles = [],
  visibility,
  action,
}: {
  photoIds?: string[]
  photoOptions?: PhotoQueryOptions
  tags?: string[]
  albumTitles?: string[]
  visibility?: VisibilityValue
  action?: 'favorite' | 'delete'
}) => runAuthenticatedAdminServerAction(async () => {
  const photoIds = _photoIds.length > 0
    ? _photoIds
    : photoOptions !== undefined
      ? await getPhotoIds(photoOptions)
      : [];

  if (tags.length > 0) {
    await addTagsToPhotos(tags, photoIds);
  }
  if (albumTitles.length > 0) {
    const albumIds = await createAlbumsAndGetIds(albumTitles);
    await addPhotoAlbumIds(photoIds, albumIds);
  }
  if (visibility !== undefined) {
    await setPhotoVisibilityForIds(
      photoIds,
      visibility === 'private',
      visibility === 'exclude',
    );
  }
  switch (action) {
    case 'favorite':
      await addTagsToPhotos([TAG_FAVS], photoIds);
      break;
    case 'delete':
      for (const photoId of photoIds) {
        const photo = await getPhoto(photoId, true);
        if (photo) {
          await deletePhotoAndFiles(photoId, photo.url);
        }
      }
      break;
  }

  revalidateAllKeysAndPaths();
});

export const batchUpdatePhotoTitlesAction = async (
  updates: {
    photoId: string
    title: string
    caption: string
  }[],
) => runAuthenticatedAdminServerAction(async () => {
  await updatePhotoTitleCaption(
    updates.map(({ photoId }) => photoId),
    updates.map(({ title }) => title.trim() || null),
    updates.map(({ caption }) => caption.trim() || null),
  );
  revalidateAllKeysAndPaths();
});

// Public/Private actions

export const getPhotosAction = async (
  options: PhotoQueryOptions,
  warmOnly?: boolean,
) => {
  if (warmOnly) {
    return [];
  } else {
    return areOptionsSensitive(options)
      ? runAuthenticatedAdminServerAction(() => getPhotos(options))
      : getPhotos(options);
  }
};

export const getPhotosCachedAction = async (
  options: PhotoQueryOptions,
  warmOnly?: boolean,
) => {
  if (warmOnly) {
    return [];
  } else {
    return areOptionsSensitive(options)
      ? runAuthenticatedAdminServerAction(() => getPhotosCached(options))
      : getPhotosCached(options);
  }
};

// Public actions

export const searchPhotosPublicAction = async (query: string) =>
  getPhotosQueryData({ query, limit: COMMAND_K_PHOTO_LIMIT })
    .then(([photos, { count }]) => ({ photos, count }))
    .catch(e => {
      console.error('Could not query photos', e);
      return { photos: [] as Photo[], count: 0 };
    });
