import { describe, it, expect } from "vitest";
import { riconosciBase } from "./base";

// La sequenza è quella del form: indice 0 = casa, l'ultima fermata = destinazione.
const MILANO = { lat: 45.4642, lon: 9.19 };
const FIRENZE = { lat: 43.7696, lon: 11.2558 };
const SIENA = { lat: 43.3188, lon: 11.3308 };
const PISA = { lat: 43.7228, lon: 10.4017 };
const SANGIMIGNANO = { lat: 43.4676, lon: 11.0431 };
const ROMA = { lat: 41.9028, lon: 12.4964 };

describe("riconosciBase — il posto dove si dorme si deduce dalle coordinate", () => {
  it("il viaggio in Toscana: base a Firenze, due gite", () => {
    const r = riconosciBase([MILANO, FIRENZE, SIENA, FIRENZE, PISA, FIRENZE]);
    expect(r).not.toBeNull();
    expect(r!.baseIdx).toBe(1);
    expect(r!.occorrenze).toEqual([1, 3, 5]);
    expect(r!.gite).toEqual([{ tappe: [2] }, { tappe: [4] }]);
    expect(r!.prima).toEqual([]);
    expect(r!.dopo).toEqual([]);
    expect(r!.destinazioneEBase).toBe(true);
  });

  it("un viaggio lineare non ha base", () => {
    expect(riconosciBase([MILANO, FIRENZE, SIENA, ROMA])).toBeNull();
  });

  it("una gita può avere più tappe", () => {
    const r = riconosciBase([MILANO, FIRENZE, SIENA, SANGIMIGNANO, FIRENZE]);
    expect(r!.gite).toEqual([{ tappe: [2, 3] }]);
  });

  it("la stessa città due volte DI FILA non è una base (è un refuso)", () => {
    expect(riconosciBase([MILANO, FIRENZE, FIRENZE, SIENA])).toBeNull();
  });

  it("ripassare da casa a metà viaggio non fa di casa una base", () => {
    // Milano → Torino → Milano → Roma: casa rivisitata, ma resta casa.
    const TORINO = { lat: 45.0703, lon: 7.6869 };
    expect(riconosciBase([MILANO, TORINO, MILANO, ROMA])).toBeNull();
  });

  it("il viaggio che prosegue dopo la base: la coda finisce in `dopo`", () => {
    const r = riconosciBase([MILANO, FIRENZE, SIENA, FIRENZE, ROMA]);
    expect(r!.occorrenze).toEqual([1, 3]);
    expect(r!.dopo).toEqual([4]);
    expect(r!.destinazioneEBase).toBe(false);
  });

  it("le tappe di avvicinamento finiscono in `prima`", () => {
    const BOLOGNA = { lat: 44.4949, lon: 11.3426 };
    const r = riconosciBase([MILANO, BOLOGNA, FIRENZE, SIENA, FIRENZE]);
    expect(r!.prima).toEqual([1]);
    expect(r!.baseIdx).toBe(2);
  });

  it("con due posti ripetuti vince il più rivisitato", () => {
    // Firenze ×3, Siena ×2 → base Firenze.
    const r = riconosciBase([MILANO, FIRENZE, SIENA, FIRENZE, SIENA, FIRENZE]);
    expect(r!.baseIdx).toBe(1);
    expect(r!.occorrenze).toEqual([1, 3, 5]);
  });

  it("la tolleranza è da città, non da via: 200 m sono lo stesso posto", () => {
    const firenzeCentro = { lat: 43.7696, lon: 11.2558 };
    const firenzeStazione = { lat: 43.7710, lon: 11.2540 };   // ~200 m
    const r = riconosciBase([MILANO, firenzeCentro, SIENA, firenzeStazione]);
    expect(r).not.toBeNull();
    expect(r!.occorrenze).toEqual([1, 3]);
  });

  it("fermate senza coordinate non mandano in tilt il riconoscimento", () => {
    const r = riconosciBase([MILANO, FIRENZE, { lat: null, lon: null }, FIRENZE]);
    expect(r).not.toBeNull();                      // la gita è la tappa senza coordinate
    expect(r!.gite).toEqual([{ tappe: [2] }]);
  });

  it("meno di quattro fermate: mai una base", () => {
    expect(riconosciBase([MILANO, FIRENZE, FIRENZE])).toBeNull();
    expect(riconosciBase([MILANO, FIRENZE])).toBeNull();
  });
});
