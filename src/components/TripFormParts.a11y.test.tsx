import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ItineraryPanel, type Waypoint } from "./TripFormParts";

/**
 * L'editor dell'itinerario è fatto di gruppi SVG con solo onClick: non erano
 * raggiungibili col Tab né azionabili con Invio. Da tastiera si poteva
 * aggiungere una tappa (quelli sono <button> veri) ma non rimuoverla, né
 * cambiare mezzo, né toccare la città di partenza.
 */

class FakeResizeObserver { observe() {} unobserve() {} disconnect() {} }
(globalThis as any).ResizeObserver ??= FakeResizeObserver;

const wp = (city: string, transport: Waypoint["transport_mode"] = "car"): Waypoint => ({
  id: city, city, country: "Italia", country_code: "IT", lat: 45, lon: 9, transport_mode: transport,
});

function setup(over: Partial<React.ComponentProps<typeof ItineraryPanel>> = {}) {
  const props = {
    waypoints: [wp("Innsbruck"), wp("Vienna", "train")],
    home: { lat: 45.46, lon: 9.19, label: "Milano, Italia" },
    onEditHome: vi.fn(), editingHome: false,
    homeQuery: "", setHomeQuery: vi.fn(), homeResults: [], onSelectHome: vi.fn(),
    onRemoveWaypoint: vi.fn(), onChangeTransport: vi.fn(), onMoveWaypoint: vi.fn(),
    wpTransport: "plane" as const, setWpTransport: vi.fn(),
    wpOpen: false, setWpOpen: vi.fn(), wpQuery: "", setWpQuery: vi.fn(),
    wpResults: [], wpLoading: false, onAddWaypoint: vi.fn(),
    ...over,
  };
  render(<ItineraryPanel {...props} />);
  return props;
}

describe("Itinerario — azionabile da tastiera", () => {
  beforeEach(() => vi.clearAllMocks());

  it("i controlli dell'itinerario sono raggiungibili col Tab", () => {
    setup();
    const casa = screen.getByRole("button", { name: /Cambia la città di partenza/i });
    const rimuovi = screen.getByRole("button", { name: /Rimuovi la tappa Innsbruck/i });
    expect(casa).toHaveProperty("tabIndex", 0);
    expect(rimuovi).toHaveProperty("tabIndex", 0);
  });

  it("Invio sul nodo casa apre la modifica della città di partenza", () => {
    const p = setup();
    fireEvent.keyDown(screen.getByRole("button", { name: /Cambia la città di partenza/i }), { key: "Enter" });
    expect(p.onEditHome).toHaveBeenCalled();
  });

  it("Spazio sulla × rimuove quella tappa", () => {
    const p = setup();
    fireEvent.keyDown(screen.getByRole("button", { name: /Rimuovi la tappa Vienna/i }), { key: " " });
    expect(p.onRemoveWaypoint).toHaveBeenCalledWith(1);
  });

  it("da tastiera si apre il selettore del mezzo e si sceglie", () => {
    const p = setup();
    const arco = screen.getAllByRole("button", { name: /Cambia il mezzo per arrivare a/i })[0];
    fireEvent.keyDown(arco, { key: "Enter" });

    const treno = screen.getByRole("button", { name: "Treno" });
    fireEvent.keyDown(treno, { key: "Enter" });
    expect(p.onChangeTransport).toHaveBeenCalledWith(0, "train");
  });

  // Il form NUOVO parte senza tappe e mostra un disegno diverso, con i suoi
  // controlli: la prima versione del fix copriva solo l'itinerario pieno, e
  // dal vivo il form vuoto risultava ancora inaccessibile.
  it("anche l'itinerario VUOTO ha la partenza raggiungibile da tastiera", () => {
    const p = setup({ waypoints: [] });
    const casa = screen.getByRole("button", { name: /Cambia la città di partenza/i });
    expect(casa).toHaveProperty("tabIndex", 0);
    fireEvent.keyDown(casa, { key: "Enter" });
    expect(p.onEditHome).toHaveBeenCalled();
  });

  it("Escape chiude il selettore del mezzo", () => {
    setup();
    const arco = screen.getAllByRole("button", { name: /Cambia il mezzo per arrivare a/i })[0];
    fireEvent.keyDown(arco, { key: "Enter" });
    expect(screen.getByRole("group", { name: "Scegli il mezzo" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Scegli il mezzo" })).toBeNull();
  });
});
