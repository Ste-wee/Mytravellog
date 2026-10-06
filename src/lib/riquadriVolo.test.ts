import { describe, it, expect } from "vitest";
import { riquadriDelVolo, type SezioneVolo } from "./riquadriVolo";

const VISTA = { w: 390, h: 844 };
const MILANO = { lon: 9.19, lat: 45.46 };
const INNSBRUCK = { lon: 11.39, lat: 47.27 };

/** Il riquadro (512 px) che contiene un punto, allo zoom z. */
function riquadroDi(lon: number, lat: number, z: number): string {
  const n = 2 ** z;
  const la = lat * Math.PI / 180;
  const x = Math.floor((lon + 180) / 360 * n);
  const y = Math.floor((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n);
  return `${z}/${x}/${y}`;
}
const zoomDi = (k: string) => Number(k.split("/")[0]);
const centroLon = (k: string) => {
  const [z, x] = k.split("/").map(Number);
  return (x + 0.5) / 2 ** z * 360 - 180;
};

describe("riquadriDelVolo", () => {
  const tratta: SezioneVolo = { da: { ...MILANO, zoom: 6.5 }, a: { ...INNSBRUCK, zoom: 6.5 } };

  it("copre partenza e arrivo allo zoom pieno (6.5 → riquadri di zoom 7)", () => {
    const [lista] = riquadriDelVolo([tratta], VISTA);
    expect(lista).toContain(riquadroDi(MILANO.lon, MILANO.lat, 7));
    expect(lista).toContain(riquadroDi(INNSBRUCK.lon, INNSBRUCK.lat, 7));
  });

  it("aggiunge l'orizzonte a zoom più bassi, e mai uno zoom più alto del pieno", () => {
    const [lista] = riquadriDelVolo([tratta], VISTA);
    const zoom = new Set(lista.map(zoomDi));
    expect([...zoom].sort()).toEqual([5, 6, 7]);
  });

  it("dentro una sezione mette prima i riquadri nitidi (zoom decrescente)", () => {
    const [lista] = riquadriDelVolo([tratta], VISTA);
    const z = lista.map(zoomDi);
    expect(z).toEqual([...z].sort((a, b) => b - a));
  });

  it("un riquadro compare una volta sola, nella PRIMA sezione che lo usa", () => {
    const [prima, seconda] = riquadriDelVolo([tratta, tratta], VISTA);
    expect(prima.length).toBeGreaterThan(0);
    expect(seconda).toEqual([]);
    expect(new Set(prima).size).toBe(prima.length);
  });

  it("guarda più a nord che a sud (la camera è inclinata verso nord)", () => {
    const fermo: SezioneVolo = { da: { ...MILANO, zoom: 6.5 }, a: { ...MILANO, zoom: 6.5 } };
    const [lista] = riquadriDelVolo([fermo], VISTA);
    // allo zoom dell'orizzonte (pieno − 1): allo zoom pieno la grana dei
    // riquadri, a queste latitudini, pareggia le due finestre
    const yCentro = Number(riquadroDi(MILANO.lon, MILANO.lat, 6).split("/")[2]);
    const ys = lista.filter(k => zoomDi(k) === 6).map(k => Number(k.split("/")[2]));
    const nord = yCentro - Math.min(...ys);     // y cresce verso sud
    const sud = Math.max(...ys) - yCentro;
    expect(nord).toBeGreaterThan(sud);
  });

  it("oltre il 180° prende la strada corta, con x sempre dentro la griglia", () => {
    // Figi → Samoa: 178°E → -172°: per il Pacifico, non per l'Europa
    const pacifico: SezioneVolo = { da: { lon: 178, lat: -18, zoom: 5 }, a: { lon: -172, lat: -14, zoom: 5 } };
    const [lista] = riquadriDelVolo([pacifico], VISTA);
    expect(lista.length).toBeGreaterThan(0);
    for (const k of lista) {
      const [z, x, y] = k.split("/").map(Number);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(2 ** z);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(2 ** z);
      expect(Math.abs(centroLon(k))).toBeGreaterThan(120);
    }
  });

  it("a zoom bassissimo non chiede zoom negativi né righe fuori dal mondo", () => {
    const mondo: SezioneVolo = { da: { lon: 0, lat: 80, zoom: 0.4 }, a: { lon: 10, lat: 80, zoom: 1 } };
    const [lista] = riquadriDelVolo([mondo], VISTA);
    for (const k of lista) {
      const [z, , y] = k.split("/").map(Number);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(2 ** z);
    }
  });

  it("su uno schermo grande scarica solo la parte centrale (non svuota la cache)", () => {
    const grande = riquadriDelVolo([tratta], { w: 1920, h: 1080 })[0];
    const tetto = riquadriDelVolo([tratta], { w: 600, h: 1000 })[0];
    expect(grande).toEqual(tetto);
    // e il telefono, sotto il tetto, non viene toccato
    expect(riquadriDelVolo([tratta], VISTA)[0].length).toBeLessThan(tetto.length);
  });

  it("per un viaggio vero resta un numero ragionevole di riquadri", () => {
    // il viaggio di prova (Milano → Innsbruck → Vienna → Budapest), decollo incluso:
    // misurato 91 riquadri ≈ 5 MB. Un tetto largo: se esplode, qualcosa si è rotto.
    const sezioni: SezioneVolo[] = [
      { da: { lon: 14, lat: 46.5, zoom: 4.6 }, a: { ...MILANO, zoom: 6.5 } },
      tratta,
      { da: { ...INNSBRUCK, zoom: 6.5 }, a: { lon: 16.37, lat: 48.21, zoom: 6.5 } },
      { da: { lon: 16.37, lat: 48.21, zoom: 6.5 }, a: { lon: 19.04, lat: 47.5, zoom: 6.5 } },
    ];
    const tot = riquadriDelVolo(sezioni, VISTA).flat().length;
    expect(tot).toBeGreaterThan(30);
    expect(tot).toBeLessThan(200);
  });
});
