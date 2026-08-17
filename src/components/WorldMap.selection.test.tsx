import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { WorldMap } from "./WorldMap";
import type { Trip } from "@/lib/storage";

/**
 * Verifica che la SELEZIONE di un viaggio sul globo sia incrementale: prima
 * ogni tap ricostruiva da zero tutte le source/layer MapLibre (teardown
 * completo, causa storica del leak WebGL). Qui la mappa è finta e registra
 * ogni chiamata, così il comportamento è verificabile senza WebGL.
 */

// ── Mappa finta ──────────────────────────────────────────────────────────────
class FakeMap {
  layers = new Map<string, any>();
  sources = new Map<string, any>();
  handlers: Record<string, ((payload?: any) => void)[]> = {};
  calls: { op: string; id: string }[] = [];
  flyToCount = 0;
  setDataCalls: { id: string; features: any[] }[] = [];
  paintCalls: { id: string; prop: string; value: any }[] = [];

  constructor(opts: any) { this.opts = opts; }
  opts: any;

  on(ev: string, a?: any, b?: any) {
    const fn = typeof a === "function" ? a : b;
    const key = typeof a === "string" ? `${ev}:${a}` : ev;
    (this.handlers[key] ??= []).push(fn);
    if (ev === "load") setTimeout(() => fn({}), 0);
  }
  off() {}
  fire(key: string, payload: any = {}) { (this.handlers[key] ?? []).forEach(f => f(payload)); }

  addSource(id: string, src: any) {
    this.sources.set(id, {
      ...src,
      setData: (data: any) => this.setDataCalls.push({ id, features: data.features ?? [] }),
    });
    this.calls.push({ op: "addSource", id });
  }
  removeSource(id: string) { this.sources.delete(id); this.calls.push({ op: "removeSource", id }); }
  getSource(id: string) { return this.sources.get(id); }
  addLayer(def: any) { this.layers.set(def.id, def); this.calls.push({ op: "addLayer", id: def.id }); }
  removeLayer(id: string) { this.layers.delete(id); this.calls.push({ op: "removeLayer", id }); }
  getLayer(id: string) { return this.layers.get(id); }
  setPaintProperty(id: string, prop: string, value: any) { this.paintCalls.push({ id, prop, value }); }
  setLayoutProperty() {}
  setFilter() {}
  setLayerZoomRange() {}
  setFog() {}
  getStyle() { return { layers: Array.from(this.layers.values()) }; }
  getCanvas() { return { style: {} }; }
  queryRenderedFeatures() { return []; }
  flyTo() { this.flyToCount++; }
  getCenter() { return { lng: 0, lat: 0 }; }
  setCenter() {}
  getZoom() { return 1; }
  resize() {}
  remove() {}
  hasImage() { return true; }
  addImage() {}
  loaded() { return true; }
  isStyleLoaded() { return true; }
}

let lastMap: FakeMap | null = null;

vi.mock("maplibre-gl", () => ({
  default: {
    Map: class { constructor(opts: any) { const m = new FakeMap(opts); lastMap = m; return m as any; } },
    Marker: class {
      setLngLat() { return this; }
      addTo() { return this; }
      remove() { return this; }
      getElement() { return document.createElement("div"); }
    },
    Popup: class {
      setLngLat() { return this; } setHTML() { return this; }
      addTo() { return this; } remove() { return this; }
    },
  },
}));

// fetchMapStyle fa una fetch reale: stub con uno style minimo.
global.fetch = vi.fn(() => Promise.resolve({
  ok: true, json: () => Promise.resolve({ version: 8, layers: [], sources: {} }),
} as Response)) as any;

const trip = (over: Partial<Trip>): Trip => ({
  id: "x", created_at: "2026-01-01T00:00:00.000Z", title: "T", city: "C",
  country: "Italia", country_code: "IT", trip_date: "2026-01-01", date_end: null,
  latitude: 41.9, longitude: 12.5, home_latitude: 45.46, home_longitude: 9.19,
  home_label: "Milano", notes: null, transport_mode: "plane", waypoints: [],
  ...over,
} as Trip);

const SECCO = trip({ id: "secco", city: "Roma" });
const MULTI = trip({
  id: "multi", city: "Vienna", latitude: 48.2, longitude: 16.37, transport_mode: "train",
  waypoints: [{ id: "w1", city: "Innsbruck", country: "Austria", country_code: "AT", transport_mode: "car", lat: 47.27, lon: 11.39 }] as any,
});

// Riferimento STABILE, come in produzione: la Home tiene i viaggi in uno
// state, quindi selezionare un pallino cambia solo selectedId — l'array
// trips resta identico e `ordered` (useMemo su [trips]) non si invalida.
const TRIPS = [SECCO, MULTI];

/** Attende che la mappa finta sia creata e l'evento load processato. */
async function settle() {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 10));
    if (lastMap && lastMap.getSource("trips-labels")) return;
  }
}

