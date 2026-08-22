import { openDB, DBSchema, IDBPDatabase } from "idb";
import type { Trip } from "./storage";

export interface Photo {
  id: string;
  /**
   * Non è sempre l'id del viaggio nudo: è la chiave di ciò a cui l'immagine
   * appartiene. Oggi l'app scrive solo rilievi 3D (`<id>:relief`), ma in
   * archivio possono esserci ancora foto di destinazione (`<id>`), di casa
   * (`<id>:home`) e delle tappe (`<id>:waypoint:<idTappa>`), salvate quando
   * la funzione esisteva. `deletePhotosForTrip` le porta via tutte.
   */
  tripId: string;
  data: ArrayBuffer;
  type: string;
  createdAt: string;
}

/**
 * Chiave dell'immagine "rilievo 3D" del viaggio: lo snapshot della panoramica
 * finale del flyover (percorso + puntine). È l'unica immagine che l'app scriva
 * ancora: viene rigenerata a ogni volo e cancellata col viaggio (vedi
 * deletePhotosForTrip).
 */
export function reliefPhotoKey(tripId: string): string {
  return `${tripId}:relief`;
}

interface PhotoDB extends DBSchema {
  photos: {
    key: string;
    value: Photo;
    indexes: { "by-trip": string };
  };
}

const DB_NAME = "mytravellog-photos";
const DB_VERSION = 1;
const STORE_NAME = "photos";

// localStorage ha un limite di pochi MB per l'intera app: sufficiente per i
// dati dei viaggi (testo), non per le foto (binarie, migliaia di volte più
// pesanti). IndexedDB non ha questo limite pratico e salva i Blob nativamente,
// senza doverli prima convertire in base64.
let dbPromise: Promise<IDBPDatabase<PhotoDB>> | null = null;

function getDB(): Promise<IDBPDatabase<PhotoDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PhotoDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("by-trip", "tripId");
      },
    });
    // Un FALLIMENTO non si cristallizza (la lezione di loadGis/worldAtlas):
    // se l'apertura fallisce una volta (storage sotto pressione, modalità
    // privata transitoria), cachearla condannerebbe foto e rilievi 3D per
    // tutta la sessione. Si dimentica e al prossimo uso si riprova.
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * `id` è opzionale: normalmente si genera un UUID nuovo, ma il ripristino da
 * backup passa l'id ORIGINALE della foto (il nome del file su Storage) — così
 * un secondo restore sovrascrive lo stesso record con db.put invece di
 * duplicare le foto in ogni galleria ad ogni ripristino.
 */
export async function savePhoto(tripId: string, blob: Blob, id: string = crypto.randomUUID()): Promise<string> {
  const data = await blobToArrayBuffer(blob);
  const db = await getDB();
  await db.put(STORE_NAME, { id, tripId, data, type: blob.type, createdAt: new Date().toISOString() });
  return id;
}

export async function getPhotosForTrip(tripId: string): Promise<Photo[]> {
  const db = await getDB();
  return db.getAllFromIndex(STORE_NAME, "by-trip", tripId);
}

/**
 * Salva (o sovrascrive) lo snapshot del rilievo 3D di un viaggio. Usa un id
 * stabile derivato dal tripId, così ri-generarlo a fine flyover rimpiazza la
 * versione precedente invece di accumulare immagini.
 */
export async function saveReliefImage(tripId: string, blob: Blob): Promise<void> {
  await savePhoto(reliefPhotoKey(tripId), blob, `relief:${tripId}`);
}

/** Blob del rilievo 3D salvato per un viaggio, o null se non è mai stato generato. */
export async function getReliefImage(tripId: string): Promise<Blob | null> {
  const photos = await getPhotosForTrip(reliefPhotoKey(tripId));
  return photos.length > 0 ? photoToBlob(photos[0]) : null;
}

/** Ricostruisce un Blob visualizzabile/scaricabile da una Photo salvata. */
export function photoToBlob(photo: Photo): Blob {
  return new Blob([photo.data], { type: photo.type });
}

/**
 * Cancella TUTTO quello che questo archivio tiene per un viaggio: il rilievo
 * 3D di oggi e le foto di ieri.
 *
 * Va a prefisso invece che per elenco di chiavi note. Prima si costruiva la
 * lista (destinazione, casa, una per tappa) dal viaggio che stava per essere
 * cancellato: bastava che una tappa fosse stata tolta prima, e la sua foto
 * restava in IndexedDB per sempre, invisibile. Le foto delle tappe non si
 * possono più aggiungere dall'app, ma chi le ha caricate quando si poteva le
 * ha ancora in pancia — e pesano molto più dei viaggi.
 *
 * Gli id dei viaggi sono UUID: nessuno è prefisso di un altro, quindi
 * "questo id, o questo id seguito da due punti" non può pescare nel viaggio
 * di qualcun altro.
 */
export async function deletePhotosForTrip(trip: Pick<Trip, "id">): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  let cursor = await tx.store.index("by-trip").openCursor();
  while (cursor) {
    const chiave = cursor.value.tripId;
    if (chiave === trip.id || chiave.startsWith(`${trip.id}:`)) await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

/** Test-only: forza una nuova connessione al DB (utile tra i test con fake-indexeddb). */
export function __resetPhotoDB() {
  dbPromise = null;
}
