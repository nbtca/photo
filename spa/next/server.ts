export const after = (callback: () => unknown) => {
  queueMicrotask(callback);
};
