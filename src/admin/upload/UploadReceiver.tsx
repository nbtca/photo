'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx/lite';
import { FiUploadCloud } from 'react-icons/fi';
import { useAppState } from '@/app/AppState';
import { useAppText } from '@/i18n/state/client';
import { useUploadState } from './UploadState';
import { filesFromDataTransfer, takeSharedFiles } from './files';

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || Boolean(target.closest('input, textarea')));

export default function UploadReceiver() {
  const { isUserSignedIn } = useAppState();
  const { uploadFiles, uploadState: { isUploading } } = useUploadState();
  const appText = useAppText();
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isUserSignedIn || !uploadFiles) { return; }
    navigator.serviceWorker?.register('/sw.js');
    const url = new URL(location.href);
    if (url.searchParams.has('shared')) {
      url.searchParams.delete('shared');
      history.replaceState(history.state, '', url);
      takeSharedFiles().then(uploadFiles);
    }
  }, [isUserSignedIn, uploadFiles]);

  useEffect(() => {
    if (!isUserSignedIn || !uploadFiles) { return; }

    let depth = 0;
    // Chromium marks images dragged from within the page as "Files" too
    let isDraggingFromPage = false;
    const isFileDrag = (event: DragEvent) =>
      !isDraggingFromPage &&
      Boolean(event.dataTransfer?.types.includes('Files'));
    const reset = () => {
      depth = 0;
      isDraggingFromPage = false;
      setIsDragging(false);
    };

    const onDragStart = () => { isDraggingFromPage = true; };
    const onDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) { return; }
      event.preventDefault();
      if (depth++ === 0) { setIsDragging(true); }
    };
    const onDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) { return; }
      event.preventDefault();
      event.dataTransfer!.dropEffect = 'copy';
    };
    // Safari reports relatedTarget as null, so count enters and leaves
    const onDragLeave = (event: DragEvent) => {
      if (isFileDrag(event) && --depth <= 0) { reset(); }
    };
    const onDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) { reset(); return; }
      event.preventDefault();
      reset();
      filesFromDataTransfer(event.dataTransfer!).then(uploadFiles);
    };
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0 || isEditable(event.target)) { return; }
      event.preventDefault();
      uploadFiles(files);
    };

    const listeners = [
      ['dragstart', onDragStart],
      ['dragenter', onDragEnter],
      ['dragover', onDragOver],
      ['dragleave', onDragLeave],
      ['drop', onDrop],
      ['dragend', reset],
      ['blur', reset],
      ['paste', onPaste],
    ] as const;
    listeners.forEach(([type, listener]) =>
      window.addEventListener(type, listener as EventListener));
    return () => listeners.forEach(([type, listener]) =>
      window.removeEventListener(type, listener as EventListener));
  }, [isUserSignedIn, uploadFiles]);

  return (
    <div
      aria-hidden
      className={clsx(
        'fixed inset-0 z-50 p-4 sm:p-8 pointer-events-none',
        'transition-opacity duration-150',
        isDragging ? 'opacity-100' : 'opacity-0 invisible',
      )}
    >
      <div className={clsx(
        'size-full flex flex-col items-center justify-center gap-3',
        'text-center rounded-2xl border-2 border-dashed',
        'border-gray-400 dark:border-gray-600',
        'bg-white/85 dark:bg-black/85 backdrop-blur-sm',
      )}>
        <FiUploadCloud size={36} className="text-medium" />
        <div className="text-lg text-main">
          {isUploading ? appText.admin.dropToQueue : appText.admin.dropToUpload}
        </div>
        <div className="text-dim">{appText.admin.dropHint()}</div>
      </div>
    </div>
  );
}
