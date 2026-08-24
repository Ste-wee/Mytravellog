import { describe, it, expect } from "vitest";
import { gradiDiRotazione, GRADI_AL_SECONDO, PASSO_MAX_MS } from "./rotazione";

describe("gradiDiRotazione — il passo del globo è a tempo, non per frame", () => {
  it("un secondo pieno vale sei gradi... ma solo fino al tetto", () => {
    // 1000ms verrebbe tagliato a PASSO_MAX_MS: è proprio il senso del tetto.
    expect(gradiDiRotazione(1000)).toBeCloseTo(GRADI_AL_SECONDO * (PASSO_MAX_MS / 1000), 6);
  });

  it("a 60 fps fa lo stesso passo di prima (0,1° per frame)", () => {
    // Il valore storico, quello che l'occhio conosce: 16,7ms → 0,1°.
    expect(gradiDiRotazione(1000 / 60)).toBeCloseTo(0.1, 3);
  });

  it("a 30 fps il passo RADDOPPIA, così la velocità resta 6°/s", () => {
    // È il fix: prima erano 0,1° anche a 30 fps, cioè 3°/s — il globo
    // rallentava sui dispositivi lenti.
    const a30 = gradiDiRotazione(1000 / 30);
    expect(a30).toBeCloseTo(0.2, 3);
    expect(a30 / (1000 / 30 / 1000)).toBeCloseTo(GRADI_AL_SECONDO, 6);
  });

  it("la velocità è la stessa a qualunque frame rate (sotto il tetto)", () => {
    for (const fps of [60, 50, 30, 24, 15, 10]) {
      const dt = 1000 / fps;
      expect(gradiDiRotazione(dt) / (dt / 1000)).toBeCloseTo(GRADI_AL_SECONDO, 6);
    }
  });

  it("⚠️ IL TETTO: dopo una scheda in secondo piano il globo NON salta", () => {
    // requestAnimationFrame si ferma quando la scheda è nascosta: al ritorno il
    // primo dt vale l'intera assenza. Senza tetto sarebbero 300° di salto.
    expect(gradiDiRotazione(50_000)).toBeCloseTo(0.6, 6);
    expect(gradiDiRotazione(50_000)).toBe(gradiDiRotazione(PASSO_MAX_MS));
    // e comunque mai più di 0,6°, qualunque sia l'assenza
    for (const dt of [200, 1_000, 60_000, 3_600_000]) {
      expect(gradiDiRotazione(dt)).toBeLessThanOrEqual(0.6 + 1e-9);
    }
  });

  it("il primo frame (e i timestamp gemelli) non muovono nulla", () => {
    expect(gradiDiRotazione(0)).toBe(0);
    expect(gradiDiRotazione(-5)).toBe(0);   // orologio che va indietro
  });

  it("un dt malformato non produce NaN sulla longitudine", () => {
    // Un NaN qui arriverebbe fino a setCenter, e il globo sparirebbe.
    expect(gradiDiRotazione(NaN)).toBe(0);
    expect(gradiDiRotazione(Infinity)).toBe(0);
  });
});
