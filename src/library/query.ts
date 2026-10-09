import { rpc } from '@spa/data';
import camelcaseKeys from 'camelcase-keys';
import { Library, LibraryInsert } from '.';

export const createLibraryTable = async () => {};

export const upsertLibrary = (library: LibraryInsert) =>
  rpc<number>('upsertLibrary', library);

export const getLibrary = () =>
  rpc<Record<string, unknown> | null>('getLibrary')
    .then(row => row
      ? camelcaseKeys({
        ...row,
        updated_at: new Date(row.updated_at as string),
        created_at: new Date(row.created_at as string),
      }) as unknown as Library
      : undefined);
