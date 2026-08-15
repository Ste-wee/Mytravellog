import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  addTrip,
  loadTrips,
  saveTrips,
  setStorageErrorHandler,
  loadTombstones,
  mergeTombstones,
  TOMBSTONE_TTL_MS,
  updateTrip,
  deleteTrip,
  parseLocalDate,
  formatTripDate,
  isValidDateISO,
  adoptHomeForTripsWithout,
  countTripsWithoutHome,
  todayLocalISO,
  type Trip,
} from "./storage";

// Minimal valid trip (all nullable fields set to null)
function makeTrip(overrides: Partial<Omit<Trip, "id" | "created_at">> = {}): Omit<Trip, "id" | "created_at"> {
  return {
    title: "Test",
    country: "Italia",
    city: "Roma",
    country_code: "IT",
    trip_date: "2024-06-01",
    date_end: null,
    rating: null,
    notes: null,
    transport_mode: null,
    waypoints: [],
    latitude: 41.9,
    longitude: 12.5,
    home_latitude: null,
    home_longitude: null,
    home_label: null,
    route_geometry: null,
    temperature_c: null,
    altitude_m: null,
    distance_from_home_km: null,
    max_distance_from_home_km: null,
    max_distance_city: null,
    max_altitude_m: null,
    max_altitude_city: null,
    hottest_temp_c: null,
    hottest_city: null,
    coldest_temp_c: null,
    coldest_city: null,
    region: null,
    region_details: null,
    ...overrides,
  };
}

describe("loadTrips", () => {
  beforeEach(() => localStorage.clear());

  it("ritorna [] su storage vuoto", () => {
    expect(loadTrips()).toEqual([]);
  });

  it("ritorna [] con JSON malformato senza throw", () => {
    localStorage.setItem("atlas.trips.v1", "{not valid json");
    expect(loadTrips()).toEqual([]);
  });

  it("non collassa a [] se un record ha trip_date mancante (no wipe)", () => {
    // Regressione: prima b.trip_date.localeCompare lanciava sul record rotto,
    // il catch restituiva [] nascondendo TUTTI i viaggi (e la prossima addTrip
    // avrebbe salvato sopra un array vuoto).
    const good = { id: "g", trip_date: "2024-06-01", title: "Ok" };
    const bad = { id: "b", title: "Senza data" }; // trip_date undefined
    localStorage.setItem("atlas.trips.v1", JSON.stringify([good, bad]));
    const trips = loadTrips();
    expect(trips).toHaveLength(2);
    expect(trips.map(t => t.id).sort()).toEqual(["b", "g"]);
  });

  it("ordina i viaggi dal più recente al meno recente", () => {
    addTrip(makeTrip({ trip_date: "2023-01-01" }));
    addTrip(makeTrip({ trip_date: "2024-06-15" }));
    addTrip(makeTrip({ trip_date: "2022-12-31" }));
    const trips = loadTrips();
    expect(trips[0].trip_date).toBe("2024-06-15");
    expect(trips[1].trip_date).toBe("2023-01-01");
    expect(trips[2].trip_date).toBe("2022-12-31");
  });
});

