import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { placeKindOf, searchLandmarks, searchAnyPlace, __resetLandmarkCache, GeoResult , placeSubtitle } from "./geo";

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

  it("un monumento mostra la CITTÀ, non la regione (località prima)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => risposta([
      { class: "amenity", type: "place_of_worship", name: "Pantheon", lat: "41.898", lon: "12.476", osm_id: 7,
        address: { country: "Italia", country_code: "it", city: "Roma", state: "Lazio" } },
    ])));
    __resetLandmarkCache();
    const r = await searchLandmarks("Pantheon");
    expect(r[0].admin1).toBe("Roma");     // non "Lazio": la città disambigua meglio
  });

  it("un lago senza città ricade sulla regione", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => risposta([
      { class: "water", type: "lake", name: "Lago di Garda", lat: "45.66", lon: "10.68", osm_id: 8,
        address: { country: "Italia", country_code: "it", state: "Lombardia" } },
    ])));
    __resetLandmarkCache();
    const r = await searchLandmarks("Lago di Garda");
    expect(r[0].admin1).toBe("Lombardia");
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

describe("placeSubtitle — il sottotitolo non ripete il nome", () => {
  it("normale: regione e paese", () => {
    expect(placeSubtitle({ name: "Garda", admin1: "Veneto", country: "Italia" })).toBe("Veneto, Italia");
  });
  it("Città del Vaticano: nome = paese, senza admin1 → nessun sottotitolo", () => {
    expect(placeSubtitle({ name: "Città del Vaticano", country: "Città del Vaticano" })).toBeNull();
  });
  it("regione uguale al nome: resta solo il paese", () => {
    expect(placeSubtitle({ name: "Veneto", admin1: "Veneto", country: "Italia" })).toBe("Italia");
  });
});

describe("searchAnyPlace — dedupe e ricambio senza prefisso", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("GeoNames manda città E Stato del Vaticano con lo stesso nome: ne resta UNO", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (/geocoding-api/.test(url)) return { ok: true, json: async () => ({ results: [
        { id: 1, name: "Città del Vaticano", country: "Città del Vaticano", country_code: "VA", latitude: 41.9, longitude: 12.45, feature_code: "PPLC" },
        { id: 2, name: "Città del Vaticano", country: "Città del Vaticano", country_code: "VA", latitude: 41.9, longitude: 12.45, feature_code: "PCLI" },
      ] }) };
      return risposta([]);
    }));
    const { searchAnyPlace, __resetLandmarkCache } = await import("./geo");
    __resetLandmarkCache();
    const r = await searchAnyPlace("Città del Vaticano");
    expect(r.filter(p => p.name === "Città del Vaticano")).toHaveLength(1);
  });

  it("'lago di loch ness': i luoghi tornano vuoti, il ricambio senza prefisso trova il lago", async () => {
    const chiamateNominatim: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (/geocoding-api/.test(url)) return { ok: true, json: async () => ({ results: [] }) };
      chiamateNominatim.push(decodeURIComponent(url));
      // il primo tentativo ("lago di loch ness") è vuoto, il secondo trova
      if (/lago di/.test(decodeURIComponent(url))) return risposta([]);
      return risposta([
        { class: "water", type: "lake", name: "Loch Ness", lat: "57.3", lon: "-4.4", osm_id: 9,
          address: { country: "Regno Unito", country_code: "gb", state: "Scozia" } },
      ]);
    }));
    const { searchAnyPlace, __resetLandmarkCache } = await import("./geo");
    __resetLandmarkCache();
    const r = await searchAnyPlace("lago di loch ness");
    expect(chiamateNominatim.some(u => /q=loch ness/.test(u))).toBe(true);
    expect(r[0]?.name).toBe("Loch Ness");
    expect(r[0]?.kind).toBe("lago");
  });

  it("il ricambio NON scatta se il primo tentativo trova già qualcosa", async () => {
    const chiamateNominatim: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (/geocoding-api/.test(url)) return { ok: true, json: async () => ({ results: [] }) };
      chiamateNominatim.push(decodeURIComponent(url));
      return risposta([
        { class: "water", type: "lake", name: "Lago di Garda", lat: "45.66", lon: "10.68", osm_id: 10,
          address: { country: "Italia", country_code: "it", state: "Lombardia" } },
      ]);
    }));
    const { searchAnyPlace, __resetLandmarkCache } = await import("./geo");
    __resetLandmarkCache();
    await searchAnyPlace("Lago di Garda");
    expect(chiamateNominatim).toHaveLength(1);
  });
});