describe("WorldMap — la selezione non ricostruisce i layer", () => {
  beforeEach(() => { lastMap = null; });

  it("selezionare un viaggio NON ricrea le source dei pallini", async () => {
    const { rerender } = render(<WorldMap trips={TRIPS} selectedId={null} />);
    await settle();
    const map = lastMap!;
    const sourceObjBefore = map.getSource("trips-single");
    map.calls.length = 0; // azzera il diario: guardo solo cosa fa la SELEZIONE

    rerender(<WorldMap trips={TRIPS} selectedId="secco" />);
    await new Promise(r => setTimeout(r, 50));

    const touched = map.calls.filter(c => /^trips-(single|multi|waypoints)/.test(c.id));
    expect(touched).toEqual([]); // nessun add/remove sui pallini
    expect(map.getSource("trips-single")).toBe(sourceObjBefore); // stessa istanza
  });

  it("il viaggio senza tappe riceve la sua rotta rosa solo da selezionato", async () => {
    const { rerender } = render(<WorldMap trips={TRIPS} selectedId={null} />);
    await settle();
    const map = lastMap!;
    expect(map.getLayer("route-secco")).toBeUndefined();

    rerender(<WorldMap trips={TRIPS} selectedId="secco" />);
    await new Promise(r => setTimeout(r, 50));
    expect(map.getLayer("route-secco")?.paint["line-color"]).toBe("#f472b6");

    rerender(<WorldMap trips={TRIPS} selectedId={null} />);
    await new Promise(r => setTimeout(r, 50));
    expect(map.getLayer("route-secco")).toBeUndefined();
  });

  it("il multi-tappa cambia solo spessore/opacità, la sua rotta resta sempre", async () => {
    const { rerender } = render(<WorldMap trips={TRIPS} selectedId={null} />);
    await settle();
    const map = lastMap!;
    expect(map.getLayer("route-multi")).toBeDefined(); // visibile anche non selezionato
    map.paintCalls.length = 0;

    rerender(<WorldMap trips={TRIPS} selectedId="multi" />);
    await new Promise(r => setTimeout(r, 50));
    expect(map.paintCalls).toEqual([
      { id: "route-multi", prop: "line-width", value: 2.5 },
      { id: "route-multi", prop: "line-opacity", value: 0.9 },
    ]);
    expect(map.getLayer("route-multi")).toBeDefined();
  });

  it("le etichette città si aggiornano con setData su una source persistente", async () => {
    const { rerender } = render(<WorldMap trips={TRIPS} selectedId={null} />);
    await settle();
    const map = lastMap!;
    const labelSource = map.getSource("trips-labels");
    map.setDataCalls.length = 0;

    rerender(<WorldMap trips={TRIPS} selectedId="multi" />);
    await new Promise(r => setTimeout(r, 50));

    const last = map.setDataCalls.at(-1)!;
    expect(last.id).toBe("trips-labels");
    // casa + tappa intermedia + destinazione
    expect(last.features.map(f => f.properties.name)).toEqual(["Milano", "Innsbruck", "Vienna"]);
    expect(map.getSource("trips-labels")).toBe(labelSource); // mai ricreata

    rerender(<WorldMap trips={TRIPS} selectedId={null} />);
    await new Promise(r => setTimeout(r, 50));
    expect(map.setDataCalls.at(-1)!.features).toEqual([]); // svuotate, non rimosse
  });

  it("un solo flyTo per selezione (prima erano due animazioni sovrapposte)", async () => {
    const { rerender } = render(<WorldMap trips={TRIPS} selectedId={null} />);
    await settle();
    const map = lastMap!;
    map.flyToCount = 0;

    rerender(<WorldMap trips={TRIPS} selectedId="secco" />);
    await new Promise(r => setTimeout(r, 50));
    expect(map.flyToCount).toBe(1);
  });
});

// Le TAPPE intermedie aprono la mini-card del loro viaggio: prima toccare
// Trieste sul globo non faceva nulla, perché l'apertura era registrata solo
// sui pallini di destinazione e le feature delle tappe non portavano l'id.
describe("WorldMap — anche le tappe aprono il viaggio", () => {
  beforeEach(() => { lastMap = null; });

  it("le feature delle tappe portano l'id del viaggio", async () => {
    render(<WorldMap trips={TRIPS} selectedId={null} />);
    await settle();
    const src = lastMap!.getSource("trips-waypoints");
    expect(src).toBeTruthy();
    const props = src.data.features.map((f: any) => f.properties);
    expect(props.every((p: any) => p.id === "multi")).toBe(true);
  });

  it("il click su una tappa seleziona il suo viaggio", async () => {
    const onSelectTrip = vi.fn();
    render(<WorldMap trips={TRIPS} selectedId={null} onSelectTrip={onSelectTrip} />);
    await settle();
    lastMap!.fire("click:trips-waypoints", { features: [{ properties: { id: "multi" } }] });
    expect(onSelectTrip).toHaveBeenCalledWith(expect.objectContaining({ id: "multi" }));
  });

  it("il click sull'icona del mezzo sulla tappa funziona uguale", async () => {
    const onSelectTrip = vi.fn();
    render(<WorldMap trips={TRIPS} selectedId={null} onSelectTrip={onSelectTrip} />);
    await settle();
    lastMap!.fire("click:trips-waypoints-icons", { features: [{ properties: { id: "multi" } }] });
    expect(onSelectTrip).toHaveBeenCalledWith(expect.objectContaining({ id: "multi" }));
  });

  // La trappola scoperta dal vivo: rese cliccabili le tappe, il tocco apriva
  // ANCHE il popup città "Aggiungi come viaggio" (un pannello a tutto schermo
  // che poi mangiava ogni tocco successivo). I layer delle tappe devono stare
  // nella guardia del click generico sulla mappa.
  it("le tappe sono fra i layer che silenziano il popup città", async () => {
    render(<WorldMap trips={TRIPS} selectedId={null} onSelectCity={vi.fn()} />);
    await settle();
    const map = lastMap!;
    const interrogati: string[][] = [];
    map.queryRenderedFeatures = (_p?: any, opts?: any) => { if (opts?.layers) interrogati.push(opts.layers); return []; };
    map.fire("click", { point: { x: 1, y: 1 }, lngLat: { lng: 0, lat: 0 } });
    expect(interrogati.some(l => l.includes("trips-waypoints"))).toBe(true);
    expect(interrogati.some(l => l.includes("trips-waypoints-icons"))).toBe(true);
  });
});
