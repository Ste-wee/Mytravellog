import { describe, it, expect } from "vitest";
import { paesiVisitati, centroPaese, bboxDiPoligoni, paeseDelPunto, paeseVisibile, paeseVisibileDiViaggio, paeseVisibileDiTappa, type PaeseMondo } from "./paesi";
import type { Trip } from "./storage";

/** Quadrato [minLon,minLat]-[maxLon,maxLat] come paese finto. */
const quadrato = (id: string, name: string, a: number, b: number, c: number, d: number): PaeseMondo => {
  const anello = [[a, b], [c, b], [c, d], [a, d], [a, b]];
  const polygons = [[anello]];
  return { id, name, polygons, bbox: bboxDiPoligoni(polygons), geometry: { type: "Polygon", coordinates: [anello] } };
};

const ITALIA = quadrato("it", "Italy", 6, 36, 19, 47);
const AUSTRIA = quadrato("at", "Austria", 9, 46, 17, 49);
const SVEZIA = quadrato("se", "Sweden", 11, 55, 24, 69);

const viaggio = (over: Partial<Trip>): Trip => ({
  id: "t", created_at: "2026-01-01T00:00:00.000Z", title: "T", city: "C",
  country: "Paese", country_code: "IT", trip_date: "2026-01-01", date_end: null,
  latitude: 41.9, longitude: 12.5, home_latitude: 45.46, home_longitude: 9.19,
  home_label: "Milano", notes: null, transport_mode: "car", waypoints: [],
  ...over,
} as Trip);

describe("paesiVisitati", () => {
  it("conta anche i paesi delle TAPPE, non solo la destinazione", () => {
    // Milano → Vienna passando per l'Italia: l'Austria è l'arrivo, ma l'Italia
    // è stata attraversata e va contata (il dato per-viaggio dice solo l'arrivo).
    const t = viaggio({
      latitude: 48.2, longitude: 16.37, country_code: "AT",
      waypoints: [{ id: "w", city: "Trieste", country: "Italia", country_code: "IT", lat: 45.65, lon: 13.78, transport_mode: "car" }],
    } as Partial<Trip>);
    const visitati = paesiVisitati([t], [ITALIA, AUSTRIA, SVEZIA]);
    expect([...visitati.keys()].sort()).toEqual(["at", "it"]);
  });

  it("la bandiera è quella del punto caduto DENTRO quel paese", () => {
    // la destinazione è austriaca, la tappa italiana: l'Italia non deve
    // ereditare la bandiera austriaca della destinazione
    const t = viaggio({
      latitude: 48.2, longitude: 16.37, country_code: "AT",
      waypoints: [{ id: "w", city: "Roma", country: "Italia", country_code: "IT", lat: 41.9, lon: 12.5, transport_mode: "car" }],
    } as Partial<Trip>);
    const visitati = paesiVisitati([t], [ITALIA, AUSTRIA]);
    expect(visitati.get("it")?.code).toBe("IT");
    expect(visitati.get("at")?.code).toBe("AT");
  });

  it("un punto fuori da ogni paese non inventa nulla (oceano)", () => {
    const t = viaggio({ latitude: 0, longitude: -30, waypoints: [] });
    expect(paesiVisitati([t], [ITALIA, AUSTRIA]).size).toBe(0);
  });

  it("senza paesi caricati non esplode", () => {
    expect(paesiVisitati([viaggio({})], []).size).toBe(0);
  });

  it("lo stesso paese visitato due volte compare una volta sola", () => {
    const a = viaggio({ id: "a", latitude: 41.9, longitude: 12.5 });
    const b = viaggio({ id: "b", latitude: 45.4, longitude: 9.2 });
    expect(paesiVisitati([a, b], [ITALIA]).size).toBe(1);
  });
});

describe("centroPaese", () => {
  it("usa il poligono PIÙ GRANDE, non la media di tutti", () => {
    // Francia + un'isola lontana: il centro deve restare sulla terraferma,
    // non finire a metà strada in mezzo all'oceano.
    const grande = [[0, 44], [1, 44], [1, 45], [0.5, 45.5], [0, 45], [0, 44]];
    const isola = [[-60, 3], [-59, 3], [-59, 4], [-60, 3]];
    const polygons = [[grande], [isola]];
    const p: PaeseMondo = {
      id: "fr", name: "France", polygons, bbox: bboxDiPoligoni(polygons),
      geometry: { type: "MultiPolygon", coordinates: [[grande], [isola]] },
    };
    const c = centroPaese(p)!;
    expect(c[0]).toBeGreaterThan(0);
    expect(c[0]).toBeLessThan(1);
    expect(c[1]).toBeGreaterThan(43);
  });

  it("un paese senza geometria utile non dà un centro finto", () => {
    expect(centroPaese({ id: "x", name: "X", polygons: [], bbox: [0, 0, 0, 0] })).toBeNull();
  });
});

