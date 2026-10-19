import { describe, it, expect } from "vitest";
import { costeDaTerre } from "./worldAtlas";

const quadrato = (x: number, y: number, l: number) => [[x, y], [x + l, y], [x + l, y + l], [x, y + l], [x, y]];

describe("costeDaTerre", () => {
  it("ogni anello delle terre diventa una linea, buchi compresi (laghi e mari interni)", () => {
    const terre: GeoJSON.Feature = {
      type: "Feature", properties: {},
      geometry: { type: "MultiPolygon", coordinates: [[quadrato(0, 0, 10), quadrato(2, 2, 2)], [quadrato(20, 0, 5)]] },
    };
    const c = costeDaTerre(terre);
    expect(c.geometry.type).toBe("MultiLineString");
    expect(c.geometry.coordinates).toHaveLength(3);
    expect(c.geometry.coordinates[1]).toEqual(quadrato(2, 2, 2));
  });

  it("anche da una FeatureCollection, e ignora ciò che non è un poligono", () => {
    const c = costeDaTerre({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [quadrato(0, 0, 1)] } },
        { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [5, 5] } },
      ],
    });
    expect(c.geometry.coordinates).toEqual([quadrato(0, 0, 1)]);
  });
});
