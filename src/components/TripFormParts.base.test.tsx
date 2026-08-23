import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SettingsProvider } from "@/lib/settings";
import { ItineraryPanel, Waypoint } from "./TripFormParts";

/**
 * La vista "a base": quando il viaggio rientra più volte nello stesso posto,
 * la serpentina lo disegna una volta sola con le gite appese — e il
 * trascinamento vive SOLO nella vista lineare, dietro il bottone Riordina.
 */

const wp = (city: string, lat: number, lon: number): Waypoint => ({
  id: crypto.randomUUID(), city, country: "Italia", country_code: "IT",
  lat, lon, transport_mode: "car",
});
const FIRENZE = () => wp("Firenze", 43.7696, 11.2558);

function renderPannello(waypoints: Waypoint[], extra: Partial<React.ComponentProps<typeof ItineraryPanel>> = {}) {
  const props = {
    waypoints,
    home: { lat: 45.4642, lon: 9.19, label: "Milano, Italia" },
    onEditHome: vi.fn(), editingHome: false,
    homeQuery: "", setHomeQuery: vi.fn(), homeResults: [], onSelectHome: vi.fn(),
    onRemoveWaypoint: vi.fn(), onChangeTransport: vi.fn(), onMoveWaypoint: vi.fn(),
    wpTransport: "car" as const, setWpTransport: vi.fn(),
    wpOpen: false, setWpOpen: vi.fn(), wpQuery: "", setWpQuery: vi.fn(),
    wpResults: [], wpLoading: false, onAddWaypoint: vi.fn(),
    notti: 4,
    ...extra,
  };
  render(<MemoryRouter><SettingsProvider><ItineraryPanel {...props} /></SettingsProvider></MemoryRouter>);
  return props;
}

const toscana = () => [FIRENZE(), wp("Siena", 43.3188, 11.3308), FIRENZE(), wp("Pisa", 43.7228, 10.4017), FIRENZE()];
const etichette = () => [...document.querySelectorAll("svg text")].map(t => t.textContent ?? "");

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() { /* jsdom */ } unobserve() { /* — */ } disconnect() { /* — */ }
  });
});

describe("serpentina con base", () => {
  it("la base compare UNA volta, con le notti e le gite", () => {
    renderPannello(toscana());
    const testi = etichette();
    expect(testi.filter(t => t.includes("Firenze")).length).toBe(1);
    expect(testi.some(t => t.includes("Firenze · base"))).toBe(true);
    expect(testi.some(t => t.includes("4 notti"))).toBe(true);
    expect(testi).toContain("Siena");
    expect(testi).toContain("Pisa");
  });

  it("senza date il badge dice solo «base»", () => {
    renderPannello(toscana(), { notti: null });
    expect(etichette().some(t => t.trim() === "🌙 base")).toBe(true);
  });

  it("un viaggio lineare non cambia: niente base, niente bottone", () => {
    renderPannello([wp("Siena", 43.3188, 11.3308), wp("Pisa", 43.7228, 10.4017)]);
    expect(etichette().some(t => t.includes("· base"))).toBe(false);
    expect(screen.queryByRole("button", { name: /Riordina/ })).toBeNull();
  });

  it("nella vista a base NON si trascina niente", () => {
    renderPannello(toscana());
    // nella vista lineare le maniglie sono bottoni "…, tappa N di M. Trascina…"
    expect(screen.queryByRole("button", { name: /Trascina per spostarla/ })).toBeNull();
  });

  it("«Riordina» apre la vista lineare (coi rientri e il trascinamento), «Fine» torna alla base", () => {
    renderPannello(toscana());
    fireEvent.click(screen.getByRole("button", { name: /Riordina o cambia mezzo/ }));
    // lineare: Firenze tre volte e maniglie di trascinamento vive
    expect(etichette().filter(t => t.startsWith("Firenze")).length).toBe(3);
    expect(screen.getAllByRole("button", { name: /Trascina per spostarla/ }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Fine: torna alla vista con la base/ }));
    expect(etichette().filter(t => t.includes("Firenze")).length).toBe(1);
  });

  it("la × sulle gite rimuove la tappa giusta (indice dei dati, non del disegno)", () => {
    const p = renderPannello(toscana());
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi la tappa Pisa" }));
    // Pisa è il 4° waypoint (indice 3)
    expect(p.onRemoveWaypoint).toHaveBeenCalledWith(3);
  });

  it("il rientro si disegna: un tratto leggero con la freccia, per ogni gita", () => {
    renderPannello(toscana());
    expect(document.querySelectorAll('path[stroke-dasharray="2 4"][marker-end]').length).toBe(2);
  });

  it("viaggio che prosegue dopo la base: la coda resta sulla linea", () => {
    renderPannello([FIRENZE(), wp("Siena", 43.3188, 11.3308), FIRENZE(), wp("Roma", 41.9028, 12.4964)]);
    const testi = etichette();
    expect(testi.some(t => t.includes("Firenze · base"))).toBe(true);
    expect(testi).toContain("Roma");
  });
});
