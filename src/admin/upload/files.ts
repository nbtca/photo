const readFile = (entry: FileSystemFileEntry) =>
  new Promise<File>((resolve, reject) => entry.file(resolve, reject));

const readBatch = (reader: FileSystemDirectoryReader) =>
  new Promise<FileSystemEntry[]>((resolve, reject) =>
    reader.readEntries(resolve, reject));

const filesFromEntry = async (entry: FileSystemEntry): Promise<File[]> => {
  if (entry.name.startsWith('.')) { return []; }
  if (entry.isFile) { return [await readFile(entry as FileSystemFileEntry)]; }
  if (!entry.isDirectory) { return []; }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const entries: FileSystemEntry[] = [];
  // readEntries returns at most 100 entries per call in Chromium
  let batch = await readBatch(reader);
  while (batch.length > 0) {
    entries.push(...batch);
    batch = await readBatch(reader);
  }
  return (await Promise.all(entries.map(filesFromEntry))).flat();
};

// Entries must be read synchronously inside the drop handler:
// the DataTransfer is emptied once the handler returns.
export const filesFromDataTransfer = (dataTransfer: DataTransfer) => {
  const entries = Array.from(dataTransfer.items)
    .filter(item => item.kind === 'file')
    .map(item => item.webkitGetAsEntry());
  if (entries.some(entry => !entry)) {
    return Promise.resolve(Array.from(dataTransfer.files));
  }
  return Promise.all((entries as FileSystemEntry[]).map(filesFromEntry))
    .then(files => files.flat().sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true })));
};
