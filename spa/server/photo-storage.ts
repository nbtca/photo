import sharp from 'sharp';
import {
  deleteFile,
  getFileNamePartsFromStorageUrl,
  putFile,
} from '@/platforms/storage';
import { fetchImageUrlSafely, resizeImageToBytes } from '@/photo/server';
import {
  generateRandomFileNameForPhoto,
  getOptimizedPhotoFileMeta,
} from '@/photo/storage';

const PHOTO_MAX_EDGE = 2560;
const PHOTO_QUALITY = 85;

export const storeOptimizedPhotosForUrl = async (
  url: string,
  _fileBytes?: ArrayBuffer,
) => {
  const fileBytes = _fileBytes ?? await fetchImageUrlSafely(url);
  const { fileNameBase } = getFileNamePartsFromStorageUrl(url);
  for (const { fileName, size, quality } of
    getOptimizedPhotoFileMeta(fileNameBase)) {
    await putFile(await resizeImageToBytes(fileBytes, size, quality), fileName);
  }
  return url;
};

// Every photo is re-encoded, so stored files never carry EXIF or GPS data.
export const convertUploadToPhoto = async ({
  uploadUrl,
  fileBytes: _fileBytes,
  shouldDeleteOrigin = true,
} : {
  uploadUrl: string
  fileBytes?: ArrayBuffer
  shouldStripGpsData?: boolean
  shouldDeleteOrigin?: boolean
}) => {
  const fileBytes = _fileBytes ?? await fetchImageUrlSafely(uploadUrl);
  const photo = await sharp(fileBytes)
    .resize(PHOTO_MAX_EDGE, PHOTO_MAX_EDGE)
    .toFormat('webp', { quality: PHOTO_QUALITY })
    .toBuffer();
  const url = await putFile(
    photo,
    `${generateRandomFileNameForPhoto()}.webp`,
  );
  await storeOptimizedPhotosForUrl(url, fileBytes);
  if (shouldDeleteOrigin) { await deleteFile(uploadUrl); }
  return url;
};
