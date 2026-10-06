import { describe, it, expect } from "vitest";
import {
  fmtDistance,
  fmtAltitude,
  formatDistanceKm,
  formatAltitudeM,
} from "./settings";

describe("fmtDistance", () => {
  it("1000 km metric → include '1.000' (col separatore) e 'km'", () => {
    const r = fmtDistance(1000, "metric");
    expect(r).toContain("1.000");
    expect(r).toContain("km");
  });

  it("1000 km imperial → 621 mi", () => {
    expect(fmtDistance(1000, "imperial")).toBe("621 mi");
  });

  it("null → '—'", () => {
    expect(fmtDistance(null, "metric")).toBe("—");
    expect(fmtDistance(undefined, "imperial")).toBe("—");
  });

  it("0 km → '0 km'", () => {
    expect(fmtDistance(0, "metric")).toBe("0 km");
  });

  it("valore negativo non crasha", () => {
    expect(() => fmtDistance(-100, "metric")).not.toThrow();
  });
});

describe("fmtAltitude", () => {
  it("1000 m metric → include '1.000' (col separatore) e 'm'", () => {
    const r = fmtAltitude(1000, "metric");
    expect(r).toContain("1.000");
    expect(r).toContain("m");
  });

  it("1000 m imperial → 3281 ft", () => {
    expect(fmtAltitude(1000, "imperial")).toBe("3.281 ft");
  });

  it("null → '—'", () => {
    expect(fmtAltitude(null, "metric")).toBe("—");
    expect(fmtAltitude(undefined, "imperial")).toBe("—");
  });

  it("arrotonda decimali in metric", () => {
    const r = fmtAltitude(100.7, "metric");
    expect(r).toContain("101");
  });
});

describe("alias backward-compat: formatDistanceKm / formatAltitudeM", () => {
  it("formatDistanceKm è identico a fmtDistance", () => {
    expect(formatDistanceKm(500, "metric")).toBe(fmtDistance(500, "metric"));
    expect(formatDistanceKm(null, "imperial")).toBe(fmtDistance(null, "imperial"));
  });

  it("formatAltitudeM è identico a fmtAltitude", () => {
    expect(formatAltitudeM(2000, "imperial")).toBe(fmtAltitude(2000, "imperial"));
    expect(formatAltitudeM(null, "metric")).toBe(fmtAltitude(null, "metric"));
  });

});
