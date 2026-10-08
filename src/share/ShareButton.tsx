'use client';

import { TbPhotoShare } from 'react-icons/tb';
import { clsx } from 'clsx/lite';
import LoaderButton from '@/components/primitives/LoaderButton';
import { useAppState } from '@/app/AppState';
import { ShareModalProps } from '.';
import { useAppText } from '@/i18n/state/client';

export default function ShareButton({
  dim,
  className,
  tooltip,
  photo,
  photos,
  count,
  ...rest
}: {
  dim?: boolean
  className?: string
  tooltip?: string
} & ShareModalProps) {
  const { setShareModalProps } = useAppState();

  const appText = useAppText();

  const shareCount = photo ? 1 : count ?? photos?.length;
  const tooltipText = tooltip ?? (
    shareCount !== undefined && shareCount > 1
      ? appText.tooltip.sharePhotos
      : appText.tooltip.sharePhoto
  );

  return (
    <LoaderButton
      tooltip={tooltipText}
      aria-label={tooltipText}
      onClick={() => setShareModalProps?.({
        photo,
        photos,
        count,
        ...rest,
      })}
      className={clsx(
        className,
        dim ? 'text-dim' : 'text-medium',
      )}
      icon={<TbPhotoShare size={16} />}
      spinnerColor="dim"
      styleAs="link"
      hideFocusOutline
    />
  );
}
