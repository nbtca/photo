import { Oklch, PhotoColorData } from './client';

// Color analysis ran on the server with sharp and is not available here.

export const getColorFieldsForImageUrl = async (
  _url: string,
  _colorData?: PhotoColorData,
  _isBatch?: boolean,
): Promise<{ colorData: PhotoColorData, colorSort: number } | undefined> =>
  undefined;

export const getColorFieldsForPhotoDbInsert = async (
  ..._args: Parameters<typeof getColorFieldsForImageUrl>
): Promise<{ colorData: string, colorSort: number } | undefined> =>
  undefined;

export const getColorFieldsForPhotoForm = async (
  ..._args: Parameters<typeof getColorFieldsForImageUrl>
): Promise<{
  colorData: string
  colorSort: string
  keyColor?: string
} | undefined> => undefined;

export const getColorFromAI = async (
  _url: string,
  _isBatch?: boolean,
): Promise<Oklch | undefined> => undefined;
