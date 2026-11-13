import { getStorageUploadUrlsNoStore } from '@/platforms/storage/cache';
import AppGrid from '@/components/AppGrid';
import { getUniqueTagsCached } from '@/photo/cache';
import { getAlbumsWithMetaCached } from '@/album/cache';
import AdminUploadsClient from '@/admin/AdminUploadsClient';

export const maxDuration = 60;

export default async function AdminUploadsPage() {
  const urls = await getStorageUploadUrlsNoStore();

  const [uniqueAlbums, uniqueTags] = urls.length > 0
    ? await Promise.all([
      getAlbumsWithMetaCached(),
      getUniqueTagsCached(),
    ])
    : [[], []];

  return (
    <AppGrid
      contentMain={
        <AdminUploadsClient {...{
          urls,
          uniqueAlbums,
          uniqueTags,
        }} />}
    />
  );
}
