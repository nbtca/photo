type NextCustomSize = 100 | 200;

type NextImageDeviceSize = 640 | 750 | 828 | 1080 | 1200 | 1920 | 2048 | 3840;

export type NextImageSize = NextCustomSize | NextImageDeviceSize;

export const MAX_IMAGE_SIZE: NextImageSize = 3840;

// Photos are stored in two sizes, /img/l/:id and /img/t/:id.
export const getNextImageUrlForRequest = ({
  imageUrl,
  size,
}: {
  imageUrl: string
  size: NextImageSize
  quality?: number
  baseUrl?: string
  addBypassSecret?: boolean
}) =>
  size <= 640
    ? imageUrl.replace(/^\/img\/l\//, '/img/t/')
    : imageUrl;
