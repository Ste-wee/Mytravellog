import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Home from "./Index";
import { SettingsProvider } from "@/lib/settings";
import { addTrip } from "@/lib/storage";
import type { Trip } from "@/lib/storage";
import React from "react";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/components/AppHeader", () => ({
  AppHeader: () => <header data-testid="app-header" />,
}));

vi.mock("@/components/StarField", () => ({
  StarField: () => null,
}));

// Il globo vero richiede WebGL: qui basta un bottone che simula il tap su un
// pallino viaggio, chiamando onSelectTrip con il primo viaggio come fa WorldMap.
vi.mock("@/components/WorldMap", () => ({
  WorldMap: ({ trips, onSelectTrip, modalitaPaesi }: { trips: Trip[]; onSelectTrip?: (t: Trip) => void; modalitaPaesi?: boolean }) => (
    <>
      <button onClick={() => trips[0] && onSelectTrip?.(trips[0])}>Simula tap pallino</button>
      {/* così il test vede in che modalità è il globo */}
      <span data-testid="modalita-globo">{modalitaPaesi ? "paesi" : "viaggi"}</span>
    </>
  ),
}));

vi.mock("@/components/TripFlyover", () => ({
  TripFlyover: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="flyover-mock"><button onClick={onClose}>Chiudi flyover</button></div>
  ),
}));

function baseTrip(overrides: Partial<Omit<Trip, "id" | "created_at">> = {}): Omit<Trip, "id" | "created_at"> {
  return {
    title: "Weekend Roma",
    country: "Italia",
    city: "Roma",
    country_code: "IT",
    trip_date: "2024-06-01",
    date_end: "2024-06-03",
    rating: 5,
    notes: null,
    transport_mode: "car",
    waypoints: [],
    latitude: 41.9,
    longitude: 12.5,
    home_latitude: 45.46,
    home_longitude: 9.19,
    home_label: "Milano",
    route_geometry: null,
    temperature_c: 24,
    altitude_m: 20,
    distance_from_home_km: 480,
    max_distance_from_home_km: 480,
    max_distance_city: "Roma",
    max_altitude_m: 20,
    max_altitude_city: "Roma",
    hottest_temp_c: 24,
    hottest_city: "Roma",
    coldest_temp_c: 24,
    coldest_city: "Roma",
    region: "Lazio",
    region_details: null,
    ...overrides,
  };
}

function renderHome() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SettingsProvider>
        <Home />
      </SettingsProvider>
    </MemoryRouter>
  );
}

describe("Home — mini-card del viaggio selezionato sul globo", () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockClear();
  });

  it("prima della selezione la card non c'è", () => {
    addTrip(baseTrip());
    renderHome();
    expect(screen.queryByText("Weekend Roma")).not.toBeInTheDocument();
  });

  it("il tap su un pallino mostra la card con titolo, luogo, date, mezzo e km", () => {
    addTrip(baseTrip());
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Simula tap pallino" }));
    expect(screen.getByText("Weekend Roma")).toBeInTheDocument();
    expect(screen.getByText("Roma, Italia")).toBeInTheDocument();
    expect(screen.getByText("Auto")).toBeInTheDocument();
    // I km sono quelli percorsi (tripTotalKm): senza route_geometry è la linea
    // d'aria Milano→Roma ≈ 477 km, NON i 480 memorizzati in distance_from_home_km.
    // NB: le stat card della Home ora sono in una tendina CHIUSA di default
    // (layout uguale a mobile ovunque), quindi il valore compare solo nella
    // mini-card — non più anche nella stat "Km totali" sempre visibile.
    expect(screen.getAllByText("477 km").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/01 giu 2024/)).toBeInTheDocument();
  });

  it("la X chiude la card", () => {
    addTrip(baseTrip());
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Simula tap pallino" }));
    fireEvent.click(screen.getByRole("button", { name: "Chiudi scheda viaggio" }));
    expect(screen.queryByText("Weekend Roma")).not.toBeInTheDocument();
  });

  it("Escape chiude la mini-card", () => {
    addTrip(baseTrip());
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Simula tap pallino" }));
    expect(screen.getByText("Weekend Roma")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("Weekend Roma")).not.toBeInTheDocument();
  });

  it("'Rivivi in 3D' apre il flyover per quel viaggio, chiudibile", () => {
    addTrip(baseTrip());
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Simula tap pallino" }));
    fireEvent.click(screen.getByRole("button", { name: /Rivivi in 3D/ }));
    expect(screen.getByTestId("flyover-mock")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chiudi flyover" }));
    expect(screen.queryByTestId("flyover-mock")).not.toBeInTheDocument();
  });

  it("'Modifica' naviga al form di modifica del viaggio", () => {
    const trip = addTrip(baseTrip());
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Simula tap pallino" }));
    fireEvent.click(screen.getByRole("button", { name: /Modifica/ }));
    expect(mockNavigate).toHaveBeenCalledWith("/modifica-viaggio/" + trip.id);
  });
});

