import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { WorldMap } from "./WorldMap";
import { __clearPaesiCache } from "@/lib/paesi";
import { __clearWorldAtlasCache } from "@/lib/worldAtlas";
import type { Trip } from "@/lib/storage";

/**
 * Modalità paesi: scorrendo il dito sulla riga dei numeri il globo smette di
 * mostrare i pallini dei viaggi e colora i PAESI visitati, con la bandiera al
 * centro. Qui la mappa è finta: si verifica cosa viene aggiunto, nascosto e
 * ripulito, senza WebGL.
 */

class FakeMap {
  layers = new Map<string, any>();
  sources = new Map<string, any>();
  visibilita: Record<string, string> = {};
  immagini = new Set<string>();
  handlers: Record<string, ((p?: any) => void)[]> = {};
  voli: { zoom?: number }[] = [];
  constructor(public opts: any) {}
  on(ev: string, a?: any, b?: any) {
    const fn = typeof a === "function" ? a : b;
    (this.handlers[typeof a === "string" ? `${ev}:${a}` : ev] ??= []).push(fn);
    if (ev === "load") setTimeout(() => fn({}), 0);
  }
  /** Registrati, NON eseguiti subito: il test decide quando il volo finisce. */
  onceHandlers: Record<string, (() => void)[]> = {};
  once(ev: string, fn: () => void) { (this.onceHandlers[ev] ??= []).push(fn); }
  fineVolo() { (this.onceHandlers["moveend"] ?? []).forEach(f => f()); this.onceHandlers["moveend"] = []; }
  off() {}
  addSource(id: string, src: any) { this.sources.set(id, { ...src, setData: () => {} }); }
  removeSource(id: string) { this.sources.delete(id); }
  getSource(id: string) { return this.sources.get(id); }
  addLayer(def: any) { this.layers.set(def.id, def); }
  removeLayer(id: string) { this.layers.delete(id); }
  getLayer(id: string) { return this.layers.get(id); }
  setPaintProperty() {}
  storiaVisibilita: { id: string; val: string }[] = [];
  setLayoutProperty(id: string, prop: string, val: string) {
    if (prop !== "visibility") return;
    this.visibilita[id] = val;
    this.storiaVisibilita.push({ id, val });
  }
  setFilter() {}
  setLayerZoomRange() {}
  getStyle() { return { layers: [...this.layers.values()] }; }
  getCanvas() { return { style: {} }; }
  queryRenderedFeatures() { return []; }
  flyTo(o: any) { this.voli.push(o); }
  getCenter() { return { lng: 10, lat: 45 }; }
  setCenter() {}
  getZoom() { return 0.5; }
  resize() {}
  remove() {}
  hasImage(id: string) { return this.immagini.has(id); }
  addImage(id: string) { this.immagini.add(id); }
  loaded() { return true; }
  isStyleLoaded() { return true; }
}

let lastMap: FakeMap | null = null;

vi.mock("maplibre-gl", () => ({
  default: {
    Map: class { constructor(o: any) { const m = new FakeMap(o); lastMap = m; return m as any; } },
    Marker: class { setLngLat() { return this; } addTo() { return this; } remove() { return this; } getElement() { return document.createElement("div"); } },
    Popup: class { setLngLat() { return this; } setHTML() { return this; } addTo() { return this; } remove() { return this; } },
  },
}));

// Un mondo finto di due paesi: un quadrato sull'Italia e uno sull'Austria.
const quadratoTopo = (nome: string, a: number, b: number, c: number, d: number) => ({
  type: "Feature", id: nome, properties: { name: nome },
  geometry: { type: "Polygon", coordinates: [[[a, b], [c, b], [c, d], [a, d], [a, b]]] },
});

beforeEach(() => {
  lastMap = null;
  __clearPaesiCache();
  __clearWorldAtlasCache();
  global.fetch = vi.fn((url: any) => {
    const u = String(url);
    if (u.includes("world-atlas")) {
      // loadWorldAtlasCountries passa da topojson: qui stubbo il livello sopra
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ version: 8, layers: [], sources: {} }) } as Response);
    }
    if (u.includes("flagcdn")) return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob()) } as unknown as Response);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ version: 8, layers: [], sources: {} }) } as Response);
  }) as any;
});
afterEach(() => { vi.restoreAllMocks(); });

vi.mock("@/lib/worldAtlas", async (importOriginal) => {
  const vero = await importOriginal<typeof import("@/lib/worldAtlas")>();
  return {
    ...vero,
    loadWorldAtlasCountries: vi.fn(async () => ({
      type: "FeatureCollection",
      features: [quadratoTopo("Italy", 6, 36, 19, 47), quadratoTopo("Austria", 9, 47.1, 17, 49)],
    })),
  };
});

