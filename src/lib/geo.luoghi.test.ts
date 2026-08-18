import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { placeKindOf, searchLandmarks, searchAnyPlace, __resetLandmarkCache, GeoResult } from "./geo";

/**
 * La seconda fonte della ricerca: laghi, monumenti e montagne, che il
 * geocoder delle città non conosce ("Lago di Garda" lì dà zero risultati).
 */
describe("placeKindOf — cosa entra in un diario di viaggio e cosa no", () => {
  it("riconosce le categorie utili", () => {
    expect(placeKindOf("water", "lake")).toBe("lago");
    expect(placeKindOf("natural", "peak")).toBe("montagna");
    expect(placeKindOf("natural", "volcano")).toBe("montagna");
    expect(placeKindOf("natural", "beach")).toBe("spiaggia");
    expect(placeKindOf("historic", "archaeological_site")).toBe("monumento");
    expect(placeKindOf("historic", "castle")).toBe("monumento");
    expect(placeKindOf("tourism", "attraction")).toBe("monumento");
    expect(placeKindOf("tourism", "museum")).toBe("monumento");
    expect(placeKindOf("leisure", "park")).toBe("parco");
    expect(placeKindOf("boundary", "national_park")).toBe("parco");
    expect(placeKindOf("place", "island")).toBe("luogo");
    expect(placeKindOf("man_made", "lighthouse")).toBe("monumento");
  });

  it("i luoghi di culto e le piazze celebri sono monumenti/luoghi, non rumore", () => {
    // Casi VERI dall'API (2026-08-18, segnalazione di Stefano: "ho cercato il
    // pantheon a roma e non ho trovato nulla"):
    // Pantheon/Duomo di Milano/Sagrada Familia = amenity/place_of_worship,
    // Fontana di Trevi = amenity/fountain, Piazza San Marco = place/square.
    expect(placeKindOf("amenity", "place_of_worship")).toBe("monumento");
    expect(placeKindOf("amenity", "fountain")).toBe("monumento");
    expect(placeKindOf("place", "square")).toBe("luogo");
    // ma il resto di amenity resta fuori: è la classe di bar e ospedali
    expect(placeKindOf("amenity", "restaurant")).toBeNull();
    expect(placeKindOf("amenity", "school")).toBeNull();
    expect(placeKindOf("amenity", "hospital")).toBeNull();
    expect(placeKindOf("amenity", "parking")).toBeNull();
  });

  it("scarta il rumore: strade, ferrovie, alberghi, confini", () => {
    // Cercando "Colosseo" su Nominatim il PRIMO risultato è la via pedonale.
    expect(placeKindOf("highway", "pedestrian")).toBeNull();
    expect(placeKindOf("railway", "station")).toBeNull();
    expect(placeKindOf("tourism", "hotel")).toBeNull();
    expect(placeKindOf("tourism", "guest_house")).toBeNull();
    expect(placeKindOf("boundary", "administrative")).toBeNull();
    expect(placeKindOf("landuse", "residential")).toBeNull();
    expect(placeKindOf("shop", "bakery")).toBeNull();
    expect(placeKindOf("leisure", "pitch")).toBeNull();
    expect(placeKindOf("place", "city")).toBeNull();   // già coperte dalle città
  });
});

const risposta = (righe: unknown[]) => ({ ok: true, json: async () => righe });

