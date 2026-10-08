import { rpc } from '@spa/data';
import { Albums, parseAlbumFromDb } from '@/album';

export const createAlbumsTable = async () => {};
export const createAlbumPhotoTable = async () => {};

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
