import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { splitRingAtAntimeridian, deriveCountryId, allVisitedPoints, ContinentsMap, __clearCountryFeatsCache } from "./ContinentsMap";
import { __clearWorldAtlasCache } from "@/lib/worldAtlas";
import type { Trip } from "@/lib/storage";
import { render, waitFor } from "@testing-library/react";
import React from "react";

describe("allVisitedPoints", () => {
  it("include la destinazione finale del viaggio", () => {
    const trip = { latitude: 41.9, longitude: 12.5, waypoints: [] } as unknown as Trip;
    expect(allVisitedPoints([trip])).toEqual([{ lat: 41.9, lon: 12.5 }]);
  });

  it("include anche ogni tappa (waypoint) intermedia, non solo la destinazione", () => {
    const trip = {
      latitude: -34.6, longitude: -58.4, // Buenos Aires (destinazione)
      waypoints: [
        { city: "Il Cairo", country: "Egitto", transport_mode: "car", lat: 30.06, lon: 31.25 },
        { city: "Tokyo", country: "Giappone", transport_mode: "walk", lat: 35.68, lon: 139.69 },
      ],
    } as unknown as Trip;
    const points = allVisitedPoints([trip]);
    expect(points).toHaveLength(3);
    expect(points).toContainEqual({ lat: 30.06, lon: 31.25 });
    expect(points).toContainEqual({ lat: 35.68, lon: 139.69 });
    expect(points).toContainEqual({ lat: -34.6, lon: -58.4 });
  });

  it("salta i waypoint senza coordinate (viaggi salvati prima che le tappe avessero lat/lon)", () => {
    const trip = {
      latitude: 41.9, longitude: 12.5,
      waypoints: [{ city: "Sconosciuta", country: "?", transport_mode: "car" }],
    } as unknown as Trip;
    expect(allVisitedPoints([trip])).toEqual([{ lat: 41.9, lon: 12.5 }]);
  });
});

describe("deriveCountryId", () => {
  it("usa l'id numerico se presente", () => {
    expect(deriveCountryId({ id: 380 }, 0)).toBe("380");
  });

  it("ricade sul nome se l'id manca (es. Antartide nel world-atlas)", () => {
    expect(deriveCountryId({ properties: { name: "Antarctica" } }, 7)).toBe("Antarctica");
  });

  it("ricade sull'indice se manca sia id che nome", () => {
    expect(deriveCountryId({}, 3)).toBe("unknown-3");
  });

  it("due feature senza id ma con nomi diversi non collidono", () => {
    const a = deriveCountryId({ properties: { name: "Antarctica" } }, 1);
    const b = deriveCountryId({ properties: { name: "Somaliland" } }, 2);
    expect(a).not.toBe(b);
  });
});

describe("splitRingAtAntimeridian", () => {
  it("keeps a normal ring as a single segment", () => {
    const ring = [
      [10, 40],
      [12, 41],
      [14, 39],
      [10, 40],
    ];
    const segs = splitRingAtAntimeridian(ring);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toHaveLength(4);
  });

  it("splits a ring that crosses the antimeridian (Russia-like)", () => {
    // Jumps from +178 to -179 → must split.
    const ring = [
      [170, 65],
      [178, 66],
      [-179, 65],
      [-175, 64],
    ];
    const segs = splitRingAtAntimeridian(ring);
    expect(segs.length).toBeGreaterThanOrEqual(2);
    // No segment should contain points on opposite sides of the antimeridian
    for (const seg of segs) {
      for (let i = 1; i < seg.length; i++) {
        expect(Math.abs(seg[i][0] - seg[i - 1][0])).toBeLessThanOrEqual(180);
      }
    }
  });

  it("splits multiple times for rings crossing the antimeridian repeatedly (Fiji-like)", () => {
    const ring = [
      [177, -17],
      [-178, -17],
      [178, -18],
      [-177, -18],
    ];
    const segs = splitRingAtAntimeridian(ring);
    expect(segs.length).toBeGreaterThanOrEqual(3);
  });

  it("handles empty rings", () => {
    expect(splitRingAtAntimeridian([])).toEqual([]);
  });
});

describe("ContinentsMap — cache dei confini tra i mount", () => {
  beforeEach(() => { __clearCountryFeatsCache(); __clearWorldAtlasCache(); });
  afterEach(() => vi.restoreAllMocks());

  const fakeTopo = {
    objects: { countries: { type: "GeometryCollection", geometries: [] } },
    type: "Topology", arcs: [],
  };

  function renderMap() {
    return render(React.createElement(ContinentsMap, { trips: [] }));
  }

  it("scarica il topojson al primo mount", async () => {
    global.fetch = vi.fn().mockResolvedValue({ json: async () => fakeTopo });
    renderMap();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it("un secondo mount non rifà il fetch: usa la cache in memoria", async () => {
    global.fetch = vi.fn().mockResolvedValue({ json: async () => fakeTopo });
    const first = renderMap();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    first.unmount();

    renderMap();
    await new Promise(r => setTimeout(r, 10));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("azzerate ENTRAMBE le cache (feats + topojson condiviso), il mount successivo rifà il fetch", async () => {
    global.fetch = vi.fn().mockResolvedValue({ json: async () => fakeTopo });
    const first = renderMap();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    first.unmount();

    // Due livelli: i feats calcolati (qui) e il topojson grezzo (worldAtlas,
    // condiviso con posterSvg). Svuotare solo i feats NON rifà il fetch —
    // è il punto della condivisione: il file viaggia una volta sola.
    __clearCountryFeatsCache();
    const second = renderMap();
    await new Promise(r => setTimeout(r, 10));
    expect(fetch).toHaveBeenCalledTimes(1);
    second.unmount();

    __clearCountryFeatsCache();
    __clearWorldAtlasCache();
    renderMap();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
});
