export interface UploadState {
  isUploading: boolean
  uploadError: string
  fileUploadName: string
  fileUploadIndex: number
  filesLength: number
  uploadProgress?: number
}

export const INITIAL_UPLOAD_STATE: UploadState = {
  isUploading: false,
  uploadError: '',
  fileUploadName: '',
  fileUploadIndex: 0,
  filesLength: 0,
};

export const getUploadProgress = (
  fileSizes: number[],
  fileIndex: number,
  bytesLoaded: number,
) => {
  const bytesTotal = fileSizes.reduce((sum, size) => sum + size, 0);
  if (bytesTotal <= 0) { return 0; }
  const bytesCompleted = fileSizes
    .slice(0, fileIndex)
    .reduce((sum, size) => sum + size, 0);
  return Math.min(1, (bytesCompleted + bytesLoaded) / bytesTotal);
};

export type SkipReason = 'heic' | 'type' | 'size' | 'duplicate' | 'failed';

type FileLike = Pick<File, 'name' | 'type' | 'size'>;

const extensionOf = (name: string) =>
  name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';

export const uploadExtensionFor = ({ name, type }: FileLike) =>
  type === 'image/png' || extensionOf(name) === 'png' ? 'png' : 'jpg';

export const skipReasonFor = (
  file: FileLike,
  maxBytes: number,
): SkipReason | undefined => {
  const extension = extensionOf(file.name);
  if (/^image\/hei[cf]$/.test(file.type) || /^hei[cf]$/.test(extension)) {
    return 'heic';
  }
  const isAccepted = file.type
    ? /^image\/(jpe?g|png)$/.test(file.type)
    : /^(jpe?g|png)$/.test(extension);
  if (!isAccepted) { return 'type'; }
  if (file.size > maxBytes) { return 'size'; }
};

export const partitionUploadFiles = <T extends FileLike>(
  files: T[],
  maxBytes: number,
) => {
  const accepted: T[] = [];
  const skipped: SkipReason[] = [];
  for (const file of files) {
    const reason = skipReasonFor(file, maxBytes);
    if (reason) { skipped.push(reason); } else { accepted.push(file); }
  }
  return { accepted, skipped };
};

export const countSkipReasons = (reasons: SkipReason[]) =>
  (['heic', 'type', 'size', 'duplicate', 'failed'] as const)
    .map(reason => ({
      reason,
      count: reasons.filter(r => r === reason).length,
    }))
    .filter(({ count }) => count > 0);

const DEFAULT_FILE_NAME = new RegExp(`^(?:${[
  '_?dsc[fn]?', '_?mg_', 'img', 'pxl', 'mvimg', 'vid', 'dji', 'gopr', 'p\\d',
  'mmexport', 'wx_camera', '微信图片', '截屏', '屏幕截图', 'screen ?shot',
  'image', 'photo',
].join('|')})`, 'i');

export const suggestTitle = (fileName = '') => {
  const name = fileName.replace(/\.[^.]+$/, '').trim();
  return DEFAULT_FILE_NAME.test(name) || !/\p{L}/u.test(name)
    ? ''
    : name.replace(/_+/g, ' ').trim();
};

export const suggestAlbum = (uploads: { folder?: string }[]) => {
  const folders = new Set(uploads.map(({ folder }) => folder));
  const [folder] = folders;
  return folders.size === 1 && folder ? folder : '';
};
