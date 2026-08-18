import { describe, it, expect } from "vitest";
import { distanceKm } from "./geo";
describe("distanceKm", () => {
  it("stesso punto → 0 km", () => {
    expect(distanceKm(41.9, 12.5, 41.9, 12.5)).toBe(0);
  });

  it("Milano → Roma ≈ 480 km (±20 km)", () => {
    const d = distanceKm(45.464, 9.19, 41.9, 12.5);
    expect(d).toBeGreaterThan(460);
    expect(d).toBeLessThan(500);
  });

  it("polo nord → polo sud ≈ 20000 km (±200 km)", () => {
    const d = distanceKm(90, 0, -90, 0);
    expect(d).toBeGreaterThan(19800);
    expect(d).toBeLessThan(20200);
  });

  it("coordinate negative (Buenos Aires → Sydney) > 10000 km", () => {
    const d = distanceKm(-34.6, -58.4, -33.9, 151.2);
    expect(d).toBeGreaterThan(10000);
  });

  it("ritorna un numero intero (Math.round)", () => {
    const d = distanceKm(45.464, 9.19, 41.9, 12.5);
    expect(Number.isInteger(d)).toBe(true);
  });
});
