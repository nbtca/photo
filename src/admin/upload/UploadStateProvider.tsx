'use client';

import {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { UploadStateContext } from './UploadState';
import {
  INITIAL_UPLOAD_STATE,
  SkipReason,
  UploadState,
  countSkipReasons,
  getUploadProgress,
  partitionUploadFiles,
  uploadExtensionFor,
} from '.';
import { revalidateAdminAfterUploadAction } from '@/admin/actions';
import { PATH_ADMIN_UPLOADS, pathForAdminUploadUrl } from '@/app/path';
import { PRESERVE_ORIGINAL_UPLOADS } from '@/app/config';
import { uploadTempPhotoFromClient } from '@/photo/storage';
import { MAX_PHOTO_UPLOAD_SIZE_IN_BYTES } from '@/photo';
import { MAX_UPLOAD_BYTES } from '@/photo/limits';
import { MAX_IMAGE_SIZE } from '@/platforms/next-image';
import { isAbortError } from '@/utility/abort';
import { useAppText } from '@/i18n/state/client';
import { toastWarning } from '@/toast';
import { Unauthorized } from '@spa/data';

const Lines = ({ lines }: { lines: string[] }) =>
  lines.map(line => <div key={line}>{line}</div>);

const prepareUpload = async (file: File) => {
  const extension = uploadExtensionFor(file);
  if (PRESERVE_ORIGINAL_UPLOADS) { return { blob: file as Blob, extension }; }
  const { pngToJpegWithExif, jpgToJpegWithExif } =
    await import('@/utility/exif-client');
  const convert = extension === 'png' ? pngToJpegWithExif : jpgToJpegWithExif;
  return convert(file, { maxSize: MAX_IMAGE_SIZE, quality: 0.9 })
    .then(
      blob => ({ blob, extension: 'jpeg' }),
      () => ({ blob: file as Blob, extension }),
    );
};

export default function UploadStateProvider({
  children,
}: {
  children: ReactNode
}) {
  const router = useRouter();

  const pathname = usePathname();

  const appText = useAppText();

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const [uploadState, _setUploadState] = useState(INITIAL_UPLOAD_STATE);
  const [hideUploadPanel, setHideUploadPanel] = useState(false);

  const startUpload = useCallback(() =>
    new Promise<boolean>(resolve => {
      if (uploadInputRef.current) {
        uploadInputRef.current.value = '';
        uploadInputRef.current.click();
        uploadInputRef.current.oninput = () => resolve(true);
        uploadInputRef.current.oncancel = () => resolve(false);
      } else {
        resolve(false);
      }
    })
  , []);
  const setUploadState = useCallback((uploadState: Partial<UploadState>) => {
    _setUploadState(prev => ({ ...prev, ...uploadState }));
  }, []);
  const resetUploadState = useCallback(() => {
    _setUploadState(INITIAL_UPLOAD_STATE);
  }, []);
  const cancelUpload = useCallback(() => {
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    _setUploadState(INITIAL_UPLOAD_STATE);
  }, []);

  const shouldResetUploadStateAfterPending = useRef(false);
  const [isUploadPending, startUploadTransition] = useTransition();
  // Only reset upload state after route transition completes
  useEffect(() => {
    if (!isUploadPending && shouldResetUploadStateAfterPending.current) {
      resetUploadState();
      shouldResetUploadStateAfterPending.current = false;
    }
  }, [isUploadPending, resetUploadState]);
  const isFinishingUpload =
    isUploadPending && shouldResetUploadStateAfterPending.current;

  useEffect(() => {
    if (!uploadState.isUploading) { return; }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [uploadState.isUploading]);

  const describeSkipped = useCallback((reasons: SkipReason[]) =>
    countSkipReasons(reasons)
      .map(({ reason, count }) => appText.admin.uploadSkipped(reason, count))
  , [appText]);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (uploadAbortRef.current) {
      toastWarning(appText.admin.dropBusy);
      return;
    }

    const { accepted, skipped } = partitionUploadFiles(
      files,
      PRESERVE_ORIGINAL_UPLOADS
        ? MAX_UPLOAD_BYTES
        : MAX_PHOTO_UPLOAD_SIZE_IN_BYTES,
    );
    if (accepted.length === 0) {
      if (skipped.length > 0) {
        toastWarning(<Lines lines={describeSkipped(skipped)} />);
      }
      return;
    }

    const controller = new AbortController();
    uploadAbortRef.current = controller;
    const abortSignal = controller.signal;

    const fileSizes = accepted.map(file => file.size);
    const reportProgress = (fileIndex: number, bytesLoaded: number) =>
      setUploadState({
        uploadProgress: getUploadProgress(fileSizes, fileIndex, bytesLoaded),
      });
    setUploadState({
      isUploading: true,
      uploadError: '',
      uploadProgress: 0,
      filesLength: accepted.length,
    });

    const urls: string[] = [];
    try {
      for (const [index, file] of accepted.entries()) {
        setUploadState({ fileUploadIndex: index, fileUploadName: file.name });
        reportProgress(index, 0);
        const { blob, extension } = await prepareUpload(file);
        if (abortSignal.aborted) { return; }
        fileSizes[index] = blob.size;
        if (blob.size > MAX_UPLOAD_BYTES) {
          skipped.push('size');
        } else {
          try {
            urls.push(await uploadTempPhotoFromClient(blob, extension, {
              abortSignal,
              onProgress: loaded => reportProgress(index, loaded),
            }));
          } catch (error) {
            if (isAbortError(error) || error instanceof Unauthorized) {
              throw error;
            }
            console.error(error);
            skipped.push('failed');
          }
        }
        reportProgress(index, fileSizes[index]);
      }
    } catch (error) {
      if (isAbortError(error) || error instanceof Unauthorized) { return; }
      throw error;
    } finally {
      if (uploadAbortRef.current === controller) {
        uploadAbortRef.current = null;
      }
    }

    const skippedLines = describeSkipped(skipped);
    if (urls.length === 0) {
      setUploadState({
        isUploading: false,
        uploadError: skippedLines.join(' · '),
      });
      return;
    }
    if (skippedLines.length > 0) {
      toastWarning(<Lines lines={skippedLines} />, 8000);
    }

    await revalidateAdminAfterUploadAction();
    shouldResetUploadStateAfterPending.current = true;
    if (pathname === PATH_ADMIN_UPLOADS) {
      setUploadState({ isUploading: false });
      router.refresh();
    } else {
      startUploadTransition(() => accepted.length > 1
        ? router.push(PATH_ADMIN_UPLOADS)
        : router.push(pathForAdminUploadUrl(urls[0])));
    }
  }, [appText, describeSkipped, pathname, router, setUploadState]);

  return (
    <UploadStateContext
      value={{
        uploadInputRef,
        uploadState,
        setUploadState,
        resetUploadState,
        hideUploadPanel,
        setHideUploadPanel,
        startUpload,
        cancelUpload,
        uploadFiles,
        isFinishingUpload,
      }}
    >
      {children}
    </UploadStateContext>
  );
}
