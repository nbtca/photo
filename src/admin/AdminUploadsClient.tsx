'use client';

import { StorageListItem, StorageListResponse } from '@/platforms/storage';
import AdminBatchUploadActions from './AdminBatchUploadActions';
import { useEffect, useMemo, useState } from 'react';
import { Tags } from '@/tag';
import AdminUploadsTable from './AdminUploadsTable';
import { Albums } from '@/album';
import AdminPageHeader from './AdminPageHeader';
import PhotoUploadWithStatus from '@/photo/PhotoUploadWithStatus';
import { useAppText } from '@/i18n/state/client';
import { useUploadState } from '@/admin/upload/UploadState';
import EmptyState from '@/components/EmptyState';
import IconUpload from '@/components/icons/IconUpload';
import { suggestAlbum, suggestTitle } from '@/admin/upload';
import { generateLocalTakenAt } from '@/utility/date';

export type UrlAddStatus = StorageListItem & {
  status?: 'waiting' | 'adding' | 'added'
  statusMessage?: string
  draftTitle?: string
  progress?: number
};

const withSuggestedTitles = (urls: StorageListResponse): UrlAddStatus[] =>
  urls.map(upload => ({
    ...upload,
    draftTitle: suggestTitle(upload.originalName),
  }));

export default function AdminUploadsClient({
  urls,
  uniqueTags,
  uniqueAlbums,
}: {
  urls: StorageListResponse
  uniqueTags: Tags
  uniqueAlbums: Albums
}) {
  const appText = useAppText();

  const { uploadState: { isUploading } } = useUploadState();

  const [urlAddStatuses, setUrlAddStatuses] =
    useState(() => withSuggestedTitles(urls));

  useEffect(() => {
    // Overwrite local state when server state changes
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrlAddStatuses(withSuggestedTitles(urls));
  }, [urls]);

  const uploadUrls = useMemo(() => urlAddStatuses
    .map(({ url }) => url), [urlAddStatuses]);
  const uploadTitles = useMemo(() => urlAddStatuses
    .map(({ draftTitle }) => draftTitle ?? ''), [urlAddStatuses]);
  const uploadTakenAts = useMemo(() => urlAddStatuses
    .map(({ modifiedAt }) => generateLocalTakenAt(modifiedAt))
  , [urlAddStatuses]);
  const suggestedAlbum = useMemo(() => suggestAlbum(urls), [urls]);

  const [isAdding, setIsAdding] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <div className="space-y-2">
      <AdminPageHeader
        count={urls.length}
        singular={appText.admin.upload}
        plural={appText.admin.uploadPlural}
        hideLabel={isUploading}
        accessory={<PhotoUploadWithStatus
          inputId="admin-uploads"
          className="flex-row-reverse min-w-0"
          expandStatus={isUploading}
          primary={urlAddStatuses.length === 0}
        />}
      />
      {urlAddStatuses.length === 0
        ? <EmptyState icon={<IconUpload />}>
          <div className="max-w-xs text-center space-y-1">
            <div className="font-bold">
              {appText.admin.uploadsEmpty}
            </div>
            <div className="text-dim">
              {appText.admin.uploadsEmptyNote}
            </div>
          </div>
        </EmptyState>
        : <>
          {(urls.length > 1 || isAdding) &&
            <AdminBatchUploadActions key={suggestedAlbum} {...{
              uploadUrls,
              uploadTitles,
              uploadTakenAts,
              suggestedAlbum,
              uniqueAlbums,
              uniqueTags,
              isAdding,
              setIsAdding,
              setUrlAddStatuses,
              isDeleting,
              setIsDeleting,
            }} />}
          <AdminUploadsTable {...{
            isAdding,
            urlAddStatuses,
            setUrlAddStatuses,
            isDeleting,
            setIsDeleting,
          }} />
        </>}
    </div>
  );
}