describe("Home — benvenuto al primo avvio", () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockClear();
  });

  it("senza viaggi mostra l'invito e il CTA porta a /nuovo-viaggio", () => {
    renderHome();
    expect(screen.getByText("Benvenuto su NAV·TA")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi il primo viaggio/ }));
    expect(mockNavigate).toHaveBeenCalledWith("/nuovo-viaggio");
  });

  it("senza città di casa mostra anche il link alle Impostazioni", () => {
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: /imposta la tua città di casa/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/impostazioni");
  });

  it("con almeno un viaggio l'invito non compare", () => {
    addTrip(baseTrip());
    renderHome();
    expect(screen.queryByText("Benvenuto su NAV·TA")).not.toBeInTheDocument();
  });
});

// La riga-sommario sotto il globo ha sostituito il cassetto "Statistiche":
// niente più gesto per vedere quattro numeri, e il tocco porta alla pagina
// invece di duplicarla.
describe("Home — riga-sommario sotto il globo", () => {
  // Questo describe è fuori dal beforeEach di sopra: senza pulizia i viaggi
  // dei test precedenti si accumulano e i conteggi non sono più prevedibili.
  beforeEach(() => { localStorage.clear(); mockNavigate.mockClear(); });

  it("mostra i numeri sempre, senza cassetto da aprire", async () => {
    addTrip(baseTrip());
    renderHome();
    const riga = await screen.findByRole("button", { name: /statistiche/i });
    expect(riga).toBeInTheDocument();
    // il vecchio cassetto non esiste più
    expect(screen.queryByRole("button", { name: /Mostra le tue statistiche/i })).toBeNull();
  });

  // I DATI devono stare nell'aria-label, non in sr-only dentro il bottone:
  // l'aria-label SOSTITUISCE il contenuto per lo screen reader, quindi con i
  // testi nascosti si sentiva solo "vai alla pagina Statistiche" e i numeri
  // sparivano proprio a chi non li vede.
  it("chi ascolta sente i NUMERI, non solo l'invito a navigare", async () => {
    addTrip(baseTrip());
    renderHome();
    const riga = await screen.findByRole("button", { name: /statistiche/i });
    const nome = riga.getAttribute("aria-label") ?? "";
    expect(nome).toMatch(/1 viaggio/);
    expect(nome).toMatch(/1 paese/);
    expect(nome).toMatch(/km percorsi/);
    // le icone restano mute: il senso lo porta il nome del bottone
    expect(riga.querySelectorAll("svg[aria-hidden]").length).toBeGreaterThanOrEqual(4);
  });

  // Il tocco NON naviga più: accende la modalità paesi sul globo (la pagina
  // Statistiche resta nel menu in alto). Scelta di Stefano: "cliccando lì
  // sotto non si aprono le statistiche, il globo cambia".
  it("il tocco accende la modalità paesi sul globo, e non naviga", async () => {
    addTrip(baseTrip());
    renderHome();
    const riga = await screen.findByRole("button", { name: /statistiche/i });
    expect(screen.getByTestId("modalita-globo").textContent).toBe("viaggi");

    fireEvent.click(riga);
    expect(screen.getByTestId("modalita-globo").textContent).toBe("paesi");
    expect(mockNavigate).not.toHaveBeenCalledWith("/statistiche");
  });

  it("toccando di nuovo si torna ai viaggi", async () => {
    addTrip(baseTrip());
    renderHome();
    const riga = await screen.findByRole("button", { name: /statistiche/i });
    fireEvent.click(riga);
    fireEvent.click(await screen.findByRole("button", { name: /statistiche/i }));
    expect(screen.getByTestId("modalita-globo").textContent).toBe("viaggi");
  });

  // Chi non vede lo schermo deve sapere cosa fa il bottone ADESSO, non cosa
  // faceva prima: l'etichetta cambia insieme allo stato.
  it("l'etichetta dice sempre cosa succede al prossimo tocco", async () => {
    addTrip(baseTrip());
    renderHome();
    const riga = await screen.findByRole("button", { name: /statistiche/i });
    expect(riga.getAttribute("aria-label")).toMatch(/paesi che hai visitato/i);
    fireEvent.click(riga);
    const dopo = await screen.findByRole("button", { name: /statistiche/i });
    expect(dopo.getAttribute("aria-label")).toMatch(/pallini dei viaggi/i);
  });
});