describe("searchLandmarks", () => {
  beforeEach(() => {
    __resetLandmarkCache();
    vi.stubGlobal("fetch", vi.fn(async () => risposta([
      { class: "highway", type: "pedestrian", name: "Colosseo", lat: "41.891", lon: "12.492", osm_id: 1, address: { country: "Italia", country_code: "it" } },
      { class: "historic", type: "archaeological_site", name: "Colosseo", lat: "41.890", lon: "12.492", osm_id: 2, address: { country: "Italia", country_code: "it", state: "Lazio" } },
    ])));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("tiene il monumento e butta la strada omonima", async () => {
    const r = await searchLandmarks("Colosseo");
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe("Colosseo");
    expect(r[0].kind).toBe("monumento");
    expect(r[0].latitude).toBeCloseTo(41.89, 2);
    expect(r[0].country_code).toBe("IT");   // maiuscolo come i risultati delle città
    expect(r[0].admin1).toBe("Lazio");
  });

  it("non interroga la rete per query troppo corte", async () => {
    expect(await searchLandmarks("La")).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("la seconda ricerca uguale non ripassa dalla rete", async () => {
    await searchLandmarks("Colosseo");
    await searchLandmarks("colosseo");           // stessa query, altra grafia
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("id negativi: non possono collidere con quelli delle città", async () => {
    const r = await searchLandmarks("Colosseo");
    expect(r[0].id).toBeLessThan(0);
  });

  it("rete a terra o risposta strana → lista vuota, non un errore", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    __resetLandmarkCache();
    expect(await searchLandmarks("Colosseo")).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ non: "un array" }) })));
    __resetLandmarkCache();
    expect(await searchLandmarks("Colosseo")).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => [] })));
    __resetLandmarkCache();
    expect(await searchLandmarks("Colosseo")).toEqual([]);
  });

  it("scarta i risultati senza coordinate valide", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => risposta([
      { class: "water", type: "lake", name: "Lago fantasma", lat: "nonUnNumero", lon: "12", osm_id: 9, address: {} },
    ])));
    __resetLandmarkCache();
    expect(await searchLandmarks("Lago")).toEqual([]);
  });

  it("lo stesso nome due volte (poligono + centro) compare una volta sola", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => risposta([
      { class: "water", type: "lake", name: "Lago di Garda", lat: "45.66", lon: "10.68", osm_id: 3, address: { country_code: "it" } },
      { class: "water", type: "lake", name: "Lago di Garda", lat: "45.67", lon: "10.69", osm_id: 4, address: { country_code: "it" } },
    ])));
    __resetLandmarkCache();
    const r = await searchLandmarks("Lago di Garda");
    expect(r).toHaveLength(1);
  });
});

describe("searchPlaces — anche il geocoder delle città etichetta i non-abitati", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("un monte di GeoNames (feature_code MT) esce come montagna; le città senza etichetta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ results: [
      { id: 1, name: "Everest", country: "Nepal", country_code: "NP", latitude: 27.99, longitude: 86.93, feature_code: "MT" },
      { id: 2, name: "Everest", country: "Stati Uniti", country_code: "US", latitude: 39.68, longitude: -95.42, feature_code: "PPL" },
    ] }) })));
    const { searchPlaces } = await import("./geo");
    const r = await searchPlaces("Everest");
    expect(r[0].kind).toBe("montagna");
    expect(r[1].kind).toBeUndefined();
  });
});

describe("searchAnyPlace — le due fonti in una lista sola", () => {
  beforeEach(() => __resetLandmarkCache());
  afterEach(() => vi.unstubAllGlobals());

  it("chi si chiama ESATTAMENTE come la ricerca va in cima, da qualunque fonte", async () => {
    // Il caso vero: "Lago di Garda" esiste come lago; "Garda" è un paese.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("open-meteo")) {
        return { ok: true, json: async () => ({ results: [
          { id: 1, name: "Garda", country: "Italia", country_code: "IT", latitude: 45.57, longitude: 10.71 },
        ] }) };
      }
      return risposta([
        { class: "water", type: "lake", name: "Lago di Garda", lat: "45.66", lon: "10.68", osm_id: 5, address: { country: "Italia", country_code: "it" } },
      ]);
    }));
    const r = await searchAnyPlace("Lago di Garda");
    expect(r[0].name).toBe("Lago di Garda");
    expect(r[0].kind).toBe("lago");
    expect(r.map(p => p.name)).toContain("Garda");   // il paese resta, ma sotto
  });

  it("se una delle due fonti cade, l'altra risponde lo stesso", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("open-meteo")) throw new Error("geocoder giù");
      return risposta([
        { class: "historic", type: "castle", name: "Castello", lat: "45", lon: "9", osm_id: 6, address: { country_code: "it" } },
      ]);
    }));
    const r = await searchAnyPlace("Castello");
    expect(r.map(p => p.name)).toEqual(["Castello"]);
  });

  it("query vuota: nessuna chiamata di rete", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect(await searchAnyPlace("   ")).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("non restituisce più risultati di quanti richiesti", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("open-meteo")) {
        return { ok: true, json: async () => ({ results: Array.from({ length: 6 }, (_, i) => (
          { id: i, name: "Città " + i, country: "Italia", country_code: "IT", latitude: 45, longitude: 9 }
        )) }) };
      }
      return risposta(Array.from({ length: 4 }, (_, i) => (
        { class: "water", type: "lake", name: "Lago " + i, lat: "45", lon: "9", osm_id: 100 + i, address: { country_code: "it" } }
      )));
    }));
    const r: GeoResult[] = await searchAnyPlace("qualcosa", 6);
    expect(r).toHaveLength(6);
  });
});
