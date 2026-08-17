import { describe, it, expect, vi, afterEach } from "vitest";
import { searchPlaces, fetchElevation, fetchTemperature, fetchRegion } from "./geo";
import { reverseGeocode } from "./gpx";
import { loadTombstones, loadPlans } from "./storage";
import { unwrapSegments, unwrapNear } from "./lonWrap";
import { polygonsOf } from "./worldAtlas";
import { pointAlongPath } from "./flyover";
import { computeYearRecap } from "./recap";
import type { Trip } from "./storage";

// I rami che il coverage segnalava SCOPERTI: quasi tutti blocchi d'errore
// (server giù, rete assente, JSON corrotto) e casi limite. La regola del
// prompt: i catch devono degradare con garbo, mai far crollare l'app.

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

const rete = (impl: (url: string) => Partial<Response> | Promise<never>) => {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => impl(String(input)) as Response) as unknown as typeof fetch;
};

describe("geo — blocchi d'errore delle API", () => {
  it("server offline (fetch che rigetta): searchPlaces → [], fetchElevation/Temperature → null", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    expect(await searchPlaces("rom")).toEqual([]);
    expect(await fetchElevation(45, 9)).toBeNull();
    expect(await fetchTemperature(45, 9, "2020-06-01")).toBeNull();
  });

  it("risposta non-ok (500): stessi ripieghi silenziosi", async () => {
    rete(() => ({ ok: false, status: 500 }));
    expect(await searchPlaces("rom")).toEqual([]);
    expect(await fetchElevation(45, 9)).toBeNull();
    expect(await fetchTemperature(45, 9, "2020-06-01")).toBeNull();
  });

  it("query vuota o di soli spazi: nessuna richiesta, []", async () => {
    const spia = vi.fn();
    global.fetch = spia as unknown as typeof fetch;
    expect(await searchPlaces("   ")).toEqual([]);
    expect(spia).not.toHaveBeenCalled();
  });

  it("temperatura di OGGI: usa il ramo previsioni (current), non l'archivio", async () => {
    const oggi = new Date();
    const iso = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}-${String(oggi.getDate()).padStart(2, "0")}`;
    const urls: string[] = [];
    rete(u => { urls.push(u); return { ok: true, status: 200, json: async () => ({ current: { temperature_2m: 21.5 } }) }; });
    expect(await fetchTemperature(45, 9, iso)).toBe(21.5);
    expect(urls[0]).toContain("current=temperature_2m");
    expect(urls[0]).not.toContain("archive");
  });

  it("temperatura nel FUTURO: null senza nemmeno chiamare la rete", async () => {
    const spia = vi.fn();
    global.fetch = spia as unknown as typeof fetch;
    expect(await fetchTemperature(45, 9, "2099-01-01")).toBeNull();
    expect(spia).not.toHaveBeenCalled();
  });

  it("fetchRegion con risposta non-ok → {null, null}, non un crash", async () => {
    rete(() => ({ ok: false, status: 503 }));
    expect(await fetchRegion(45, 9)).toEqual({ name: null, code: null });
  });

  it("fetchRegion offline → {null, null}", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    expect(await fetchRegion(45, 9)).toEqual({ name: null, code: null });
  });
});

describe("gpx.reverseGeocode — errori e fallback dei campi", () => {
  it("risposta ok: city dai campi alternativi (town) e codice maiuscolo", async () => {
    rete(() => ({ ok: true, status: 200, json: async () => ({ address: { town: "Riva", country: "Italia", country_code: "it" } }) }));
    expect(await reverseGeocode(45.88, 10.84)).toEqual({ city: "Riva", country: "Italia", country_code: "IT" });
  });

  it("risposta non-ok → lancia (il chiamante decide come degradare)", async () => {
    rete(() => ({ ok: false, status: 500 }));
    await expect(reverseGeocode(45, 9)).rejects.toThrow();
  });

  it("senza address utilizzabile → stringhe vuote, non undefined", async () => {
    rete(() => ({ ok: true, status: 200, json: async () => ({}) }));
    expect(await reverseGeocode(45, 9)).toEqual({ city: "", country: "", country_code: "" });
  });
});

describe("storage — JSON corrotto nei bucket secondari", () => {
  it("tombstones corrotte → [] (non un crash all'avvio del sync)", () => {
    localStorage.setItem("atlas.deleted.trips.v1", "{non json");
    expect(loadTombstones("trips")).toEqual([]);
  });

  it("piani corrotti → []", () => {
    localStorage.setItem("atlas.plans.v1", "{non json");
    expect(loadPlans()).toEqual([]);
  });
});

describe("lonWrap — casi limite", () => {
  it("un segmento VUOTO in mezzo non rompe la catena", () => {
    const out = unwrapSegments([[[170, 0], [175, 0]], [], [[-175, 0]]]);
    expect(out[1]).toEqual([]);
    expect(out[2][0][0]).toBe(185); // riagganciato all'ULTIMO punto pieno, non a zero
  });

  it("unwrapNear con Infinity non cicla e restituisce l'input", () => {
    expect(unwrapNear(Infinity, 0)).toBe(Infinity);
    expect(unwrapNear(10, NaN)).toBe(10);
  });
});

describe("worldAtlas.polygonsOf — geometrie strane", () => {
  it("null/undefined → []", () => {
    expect(polygonsOf(null as unknown as Parameters<typeof polygonsOf>[0])).toEqual([]);
    expect(polygonsOf(undefined as unknown as Parameters<typeof polygonsOf>[0])).toEqual([]);
  });

  it("tipo sconosciuto (Point) → [], mai un TypeError", () => {
    expect(polygonsOf({ type: "Point", coordinates: [1, 2] } as unknown as Parameters<typeof polygonsOf>[0])).toEqual([]);
  });
});

describe("flyover.pointAlongPath — estremi di t", () => {
  const path: [number, number][] = [[0, 0], [10, 0], [20, 0]];
  it("t oltre 1 → l'ultimo punto, non un punto inventato", () => {
    expect(pointAlongPath(path, 1)).toEqual([20, 0]);
    expect(pointAlongPath(path, 5)).toEqual([20, 0]);
  });
});

describe("recap — fallback sui dati incompleti", () => {
  const base: Partial<Trip> = {
    created_at: "2024-01-01", city: "X", country: "Italia", country_code: "IT",
    latitude: 45, longitude: 9, home_latitude: 45.4, home_longitude: 9.1, home_label: "Milano",
    waypoints: [], rating: null, notes: null, transport_mode: null, route_geometry: null,
    region: null, region_details: null,
  };
  const trip = (over: Partial<Trip>) => ({ ...base, id: Math.random().toString(36).slice(2), ...over }) as Trip;

  it("paese senza nome ma con codice: contato lo stesso (chiave dal codice)", () => {
    const r = computeYearRecap([trip({ trip_date: "2026-03-01", country: "", country_code: "FR" })], 2026);
    expect(r.countries).toBe(1);
  });

  it("trip_date malformata: il viaggio non entra in nessun anno (parseInt NaN)", () => {
    const r = computeYearRecap([trip({ trip_date: "boh" })], 2026);
    expect(r.trips).toBe(0);
  });

  it("mese fuori range non aggiunge mesi", () => {
    const r = computeYearRecap([trip({ trip_date: "2026-00-01" })], 2026);
    expect(r.monthsActive).toBe(0);
  });
});
