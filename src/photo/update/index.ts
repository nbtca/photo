import { Photo, PhotoDb } from '..';
import {
  COLOR_SORT_ENABLED,
} from '@/app/config';
import { capitalize } from '@/utility/string';

export interface PhotoUpdateStatus {
  isOutdated: boolean
  isMissingColorData: boolean
}

// UTC 2025-09-7 23:55:00
export const OUTDATED_UPDATE_AT_THRESHOLD =
  new Date(Date.UTC(2025, 8, 7, 23, 55, 0));

const isPhotoOutdated = (photo: PhotoDb) =>
  photo.updatedAt < OUTDATED_UPDATE_AT_THRESHOLD;

export const isPhotoMissingColorData = (photo: PhotoDb) =>
  // "== null" intentional check for undefined or null
  COLOR_SORT_ENABLED && (
    photo.colorData == null ||
    photo.colorSort == null
  );

export const generatePhotoUpdateStatus = (
  photo: PhotoDb,
): PhotoUpdateStatus => ({
  isOutdated: isPhotoOutdated(photo),
  isMissingColorData: isPhotoMissingColorData(photo),
});

export const photoNeedsToBeUpdated = (photo: Photo) =>
  photo.updateStatus?.isOutdated ||
  photo.updateStatus?.isMissingColorData;

export const getPhotoUpdateStatusText = (photo: Photo) => {
  const { isOutdated, isMissingColorData } = photo.updateStatus ?? {};

  const cta = 'sync to update';
  if (isOutdated) {
    return `Outdated data—${cta}`;
  } else if (isMissingColorData) {
    return `Missing color data—${cta}`;
  } else {
    return capitalize(cta);
  }
};