// createImageBitmap non esiste in jsdom: le bandiere devono comunque arrivare
Object.defineProperty(globalThis, "createImageBitmap", {
  writable: true, value: vi.fn(async () => ({ width: 40, height: 30 })),
});

const trip = (over: Partial<Trip>): Trip => ({
  id: "x", created_at: "2026-01-01T00:00:00.000Z", title: "T", city: "Roma",
  country: "Italia", country_code: "IT", trip_date: "2026-01-01", date_end: null,
  latitude: 41.9, longitude: 12.5, home_latitude: 45.46, home_longitude: 9.19,
  home_label: "Milano", notes: null, transport_mode: "car", waypoints: [],
  ...over,
} as Trip);

const TRIPS = [trip({ id: "roma" })];

async function settle(giri = 40) {
  for (let i = 0; i < giri; i++) {
    await new Promise(r => setTimeout(r, 10));
    if (lastMap?.getSource("trips-labels")) break;
  }
}
const respira = () => new Promise(r => setTimeout(r, 60));

describe("WorldMap — modalità paesi", () => {
  it("spenta: nessun layer dei paesi, i viaggi si vedono", async () => {
    render(<WorldMap trips={TRIPS} selectedId={null} />);
    await settle();
    await respira();
    expect(lastMap!.getLayer("paesi-visitati-fill")).toBeUndefined();
    expect(lastMap!.visibilita["trips-single"]).not.toBe("none");
  });

  it("accesa: colora i paesi, mette le bandiere e nasconde i pallini", async () => {
    render(<WorldMap trips={TRIPS} selectedId={null} modalitaPaesi />);
    await settle();
    await respira(); await respira();
    expect(lastMap!.getLayer("paesi-visitati-fill")).toBeDefined();
    expect(lastMap!.getLayer("paesi-visitati-bordo")).toBeDefined();
    expect(lastMap!.getLayer("paesi-bandiere-layer")).toBeDefined();
    expect(lastMap!.immagini.has("bandiera-it")).toBe(true);
    // Solo i layer che esistono davvero: trips-multi e trips-waypoints
    // nascono con le tappe, e questo viaggio non ne ha.
    // NB: qui si verifica anche che l'ORDINE non conti — i layer dei viaggi
    // vengono creati DOPO l'accensione della modalità (import asincrono di
    // MapLibre) e devono nascere già nascosti.
    for (const id of ["trips-single", "trips-labels"]) {
      expect(lastMap!.visibilita[id]).toBe("none");
    }
  });

  it("spegnendola i layer spariscono e i viaggi tornano visibili", async () => {
    const { rerender } = render(<WorldMap trips={TRIPS} selectedId={null} modalitaPaesi />);
    await settle();
    await respira(); await respira();
    rerender(<WorldMap trips={TRIPS} selectedId={null} modalitaPaesi={false} />);
    await respira();
    expect(lastMap!.getLayer("paesi-visitati-fill")).toBeUndefined();
    expect(lastMap!.getLayer("paesi-bandiere-layer")).toBeUndefined();
    expect(lastMap!.getSource("paesi-visitati")).toBeUndefined();
    expect(lastMap!.visibilita["trips-single"]).toBe("visible");
  });

  // La telecamera si sposta sui propri paesi, ma il globo deve restare INTERO
  // con il cielo attorno: sopra 0.95 (misurato a 390px) la sfera esce dai bordi
  // e diventa una mappa piatta.
  it("vola sui paesi con il globo intero in vista", async () => {
    render(<WorldMap trips={TRIPS} selectedId={null} modalitaPaesi />);
    await settle();
    await respira(); await respira();
    const volo = lastMap!.voli.at(-1);
    expect(volo?.zoom).toBeLessThanOrEqual(0.9);
  });

  // Richiesta di Stefano: "porta il globo in home page con i pallini alla
  // stessa dimensione dell'altro con le bandiere". Una costante sola per
  // entrambe le viste, così non possono più divergere.
  it("il globo dei viaggi e quello dei paesi hanno la STESSA dimensione", async () => {
    render(<WorldMap trips={TRIPS} selectedId={null} modalitaPaesi />);
    await settle();
    await respira(); await respira();
    const zoomIniziale = lastMap!.opts.zoom;      // com'è nato il globo in Home
    const zoomPaesi = lastMap!.voli.at(-1)?.zoom; // dove vola in modalità paesi
    expect(zoomIniziale).toBe(zoomPaesi);
  });

  // Bug trovato dal vivo: uscendo, la rotazione ripartiva SUBITO e il suo
  // setCenter a ogni frame cancellava il volo di ritorno — il globo restava
  // allo zoom della modalità paesi invece di tornare come prima.
  it("uscendo, la rotazione riparte solo a volo finito", async () => {
    const { rerender } = render(<WorldMap trips={TRIPS} selectedId={null} autoRotateSetting="on" modalitaPaesi />);
    await settle();
    await respira(); await respira();

    const rAF = vi.spyOn(globalThis, "requestAnimationFrame");
    rerender(<WorldMap trips={TRIPS} selectedId={null} autoRotateSetting="on" modalitaPaesi={false} />);
    await respira();
    // il volo di ritorno è in corso: guai a muovere il centro adesso
    expect(lastMap!.voli.at(-1)?.zoom).toBe(0.5);
    expect(rAF).not.toHaveBeenCalled();

    lastMap!.fineVolo();
    await respira();
    expect(rAF).toHaveBeenCalled();
    rAF.mockRestore();
  });

  // Con la vista ferma sui propri paesi, la rotazione automatica li porterebbe
  // fuori schermo in pochi secondi.
  it("in modalità paesi la rotazione automatica non gira", async () => {
    const rAF = vi.spyOn(globalThis, "requestAnimationFrame");
    render(<WorldMap trips={TRIPS} selectedId={null} autoRotateSetting="on" modalitaPaesi />);
    await settle();
    await respira(); await respira();
    rAF.mockClear();
    await respira();
    expect(rAF).not.toHaveBeenCalled();
  });
});

