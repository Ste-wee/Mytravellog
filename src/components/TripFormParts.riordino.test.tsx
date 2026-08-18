import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { ItineraryPanel, Waypoint } from "./TripFormParts";
import { moveItem } from "@/lib/utils";

/**
 * Riordino delle tappe per trascinamento. Il difetto da prevenire è che il
 * rilascio calcoli la riga sbagliata: la serpentina alterna le colonne, ma
 * l'ordine è verticale — la posizione dipende dalla sola Y.
 */
describe("moveItem", () => {
  it("sposta in avanti e all'indietro", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });
  it("stessa posizione: array invariato (e identico, non una copia)", () => {
    const v = ["a", "b"];
    expect(moveItem(v, 1, 1)).toBe(v);
  });
  it("indici fuori intervallo non perdono elementi", () => {
    const v = ["a", "b", "c"];
    expect(moveItem(v, -1, 1)).toBe(v);
    expect(moveItem(v, 0, 9)).toBe(v);
    expect(moveItem(v, 5, 0)).toBe(v);
  });
  it("non tocca l'array originale", () => {
    const v = ["a", "b", "c"];
    moveItem(v, 0, 2);
    expect(v).toEqual(["a", "b", "c"]);
  });
});

const wp = (id: string, city: string): Waypoint => ({
  id, city, country: "Italia", country_code: "IT", lat: 45, lon: 9, transport_mode: "car",
});

function renderPannello(extra: Partial<React.ComponentProps<typeof ItineraryPanel>> = {}) {
  const props = {
    waypoints: [wp("1", "Firenze"), wp("2", "Roma"), wp("3", "Napoli")],
    home: { lat: 45.46, lon: 9.19, label: "Milano, Italia" },
    onEditHome: vi.fn(), editingHome: false,
    homeQuery: "", setHomeQuery: vi.fn(), homeResults: [], onSelectHome: vi.fn(),
    onRemoveWaypoint: vi.fn(), onChangeTransport: vi.fn(), onMoveWaypoint: vi.fn(),
    wpTransport: "car" as const, setWpTransport: vi.fn(),
    wpOpen: false, setWpOpen: vi.fn(), wpQuery: "", setWpQuery: vi.fn(),
    wpResults: [], wpLoading: false, onAddWaypoint: vi.fn(),
    ...extra,
  };
  render(<MemoryRouter><ItineraryPanel {...props} /></MemoryRouter>);
  return props;
}

// jsdom non fa layout: senza queste, getBoundingClientRect è tutto zero e la
// conversione schermo→viewBox dividerebbe per zero.
function fingiLayout(altezza = 400) {
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    top: 0, left: 0, width: 390, height: altezza, right: 390, bottom: altezza, x: 0, y: 0, toJSON: () => ({}),
  })) as unknown as typeof Element.prototype.getBoundingClientRect;
}