describe("searchAnyPlace — la velocità percepita", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("onParziale consegna le CITTÀ subito, mentre i luoghi pagano ancora la coda", async () => {
    let liberaNominatim: (v: unknown) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (/geocoding-api/.test(url)) return { ok: true, json: async () => ({ results: [
        { id: 1, name: "Trevi", country: "Italia", country_code: "IT", latitude: 42.9, longitude: 12.7 },
      ] }) };
      await new Promise(r => { liberaNominatim = r; });      // Nominatim resta in volo
      return risposta([
        { class: "amenity", type: "fountain", name: "Fontana di Trevi", lat: "41.9", lon: "12.48", osm_id: 11,
          address: { country: "Italia", country_code: "it", city: "Roma" } },
      ]);
    }));
    const { searchAnyPlace, __resetLandmarkCache } = await import("./geo");
    __resetLandmarkCache();
    const parziali: string[][] = [];
    const totaleP = searchAnyPlace("Trevi", 6, r => parziali.push(r.map(p => p.name)));
    // le città sono arrivate PRIMA che Nominatim risponda
    await new Promise(r => setTimeout(r, 20));
    expect(parziali).toEqual([["Trevi"]]);
    liberaNominatim(null);
    const totale = await totaleP;
    expect(totale.map(p => p.name)).toContain("Fontana di Trevi");
  });

  it("una ricerca superata in coda NON va in rete (e non inquina la cache)", async () => {
    vi.useFakeTimers();
    const urlNominatim: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (/geocoding-api/.test(url)) return { ok: true, json: async () => ({ results: [] }) };
      urlNominatim.push(decodeURIComponent(url));
      return risposta([]);
    }));
    const { searchLandmarks, __resetLandmarkCache } = await import("./geo");
    __resetLandmarkCache();
    const p1 = searchLandmarks("colosseo");     // parte subito (coda libera)
    const p2 = searchLandmarks("colosseo r");   // in coda, verrà SUPERATA
    const p3 = searchLandmarks("colosseo roma");// la più nuova
    await vi.advanceTimersByTimeAsync(4000);
    await Promise.all([p1, p2, p3]);
    // In una raffica: la PRIMA parte subito (coda libera, nessun motivo di
    // scartarla) e la PIÙ NUOVA parte al turno successivo. Quella di mezzo,
    // superata mentre aspettava, non va in rete E non consuma il turno —
    // altrimenti la buona erediterebbe l'attesa dei morti.
    expect(urlNominatim).toHaveLength(2);
    expect(urlNominatim[0]).toMatch(/q=colosseo&/);
    expect(urlNominatim[1]).toMatch(/q=colosseo roma/);
    expect(urlNominatim.some(u => /q=colosseo r&/.test(u))).toBe(false);
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

/**
 * Il caso Montepulciano (segnalato da Stefano su un suo viaggio vero,
 * 2026-08-21): il geocoder delle città dava un punto a 946 m dal centro
 * storico, perché per i comuni restituisce una posizione "amministrativa".
 * La risposta di Nominatim — che chiediamo già per i monumenti — contiene il
 * nodo del centro abitato: costa zero riusarla per spostare il punto.
 */
describe("searchAnyPlace — coordinate delle città corrette con OSM", () => {
  beforeEach(() => __resetLandmarkCache());
  afterEach(() => vi.unstubAllGlobals());

  const cittaOpenMeteo = (lat: number, lon: number) => ({
    ok: true, json: async () => ({ results: [
      { id: 1, name: "Montepulciano", country: "Italia", country_code: "IT", latitude: lat, longitude: lon, feature_code: "PPLA3" },
    ] }),
  });

  it("il punto amministrativo viene sostituito da quello del centro abitato", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (/geocoding-api/.test(url)) return cittaOpenMeteo(43.09998, 11.78704);  // il dato vero, impreciso
      return risposta([
        // Nominatim: il comune (centroide) e il paese (nodo). Nessuno dei due
        // finisce nella lista — sono città, non monumenti — ma il secondo dice
        // dove sta davvero Montepulciano.
        { class: "boundary", type: "administrative", name: "Montepulciano", lat: "43.0945", lon: "11.7827", osm_id: 1,
          address: { country: "Italia", country_code: "it" } },
        { class: "place", type: "town", name: "Montepulciano", lat: "43.0927", lon: "11.7810", osm_id: 2,
          address: { country: "Italia", country_code: "it" } },
      ]);
    }));
    const { searchAnyPlace, __resetLandmarkCache: reset } = await import("./geo");
    reset();
    const r = await searchAnyPlace("Montepulciano");
    const m = r.find(p => p.name === "Montepulciano")!;
    expect(m.latitude).toBeCloseTo(43.0927, 4);   // il NODO del paese
    expect(m.longitude).toBeCloseTo(11.7810, 4);
    // e resta una riga sola: non abbiamo aggiunto risultati alla lista
    expect(r.filter(p => p.name === "Montepulciano")).toHaveLength(1);
  });

  it("un omonimo LONTANO non sposta niente (i due Montepulciano distano 131 km)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (/geocoding-api/.test(url)) return cittaOpenMeteo(43.09998, 11.78704);
      return risposta([
        { class: "place", type: "hamlet", name: "Montepulciano", lat: "43.4205", lon: "13.3457", osm_id: 3,
          address: { country: "Italia", country_code: "it" } },
      ]);
    }));
    const { searchAnyPlace, __resetLandmarkCache: reset } = await import("./geo");
    reset();
    const r = await searchAnyPlace("Montepulciano");
    const m = r.find(p => p.name === "Montepulciano")!;
    expect(m.latitude).toBeCloseTo(43.09998, 4);  // invariato
  });

  it("un paese diverso non sposta niente, anche se il nome combacia", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (/geocoding-api/.test(url)) return { ok: true, json: async () => ({ results: [
        { id: 1, name: "Firenze", country: "Italia", country_code: "IT", latitude: 43.77, longitude: 11.25, feature_code: "PPLA2" },
      ] }) };
      return risposta([
        { class: "place", type: "town", name: "Firenze", lat: "43.775", lon: "11.253", osm_id: 4,
          address: { country: "Stati Uniti", country_code: "us" } },
      ]);
    }));
    const { searchAnyPlace, __resetLandmarkCache: reset } = await import("./geo");
    reset();
    const r = await searchAnyPlace("Firenze");
    expect(r[0].latitude).toBeCloseTo(43.77, 4);
  });
});
