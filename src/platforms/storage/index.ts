import { Unauthorized, rpc } from '@spa/data';
import { generateNanoid } from '@/utility/nanoid';
import { formatBytes } from '@/utility/number';

export type StorageListItem = {
  url: string
  fileName: string
  uploadedAt?: Date
  size?: string
  originalName?: string
  folder?: string
  modifiedAt?: Date
};

export type UploadOrigin = {
  name: string
  folder?: string
  modifiedAt: number
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
  sha256?: string
  sourceUrl?: string
  origin?: UploadOrigin
};

const QUOTA_MESSAGE = '存储空间已用完，请先删除一些旧照片';

export const generateStorageId = () => generateNanoid(16);

export const generateFileNameWithId = (prefix: string) =>
  `${prefix}-${generateStorageId()}`;

export const getFileNamePartsFromStorageUrl = (url: string) => {
  const [
    _,
    urlBase = '',
    fileName = '',
    fileNameBase = '',
    fileId = '',
    fileModifier = '',
    fileExtension = '',
  ] = url.match(
    /^(.+)\/((-*[a-z0-9]+-*([a-z0-9]+)-*([a-z0-9]+)*)\.([a-z]{1,4}))$/i,
  ) ?? [];
  return {
    urlBase,
    fileName,
    fileNameBase,
    fileId,
    fileModifier,
    fileExtension,
  };
};

export const labelForStorage = (_type: StorageType) => 'Cloudflare R2';
export const baseUrlForStorage = (_type: StorageType) => '/img';
export const storageTypeFromUrl = (_url: string): StorageType =>
  'cloudflare-r2';

const put = (
  file: Blob,
  fileName: string,
  {
    onProgress,
    abortSignal,
    sha256,
    sourceUrl,
    origin,
  }: ClientUploadOptions = {},
) => new Promise<string>((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.open('PUT', `/img/${fileName}`);
  if (sha256) { xhr.setRequestHeader('X-Original-Sha256', sha256); }
  if (origin) {
    xhr.setRequestHeader('X-Original-Name', encodeURIComponent(origin.name));
    if (origin.folder) {
      xhr.setRequestHeader(
        'X-Original-Folder',
        encodeURIComponent(origin.folder),
      );
    }
    xhr.setRequestHeader(
      'X-Original-Modified',
      new Date(origin.modifiedAt).toISOString(),
    );
  }
  if (sourceUrl) {
    xhr.setRequestHeader('X-Upload-Source', sourceUrl.replace(/^\/img\//, ''));
  }
  xhr.upload.onprogress = event => {
    if (event.lengthComputable) { onProgress?.(event.loaded, event.total); }
  };
  xhr.onload = () => {
    if (xhr.status === 201) {
      resolve(`/img/${fileName}`);
    } else if (xhr.status === 401) {
      window.dispatchEvent(new Event('unauthorized'));
      reject(new Unauthorized());
    } else {
      reject(new Error(xhr.status === 507
        ? QUOTA_MESSAGE
        : `Upload failed (${xhr.status})`));
    }
  };
  xhr.onerror = () => reject(new Error('Upload failed'));
  xhr.onabort = () =>
    reject(new DOMException('The operation was aborted.', 'AbortError'));
  abortSignal?.addEventListener('abort', () => xhr.abort());
  xhr.send(file);
});

export const uploadFileFromClient = async (
  file: File | Blob,
  fileName: string,
  extension: string,
  addRandomSuffix = true,
  options?: ClientUploadOptions,
) => put(
  file,
  addRandomSuffix
    ? `${fileName}-${generateStorageId()}.${extension}`
    : `${fileName}.${extension}`,
  options,
);

export const putFile = (
  file: Uint8Array,
  fileName: string,
  sourceUrl?: string,
) => put(new Blob([file as BlobPart]), fileName, { sourceUrl });

export const findUploadedHashes = (hashes: string[]) =>
  rpc<string[]>('findUploadedHashes', hashes);

export const deleteFile = async (url: string) => {
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok) { throw new Error(`Delete failed (${response.status})`); }
};

export const getStorageUrlsForPrefix = async (prefix = '') =>
  rpc<{
    url: string
    fileName: string
    uploadedAt: string
    bytes: number
    originalName: string | null
    folder: string | null
    modifiedAt: string | null
  }[]>(
    'getStorageUrlsForPrefix',
    prefix,
  ).then((files): StorageListResponse =>
    files.map(({
      uploadedAt,
      bytes,
      originalName,
      folder,
      modifiedAt,
      ...file
    }) => ({
      ...file,
      uploadedAt: new Date(uploadedAt),
      size: formatBytes(bytes),
      originalName: originalName ?? undefined,
      folder: folder ?? undefined,
      modifiedAt: modifiedAt ? new Date(modifiedAt) : undefined,
    })));

export const deleteFilesWithPrefix = async (prefix: string) => {
  const urls = await getStorageUrlsForPrefix(prefix);
  return Promise.all(urls.map(({ url }) => deleteFile(url)));
};

export const getSignedUrlForUrl = async (url: string, _method?: string) =>
  url;

export const testStorageConnection = async () => {};