describe("trascinamento delle tappe", () => {
  beforeEach(() => {
    fingiLayout();
    // jsdom non ha né ResizeObserver (l'itinerario misura la propria
    // larghezza) né le API di pointer capture.
    vi.stubGlobal("ResizeObserver", class {
      observe() { /* nessun layout in jsdom */ }
      unobserve() { /* — */ }
      disconnect() { /* — */ }
    });
    if (!Element.prototype.setPointerCapture) {
      Element.prototype.setPointerCapture = vi.fn();
      Element.prototype.releasePointerCapture = vi.fn();
    }
    // Senza `PointerEvent` definito, fireEvent.pointerMove costruisce un
    // Event generico e `clientY` non arriva mai all'handler: il test
    // sembrerebbe rotto (la riga d'arrivo risulta NaN) mentre il codice è
    // giusto. MouseEvent porta le coordinate, pointerId lo aggiungiamo noi.
    if (!("PointerEvent" in window)) {
      class FintoPointerEvent extends MouseEvent {
        pointerId: number;
        constructor(tipo: string, opts: MouseEventInit & { pointerId?: number } = {}) {
          super(tipo, opts);
          this.pointerId = opts.pointerId ?? 1;
        }
      }
      vi.stubGlobal("PointerEvent", FintoPointerEvent);
    }
  });

  const nodoDi = (nome: string) => screen.getByRole("button", { name: new RegExp("^" + nome + ",") });

  it("ogni tappa è presa e dice come si sposta; la casa no", () => {
    renderPannello();
    expect(nodoDi("Firenze")).toBeTruthy();
    expect(nodoDi("Roma").getAttribute("aria-label")).toMatch(/Trascina per spostarla/);
    // la partenza non si trascina: è il punto fisso dell'itinerario
    expect(screen.queryByRole("button", { name: /^Milano,/ })).toBeNull();
  });

  it("trascinare Napoli in cima chiama onMoveWaypoint con le posizioni giuste", () => {
    const p = renderPannello();
    const napoli = nodoDi("Napoli");
    fireEvent.pointerDown(napoli, { pointerId: 1, clientY: 292 });   // riga 3
    // la Y del rilascio decide la riga: padTop 40 + vStep 84 → riga 1 ≈ 124
    fireEvent.pointerMove(napoli, { pointerId: 1, clientY: 124 });
    fireEvent.pointerUp(napoli, { pointerId: 1, clientY: 124 });
    expect(p.onMoveWaypoint).toHaveBeenCalledWith(2, 0);
    // UNA volta sola: con lo spostamento chiamato dentro l'updater di
    // setState, React lo eseguiva due volte e la tappa faceva due salti
    // (si vedeva solo nel browser, in StrictMode).
    expect(p.onMoveWaypoint).toHaveBeenCalledTimes(1);
  });

  it("in StrictMode lo spostamento resta uno solo", () => {
    // StrictMode invoca due volte gli updater di stato per stanare gli
    // effetti collaterali messi lì dentro: è esattamente com'è girata l'app
    // in sviluppo quando la tappa saltava due posizioni.
    const onMoveWaypoint = vi.fn();
    const props = {
      waypoints: [wp("1", "Firenze"), wp("2", "Roma"), wp("3", "Napoli")],
      home: { lat: 45.46, lon: 9.19, label: "Milano, Italia" },
      onEditHome: vi.fn(), editingHome: false,
      homeQuery: "", setHomeQuery: vi.fn(), homeResults: [], onSelectHome: vi.fn(),
      onRemoveWaypoint: vi.fn(), onChangeTransport: vi.fn(), onMoveWaypoint,
      wpTransport: "car" as const, setWpTransport: vi.fn(),
      wpOpen: false, setWpOpen: vi.fn(), wpQuery: "", setWpQuery: vi.fn(),
      wpResults: [], wpLoading: false, onAddWaypoint: vi.fn(),
    };
    render(<StrictMode><MemoryRouter><ItineraryPanel {...props} /></MemoryRouter></StrictMode>);
    const napoli = screen.getAllByRole("button", { name: /^Napoli,/ })[0];
    fireEvent.pointerDown(napoli, { pointerId: 1, clientY: 292 });
    fireEvent.pointerMove(napoli, { pointerId: 1, clientY: 124 });
    fireEvent.pointerUp(napoli, { pointerId: 1, clientY: 124 });
    expect(onMoveWaypoint).toHaveBeenCalledTimes(1);
    expect(onMoveWaypoint).toHaveBeenCalledWith(2, 0);
  });

  it("rilasciare dov'era non muove nulla", () => {
    const p = renderPannello();
    const roma = nodoDi("Roma");
    fireEvent.pointerDown(roma, { pointerId: 1, clientY: 208 });
    fireEvent.pointerMove(roma, { pointerId: 1, clientY: 210 });
    fireEvent.pointerUp(roma, { pointerId: 1, clientY: 210 });
    expect(p.onMoveWaypoint).not.toHaveBeenCalled();
  });

  it("trascinare sopra la casa NON scavalca la partenza", () => {
    const p = renderPannello();
    const napoli = nodoDi("Napoli");
    fireEvent.pointerDown(napoli, { pointerId: 1, clientY: 292 });
    fireEvent.pointerMove(napoli, { pointerId: 1, clientY: -500 });  // ben sopra il bordo
    fireEvent.pointerUp(napoli, { pointerId: 1, clientY: -500 });
    // riga 1 = prima tappa dopo casa, mai riga 0
    expect(p.onMoveWaypoint).toHaveBeenCalledWith(2, 0);
  });

  it("trascinare oltre il fondo si ferma all'ultima tappa", () => {
    const p = renderPannello();
    const firenze = nodoDi("Firenze");
    fireEvent.pointerDown(firenze, { pointerId: 1, clientY: 124 });
    fireEvent.pointerMove(firenze, { pointerId: 1, clientY: 9999 });
    fireEvent.pointerUp(firenze, { pointerId: 1, clientY: 9999 });
    expect(p.onMoveWaypoint).toHaveBeenCalledWith(0, 2);
  });

  it("pointercancel (telefonata, gesto di sistema) annulla senza spostare", () => {
    const p = renderPannello();
    const roma = nodoDi("Roma");
    fireEvent.pointerDown(roma, { pointerId: 1, clientY: 208 });
    fireEvent.pointerMove(roma, { pointerId: 1, clientY: 124 });
    fireEvent.pointerCancel(roma, { pointerId: 1 });
    fireEvent.pointerUp(roma, { pointerId: 1, clientY: 124 });
    expect(p.onMoveWaypoint).not.toHaveBeenCalled();
  });

  it("con una sola tappa non c'è niente da riordinare", () => {
    renderPannello({ waypoints: [wp("1", "Firenze")] });
    expect(screen.queryByRole("button", { name: /Trascina per spostarla/ })).toBeNull();
  });

  it("frecce su e giù: il riordino esiste anche senza mouse", () => {
    const p = renderPannello();
    fireEvent.keyDown(nodoDi("Roma"), { key: "ArrowUp" });
    expect(p.onMoveWaypoint).toHaveBeenCalledWith(1, 0);
    fireEvent.keyDown(nodoDi("Roma"), { key: "ArrowDown" });
    expect(p.onMoveWaypoint).toHaveBeenLastCalledWith(1, 2);
  });

  it("le frecce non spingono la prima tappa sopra la casa né l'ultima oltre il fondo", () => {
    const p = renderPannello();
    fireEvent.keyDown(nodoDi("Firenze"), { key: "ArrowUp" });
    fireEvent.keyDown(nodoDi("Napoli"), { key: "ArrowDown" });
    expect(p.onMoveWaypoint).not.toHaveBeenCalled();
  });
});
