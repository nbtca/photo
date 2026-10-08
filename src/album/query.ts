import { rpc } from '@spa/data';
import { Album, Albums, parseAlbumFromDb } from '@/album';

export const createAlbumsTable = async () => {};
export const createAlbumPhotoTable = async () => {};

export const insertAlbum = (album: Omit<Album, 'id'>) =>
  rpc<string>('insertAlbum', album);

export const updateAlbum = (album: Album) => rpc<void>('updateAlbum', album);

export const deleteAlbum = (id: string) => rpc<void>('deleteAlbum', id);

export const clearPhotoAlbumIds = (photoId: string) =>
  rpc<void>('clearPhotoAlbumIds', photoId);

export const addPhotoAlbumIds = async (
  photoIds: string[],
  albumIds: string[],
) => {
  if (photoIds.length > 0 && albumIds.length > 0) {
    await rpc<void>('addPhotoAlbumIds', photoIds, albumIds);
  }
};

export const addPhotoAlbumId = (photoId: string, albumId: string) =>
  addPhotoAlbumIds([photoId], [albumId]);

export const getAlbumFromSlug = (slug: string) =>
  rpc<object | null>('getAlbumFromSlug', slug)
    .then(row => row ? parseAlbumFromDb(row) : undefined);

export const getAlbumsWithMeta = () =>
  rpc<{ count: number, updated_at: string }[]>('getAlbumsWithMeta')
    .then((rows): Albums => rows.map(({ count, ...album }) => ({
      album: parseAlbumFromDb(album),
      count,
      lastModified: new Date(album.updated_at),
    })));

export const getAlbumTitlesForPhoto = (photoId: string) =>
  rpc<string[]>('getAlbumTitlesForPhoto', photoId);

export const getTagsForAlbum = (albumId: string) =>
  rpc<string[]>('getTagsForAlbum', albumId);
