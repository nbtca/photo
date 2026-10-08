type NextCustomSize = 100 | 200;

type NextImageDeviceSize = 640 | 750 | 828 | 1080 | 1200 | 1920 | 2048 | 3840;

export type NextImageSize = NextCustomSize | NextImageDeviceSize;

export const MAX_IMAGE_SIZE: NextImageSize = 3840;

const VARIANTS = [
  { suffix: 'sm', size: 200 },
  { suffix: 'md', size: 640 },
  { suffix: 'lg', size: 1080 },
];

// Photos are stored with three smaller variants named after the original.
export const variantForWidth = (imageUrl: string, width: number) => {
  const suffix = VARIANTS.find(({ size }) => width <= size)?.suffix;
  return suffix
    ? imageUrl.replace(/^(\/img\/photo-\w+)\.\w+$/, `$1-${suffix}.jpg`)
    : imageUrl;
};

export const getNextImageUrlForRequest = ({
  imageUrl,
  size,
}: {
  imageUrl: string
  size: NextImageSize
  quality?: number
  baseUrl?: string
  addBypassSecret?: boolean
}) => variantForWidth(imageUrl, size);
