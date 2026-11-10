import {
  deleteFilesWithPrefix,
  getFileNamePartsFromStorageUrl,
} from '@/platforms/storage';
import { convertFormDataToPhotoDbInsert } from '@/photo/form';
import {
  FujifilmSimulation,
  getFujifilmSimulationFromMakerNote,
} from '@/platforms/fujifilm/simulation';
import type { ExifData } from 'ts-exif-parser';
import { PhotoFormData } from './form';
import sharp, { Sharp } from 'sharp';
import {
  GEO_PRIVACY_ENABLED,
  PRESERVE_ORIGINAL_UPLOADS,
} from '@/app/config';
import { isExifForFujifilm } from '@/platforms/fujifilm/server';
import {
  FujifilmRecipe,
  getFujifilmRecipeFromMakerNote,
} from '@/platforms/fujifilm/recipe';
import {
  getNikonPictureControlFromMakerNote,
  NikonPictureControl,
} from '@/platforms/nikon/simulation';
import { isExifForNikon } from '@/platforms/nikon/server';
import {
  deletePhoto,
  getRecipeTitleForData,
  updateAllMatchingRecipeTitles,
} from '@/photo/query';
import { MAX_PHOTO_UPLOAD_SIZE_IN_BYTES, PhotoDbInsert } from '.';
import { convertExifToFormData } from './form/server';
import { getColorFieldsForPhotoForm } from './color/server';
import { getCompatibleExifValue } from '@/utility/exif';
import { fetchUrlWithByteLimit } from '@/utility/fetch';

const IMAGE_WIDTH_BLUR = 200;
const IMAGE_QUALITY_DEFAULT = 80;

// Buffers an image, refusing to exceed `maxBytes`, so that oversized
// photos fail fast instead of exhausting serverless memory
export const fetchImageUrlSafely = (url: string) =>
  fetchUrlWithByteLimit(url, MAX_PHOTO_UPLOAD_SIZE_IN_BYTES);

export const extractImageDataFromBlobPath = async (
  blobPath: string, {
    includeInitialPhotoFields,
    generateBlurData,
    updateColorFields = true,
  }: {
    includeInitialPhotoFields?: boolean
    generateBlurData?: boolean
    updateColorFields?: boolean
  } = {},
): Promise<{
  blobId?: string
  formDataFromExif?: Partial<PhotoFormData>
  shouldStripGpsData?: boolean
  fileBytes?: ArrayBuffer
  error?: string
}> => {
  const url = decodeURIComponent(blobPath);

  const {
    fileExtension: extension,
    fileId: blobId,
  } = getFileNamePartsFromStorageUrl(url);

  let dataExif: ExifData | undefined;
  let dataExifr: any | undefined;
  let film: FujifilmSimulation | NikonPictureControl | undefined;
  let recipe: FujifilmRecipe | undefined;
  let blurData: string | undefined;
  let shouldStripGpsData = false;
  let error: string | undefined;

  const fileBytes = blobPath
    ? await fetchImageUrlSafely(url)
      .catch(e => {
        error = `Error fetching image from ${url}: "${e.message}"`;
        return undefined;
      })
    : undefined;

  try {
    if (fileBytes) {
      const [{ ExifParserFactory }, { default: exifr }] = await Promise.all([
        import('ts-exif-parser'),
        import('exifr'),
      ]);
      const parser = ExifParserFactory.create(Buffer.from(fileBytes));

      // Data for form
      parser.enableBinaryFields(false);
      dataExif = parser.parse();
      dataExifr = await exifr.parse(fileBytes, { xmp: true });

      // Capture film simulation for Fujifilm or Picture Control for Nikon
      if (isExifForFujifilm(dataExif) || isExifForNikon(dataExif)) {
        // Parse exif data again with binary fields
        // in order to access MakerNote tag
        parser.enableBinaryFields(true);
        const exifDataBinary = parser.parse();
        const makerNote = exifDataBinary.tags?.MakerNote;
        if (Buffer.isBuffer(makerNote)) {
          if (isExifForFujifilm(dataExif)) {
            film = getFujifilmSimulationFromMakerNote(makerNote);
            recipe = getFujifilmRecipeFromMakerNote(makerNote);
          } else if (isExifForNikon(dataExif)) {
            film = getNikonPictureControlFromMakerNote(makerNote);
          }
        }
      }

      if (generateBlurData) {
        blurData = await blurImage(fileBytes);
      }

      shouldStripGpsData = GEO_PRIVACY_ENABLED && (
        Boolean(getCompatibleExifValue('GPSLatitude', dataExif, dataExifr)) ||
        Boolean(getCompatibleExifValue('GPSLongitude', dataExif, dataExifr))
      );
    }
  } catch (e) {
    error = `Error extracting image data from ${url}: "${e}"`;
  }

  if (error) { console.log(error); }

  const colorFields = updateColorFields
    ? await getColorFieldsForPhotoForm(url)
    : undefined;

  const formDataFromExif = dataExif
    ? {
      ...includeInitialPhotoFields && {
        hidden: 'false',
        favorite: 'false',
        extension,
        url,
      },
      ...generateBlurData && { blurData },
      ...convertExifToFormData(dataExif, dataExifr, film, recipe),
      ...colorFields,
    } satisfies Partial<PhotoFormData>
    : undefined;

  return {
    blobId,
    formDataFromExif,
    shouldStripGpsData,
    fileBytes,
    error,
  };
};

