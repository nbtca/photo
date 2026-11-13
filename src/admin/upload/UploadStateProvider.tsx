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
import { findUploadedHashes } from '@/platforms/storage';
import { MAX_PHOTO_UPLOAD_SIZE_IN_BYTES } from '@/photo';
import { MAX_UPLOAD_BYTES } from '@/photo/limits';
import { MAX_IMAGE_SIZE } from '@/platforms/next-image';
import { isAbortError } from '@/utility/abort';
import { useAppText } from '@/i18n/state/client';
import { toastWarning } from '@/toast';
import { Unauthorized } from '@spa/data';

interface UploadSession {
  controller: AbortController
  queue: File[]
  hashes: string[]
  sizes: number[]
  seen: Set<string>
  skipped: SkipReason[]
  urls: string[]
  next: number
  pending: number
  isRunning: boolean
}

const sha256Of = async (file: Blob) => new Uint8Array(
  await crypto.subtle.digest('SHA-256', await file.arrayBuffer()),
).toHex();

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
  const sessionRef = useRef<UploadSession | null>(null);
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
    sessionRef.current?.controller.abort();
    sessionRef.current = null;
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

  const finishSession = useCallback(async (session: UploadSession) => {
    sessionRef.current = null;
    const skippedLines = describeSkipped(session.skipped);
    if (session.urls.length === 0) {
      if (session.skipped.every(reason => reason !== 'failed')) {
        resetUploadState();
        toastWarning(<Lines lines={skippedLines} />);
      } else {
        setUploadState({
          isUploading: false,
          uploadError: skippedLines.join(' · '),
        });
      }
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
      startUploadTransition(() => session.queue.length > 1
        ? router.push(PATH_ADMIN_UPLOADS)
        : router.push(pathForAdminUploadUrl(session.urls[0])));
    }
  }, [describeSkipped, pathname, resetUploadState, router, setUploadState]);

  const runSession = useCallback(async (session: UploadSession) => {
    const { signal } = session.controller;
    const reportProgress = (index: number, bytesLoaded: number) =>
      setUploadState({
        uploadProgress: getUploadProgress(session.sizes, index, bytesLoaded),
      });
    session.isRunning = true;
    try {
      for (; session.next < session.queue.length; session.next++) {
        const index = session.next;
        const file = session.queue[index];
        setUploadState({ fileUploadIndex: index, fileUploadName: file.name });
        reportProgress(index, 0);
        const { blob, extension } = await prepareUpload(file);
        if (signal.aborted) { return; }
        session.sizes[index] = blob.size;
        if (blob.size > MAX_UPLOAD_BYTES) {
          session.skipped.push('size');
        } else {
          try {
            session.urls.push(await uploadTempPhotoFromClient(blob, extension, {
              abortSignal: signal,
              sha256: session.hashes[index],
              onProgress: loaded => reportProgress(index, loaded),
            }));
          } catch (error) {
            if (isAbortError(error) || error instanceof Unauthorized) {
              throw error;
            }
            console.error(error);
            session.skipped.push('failed');
          }
        }
        reportProgress(index, session.sizes[index]);
      }
    } catch (error) {
      if (isAbortError(error) || error instanceof Unauthorized) { return; }
      console.error(error);
      sessionRef.current = null;
      setUploadState({ isUploading: false, uploadError: String(error) });
      return;
    } finally {
      session.isRunning = false;
    }
    if (session.pending === 0) { await finishSession(session); }
  }, [finishSession, setUploadState]);

  const uploadFiles = useCallback(async (files: File[]) => {
    const { accepted, skipped } = partitionUploadFiles(
      files,
      PRESERVE_ORIGINAL_UPLOADS
        ? MAX_UPLOAD_BYTES
        : MAX_PHOTO_UPLOAD_SIZE_IN_BYTES,
    );
    if (!sessionRef.current && accepted.length === 0) {
      if (skipped.length > 0) {
        toastWarning(<Lines lines={describeSkipped(skipped)} />);
      }
      return;
    }

    let session = sessionRef.current;
    if (!session) {
      session = {
        controller: new AbortController(),
        queue: [],
        hashes: [],
        sizes: [],
        seen: new Set(),
        skipped: [],
        urls: [],
        next: 0,
        pending: 0,
        isRunning: false,
      };
      sessionRef.current = session;
      setUploadState({
        isUploading: true,
        uploadError: '',
        uploadProgress: 0,
        fileUploadIndex: 0,
        fileUploadName: '',
        filesLength: 0,
      });
    }
    session.skipped.push(...skipped);

    session.pending++;
    try {
      const hashes: string[] = [];
      for (const file of accepted) {
        hashes.push(await sha256Of(file).catch(() => ''));
      }
      const known = hashes.filter(Boolean);
      const uploaded = new Set(known.length > 0
        ? await findUploadedHashes(known).catch(error => {
          if (error instanceof Unauthorized) { throw error; }
          console.error(error);
          return [];
        })
        : []);
      if (session !== sessionRef.current) { return; }
      accepted.forEach((file, index) => {
        const hash = hashes[index];
        if (hash && (uploaded.has(hash) || session.seen.has(hash))) {
          session.skipped.push('duplicate');
          return;
        }
        if (hash) { session.seen.add(hash); }
        session.queue.push(file);
        session.hashes.push(hash);
        session.sizes.push(file.size);
      });
      setUploadState({ filesLength: session.queue.length });
    } catch (error) {
      if (error instanceof Unauthorized) { return; }
      throw error;
    } finally {
      session.pending--;
    }
    if (!session.isRunning) { await runSession(session); }
  }, [describeSkipped, runSession, setUploadState]);

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