describe("updated_at e tombstone (backup Drive)", () => {
  beforeEach(() => localStorage.clear());

  it("addTrip timbra updated_at e updateTrip lo rinfresca", async () => {
    const t1 = addTrip(makeTrip());
    expect(t1.updated_at).toBeTruthy();
    await new Promise(r => setTimeout(r, 5));
    const t2 = updateTrip(t1.id, { title: "Cambiato" })!;
    expect(Date.parse(t2.updated_at!)).toBeGreaterThan(Date.parse(t1.updated_at!));
  });

  it("updated_at non è impostabile dal chiamante (vince il momento reale)", () => {
    const t1 = addTrip(makeTrip());
    const t2 = updateTrip(t1.id, { updated_at: "1999-01-01T00:00:00Z" } as any)!;
    expect(Date.parse(t2.updated_at!)).toBeGreaterThan(Date.parse("2000-01-01T00:00:00Z"));
  });

  it("deleteTrip registra un tombstone (così la cancellazione si propaga)", () => {
    const t1 = addTrip(makeTrip());
    deleteTrip(t1.id);
    expect(loadTrips()).toHaveLength(0);
    expect(loadTombstones("trips").map(d => d.id)).toContain(t1.id);
    expect(loadTombstones("plans")).toHaveLength(0); // bucket separati
  });

  it("mergeTombstones: unione per id con la cancellazione più recente", () => {
    // NB timestamp realistici: `at` è un epoch in ms e le voci oltre la
    // scadenza vengono potate (con valori tipo 100 sarebbero del 1970).
    const now = Date.now();
    const out = mergeTombstones(
      [{ id: "a", at: now - 5000 }, { id: "b", at: now - 9000 }],
      [{ id: "a", at: now - 10 }],
    );
    expect(out.find(d => d.id === "a")?.at).toBe(now - 10);
    expect(out.map(d => d.id).sort()).toEqual(["a", "b"]);
  });

  it("mergeTombstones dimentica i tombstone oltre la scadenza", () => {
    const vecchio = { id: "vecchio", at: Date.now() - TOMBSTONE_TTL_MS - 1000 };
    const fresco = { id: "fresco", at: Date.now() };
    expect(mergeTombstones([vecchio, fresco], []).map(d => d.id)).toEqual(["fresco"]);
  });
});

describe("quota di localStorage esaurita", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { setStorageErrorHandler(null); vi.restoreAllMocks(); });

  it("segnala l'errore invece di lasciar risalire l'eccezione", () => {
    // NB: setup.ts installa localStorage da un SECONDO realm jsdom, quindi lo
    // `Storage.prototype` globale non è il suo → si prende dall'istanza vera.
    const proto = Object.getPrototypeOf(localStorage);
    vi.spyOn(proto, "setItem").mockImplementation(() => {
      throw new DOMException("pieno", "QuotaExceededError");
    });
    const errors: unknown[] = [];
    setStorageErrorHandler(e => errors.push(e));

    // Prima: QuotaExceededError risaliva fino ad addTrip e il salvataggio
    // falliva senza che l'utente vedesse nulla.
    expect(() => addTrip(makeTrip())).not.toThrow();
    expect(errors).toHaveLength(1);
    expect(saveTrips([])).toBe(false); // dice di NON aver scritto
    expect(errors).toHaveLength(2);
  });

  it("saveTrips conferma la scrittura quando c'è spazio", () => {
    expect(saveTrips([])).toBe(true);
  });
});

describe("addTrip", () => {
  beforeEach(() => localStorage.clear());

  it("assegna un id univoco ad ogni viaggio", () => {
    const t1 = addTrip(makeTrip());
    const t2 = addTrip(makeTrip());
    expect(t1.id).toBeTruthy();
    expect(t2.id).toBeTruthy();
    expect(t1.id).not.toBe(t2.id);
  });

  it("assegna created_at come stringa ISO parsabile", () => {
    const t = addTrip(makeTrip());
    expect(t.created_at).toBeTruthy();
    expect(isNaN(new Date(t.created_at).getTime())).toBe(false);
  });

  it("preserva tutti i campi nullable a null", () => {
    const t = addTrip(makeTrip());
    expect(t.date_end).toBeNull();
    expect(t.rating).toBeNull();
    expect(t.notes).toBeNull();
    expect(t.transport_mode).toBeNull();
    expect(t.temperature_c).toBeNull();
    expect(t.altitude_m).toBeNull();
    expect(t.distance_from_home_km).toBeNull();
    expect(t.region).toBeNull();
  });

  it("gestisce waypoints vuoti senza crash", () => {
    const t = addTrip(makeTrip({ waypoints: [] }));
    expect(t.waypoints).toEqual([]);
  });

  it("usa l'id passato esplicitamente invece di generarne uno nuovo", () => {
    const t = addTrip(makeTrip({ city: "Torino" }), "id-bozza-123");
    expect(t.id).toBe("id-bozza-123");
    expect(loadTrips()[0].id).toBe("id-bozza-123");
  });

  it("persiste il viaggio in loadTrips", () => {
    addTrip(makeTrip({ city: "Milano" }));
    const trips = loadTrips();
    expect(trips).toHaveLength(1);
    expect(trips[0].city).toBe("Milano");
  });
});

