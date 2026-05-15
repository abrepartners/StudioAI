import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'vellum_images';
const DB_VERSION = 1;
const PHOTOS_STORE = 'photos';
const RESULTS_STORE = 'results';

interface StoredPhoto {
  key: string;
  projectId: string;
  photoId: number;
  blob: Blob;
  label: string;
  fileName: string;
}

interface StoredResult {
  key: string;
  projectId: string;
  photoId: number;
  blob: Blob;
}

function makeKey(projectId: string, photoId: number): string {
  return `${projectId}::${photoId}`;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
          const photos = db.createObjectStore(PHOTOS_STORE, { keyPath: 'key' });
          photos.createIndex('projectId', 'projectId');
        }
        if (!db.objectStoreNames.contains(RESULTS_STORE)) {
          const results = db.createObjectStore(RESULTS_STORE, { keyPath: 'key' });
          results.createIndex('projectId', 'projectId');
        }
      },
    });
  }
  return dbPromise;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

export async function savePhoto(
  projectId: string,
  photoId: number,
  dataUrl: string,
  label: string,
  fileName: string,
): Promise<void> {
  const db = await getDb();
  const blob = await dataUrlToBlob(dataUrl);
  const record: StoredPhoto = {
    key: makeKey(projectId, photoId),
    projectId,
    photoId,
    blob,
    label,
    fileName,
  };
  await db.put(PHOTOS_STORE, record);
}

export async function saveResult(
  projectId: string,
  photoId: number,
  dataUrl: string,
): Promise<void> {
  const db = await getDb();
  const blob = await dataUrlToBlob(dataUrl);
  const record: StoredResult = {
    key: makeKey(projectId, photoId),
    projectId,
    photoId,
    blob,
  };
  await db.put(RESULTS_STORE, record);
}

export interface LoadedPhoto {
  photoId: number;
  dataUrl: string;
  label: string;
  fileName: string;
}

// Migrate legacy room labels on load. 'Exterior' was dropped from the picker
// May 2026 in favor of specific options (Front Yard / Backyard / Patio / Pool).
// Old IndexedDB rows still have it — remap so the dropdown shows a valid value.
function migrateLabel(label: string): string {
  if (label === 'Exterior') return 'Front Yard';
  return label;
}

export async function loadPhotos(projectId: string): Promise<LoadedPhoto[]> {
  const db = await getDb();
  const all: StoredPhoto[] = await db.getAllFromIndex(PHOTOS_STORE, 'projectId', projectId);
  const results = await Promise.all(all.map(async (record) => ({
    photoId: record.photoId,
    dataUrl: await blobToDataUrl(record.blob),
    label: migrateLabel(record.label),
    fileName: record.fileName,
  })));
  return results.sort((a, b) => a.photoId - b.photoId);
}

export async function loadResults(projectId: string): Promise<Record<number, string>> {
  const db = await getDb();
  const all: StoredResult[] = await db.getAllFromIndex(RESULTS_STORE, 'projectId', projectId);
  const entries = await Promise.all(all.map(async (record) => [record.photoId, await blobToDataUrl(record.blob)] as const));
  const map: Record<number, string> = {};
  for (const [id, dataUrl] of entries) map[id] = dataUrl;
  return map;
}

export async function deleteProjectImages(projectId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([PHOTOS_STORE, RESULTS_STORE], 'readwrite');
  const photoStore = tx.objectStore(PHOTOS_STORE);
  const resultStore = tx.objectStore(RESULTS_STORE);
  const photoKeys = await photoStore.index('projectId').getAllKeys(projectId);
  const resultKeys = await resultStore.index('projectId').getAllKeys(projectId);
  for (const k of photoKeys) await photoStore.delete(k);
  for (const k of resultKeys) await resultStore.delete(k);
  await tx.done;
}
