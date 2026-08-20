import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchPlaces, fetchElevation, fetchTemperature, fetchRegion, fetchDrivingRoute, mergeRegions } from "./geo";
import { todayLocalISO } from "./storage";

const okJson = (data: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
const notOk = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);

describe("searchPlaces", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("ritorna [] con query vuota senza fetch", async () => {
    expect(await searchPlaces("   ")).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ritorna i risultati parsati", async () => {
    (fetch as any).mockReturnValue(okJson({ results: [{ id: 1, name: "Roma" }] }));
    const r = await searchPlaces("Roma");
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe("Roma");
  });

  it("ritorna [] su risposta non ok", async () => {
    (fetch as any).mockReturnValue(notOk());
    expect(await searchPlaces("x")).toEqual([]);
  });

  it("ritorna [] su errore di rete", async () => {
    (fetch as any).mockRejectedValue(new Error("net"));
    expect(await searchPlaces("x")).toEqual([]);
  });

  it("encoda la query nell'URL", async () => {
    (fetch as any).mockReturnValue(okJson({ results: [] }));
    await searchPlaces("New York");
    expect((fetch as any).mock.calls[0][0]).toContain("name=New%20York");
  });
});

describe("fetchElevation", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("estrae elevation[0]", async () => {
    (fetch as any).mockReturnValue(okJson({ elevation: [123] }));
    expect(await fetchElevation(0, 0)).toBe(123);
  });

  it("ritorna null su payload vuoto", async () => {
    (fetch as any).mockReturnValue(okJson({}));
    expect(await fetchElevation(0, 0)).toBeNull();
  });

  it("ritorna null su risposta non ok", async () => {
    (fetch as any).mockReturnValue(notOk());
    expect(await fetchElevation(0, 0)).toBeNull();
  });

  it("ritorna null su errore", async () => {
    (fetch as any).mockRejectedValue(new Error("net"));
    expect(await fetchElevation(0, 0)).toBeNull();
  });
});

describe("fetchTemperature", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("ritorna null per date future senza fetch", async () => {
    const future = "2999-01-01";
    expect(await fetchTemperature(0, 0, future)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("usa archive-api per date passate, con min e max (non più la media)", async () => {
    // Il criterio è cambiato il 2026-08-20: la media giornaliera annacquava
    // il dato memorabile (Lapponia a -31 mostrata come -12). Ora si prende
    // l'estremo del periodo — v. geo.temperatura.test.ts.
    (fetch as any).mockReturnValue(okJson({ daily: { temperature_2m_min: [12.1], temperature_2m_max: [24.9] } }));
    const r = await fetchTemperature(0, 0, "2000-01-01");
    expect(r).toBe(24.9);
    expect((fetch as any).mock.calls[0][0]).toContain("archive-api");
  });

  it("usa forecast per data odierna", async () => {
    (fetch as any).mockReturnValue(okJson({ current: { temperature_2m: 21 } }));
    const today = todayLocalISO();
    const r = await fetchTemperature(0, 0, today);
    expect(r).toBe(21);
    expect((fetch as any).mock.calls[0][0]).toContain("forecast");
  });

  it("ritorna null su errore", async () => {
    (fetch as any).mockRejectedValue(new Error("net"));
    expect(await fetchTemperature(0, 0, "2000-01-01")).toBeNull();
  });
});

describe("fetchRegion", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("preferisce state, poi region, poi county; include il codice ISO 3166-2", async () => {
    (fetch as any).mockReturnValue(okJson({ address: { state: "Lazio", region: "R", county: "C", "ISO3166-2-lvl4": "IT-62" } }));
    expect(await fetchRegion(0, 0)).toEqual({ name: "Lazio", code: "IT-62" });
  });

  it("fallback a region se manca state", async () => {
    (fetch as any).mockReturnValue(okJson({ address: { region: "R", county: "C" } }));
    expect(await fetchRegion(0, 0)).toEqual({ name: "R", code: null });
  });

  it("ritorna name e code null se nessun campo utile", async () => {
    (fetch as any).mockReturnValue(okJson({ address: {} }));
    expect(await fetchRegion(0, 0)).toEqual({ name: null, code: null });
  });

  it("ritorna name e code null su errore", async () => {
    (fetch as any).mockRejectedValue(new Error("net"));
    expect(await fetchRegion(0, 0)).toEqual({ name: null, code: null });
  });
});

describe("mergeRegions", () => {
  it("ritorna [] con lista vuota", () => {
    expect(mergeRegions([])).toEqual([]);
  });

  it("scarta le entry senza nome e senza codice", () => {
    expect(mergeRegions([{ name: null, code: null }])).toEqual([]);
  });

  it("deduplica per codice ISO quando presente, anche con nomi diversi", () => {
    const out = mergeRegions([
      { name: "Vienna", code: "AT-9" },
      { name: "Wien", code: "AT-9" }, // stessa regione, nome diverso -> stesso codice
    ]);
    expect(out).toEqual([{ name: "Vienna", code: "AT-9" }]);
  });

  it("deduplica per nome normalizzato quando il codice manca", () => {
    const out = mergeRegions([
      { name: "Lazio", code: null },
      { name: "lazio", code: null },
    ]);
    expect(out).toHaveLength(1);
  });

  it("mantiene distinte due regioni diverse", () => {
    const out = mergeRegions([
      { name: "Vienna", code: "AT-9" },
      { name: "Salzburg", code: "AT-5" },
    ]);
    expect(out).toHaveLength(2);
  });

  it("usa il codice come nome se il nome manca", () => {
    expect(mergeRegions([{ name: null, code: "AT-9" }])).toEqual([{ name: "AT-9", code: "AT-9" }]);
  });
});

describe("fetchDrivingRoute", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("ritorna le coordinate del percorso da OSRM", async () => {
    (fetch as any).mockReturnValue(okJson({
      code: "Ok",
      routes: [{ geometry: { type: "LineString", coordinates: [[12.5, 41.9], [12.6, 42.0], [12.7, 42.1]] } }],
    }));
    const route = await fetchDrivingRoute(41.9, 12.5, 42.1, 12.7);
    expect(route).toEqual([[12.5, 41.9], [12.6, 42.0], [12.7, 42.1]]);
  });

  it("ritorna null se OSRM non trova un percorso (routes vuoto)", async () => {
    (fetch as any).mockReturnValue(okJson({ code: "NoRoute", routes: [] }));
    expect(await fetchDrivingRoute(0, 0, 1, 1)).toBeNull();
  });

  it("ritorna null su risposta non ok", async () => {
    (fetch as any).mockReturnValue(notOk());
    expect(await fetchDrivingRoute(0, 0, 1, 1)).toBeNull();
  });

  it("ritorna null su errore di rete", async () => {
    (fetch as any).mockRejectedValue(new Error("net"));
    expect(await fetchDrivingRoute(0, 0, 1, 1)).toBeNull();
  });

  it("costruisce l'URL con lon,lat nell'ordine corretto per OSRM", async () => {
    (fetch as any).mockReturnValue(okJson({ routes: [{ geometry: { coordinates: [[1,2],[3,4]] } }] }));
    await fetchDrivingRoute(41.9, 12.5, 48.85, 2.35);
    const url = (fetch as any).mock.calls[0][0];
    expect(url).toContain("driving/12.5,41.9;2.35,48.85");
  });
});