describe("updateTrip", () => {
  beforeEach(() => localStorage.clear());

  it("aggiorna solo i campi passati, preserva gli altri", () => {
    const t = addTrip(makeTrip({ city: "Roma", rating: 3, notes: "Bella città" }));
    const updated = updateTrip(t.id, { rating: 5 });
    expect(updated).not.toBeNull();
    expect(updated!.rating).toBe(5);
    expect(updated!.city).toBe("Roma");
    expect(updated!.notes).toBe("Bella città");
  });

  it("ritorna null su id inesistente", () => {
    const result = updateTrip("id-che-non-esiste", { rating: 5 });
    expect(result).toBeNull();
  });

  it("non corrompe gli altri viaggi su id inesistente", () => {
    addTrip(makeTrip({ city: "Napoli" }));
    updateTrip("fake-id", { rating: 1 });
    expect(loadTrips()).toHaveLength(1);
    expect(loadTrips()[0].city).toBe("Napoli");
  });

  it("round-trip: addTrip → updateTrip → loadTrips è coerente", () => {
    const t = addTrip(makeTrip({ city: "Venezia", rating: null }));
    updateTrip(t.id, { rating: 4, notes: "Fantastica" });
    const stored = loadTrips().find(x => x.id === t.id)!;
    expect(stored.rating).toBe(4);
    expect(stored.notes).toBe("Fantastica");
    expect(stored.city).toBe("Venezia");
  });
});

describe("deleteTrip", () => {
  beforeEach(() => localStorage.clear());

  it("rimuove solo il viaggio con l'id corretto", () => {
    const t1 = addTrip(makeTrip({ city: "Roma" }));
    const t2 = addTrip(makeTrip({ city: "Milano" }));
    deleteTrip(t1.id);
    const remaining = loadTrips();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(t2.id);
  });

  it("non lancia su id inesistente e non corrompe lo storage", () => {
    addTrip(makeTrip({ city: "Torino" }));
    expect(() => deleteTrip("id-falso")).not.toThrow();
    expect(loadTrips()).toHaveLength(1);
  });
});