const generateBase64 = async (
  image: ArrayBuffer,
  middleware?: (sharp: Sharp) => Sharp,
) => 
  (middleware ? middleware(sharp(image)) : sharp(image))
    .withMetadata()
    .toFormat('jpeg', { quality: IMAGE_QUALITY_DEFAULT })
    .toBuffer()
    .then(data => `data:image/jpeg;base64,${data.toString('base64')}`);

const blurImage = async (image: ArrayBuffer) => 
  generateBase64(image, sharp => sharp
    .resize(IMAGE_WIDTH_BLUR)
    .modulate({ saturation: 1.15 })
    .blur(4),
  );

export const blurImageFromUrl = async (url: string) => 
  fetch(decodeURIComponent(url))
    .then(res => res.arrayBuffer())
    .then(buffer => blurImage(buffer))
    .catch(e => {
      console.log(`Error blurring image from URL (${url})`, e);
      return '';
    });

export const resizeImageToBytes = async (
  image: ArrayBuffer,
  width: number,
  quality = IMAGE_QUALITY_DEFAULT,
) => 
  sharp(image)
    .resize(width)
    .toFormat('jpeg', { quality })
    .toBuffer();

const GPS_NULL_STRING = '-';

export const removeGpsData = async (image: ArrayBuffer) =>
  sharp(image)
    .withExifMerge({
      IFD3: {
        GPSMapDatum: GPS_NULL_STRING,
        GPSLatitude: GPS_NULL_STRING,
        GPSLongitude: GPS_NULL_STRING,
        GPSDateStamp: GPS_NULL_STRING,
        GPSDateTime: GPS_NULL_STRING,
        GPSTimeStamp: GPS_NULL_STRING,
        GPSAltitude: GPS_NULL_STRING,
        GPSSatellites: GPS_NULL_STRING,
        GPSAreaInformation: GPS_NULL_STRING,
        GPSSpeed: GPS_NULL_STRING,
        GPSImgDirection: GPS_NULL_STRING,
        GPSDestLatitude: GPS_NULL_STRING,
        GPSDestLongitude: GPS_NULL_STRING,
        GPSDestBearing: GPS_NULL_STRING,
        GPSDestDistance: GPS_NULL_STRING,
        GPSHPositioningError: GPS_NULL_STRING,
      },
    })
    .toFormat('jpeg', { quality: PRESERVE_ORIGINAL_UPLOADS ? 95 : 80 })
    .toBuffer();

export const convertFormDataToPhotoDbInsertAndLookupRecipeTitle =
  async (...args: Parameters<typeof convertFormDataToPhotoDbInsert>):
  Promise<ReturnType<typeof convertFormDataToPhotoDbInsert>> => {
    const photo = convertFormDataToPhotoDbInsert(...args);

    if (photo.recipeData && !photo.recipeTitle && photo.film) {
      const recipeTitle = await getRecipeTitleForData(
        photo.recipeData,
        photo.film,
      );
      // Only replace recipe title when a new one is found
      if (recipeTitle) {
        photo.recipeTitle = recipeTitle;
      }
    }

    return photo;
  };

export const propagateRecipeTitleIfNecessary = async (
  formData: FormData,
  photo: PhotoDbInsert,
) => {
  if (
    formData.get('applyRecipeTitleGlobally') === 'true' &&
    // Only propagate recipe title if set by user before lookup
    formData.get('recipeTitle') &&
    photo.recipeTitle &&
    photo.recipeData &&
    photo.film
  ) {
    await updateAllMatchingRecipeTitles(
      photo.recipeTitle,
      photo.recipeData,
      photo.film,
    );
  }
};

export const deletePhotoAndFiles = async (
  photoId: string,
  photoUrl: string,
) =>
  deletePhoto(photoId)
    .then(() => {
      const { fileNameBase } = getFileNamePartsFromStorageUrl(photoUrl);
      return deleteFilesWithPrefix(fileNameBase);
    });