/**
 * Le tre reti di sicurezza della modalità paesi, trovate rileggendo il codice
 * il giorno dopo: senza, il globo poteva restare VUOTO (né viaggi né paesi) e
 * sembrare rotto, e le rotte restavano disegnate sopra i paesi colorati.
 */
describe("WorldMap — modalità paesi: quando qualcosa va storto", () => {
  beforeEach(() => { lastMap = null; });

  // NB sul metodo: questi due test partono dalla modalità SPENTA e poi la
  // accendono. Scritti col globo già in modalità paesi passavano anche senza
  // la correzione — i layer nascevano dopo e nessuno li nascondeva mai: il
  // mutation test li ha smascherati.
  it("se i confini non arrivano, i pallini dei viaggi TORNANO", async () => {
    const atlas = await import("@/lib/worldAtlas");
    const { rerender } = render(<WorldMap trips={TRIPS} selectedId={null} />);
    await settle();
    await respira();
    vi.mocked(atlas.loadWorldAtlasCountries).mockRejectedValueOnce(new Error("offline"));
    rerender(<WorldMap trips={TRIPS} selectedId={null} modalitaPaesi />);
    await respira(); await respira();
    // i pallini non devono sparire NEMMENO per un istante: senza paesi da
    // mostrare il globo resterebbe spoglio
    expect(lastMap!.storiaVisibilita.filter(v => v.id === "trips-single" && v.val === "none")).toEqual([]);
    expect(lastMap!.getLayer("paesi-visitati-fill")).toBeUndefined();
  });

  it("se nessun viaggio cade in un paese noto, i pallini TORNANO", async () => {
    // viaggio in mezzo all'oceano: nessun poligono lo contiene
    const inMareAperto = [trip({ id: "oceano", latitude: 0, longitude: -30 })];
    const { rerender } = render(<WorldMap trips={inMareAperto} selectedId={null} />);
    await settle();
    await respira();
    rerender(<WorldMap trips={inMareAperto} selectedId={null} modalitaPaesi />);
    await respira(); await respira();
    expect(lastMap!.storiaVisibilita.filter(v => v.id === "trips-single" && v.val === "none")).toEqual([]);
  });

  it("in modalità paesi spariscono anche le ROTTE, non solo i pallini", async () => {
    const conTappe = [trip({
      id: "multi",
      waypoints: [{ id: "w", city: "Vienna", country: "Austria", country_code: "AT", lat: 48.2, lon: 16.37, transport_mode: "car" }],
    } as Partial<Trip>)];
    const { rerender } = render(<WorldMap trips={conTappe} selectedId={null} />);
    await settle();
    await respira();
    const rotte = [...lastMap!.layers.keys()].filter(id => id.startsWith("route-"));
    expect(rotte.length).toBeGreaterThan(0);      // c'è davvero una rotta da nascondere

    rerender(<WorldMap trips={conTappe} selectedId={null} modalitaPaesi />);
    await respira(); await respira();
    for (const id of rotte) expect(lastMap!.visibilita[id]).toBe("none");
  });
});
