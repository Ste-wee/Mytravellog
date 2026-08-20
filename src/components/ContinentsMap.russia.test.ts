import { describe, it, expect } from "vitest";
import { paeseDelPunto, areaPoligonoCheContiene, type CountryFeat } from "./ContinentsMap";

/**
 * Segnalazione di Stefano (2026-08-20): "la mappa mostra la Russia come paese
 * visitato" — con un solo viaggio in Lapponia (Svezia).
 *
 * Causa: il poligono continentale della Russia va da -180° a +180° (scavalca
 * l'antimeridiano in Chukotka). Il ray casting su una forma che avvolge il
 * mondo dà falsi positivi alle latitudini artiche, e il codice si fermava al
 * PRIMO paese che conteneva il punto: nel world-atlas la Russia è la 18ª
 * feature, la Svezia la 110ª.
 */

/** Rettangolo lon/lat come poligono GeoJSON (un solo anello). */
const rett = (minLon: number, minLat: number, maxLon: number, maxLat: number): number[][][] =>
  [[[minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat]]];

const paese = (id: string, polygons: number[][][][]): CountryFeat => {
  let mnLo = Infinity, mxLo = -Infinity, mnLa = Infinity, mxLa = -Infinity;
  for (const p of polygons) for (const r of p) for (const [lo, la] of r) {
    if (lo < mnLo) mnLo = lo; if (lo > mxLo) mxLo = lo;
    if (la < mnLa) mnLa = la; if (la > mxLa) mxLa = la;
  }
  return { id, name: id, path: "", centroid: [0, 0], polygons, bbox: [mnLo, mnLa, mxLo, mxLa] };
};

// Il colosso che avvolge il mondo (la Russia del world-atlas) e la Svezia,
// molto più piccola, che contiene davvero Kiruna e Abisko.
const RUSSIA_AVVOLGENTE = paese("russia", [rett(-180, 41, 180, 82)]);
const SVEZIA = paese("svezia", [rett(11, 55, 24, 69)]);
const KIRUNA: [number, number] = [20.225, 67.856];
const ABISKO: [number, number] = [18.833, 68.351];

describe("paeseDelPunto — l'antimeridiano non deve rubare i punti", () => {
  it("Kiruna e Abisko finiscono in Svezia anche se la Russia viene PRIMA nell'elenco", () => {
    const countries = [RUSSIA_AVVOLGENTE, SVEZIA];   // ordine del world-atlas
    expect(paeseDelPunto(KIRUNA[0], KIRUNA[1], countries)?.id).toBe("svezia");
    expect(paeseDelPunto(ABISKO[0], ABISKO[1], countries)?.id).toBe("svezia");
  });

  it("l'ordine dell'elenco non conta: vince sempre il poligono più piccolo", () => {
    expect(paeseDelPunto(KIRUNA[0], KIRUNA[1], [SVEZIA, RUSSIA_AVVOLGENTE])?.id).toBe("svezia");
  });

  it("un punto DAVVERO in Russia resta in Russia (nessun altro candidato)", () => {
    // Mosca: fuori dal rettangolo svedese, dentro quello russo
    expect(paeseDelPunto(37.618, 55.751, [RUSSIA_AVVOLGENTE, SVEZIA])?.id).toBe("russia");
  });

  it("un punto in mezzo all'oceano non appartiene a nessuno", () => {
    expect(paeseDelPunto(-30, 0, [RUSSIA_AVVOLGENTE, SVEZIA])).toBeNull();
  });

  it("il prefiltro del bbox non scarta punti validi ai bordi", () => {
    // esattamente sul confine sud della Svezia finta
    expect(paeseDelPunto(15, 60, [RUSSIA_AVVOLGENTE, SVEZIA])?.id).toBe("svezia");
  });
});

describe("areaPoligonoCheContiene", () => {
  it("Infinity se il punto è fuori da tutti i poligoni", () => {
    expect(areaPoligonoCheContiene(0, 0, [rett(10, 10, 20, 20)])).toBe(Infinity);
  });

  it("fra due poligoni sovrapposti torna l'area del più piccolo", () => {
    const grande = rett(0, 0, 100, 100), piccolo = rett(40, 40, 50, 50);
    expect(areaPoligonoCheContiene(45, 45, [grande, piccolo])).toBe(100);
  });

  it("un punto dentro un BUCO non conta come dentro", () => {
    // anello esterno + buco che contiene il punto
    const conBuco: number[][][] = [
      ...rett(0, 0, 100, 100),
      [[40, 40], [60, 40], [60, 60], [40, 60], [40, 40]],
    ];
    expect(areaPoligonoCheContiene(50, 50, [conBuco])).toBe(Infinity);
  });
});
