import { describe, it, expect } from "vitest";
import { copioneVolo, type TempiCopione, type Camera } from "./copioneVolo";

const TEMPI: TempiCopione = {
  aperturaMs: 2500, avvicinamentoZoom: 0.3, decolloMs: 1800, arrivoMs: 1500, arrivoZoom: 0.15,
  finaleMs: 2500, titoloMs: 2800, sfumaturaMs: 500, velocitaIcona: 1.12,
};
const APERTURA: Camera = { lon: 12, lat: 46, zoom: 4.6, pitch: 45, bearing: 0 };
const cam = (zoom: number, durationMs: number) => ({ zoom, pitch: 50, bearing: 0, durationMs });
const MILANO = { lon: 9.19, lat: 45.46 }, LUGANO = { lon: 8.95, lat: 46.0 }, ZURIGO = { lon: 8.54, lat: 47.38 };
const TRATTE = [
  { from: MILANO, to: LUGANO, camera: cam(8.5, 7000), pathCoords: [[9.19, 45.46], [9.0, 45.8], [8.95, 46.0]] as [number, number][] },
  { from: LUGANO, to: ZURIGO, camera: cam(6.5, 9000), pathCoords: [[8.95, 46.0], [8.54, 47.38]] as [number, number][] },
];
const KM = [79, 206];

describe("copioneVolo", () => {
  const c = copioneVolo(TRATTE, APERTURA, KM, TEMPI);

  it("dura apertura + decollo + tratte + arrivo + finale", () => {
    expect(c.durataMs).toBe(2500 + 1800 + 7000 + 9000 + 1500 + 2500);
  });

  it("le fasi si susseguono nell'ordine giusto", () => {
    expect(c.statoAl(0).fase).toBe("apertura");
    expect(c.statoAl(2600).fase).toBe("decollo");
    expect(c.statoAl(4400).fase).toBe("tratta");
    expect(c.statoAl(4400).tratta).toBe(0);
    expect(c.statoAl(4300 + 7000 + 100).tratta).toBe(1);
    expect(c.statoAl(4300 + 16000 + 100).fase).toBe("arrivo");
    expect(c.statoAl(c.durataMs).fase).toBe("finale");
  });

  it("la camera non salta mai fra una fase e l'altra", () => {
    // ai confini, un millisecondo prima e dopo devono dare quasi la stessa camera
    // (non al finale: lì si passa al poster, e il video lo copre con la dissolvenza)
    for (const confine of [2500, 4300, 11300, 20300]) {
      const a = c.statoAl(confine - 1).camera, b = c.statoAl(confine + 1).camera;
      expect(Math.abs(a.lon - b.lon)).toBeLessThan(0.01);
      expect(Math.abs(a.lat - b.lat)).toBeLessThan(0.01);
      expect(Math.abs(a.zoom - b.zoom)).toBeLessThan(0.01);
    }
  });

  it("parte dall'apertura, si avvicina, e decolla verso la partenza", () => {
    expect(c.statoAl(0).camera).toEqual(APERTURA);
    expect(c.statoAl(2500).camera.zoom).toBeCloseTo(4.9, 6);
    const decollato = c.statoAl(4300).camera;
    expect(decollato.lon).toBeCloseTo(MILANO.lon, 6);
    expect(decollato.zoom).toBeCloseTo(8.5, 6);
  });

  it("l'icona segue la strada e arriva alla meta un po' prima della camera", () => {
    const quasiFine = c.statoAl(4300 + 7000 * 0.92);
    expect(quasiFine.icona).toEqual(TRATTE[0].pathCoords[2]);   // già arrivata
    expect(quasiFine.camera.lat).toBeLessThan(LUGANO.lat);      // la camera no
    expect(c.statoAl(4300).icona).toEqual(TRATTE[0].pathCoords[0]);
  });

  it("i km crescono fino al totale e lì restano", () => {
    let prima = -1;
    for (let ms = 0; ms <= c.durataMs; ms += 250) {
      const km = c.statoAl(ms).km;
      expect(km).toBeGreaterThanOrEqual(prima - 1e-9);
      prima = km;
    }
    expect(c.statoAl(c.durataMs).km).toBe(285);
    expect(c.statoAl(4300 + 7000).km).toBeCloseTo(79, 6);
  });

  it("i km crescono come si muove la camera: piano all'inizio della tratta", () => {
    // a un quarto del tempo la camera (easeInOutCubic) ha fatto 1/16 della strada
    expect(c.statoAl(4300 + 7000 * 0.25).km).toBeCloseTo(79 * 0.0625, 6);
  });

  it("l'avvicinamento d'apertura rallenta verso la fine", () => {
    // a metà apertura ha già fatto più di metà avvicinamento (sin(π/4) ≈ 0.71)
    expect(c.statoAl(1250).camera.zoom).toBeCloseTo(4.6 + 0.3 * Math.sin(Math.PI / 4), 6);
  });

  it("il titolo resta durante l'apertura, poi sfuma e sparisce", () => {
    expect(c.statoAl(0).titolo).toBe(1);
    expect(c.statoAl(2500 + 2800 - 500).titolo).toBe(1);
    expect(c.statoAl(2500 + 2800 - 250).titolo).toBeCloseTo(0.5, 6);
    expect(c.statoAl(2500 + 2800 + 1).titolo).toBe(0);
  });

  it("all'arrivo l'icona è sulla meta e la camera si avvicina ancora un po'", () => {
    const s = c.statoAl(20300 + 1500 - 1);
    expect(s.fase).toBe("arrivo");
    expect(s.icona).toEqual(TRATTE[1].pathCoords[1]);
    expect(s.camera.zoom).toBeCloseTo(6.5 + 0.15, 6);
  });

  it("oltre il 180° la camera prende la strada corta", () => {
    const figi = { lon: 178.4, lat: -18.1 }, samoa = { lon: -171.8, lat: -13.8 };
    const p = copioneVolo(
      [{ from: figi, to: samoa, camera: cam(4.5, 8000), pathCoords: [[178.4, -18.1], [-171.8, -13.8]] }],
      { lon: 178, lat: -16, zoom: 3, pitch: 45, bearing: 0 }, [1100], TEMPI);
    const meta = p.statoAl(2500 + 1800 + 4000).camera.lon;   // a metà tratta
    expect(Math.abs(meta)).toBeGreaterThan(170);              // sul Pacifico, non sull'Africa
  });

  it("senza tratte resta un'apertura e il finale, senza icona", () => {
    const vuoto = copioneVolo([], APERTURA, [], TEMPI);
    expect(vuoto.durataMs).toBe(2500 + 2500);
    expect(vuoto.statoAl(100).icona).toBeNull();
    expect(vuoto.statoAl(vuoto.durataMs).fase).toBe("finale");
  });
});