describe("todayLocalISO", () => {
  it("usa il calendario locale, non UTC: coerente con getFullYear/getMonth/getDate", () => {
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(todayLocalISO()).toBe(expected);
  });

  it("il formato è sempre YYYY-MM-DD (zero-padded)", () => {
    expect(todayLocalISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("parseLocalDate", () => {
  it("parsa YYYY-MM-DD a mezzanotte locale senza off-by-one UTC", () => {
    const d = parseLocalDate("2024-01-15");
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(0); // gennaio = 0
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
  });

  it("parsa correttamente il 29 febbraio di un anno bisestile", () => {
    const d = parseLocalDate("2024-02-29");
    expect(d.getDate()).toBe(29);
    expect(d.getMonth()).toBe(1);
  });
});

describe("formatTripDate", () => {
  it("produce una stringa non vuota per una data valida", () => {
    const s = formatTripDate("2024-06-15");
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(0);
  });

  it("include l'anno nella stringa formattata", () => {
    expect(formatTripDate("2024-06-15")).toContain("2024");
  });

  it("data malformata → '—', mai 'Invalid Date'", () => {
    expect(formatTripDate("non-una-data")).toBe("—");
    expect(formatTripDate("20261-06-01")).toBe("—"); // refuso anno a 5 cifre
    expect(formatTripDate("")).toBe("—");
  });
});

describe("adoptHomeForTripsWithout — la partenza per i viaggi orfani", () => {
  beforeEach(() => localStorage.clear());
  const MILANO = { lat: 45.46, lon: 9.19, label: "Milano, Italia" };

  it("dà la partenza SOLO ai viaggi che non ce l'hanno", () => {
    const orfano = addTrip(makeTrip({ home_latitude: null, home_longitude: null, home_label: null }));
    const suo = addTrip(makeTrip({ home_latitude: 41.9, home_longitude: 12.5, home_label: "Roma" }));

    expect(adoptHomeForTripsWithout(MILANO)).toBe(1);

    const dopo = loadTrips();
    const a = dopo.find(t => t.id === orfano.id)!;
    const b = dopo.find(t => t.id === suo.id)!;
    expect([a.home_latitude, a.home_longitude, a.home_label]).toEqual([45.46, 9.19, "Milano, Italia"]);
    // Un viaggio è partito da dove è partito: un trasloco non riscrive il passato.
    expect([b.home_latitude, b.home_longitude, b.home_label]).toEqual([41.9, 12.5, "Roma"]);
  });

  it("senza orfani non scrive nulla e risponde zero", () => {
    const suo = addTrip(makeTrip({ home_latitude: 41.9, home_longitude: 12.5, home_label: "Roma" }));
    const prima = loadTrips().find(t => t.id === suo.id)!.updated_at;
    expect(adoptHomeForTripsWithout(MILANO)).toBe(0);
    expect(loadTrips().find(t => t.id === suo.id)!.updated_at).toBe(prima);
  });

  it("timbra updated_at sui viaggi sistemati, così il backup se ne accorge", () => {
    // Orologio pilotato: creazione e adozione cadrebbero nello stesso
    // millisecondo e i due timbri risulterebbero identici.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    const orfano = addTrip(makeTrip({ home_latitude: null, home_longitude: null, home_label: null }));
    const prima = loadTrips().find(t => t.id === orfano.id)!.updated_at;

    vi.setSystemTime(new Date("2026-01-02T10:00:00Z"));
    adoptHomeForTripsWithout(MILANO);
    expect(loadTrips().find(t => t.id === orfano.id)!.updated_at).not.toBe(prima);
    vi.useRealTimers();
  });

  it("countTripsWithoutHome conta gli orfani", () => {
    addTrip(makeTrip({ home_latitude: null, home_longitude: null, home_label: null }));
    addTrip(makeTrip({ home_latitude: null, home_longitude: null, home_label: null }));
    addTrip(makeTrip({ home_latitude: 41.9, home_longitude: 12.5, home_label: "Roma" }));
    expect(countTripsWithoutHome()).toBe(2);
    adoptHomeForTripsWithout(MILANO);
    expect(countTripsWithoutHome()).toBe(0);
  });
});

describe("isValidDateISO", () => {
  it("accetta le date reali nel range 1900-2100", () => {
    expect(isValidDateISO("2026-08-08")).toBe(true);
    expect(isValidDateISO("1900-01-01")).toBe(true);
    expect(isValidDateISO("2100-12-31")).toBe(true);
  });

  it("rifiuta formato sbagliato, non-date e null/undefined", () => {
    expect(isValidDateISO("non-una-data")).toBe(false);
    expect(isValidDateISO("2026-13-45")).toBe(false); // mese/giorno inesistenti
    expect(isValidDateISO("20261-06-01")).toBe(false); // anno a 5 cifre
    expect(isValidDateISO(null)).toBe(false);
    expect(isValidDateISO(undefined)).toBe(false);
    expect(isValidDateISO("")).toBe(false);
  });

  it("rifiuta gli anni fuori dal range 1900-2100 anche se parsabili", () => {
    expect(isValidDateISO("1899-12-31")).toBe(false);
    expect(isValidDateISO("9999-01-01")).toBe(false); // valida per Date, assurda per un viaggio
  });
});
