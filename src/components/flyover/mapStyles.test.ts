import { describe, it, expect } from "vitest";
import { buildConstellationStyle } from "./mapStyles";

describe("buildConstellationStyle — vista costellazione (master di stampa)", () => {
  const style = buildConstellationStyle();

  it("ha il fondo nero", () => {
    const bg = style.layers.find((l: any) => l.type === "background");
    expect(bg?.paint["background-color"]).toBe("#000000");
  });

  it("confini e coste tenui in bianco (fanno da sfondo stellato)", () => {
    const borders = style.layers.find((l: any) => l.id === "country-borders");
    const coast = style.layers.find((l: any) => l.id === "coastline");
    expect(borders?.type).toBe("line");
    expect(coast?.type).toBe("line");
    expect(String(borders?.paint["line-color"])).toContain("255,255,255");
  });

  it("è piatta (nessuna proiezione globo): master di stampa senza prospettiva", () => {
    expect(style.projection).toBeUndefined();
  });
});
