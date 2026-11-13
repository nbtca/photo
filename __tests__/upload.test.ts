import {
  countSkipReasons,
  getUploadProgress,
  partitionUploadFiles,
  skipReasonFor,
  uploadExtensionFor,
} from '@/admin/upload';

const MB = 1024 * 1024;
const file = (name: string, type: string, size = MB) =>
  ({ name, type, size });
const LIMIT = 12 * MB;

describe('getUploadProgress', () => {
  it('weights progress by file size', () => {
    expect(getUploadProgress([100, 300], 0, 50)).toBe(0.125);
    expect(getUploadProgress([100, 300], 1, 150)).toBe(0.625);
    expect(getUploadProgress([100, 300], 1, 300)).toBe(1);
  });
  it('returns 0 when total size is 0', () => {
    expect(getUploadProgress([], 0, 0)).toBe(0);
    expect(getUploadProgress([0], 0, 0)).toBe(0);
  });
});

describe('skipReasonFor', () => {
  it('accepts JPEG and PNG by type or extension', () => {
    expect(skipReasonFor(file('a.jpg', 'image/jpeg'), LIMIT)).toBeUndefined();
    expect(skipReasonFor(file('a.PNG', 'image/png'), LIMIT)).toBeUndefined();
    expect(skipReasonFor(file('a.jpeg', ''), LIMIT)).toBeUndefined();
  });
  it('flags HEIC separately from other types', () => {
    expect(skipReasonFor(file('IMG_1.HEIC', ''), LIMIT)).toBe('heic');
    expect(skipReasonFor(file('a', 'image/heif'), LIMIT)).toBe('heic');
    expect(skipReasonFor(file('a.zip', 'application/zip'), LIMIT)).toBe('type');
    expect(skipReasonFor(file('a.webp', 'image/webp'), LIMIT)).toBe('type');
    expect(skipReasonFor(file('notes', ''), LIMIT)).toBe('type');
  });
  it('flags files above the limit', () => {
    const large = file('a.jpg', 'image/jpeg', 13 * MB);
    expect(skipReasonFor(large, LIMIT)).toBe('size');
    expect(skipReasonFor(large, 50 * MB)).toBeUndefined();
  });
});

describe('partitionUploadFiles', () => {
  it('keeps order of accepted files and collects skip reasons', () => {
    const files = [
      file('1.jpg', 'image/jpeg'),
      file('2.heic', 'image/heic'),
      file('3.png', 'image/png'),
      file('4.mov', 'video/quicktime'),
    ];
    const { accepted, skipped } = partitionUploadFiles(files, LIMIT);
    expect(accepted.map(({ name }) => name)).toEqual(['1.jpg', '3.png']);
    expect(skipped).toEqual(['heic', 'type']);
  });
});

describe('countSkipReasons', () => {
  it('counts reasons in a fixed order and drops empty ones', () => {
    expect(countSkipReasons(['failed', 'type', 'type'])).toEqual([
      { reason: 'type', count: 2 },
      { reason: 'failed', count: 1 },
    ]);
  });
});

describe('uploadExtensionFor', () => {
  it('uses png for PNG files and jpg otherwise', () => {
    expect(uploadExtensionFor(file('image.png', ''))).toBe('png');
    expect(uploadExtensionFor(file('image', 'image/png'))).toBe('png');
    expect(uploadExtensionFor(file('a.JPEG', 'image/jpeg'))).toBe('jpg');
  });
});
