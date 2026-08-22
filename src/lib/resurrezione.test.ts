import { describe, it, expect, beforeEach } from "vitest";
import { mergeTrips } from "./googleDrive";
import { Trip, Tombstone, loadTrips, saveTombstones, saveTrips, deleteTrip, pulisciSepolti } from "./storage";

/** Viaggio minimo per i test di questo file. */
const viaggioTest = (id: string): Trip => ({
  id, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
  title: id, city: id, country: "Italia", country_code: "IT",
  trip_date: "2026-01-01", date_end: null, latitude: 41.9, longitude: 12.5,
  home_latitude: 45.46, home_longitude: 9.19, home_label: "Milano",
  notes: null, transport_mode: "car", waypoints: [],
} as Trip);

/**
 * Caso VERO dall'archivio di Stefano (2026-08-20): un viaggio a Zurigo
 * cancellato è riapparso, e si è ritrovato SIA nella lista dei viaggi SIA
 * fra i tombstone. Qui si riproduce la sequenza esatta per capire dove la
 * cancellazione viene persa.
 */
const ID = "d45017bf-f2b2-4a17-bae5-468b4367ed6b";
const CREATO = "2026-08-20T10:49:21.411Z";
const CANCELLATO = Date.parse("2026-08-20T10:50:14.318Z");

const zurigo = (updated?: string): Trip => ({
  id: ID, title: "Zurigo", city: "Zurigo", country: "Svizzera", country_code: "CH",
  trip_date: "2025-11-01", date_end: "2025-11-02", latitude: 47.3798, longitude: 8.5414,
  created_at: CREATO, updated_at: updated, transport_mode: "car", rating: 4, notes: null,
  home_latitude: 45.46, home_longitude: 9.19, home_label: "Milano, Italia",
  region: null, region_details: null, route_geometry: null, waypoints: [], temperature_c: 7.3,
  distance_from_home_km: 220, max_distance_from_home_km: 220, max_distance_city: "Zurigo",
} as Trip);

const lapide: Tombstone[] = [{ id: ID, at: CANCELLATO }];

describe("il viaggio cancellato non deve tornare", () => {
  it("copia remota MAI toccata dopo la cancellazione: resta morta", () => {
    // Il backup su Drive ha la versione di quando fu creato.
    const out = mergeTrips([], Date.now(), [zurigo(CREATO)], Date.now(), lapide);
    expect(out).toHaveLength(0);
  });

  it("copia remota senza updated_at (legacy): resta morta grazie a created_at", () => {
    const out = mergeTrips([], Date.now(), [zurigo(undefined)], Date.now(), lapide);
    expect(out).toHaveLength(0);
  });

  it("MA una modifica successiva alla cancellazione la RESUSCITA (last-write-wins)", () => {
    // È il caso che ha colpito Stefano: qualcosa ha riscritto il viaggio DOPO
    // la cancellazione, e da quel momento vince sulla lapide.
    const dopo = "2026-08-20T12:01:28.945Z";
    const out = mergeTrips([zurigo(dopo)], Date.now(), [], 0, lapide);
    expect(out).toHaveLength(1);          // ← il morto cammina
  });

  it("un viaggio cancellato NON deve trovarsi nella lista locale: se c'è, il merge lo tiene", () => {
    // Il merge si fida della lista locale. Se un ricalcolo in sottofondo
    // riscrive un viaggio già cancellato, la lapide viene scavalcata.
    const out = mergeTrips([zurigo("2026-08-20T12:01:28.945Z")], Date.now(),
      [zurigo(CREATO)], Date.now(), lapide);
    expect(out.map(t => t.id)).toEqual([ID]);
  });
});

