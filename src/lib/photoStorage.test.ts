import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import {
  savePhoto, getPhotosForTrip, deletePhotosForTrip, photoToBlob, __resetPhotoDB,
  destinationPhotoKey, homePhotoKey, waypointPhotoKey, stopPhotoKeys,
  reliefPhotoKey, saveReliefImage, getReliefImage,
} from "./photoStorage";

function makeBlob(content = "fake-image-bytes"): Blob {
  return new Blob([content], { type: "image/jpeg" });
}

describe("photoStorage", () => {
  beforeEach(async () => {
    // fake-indexeddb non condivide stato tra file di test, ma tra i singoli
    // test di questo stesso file sì: puliamo il DB per isolarli.
    // eslint-disable-next-line no-global-assign -- riassegnazione VOLUTA: qui il globale è il finto IndexedDB del test
    indexedDB = new IDBFactory();
    __resetPhotoDB();
  });

  it("salva una foto e la ritrova tra quelle del viaggio", async () => {
    const id = await savePhoto("trip-1", makeBlob());
    const photos = await getPhotosForTrip("trip-1");
    expect(photos).toHaveLength(1);
    expect(photos[0].id).toBe(id);
    expect(photos[0].tripId).toBe("trip-1");
  });

  it("il blob ricostruito ha lo stesso contenuto e tipo dell'originale", async () => {
    const blob = makeBlob("contenuto specifico");
    await savePhoto("trip-1", blob);
    const [photo] = await getPhotosForTrip("trip-1");
    const rebuilt = photoToBlob(photo);
    expect(rebuilt.size).toBe(blob.size);
    expect(rebuilt.type).toBe("image/jpeg");
    expect(new TextDecoder().decode(photo.data)).toBe("contenuto specifico");
  });

  it("non mescola le foto di viaggi diversi", async () => {
    await savePhoto("trip-1", makeBlob());
    await savePhoto("trip-2", makeBlob());
    await savePhoto("trip-2", makeBlob());
    expect(await getPhotosForTrip("trip-1")).toHaveLength(1);
    expect(await getPhotosForTrip("trip-2")).toHaveLength(2);
  });

  it("nessuna foto per un viaggio senza foto salvate", async () => {
    expect(await getPhotosForTrip("trip-senza-foto")).toEqual([]);
  });


  it("deletePhotosForTrip rimuove tutte le foto di un viaggio senza toccare le altre", async () => {
    await savePhoto("trip-1", makeBlob());
    await savePhoto("trip-1", makeBlob());
    await savePhoto("trip-2", makeBlob());
    await deletePhotosForTrip({ id: "trip-1", waypoints: [] });
    expect(await getPhotosForTrip("trip-1")).toEqual([]);
    expect(await getPhotosForTrip("trip-2")).toHaveLength(1);
  });

  // Il rilievo 3D è l'immagine che sopravvive alla rimozione delle foto utente:
  // è quella che restava orfana in IndexedDB quando un viaggio veniva
  // cancellato su un altro dispositivo e il merge di Drive lo toglieva qui.
  it("deletePhotosForTrip rimuove anche il rilievo 3D del biglietto", async () => {
    const trip = { id: "trip-1", waypoints: [] };
    await savePhoto(reliefPhotoKey(trip.id), makeBlob());
    await savePhoto("trip-2", makeBlob());

    await deletePhotosForTrip(trip);

    expect(await getPhotosForTrip(reliefPhotoKey(trip.id))).toEqual([]);
    expect(await getPhotosForTrip("trip-2")).toHaveLength(1);
  });

  it("deletePhotosForTrip rimuove anche le foto di casa e di ogni tappa con id", async () => {
    const trip = { id: "trip-1", waypoints: [{ id: "wp-1", city: "Torino", country: "Italia", transport_mode: "train" as const }] };
    await savePhoto(destinationPhotoKey(trip.id), makeBlob());
    await savePhoto(homePhotoKey(trip.id), makeBlob());
    await savePhoto(waypointPhotoKey(trip.id, "wp-1"), makeBlob());
    await savePhoto("trip-2", makeBlob()); // di un altro viaggio, non deve essere toccata

    await deletePhotosForTrip(trip);

    expect(await getPhotosForTrip(destinationPhotoKey(trip.id))).toEqual([]);
    expect(await getPhotosForTrip(homePhotoKey(trip.id))).toEqual([]);
    expect(await getPhotosForTrip(waypointPhotoKey(trip.id, "wp-1"))).toEqual([]);
    expect(await getPhotosForTrip("trip-2")).toHaveLength(1);
  });

  it("assegna id univoci a foto diverse", async () => {
    const id1 = await savePhoto("trip-1", makeBlob());
    const id2 = await savePhoto("trip-1", makeBlob());
    expect(id1).not.toBe(id2);
  });

  describe("rilievo 3D del viaggio", () => {
    it("reliefPhotoKey è distinta e non compare tra stopPhotoKeys", () => {
      expect(reliefPhotoKey("trip-1")).toBe("trip-1:relief");
      expect(stopPhotoKeys({ id: "trip-1", waypoints: [] })).not.toContain("trip-1:relief");
    });

    it("saveReliefImage salva e getReliefImage ritrova lo stesso blob", async () => {
      expect(await getReliefImage("trip-1")).toBeNull();
      await saveReliefImage("trip-1", makeBlob("relief-bytes"));
      const blob = await getReliefImage("trip-1");
      expect(blob).not.toBeNull();
      expect(blob!.type).toBe("image/jpeg");
    });

    it("saveReliefImage sovrascrive invece di accumulare (id stabile)", async () => {
      await saveReliefImage("trip-1", makeBlob("v1"));
      await saveReliefImage("trip-1", makeBlob("v2"));
      const all = await getPhotosForTrip(reliefPhotoKey("trip-1"));
      expect(all).toHaveLength(1);
    });

    it("deletePhotosForTrip cancella anche il rilievo del viaggio", async () => {
      await saveReliefImage("trip-1", makeBlob());
      await deletePhotosForTrip({ id: "trip-1", waypoints: [] });
      expect(await getReliefImage("trip-1")).toBeNull();
    });
  });

  describe("chiavi foto per tappa", () => {
    it("destinationPhotoKey è l'id del viaggio nudo (retrocompatibile)", () => {
      expect(destinationPhotoKey("trip-1")).toBe("trip-1");
    });

    it("homePhotoKey e waypointPhotoKey sono derivate dall'id del viaggio", () => {
      expect(homePhotoKey("trip-1")).toBe("trip-1:home");
      expect(waypointPhotoKey("trip-1", "wp-1")).toBe("trip-1:waypoint:wp-1");
    });

    it("stopPhotoKeys include destinazione, casa e ogni tappa con id", () => {
      const trip = {
        id: "trip-1",
        waypoints: [
          { id: "wp-1", city: "Torino", country: "Italia", transport_mode: "train" as const },
          { city: "Senza id", country: "Italia", transport_mode: "train" as const }, // legacy, nessun id
        ],
      };
      expect(stopPhotoKeys(trip)).toEqual(["trip-1", "trip-1:home", "trip-1:waypoint:wp-1"]);
    });

    it("stopPhotoKeys senza tappe include solo destinazione e casa", () => {
      expect(stopPhotoKeys({ id: "trip-1", waypoints: [] })).toEqual(["trip-1", "trip-1:home"]);
    });
  });
});
