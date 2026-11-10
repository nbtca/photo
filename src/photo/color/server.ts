import {
  convertOklchToJsonString,
  generateColorDataFromString,
  Oklch,
  PhotoColorData,
} from './client';
import sharp from 'sharp';
import { extractColors } from 'extract-colors';
import { calculateColorSort } from './sort';
import { getOptimizedPhotoUrlForManipulation } from '../storage';

const linear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const round = (value: number) => +value.toFixed(3);

// https://bottosson.github.io/posts/oklab/
const convertRgbToOklch = (red: number, green: number, blue: number): Oklch => {
  const [r, g, b] = [red, green, blue].map(linear);
  const L = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const M = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const S = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const l = 0.2104542553 * L + 0.7936177850 * M - 0.0040720468 * S;
  const a = 1.9779984951 * L - 2.4285922050 * M + 0.4505937099 * S;
  const bb = 0.0259040371 * L + 0.7827717662 * M - 0.8086757660 * S;
  const h = Math.atan2(bb, a) * (180 / Math.PI);
  return {
    l: round(l),
    c: round(Math.hypot(a, bb)),
    h: round(h < 0 ? h + 360 : h),
  };
};

export const convertHexToOklch = (hex: string): Oklch => {
  const value = parseInt(hex.replace(/^#/, '').slice(0, 6), 16) || 0;
  return convertRgbToOklch(value >> 16, (value >> 8) & 255, value & 255);
};

// Convert image url to byte array
const getImageDataFromUrl = async (_url: string) => {
  const url = getOptimizedPhotoUrlForManipulation(_url);
  const imageBuffer = await fetch(decodeURIComponent(url))
    .then(res => res.arrayBuffer());
  const image = sharp(imageBuffer);
  const { width, height } = await image.metadata();
  const buffer = await image.ensureAlpha().raw().toBuffer();
  return {
    data: new Uint8ClampedArray(buffer.buffer),
    width,
    height,
  };
};

// Squares channels before averaging, weighted by alpha
const getAverageColorFromImageUrl = async (url: string) => {
  const { data } = await getImageDataFromUrl(url);
  const totals = [0, 0, 0];
  let alphaTotal = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const alpha = data[i + 3];
    for (let c = 0; c < 3; c++) { totals[c] += data[i + c] ** 2 * alpha; }
    alphaTotal += alpha;
  }
  const [r, g, b] = totals.map(total =>
    alphaTotal ? Math.round(Math.sqrt(total / alphaTotal)) : 0);
  return convertRgbToOklch(r, g, b);
};

// algorithm library: extract-colors
const getExtractedColorsFromImageUrl = async (url: string) => {
  const data = await getImageDataFromUrl(url);
  return extractColors(data).then(colors =>
    colors.map(({ hex }) => convertHexToOklch(hex)));
};

const getColorDataFromImageUrl = async (
  url: string,
): Promise<PhotoColorData> => ({
  average: await getAverageColorFromImageUrl(url),
  colors: await getExtractedColorsFromImageUrl(url),
});

export const getColorFieldsForImageUrl = async (
  url: string,
  _colorData?: PhotoColorData,
) => {
  try {
    const colorData = _colorData && _colorData.ai
      ? _colorData
      : await getColorDataFromImageUrl(url);
    return {
      colorData,
      colorSort: calculateColorSort(colorData),
    };
  } catch {
    console.log('Error fetching image url data', url);
  }
};

// Used when inserting colors into database
export const getColorFieldsForPhotoDbInsert = async (
  ...args: Parameters<typeof getColorFieldsForImageUrl>
) => {
  const { colorData, ...rest } = await getColorFieldsForImageUrl(...args) ?? {};
  if (colorData !== undefined) {
    return {
      colorData: JSON.stringify(colorData),
      ...rest,
    };
  }
};

// Used when preparing colors for form
export const getColorFieldsForPhotoForm = async (
  ...args: Parameters<typeof getColorFieldsForImageUrl>
) => {
  const { colorSort, colorData, ...rest } =
    await getColorFieldsForPhotoDbInsert(...args) ?? {};
  if (colorSort !== undefined) {
    return {
      colorSort: `${colorSort}`,
      colorData,
      keyColor: convertOklchToJsonString(
        generateColorDataFromString(colorData)?.ai,
      ),
      ...rest,
    };
  }
};
