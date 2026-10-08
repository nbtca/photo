export type AdminData = Awaited<ReturnType<typeof getAdminDataAction>>;

export const getAdminDataAction = async () => ({
  photosCount: 0,
  photosCountHidden: 0,
  photosCountNeedSync: 0,
  photosCountTotal: 0,
  uploadsCount: 0,
  albumsCount: 0,
  tagsCount: 0,
  recipesCount: 0,
});
