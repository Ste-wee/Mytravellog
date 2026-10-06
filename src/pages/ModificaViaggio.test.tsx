import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ModificaViaggio from "./ModificaViaggio";
import { SettingsProvider } from "@/lib/settings";
import { addTrip, deleteTrip } from "@/lib/storage";
import type { Trip } from "@/lib/storage";

vi.mock("@/components/AppHeader", () => ({
  AppHeader: () => <header data-testid="app-header" />,
}));


// Le chiamate geo (Nominatim/Open-Meteo/OSRM) restano mai risolte finché il
// test non lo decide esplicitamente: permette di ispezionare lo stato della
// UI mentre il salvataggio è "in corso". vi.hoisted perché vi.mock viene
// issato sopra ogni `let`/`const` del modulo.
const geoGate = vi.hoisted(() => {
  let resolve: (() => void) | null = null;
  const pending = new Promise<void>(r => { resolve = r; });
  return { pending, resolve: () => resolve?.() };
});
vi.mock("@/lib/geo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/geo")>();
  return {
    ...actual,
    fetchElevation: vi.fn(async () => { await geoGate.pending; return null; }),
    fetchDrivingRoute: vi.fn(async () => { await geoGate.pending; return null; }),
  };
});
// La regione, in ModificaViaggio, viene calcolata con un fetch() diretto
// (fetchMultiRegion/fetchNominatimRegion definite nel file stesso, non in
// @/lib/geo): va quindi imbrigliata sostituendo il fetch globale.
vi.stubGlobal("fetch", vi.fn(async () => {
  await geoGate.pending;
  return { ok: true, json: async () => ({ address: {} }) } as Response;
}));

// Il form usa ResizeObserver (RouteHero) per adattare la larghezza dell'SVG:
// non implementato in jsdom.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function baseTrip(overrides: Partial<Omit<Trip, "id" | "created_at">> = {}): Omit<Trip, "id" | "created_at"> {
  return {
    title: "Weekend Roma", country: "Italia", city: "Roma", country_code: "IT",
    trip_date: "2024-06-01", date_end: null, rating: null, notes: null,
    transport_mode: "car", waypoints: [],
    latitude: 41.9, longitude: 12.5,
    home_latitude: 45.46, home_longitude: 9.19, home_label: "Milano",
    route_geometry: null, altitude_m: null,
    max_altitude_m: null, max_altitude_city: null,
    distance_from_home_km: null, max_distance_from_home_km: null, max_distance_city: null,
    region: null, region_details: null,
    ...overrides,
  };
}

function renderPage(tripId: string) {
  return render(
    <MemoryRouter initialEntries={[`/modifica-viaggio/${tripId}`]}>
      <SettingsProvider>
        <Routes>
          <Route path="/modifica-viaggio/:id" element={<ModificaViaggio />} />
          <Route path="/" element={<div>HOME</div>} />
        </Routes>
      </SettingsProvider>
    </MemoryRouter>
  );
}

describe("ModificaViaggio — protezione modifiche non salvate", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("senza modifiche, 'Annulla' naviga via senza chiedere conferma", () => {
    const trip = addTrip(baseTrip());
    const confirmSpy = vi.spyOn(window, "confirm");
    renderPage(trip.id);
    fireEvent.click(screen.getByRole("link", { name: "Annulla" }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByText("HOME")).toBeInTheDocument();
  });

  it("dopo una modifica, 'Annulla' chiede conferma; se annulli la conferma resti sulla pagina", () => {
    const trip = addTrip(baseTrip());
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage(trip.id);
    fireEvent.change(screen.getByDisplayValue("Weekend Roma"), { target: { value: "Weekend Roma 2" } });
    fireEvent.click(screen.getByRole("link", { name: "Annulla" }));
    expect(confirmSpy).toHaveBeenCalledWith("Hai modifiche non salvate. Uscire senza salvare?");
    expect(screen.queryByText("HOME")).not.toBeInTheDocument();
  });

  it("dopo una modifica, confermando l'uscita si naviga comunque via", () => {
    const trip = addTrip(baseTrip());
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage(trip.id);
    fireEvent.change(screen.getByDisplayValue("Weekend Roma"), { target: { value: "Weekend Roma 2" } });
    fireEvent.click(screen.getByRole("link", { name: "Annulla" }));
    expect(screen.getByText("HOME")).toBeInTheDocument();
  });
});

describe("ModificaViaggio — validazione date", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("ritorno prima della partenza: mostra l'errore e blocca il salvataggio", () => {
    const trip = addTrip(baseTrip({ trip_date: "2024-06-01" }));
    const { container } = renderPage(trip.id);

    const [, dateEndInput] = container.querySelectorAll('input[type="date"]');
    fireEvent.change(dateEndInput, { target: { value: "2024-05-01" } });

    expect(screen.getByText("Il ritorno non può essere prima della partenza")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Salva viaggio/ }));
    expect(screen.queryByRole("button", { name: /Salvataggio…/ })).not.toBeInTheDocument();
    expect(screen.queryByText("HOME")).not.toBeInTheDocument();
  });
});

describe("ModificaViaggio — feedback durante il salvataggio lento", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("mentre salva: bottone e Annulla lo dicono chiaramente, invece di sembrare bloccati", async () => {
    const trip = addTrip(baseTrip());
    renderPage(trip.id);

    fireEvent.click(screen.getByRole("button", { name: /Salva viaggio/ }));

    expect(await screen.findByRole("button", { name: /Salvataggio…/ })).toBeInTheDocument();
    expect(screen.getByText(/Recupero regione, meteo e altitudine/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Annulla" })).toHaveAttribute("aria-disabled", "true");

    geoGate.resolve();
    await waitFor(() => expect(screen.getByText("HOME")).toBeInTheDocument());
  });
});

describe("ModificaViaggio — il viaggio viene eliminato mentre la pagina è aperta", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("non lancia un errore React e naviga alla Home, invece di un crash da hook mancanti", async () => {
    const trip = addTrip(baseTrip());
    renderPage(trip.id);

    // Simula la cancellazione da un'altra tab/finestra: lo storage cambia
    // sotto ai piedi del componente, che lo scopre solo al prossimo render
    // (trip = loadTrips().find(...) viene ricalcolato ad ogni render, non
    // mai una tantum). Digitare nel titolo forza quel prossimo render.
    deleteTrip(trip.id);
    expect(() => {
      fireEvent.change(screen.getByDisplayValue("Weekend Roma"), { target: { value: "x" } });
    }).not.toThrow();

    await waitFor(() => expect(screen.getByText("HOME")).toBeInTheDocument());
  });
});
