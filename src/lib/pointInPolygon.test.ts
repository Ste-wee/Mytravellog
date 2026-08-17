import { describe, it, expect } from "vitest";
import { pointInPolygon, pointInPolygons } from "./pointInPolygon";

// Quadrato 0..10 con un buco 4..6
const conBuco: GeoJSON.Position[][] = [
  [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
  [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
];

describe("pointInPolygon", () => {
  it("dentro il contorno esterno", () => {
    expect(pointInPolygon(2, 2, [conBuco[0]])).toBe(true);
  });

  it("fuori dal contorno", () => {
    expect(pointInPolygon(20, 20, [conBuco[0]])).toBe(false);
  });

  it("dentro un buco = FUORI dal poligono (parità degli incroci)", () => {
    expect(pointInPolygon(5, 5, conBuco)).toBe(false);
    expect(pointInPolygon(2, 5, conBuco)).toBe(true); // dentro, ma non nel buco
  });

  it("non esplode su anelli vuoti o degeneri", () => {
    expect(pointInPolygon(1, 1, [])).toBe(false);
    expect(pointInPolygon(1, 1, [[]])).toBe(false);
    expect(pointInPolygon(1, 1, [[[0, 0]]])).toBe(false);
  });

  // Un segmento orizzontale alla stessa latitudine del punto: senza l'epsilon
  // nel denominatore sarebbe una divisione per zero.
  it("regge i segmenti orizzontali sulla latitudine del punto", () => {
    const piatto: GeoJSON.Position[][] = [[[0, 5], [10, 5], [10, 10], [0, 10], [0, 5]]];
    expect(() => pointInPolygon(5, 5, piatto)).not.toThrow();
  });
});

describe("pointInPolygons", () => {
  it("true se il punto cade in una qualsiasi delle isole", () => {
    const isole: GeoJSON.Position[][][] = [
      [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
      [[[10, 10], [12, 10], [12, 12], [10, 12], [10, 10]]],
    ];
    expect(pointInPolygons(11, 11, isole)).toBe(true);
    expect(pointInPolygons(5, 5, isole)).toBe(false);
  });
});
