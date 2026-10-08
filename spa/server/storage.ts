export type StorageListItem = {
  url: string
  fileName: string
  uploadedAt?: Date
  size?: string
};

export type StorageListResponse = StorageListItem[];

export type StorageType =
  'vercel-blob' |
  'aws-s3' |
  'cloudflare-r2' |
  'minio';

export type ClientUploadOptions = {
  onProgress?: (loaded: number, total: number) => void
  abortSignal?: AbortSignal
};

export const getFileNamePartsFromStorageUrl = (url: string) => {
  const [, urlBase = '', fileId = ''] = url.match(/^(.+)\/(\w+)$/) ?? [];
  return {
    urlBase,
    fileName: fileId,
    fileNameBase: fileId,
    fileId,
    fileModifier: '',
    fileExtension: 'webp',
  };
};

export const labelForStorage = (_type: StorageType) => 'Cloudflare R2';
export const baseUrlForStorage = (_type: StorageType) => '/img';
export const storageTypeFromUrl = (_url: string): StorageType =>
  'cloudflare-r2';
