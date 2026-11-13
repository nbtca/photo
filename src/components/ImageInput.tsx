'use client';

import { useRef, RefObject } from 'react';
import { clsx } from 'clsx/lite';
import { ACCEPTED_PHOTO_FILE_TYPES } from '@/photo';
import { FiUploadCloud } from 'react-icons/fi';
import ProgressButton from './primitives/ProgressButton';
import ResponsiveText from './primitives/ResponsiveText';
import { useUploadState } from '@/admin/upload/UploadState';
import { useAppText } from '@/i18n/state/client';

export default function ImageInput({
  ref: inputRefExternal,
  id = 'file',
  className,
  multiple = true,
  hidden,
  showButton,
  primary,
  disabled: disabledProp,
  debug: _debug,
}: {
  ref?: RefObject<HTMLInputElement | null>
  id?: string
  className?: string
  multiple?: boolean
  hidden?: boolean
  showButton?: boolean
  primary?: boolean
  disabled?: boolean
  debug?: boolean
}) {
  const inputRefInternal = useRef<HTMLInputElement>(null);

  const inputRef = inputRefExternal ?? inputRefInternal;

  const {
    uploadState: {
      isUploading,
      filesLength,
      fileUploadIndex,
      uploadProgress,
    },
    uploadFiles,
  } = useUploadState();
  
  const appText = useAppText();

  const disabled = disabledProp || isUploading;

  return (
    <div className={clsx(
      hidden ? 'hidden' : 'flex flex-col gap-4 min-w-0',
      className,
    )}>
      <div className="flex items-center gap-2 sm:gap-4">
        <label
          htmlFor={id}
          className={clsx(
            'shrink-0 select-none text-main',
            // Undo standard label styles since
            // content is shown as button
            'font-normal tracking-normal',
            disabled && 'pointer-events-none cursor-not-allowed',
          )}
        >
          {showButton &&
            <ProgressButton
              type="button"
              isLoading={disabled}
              progress={isUploading
                ? uploadProgress ?? 0
                : undefined}
              icon={<FiUploadCloud
                size={18}
                className="translate-x-[-0.5px] translate-y-[0.5px]"
              />}
              aria-disabled={disabled}
              onClick={() => inputRef.current?.click()}
              hideText="never"
              primary={primary}
            >
              {isUploading
                ? filesLength > 1
                  ? <ResponsiveText shortText={appText.utility.paginate(
                    fileUploadIndex + 1,
                    filesLength,
                  )}>
                    {appText.utility.paginateAction(
                      fileUploadIndex + 1,
                      filesLength,
                      appText.admin.uploading,
                    )}
                  </ResponsiveText>
                  : appText.admin.uploading
                : appText.admin.uploadPhotos}
            </ProgressButton>}
          <input
            ref={inputRef}
            id={id}
            type="file"
            className="hidden!"
            accept={ACCEPTED_PHOTO_FILE_TYPES.join(',')}
            disabled={disabled}
            multiple={multiple}
            onChange={e => {
              const files = Array.from(e.currentTarget.files ?? []);
              e.currentTarget.value = '';
              if (files.length > 0) { uploadFiles?.(files); }
            }}
          />
        </label>
      </div>
    </div>
  );
}