describe("paeseDelPunto — la regola del poligono più piccolo, condivisa", () => {
  it("fra due paesi sovrapposti vince il più piccolo (caso Russia/Lapponia)", () => {
    // il "gigante" simula il poligono russo che avvolge il mondo
    const gigante = quadrato("ru", "Russia", -180, 30, 180, 80);
    expect(paeseDelPunto(18.8, 68.3, [gigante, SVEZIA])?.id).toBe("se");
    // ...e l'ordine dell'elenco non deve contare
    expect(paeseDelPunto(18.8, 68.3, [SVEZIA, gigante])?.id).toBe("se");
  });
});

/**
 * Le quattro nazioni del Regno Unito contano come paesi a sé (richiesta di
 * Stefano, 2026-08-21: "la Scozia dovrebbe essere a parte"). Il suo viaggio
 * "Scozia" ha davvero country "Regno Unito" + region_details [GB-SCT].
 */
describe("paeseVisibile — Scozia, Galles e le altre nazioni UK", () => {
  it("il viaggio con region GB-SCT diventa Scozia, con la sua bandiera", () => {
    expect(paeseVisibileDiViaggio({
      country: "Regno Unito", country_code: "GB",
      region: "Scozia", region_details: [{ name: "Scozia", code: "GB-SCT" }],
    })).toEqual({ nome: "Scozia", codice: "GB-SCT" });
  });

  it("riconosce anche le altre tre", () => {
    const naz = (code: string) => paeseVisibileDiViaggio({
      country: "Regno Unito", country_code: "GB", region_details: [{ name: "x", code }],
    }).nome;
    expect(naz("GB-WLS")).toBe("Galles");
    expect(naz("GB-ENG")).toBe("Inghilterra");
    expect(naz("GB-NIR")).toBe("Irlanda del Nord");
  });

  it("senza codice ISO ricade sul NOME della regione (viaggi vecchi)", () => {
    expect(paeseVisibile("Regno Unito", "GB", "Scozia", null).nome).toBe("Scozia");
    expect(paeseVisibile("Regno Unito", "GB", "Scotland", null).nome).toBe("Scozia");
  });

  it("un viaggio britannico senza regione resta Regno Unito: niente invenzioni", () => {
    expect(paeseVisibileDiViaggio({ country: "Regno Unito", country_code: "GB" }))
      .toEqual({ nome: "Regno Unito", codice: "GB" });
  });

  it("gli altri paesi non vengono toccati", () => {
    expect(paeseVisibileDiViaggio({
      country: "Italia", country_code: "IT",
      region_details: [{ name: "Toscana", code: "IT-52" }],
    })).toEqual({ nome: "Italia", codice: "IT" });
  });
});

describe("paeseVisibileDiTappa — le tappe non gonfiano il conteggio", () => {
  const SCOZIA = { nome: "Scozia", codice: "GB-SCT" };

  it("una tappa britannica di un viaggio scozzese conta come Scozia", () => {
    // Il caso vero: viaggio "Scozia" (Pitlochry) con tappe Edimburgo e Fort
    // Augustus, entrambe con country_code GB e senza regione salvata.
    expect(paeseVisibileDiTappa({ country: "Regno Unito", country_code: "GB" }, SCOZIA)).toEqual(SCOZIA);
  });

  it("una tappa in un ALTRO paese resta sé stessa", () => {
    expect(paeseVisibileDiTappa({ country: "Francia", country_code: "FR" }, SCOZIA))
      .toEqual({ nome: "Francia", codice: "FR" });
  });

  it("se il viaggio non è in una nazione UK non eredita niente", () => {
    expect(paeseVisibileDiTappa({ country: "Regno Unito", country_code: "GB" }, { nome: "Italia", codice: "IT" }))
      .toEqual({ nome: "Regno Unito", codice: "GB" });
  });
});
