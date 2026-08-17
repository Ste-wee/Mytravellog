import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";

// La lezione di loadGis/worldAtlas: un FALLIMENTO di apertura non deve
// cristallizzarsi nella cache della connessione, o foto e rilievi 3D restano
// rotti per tutta la sessione anche quando IndexedDB torna disponibile.
//
// File separato con vi.mock("idb"): l'unico modo AFFIDABILE di far rigettare
// openDB — una finta IDBOpenDBRequest non è instanceof IDBRequest e idb non
// la promisifica (un primo tentativo di test passava senza esercitare nulla).
let openDeveFallire = false;
vi.mock("idb", async (importOriginal) => {
  const vero = await importOriginal<typeof import("idb")>();
  return {
    ...vero,
    openDB: (...args: Parameters<typeof vero.openDB>) =>
      openDeveFallire ? Promise.reject(new Error("apertura fallita")) : vero.openDB(...args),
  };
});

import { getPhotosForTrip, __resetPhotoDB } from "./photoStorage";

describe("photoStorage — il fallimento di apertura non si cristallizza", () => {
  beforeEach(() => __resetPhotoDB());

  it("dopo un'apertura fallita, al prossimo uso si riprova e funziona", async () => {
    openDeveFallire = true;
    await expect(getPhotosForTrip("t1")).rejects.toThrow("apertura fallita");
    openDeveFallire = false;
    // Senza il fix questa seconda chiamata rigettava con lo STESSO errore cacheato.
    await expect(getPhotosForTrip("t1")).resolves.toEqual([]);
  });
});
