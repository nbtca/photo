'use client';

import { deleteUploadsAction } from '@/photo/actions';
import DeleteButton from './DeleteButton';
import { ComponentProps, useState } from 'react';
import LoaderButton from '@/components/primitives/LoaderButton';
import { useAppText } from '@/i18n/state/client';

export default function DeleteUploadButton({
  urls,
  onDeleteStart,
  onDelete,
  children,
  isLoading,
  ...props
}: {
  urls: string[]
  onDeleteStart?: () => void
  onDelete?: (didFail?: boolean) => void
} & ComponentProps<typeof LoaderButton>) {
  const [isDeleting, setIsDeleting] = useState(false);

  const appText = useAppText();

  return (
    <DeleteButton
      {...props}
      confirmText={urls.length === 1
        ? appText.admin.uploadDeleteConfirm
        : appText.admin.uploadsDeleteConfirm(urls.length)}
      onClick={() => {
        onDeleteStart?.();
        setIsDeleting(true);
        deleteUploadsAction(urls)
          .then(() => {
            setIsDeleting(false);
            onDelete?.();
          })
          .catch(() => {
            setIsDeleting(false);
            onDelete?.(true);
          });
      }}
      isLoading={isLoading ?? isDeleting}
    >
      {children}
    </DeleteButton>
  );
}
