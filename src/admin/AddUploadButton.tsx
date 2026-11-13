import LoaderButton from '@/components/primitives/LoaderButton';
import { addUploadAction } from '@/photo/actions';
import { generateLocalTakenAt } from '@/utility/date';
import { useAppText } from '@/i18n/state/client';
import { PATH_ADMIN_PHOTOS } from '@/app/path';
import { useRouter } from 'next/navigation';
import { ComponentProps, useState } from 'react';
import IconAddUpload from '@/components/icons/IconAddUpload';

export default function AddUploadButton({
  url,
  title,
  takenAtFallback,
  onAddStart,
  onAddFinish,
  shouldRedirectToAdminPhotos,
  ...props
}: {
  url: string
  title?: string
  takenAtFallback?: Date
  onAddStart?: () => void
  onAddFinish?: (success: boolean) => void
  shouldRedirectToAdminPhotos: boolean
} & ComponentProps<typeof LoaderButton>) {
  const router = useRouter();

  const appText = useAppText();

  const [isAddingLocal, setIsAddingLocal] = useState(false);

  return (
    <LoaderButton
      {...props}
      icon={<IconAddUpload />}
      onClick={() => {
        onAddStart?.();
        setIsAddingLocal(true);
        addUploadAction({
          url,
          title,
          ...generateLocalTakenAt(takenAtFallback),
          shouldRevalidateAllKeysAndPaths: true,
        })
          .then(() => {
            if (shouldRedirectToAdminPhotos) {
              router.push(PATH_ADMIN_PHOTOS);
            } else {
              onAddFinish?.(true);
              setIsAddingLocal(false);
            }
          })
          .catch(() => {
            onAddFinish?.(false);
            setIsAddingLocal(false);
          });
      }}
      isLoading={isAddingLocal}
      tooltip={appText.admin.uploadAddTooltip}
      hideText="never"
    >
      {appText.admin.uploadAdd}
    </LoaderButton>
  );
}