describe("la lapide protegge anche la lista LOCALE (il buco vero)", () => {
  beforeEach(() => localStorage.clear());

  it("un viaggio con la lapide non compare, anche se è rimasto nell'array", () => {
    // Lo stato in cui si è trovato l'archivio di Stefano: il viaggio nella
    // lista E la sua lapide fra i cancellati.
    localStorage.setItem("atlas.trips.v1", JSON.stringify([zurigo("2026-08-20T12:01:28.945Z")]));
    saveTombstones("trips", lapide);
    expect(loadTrips()).toHaveLength(0);
  });

  it("così un ricalcolo in sottofondo non può resuscitarlo: non lo vede proprio", () => {
    localStorage.setItem("atlas.trips.v1", JSON.stringify([zurigo(CREATO)]));
    saveTombstones("trips", lapide);
    // updateTrip lavora sulla lista salvata: il viaggio morto non è fra quelli
    // che un ricalcolo può leggere, quindi nessuno gli timbrerà updated_at.
    expect(loadTrips().map(t => t.id)).not.toContain(ID);
  });

  it("i viaggi vivi restano tutti al loro posto", () => {
    const vivo = { ...zurigo(CREATO), id: "vivo-1", city: "Berlino" };
    localStorage.setItem("atlas.trips.v1", JSON.stringify([zurigo(CREATO), vivo]));
    saveTombstones("trips", lapide);
    expect(loadTrips().map(t => t.id)).toEqual(["vivo-1"]);
  });

  it("senza lapidi non cambia nulla", () => {
    localStorage.setItem("atlas.trips.v1", JSON.stringify([zurigo(CREATO)]));
    expect(loadTrips()).toHaveLength(1);
  });
});

/**
 * "Se un viaggio viene cancellato e non si fa annulla, non dovrebbe rimanere
 * in memoria per 180 giorni?" (Stefano, 2026-08-21). Giusto: a restare sei
 * mesi è la LAPIDE — un id e una data, 38 byte — che serve a propagare la
 * cancellazione agli altri dispositivi. Il viaggio invece se ne va subito.
 */
describe("il sepolto non resta nell'archivio", () => {
  beforeEach(() => localStorage.clear());

  it("scrivendo l'archivio, i record con la lapide vengono buttati via", () => {
    saveTrips([viaggioTest("vivo"), viaggioTest("sepolto")]);
    deleteTrip("sepolto");
    const grezzo = JSON.parse(localStorage.getItem("atlas.trips.v1") ?? "[]");
    expect(grezzo.map((t: Trip) => t.id)).toEqual(["vivo"]);
  });

  it("nemmeno se qualcuno prova a riscriverlo esplicitamente", () => {
    saveTrips([viaggioTest("vivo")]);
    deleteTrip("sepolto");                                  // lapide senza record
    saveTrips([viaggioTest("vivo"), viaggioTest("sepolto")]);   // tentativo di reinserirlo
    const grezzo = JSON.parse(localStorage.getItem("atlas.trips.v1") ?? "[]");
    expect(grezzo.map((t: Trip) => t.id)).toEqual(["vivo"]);
  });

  it("pulisciSepolti libera i fantasmi vecchi rimasti in pancia", () => {
    // com'era l'archivio di chi aggiorna l'app con un fantasma già dentro:
    // scritto a mano, come se l'avesse messo una versione precedente
    localStorage.setItem("atlas.trips.v1", JSON.stringify([viaggioTest("vivo"), viaggioTest("fantasma")]));
    localStorage.setItem("atlas.deleted.trips.v1", JSON.stringify([{ id: "fantasma", at: Date.now() }]));
    expect(pulisciSepolti()).toBe(1);
    expect(JSON.parse(localStorage.getItem("atlas.trips.v1") ?? "[]").map((t: Trip) => t.id)).toEqual(["vivo"]);
  });

  it("se non c'è niente da pulire non scrive nulla", () => {
    localStorage.setItem("atlas.trips.v1", JSON.stringify([viaggioTest("vivo")]));
    const prima = localStorage.getItem("atlas.trips.v1");
    expect(pulisciSepolti()).toBe(0);
    expect(localStorage.getItem("atlas.trips.v1")).toBe(prima);   // byte identici
  });

  it("la lapide invece RESTA: è lei a propagare la cancellazione", () => {
    saveTrips([viaggioTest("sepolto")]);
    deleteTrip("sepolto");
    const lapidi = JSON.parse(localStorage.getItem("atlas.deleted.trips.v1") ?? "[]");
    expect(lapidi).toHaveLength(1);
    expect(lapidi[0].id).toBe("sepolto");
    expect(JSON.stringify(lapidi).length).toBeLessThan(80);   // pochi byte, non un viaggio
  });
});
