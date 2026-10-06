import { describe, it, expect } from "vitest";
import { scegliFormatoVideo, kmContatiPerTratta, misureVideo, nomeFileVideo } from "./voloVideo";
import { buildFlightPath, buildFlightLegs, tripTotalKm } from "./flyover";
import type { Trip } from "./storage";

describe("scegliFormatoVideo — webm dove c'è, mp4 per Safari", () => {
  it("Chrome/Android: webm vp9 per primo", () => {
    expect(scegliFormatoVideo(() => true)).toEqual({ mime: "video/webm;codecs=vp9", estensione: "webm" });
  });

  it("webm senza vp9: il webm generico", () => {
    expect(scegliFormatoVideo(m => m === "video/webm")?.mime).toBe("video/webm");
  });

  it("Safari/iPhone (niente webm): l'mp4", () => {
    const f = scegliFormatoVideo(m => m.startsWith("video/mp4"));
    expect(f?.estensione).toBe("mp4");
  });

  it("nessun formato: null, e il bottone non compare", () => {
    expect(scegliFormatoVideo(() => false)).toBeNull();
  });

  it("un browser che LANCIA su isTypeSupported vale «no», non un crash", () => {
    expect(scegliFormatoVideo(() => { throw new Error("boom"); })).toBeNull();
  });
});

const viaggio = (over: Partial<Trip>): Trip => ({
  id: Math.random().toString(36).slice(2), created_at: "2026-01-01T00:00:00.000Z",
  title: "T", city: "X", country: "Italia", country_code: "IT",
  trip_date: "2026-01-01", date_end: "2026-01-05", rating: null, notes: null,
  transport_mode: "plane", waypoints: [], latitude: 0, longitude: 0,
  home_latitude: 45.46, home_longitude: 9.19, home_label: "Milano",
  route_geometry: null, altitude_m: null, distance_from_home_km: null,
  max_distance_from_home_km: null, max_distance_city: null, max_altitude_m: null,
  max_altitude_city: null, region: null, region_details: null,
  ...over,
} as Trip);

describe("kmContatiPerTratta — il contatore finisce sul numero del poster", () => {
  it("le tratte di rientro a casa fra due viaggi valgono zero", () => {
    const tratte = [
      { km: 100, to: { casa: false } },
      { km: 900, to: { casa: true } },     // rientro: si vola, non si conta
      { km: 50, to: {} },
    ];
    expect(kmContatiPerTratta(tratte)).toEqual([100, 0, 50]);
  });

  it("un km non numerico non avvelena il totale", () => {
    expect(kmContatiPerTratta([{ km: NaN, to: {} }, { km: 10, to: {} }])).toEqual([0, 10]);
  });

  // Il paletto vero: col volo di un ANNO (più viaggi concatenati), la somma
  // contata deve coincidere con la somma dei km dei viaggi che il poster
  // mostra (tripTotalKm), non con la lunghezza di tutto il filo volato.
  it("su un anno di due viaggi la somma coincide con i km del poster", () => {
    const viaggi = [
      viaggio({ trip_date: "2026-03-01", latitude: 48.21, longitude: 16.37 }),   // Milano → Vienna
      viaggio({ trip_date: "2026-05-01", latitude: 38.72, longitude: -9.14 }),   // Milano → Lisbona
    ];
    const tratte = buildFlightLegs(buildFlightPath(viaggi));
    const contati = kmContatiPerTratta(tratte).reduce((a, b) => a + b, 0);
    const volati = tratte.reduce((a, t) => a + t.km, 0);
    const poster = viaggi.reduce((a, t) => a + tripTotalKm(t), 0);
    expect(contati).toBeCloseTo(poster, 6);
    expect(volati).toBeGreaterThan(poster);          // il rientro Vienna → Milano si vola ma non si conta
  });
});

describe("misureVideo", () => {
  it("un canvas piccolo resta com'è (arrotondato al pari)", () => {
    expect(misureVideo(683, 1201)).toEqual({ w: 684, h: 1202 });   // 600,5 → 601 → 1202
  });

  it("un telefono a densità 3 si ridimensiona sul lato lungo, in proporzione", () => {
    const { w, h } = misureVideo(1026, 1803);
    expect(Math.max(w, h)).toBeLessThanOrEqual(1280);
    expect(w % 2).toBe(0);
    expect(h % 2).toBe(0);
    expect(w / h).toBeCloseTo(1026 / 1803, 2);
  });
});

describe("nomeFileVideo", () => {
  it("titolo ripulito + estensione del formato", () => {
    expect(nomeFileVideo("Giro dell'Est", { mime: "video/mp4", estensione: "mp4" })).toBe("Giro_dell_Est-3d.mp4");
  });

  it("titolo vuoto o tutto simboli: «viaggio»", () => {
    expect(nomeFileVideo("☀︎☀︎", { mime: "video/webm", estensione: "webm" })).toBe("viaggio-3d.webm");
  });
});
