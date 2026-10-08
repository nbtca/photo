'use client';

import { ComponentProps, useCallback, useMemo } from 'react';
import {
  getPathComponents,
  PARAM_REDIRECT,
  pathForAdminPhotoEdit,
  pathForPhoto,
} from '@/app/path';
import {
  deletePhotoAction,
  setPhotoVisibilityAction,
  toggleFavoritePhotoAction,
} from '@/photo/actions';
import {
  Photo,
  deleteConfirmationTextForPhoto,
  downloadFileNameForPhoto,
  titleForPhoto,
} from '@/photo';
import { isPathFavs, isPhotoFav } from '@/tag';
import { usePathname, useRouter } from 'next/navigation';
import MoreMenu, { MoreMenuSection } from '@/components/more/MoreMenu';
import { renderMenuItemCheck } from '@/components/more/MoreMenuItem';
import { useAppState } from '@/app/AppState';
import { RevalidatePhoto } from '@/photo/InfinitePhotoScroll';
import { MdOutlineFileDownload } from 'react-icons/md';
import IconFavs from '@/components/icons/IconFavs';
import IconEdit from '@/components/icons/IconEdit';
import { KEY_COMMANDS } from '@/photo/key-commands';
import { useAppText } from '@/i18n/state/client';
import IconTrash from '@/components/icons/IconTrash';
import {
  getVisibilityFromPhoto,
  getVisibilityOptions,
  VisibilityValue,
} from '@/photo/visibility';

export default function AdminPhotoMenu({
  photo,
  revalidatePhoto,
  includeFavorite = true,
  showKeyCommands,
  alwaysVisible,
  ...props
}: Omit<ComponentProps<typeof MoreMenu>, 'sections' | 'ariaLabel'> & {
  photo: Photo
  revalidatePhoto?: RevalidatePhoto
  includeFavorite?: boolean
  showKeyCommands?: boolean
  alwaysVisible?: boolean
}) {
  const { isUserSignedIn, registerAdminUpdate } = useAppState();

  const appText = useAppText();


  const router = useRouter();

  const path = usePathname();
  const pathComponents = getPathComponents(path);
  const isOnPhotoDetail = pathComponents.photoId === photo.id;
  const isFav = isPhotoFav(photo);
  const shouldRedirectFav = isPathFavs(path) && isFav;
  const shouldRedirectDelete = isOnPhotoDetail;
  const visibility = getVisibilityFromPhoto(photo);
  // Only leave the photo detail page when privacy itself changes, following
  // the photo to its new url: private photos are only reachable beneath the
  // private tag, public photos only outside it
  const redirectPathForVisibility = useCallback((value: VisibilityValue) => {
    const willBePrivate = value === 'private';
    return isOnPhotoDetail && willBePrivate !== Boolean(photo.hidden)
      ? pathForPhoto({ photo: { ...photo, hidden: willBePrivate } })
      : undefined;
  }, [isOnPhotoDetail, photo]);

  const sectionMain = useMemo(() => {
    const items: MoreMenuSection['items'] = [{
      label: appText.admin.edit,
      icon: <IconEdit />,
      href: pathForAdminPhotoEdit(photo.id) +
        `?${PARAM_REDIRECT}=${encodeURIComponent(path)}`,
      ...showKeyCommands && { keyCommand: KEY_COMMANDS.edit },
    }];
    if (includeFavorite) {
      items.push({
        label: isFav ? appText.admin.unfavorite : appText.admin.favorite,
        icon: <IconFavs
          size={14}
          className="translate-x-[-1px] translate-y-[0.5px]"
          highlight={isFav}
        />,
        action: () => toggleFavoritePhotoAction(
          photo.id,
          shouldRedirectFav,
        ).then(() => revalidatePhoto?.(photo.id)),
        ...showKeyCommands && {
          keyCommand: isFav
            ? KEY_COMMANDS.unfavorite
            : KEY_COMMANDS.favorite,
        },
      });
    }
    items.push({
      label: appText.admin.download,
      icon: <MdOutlineFileDownload
        size={18}
        className="translate-x-[-1.5px]"
      />,
      href: photo.url,
      hrefDownloadName: downloadFileNameForPhoto(photo),
      ...showKeyCommands && { keyCommand: KEY_COMMANDS.download },
    });
    const visibilityOptions = getVisibilityOptions(appText);
    items.push({
      label: appText.admin.setVisibility,
      icon: <span className="block translate-x-[-1px]">{visibilityOptions
        .find(({ value }) => value === visibility)
        ?.accessoryStart}</span>,
      items: visibilityOptions.map(({ value, label, accessoryStart }) => ({
        label,
        // Selected visibility is marked with a check, unselected show its icon
        icon: value === visibility
          ? renderMenuItemCheck(true)
          : accessoryStart,
        action: () => setPhotoVisibilityAction(
          photo.id,
          value,
          redirectPathForVisibility(value),
        )
          .then(() => {
            // Photos leaving a feed shift every subsequent page
            revalidatePhoto?.(photo.id, true);
            // Update photos rendered on the server, which SWR doesn't own
            router.refresh();
          }),
      })),
    });
    return { items };
  }, [
    path,
    appText,
    photo,
    showKeyCommands,
    includeFavorite,
    isFav,
    shouldRedirectFav,
    visibility,
    redirectPathForVisibility,
    revalidatePhoto,
    router,
  ]);

  const sectionDelete: MoreMenuSection = useMemo(() => ({
    items: [{
      label: appText.admin.delete,
      icon: <IconTrash
        className="translate-x-[-1px]"
      />,
      className: 'text-error *:hover:text-error *:active:text-error',
      color: 'red',
      action: () => {
        if (confirm(deleteConfirmationTextForPhoto(photo, appText))) {
          return deletePhotoAction(
            photo.id,
            photo.url,
            shouldRedirectDelete,
          ).then(() => {
            revalidatePhoto?.(photo.id, true);
            registerAdminUpdate?.();
          });
        }
      },
      ...showKeyCommands && {
        keyCommandModifier: KEY_COMMANDS.delete[0],
        keyCommand: KEY_COMMANDS.delete[1],
      },
    }],
  }), [
    appText,
    photo,
    showKeyCommands,
    revalidatePhoto,
    shouldRedirectDelete,
    registerAdminUpdate,
  ]);

  const sections = useMemo(() =>
    [sectionMain, sectionDelete]
  , [sectionMain, sectionDelete]);

  return (
    (isUserSignedIn && photo.editable !== false) || alwaysVisible
      ? <>
        <MoreMenu {...{
          ...props,
          sections,
          ariaLabel: `Admin menu for '${titleForPhoto(photo)}' photo`,
        }}/>
      </>
      : null
  );
}
