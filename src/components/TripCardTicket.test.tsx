import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TripCardTicket, seasonColor } from "./TripCardTicket";
import { SettingsProvider } from "@/lib/settings";
import { addTrip } from "@/lib/storage";
import type { Trip } from "@/lib/storage";
import React from "react";

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// Radix DropdownMenu (menu azioni ⋮) in jsdom: servono questi stub per aprirsi
// (hasPointerCapture/scrollIntoView del trigger, ResizeObserver del Popper).
beforeAll(() => {
  const p = window.HTMLElement.prototype as any;
  if (!p.hasPointerCapture) p.hasPointerCapture = () => false;
  if (!p.releasePointerCapture) p.releasePointerCapture = () => {};
  if (!p.scrollIntoView) p.scrollIntoView = () => {};
  if (!(window as any).ResizeObserver) (window as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!(window as any).matchMedia) (window as any).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
});

// Apre il menu azioni ⋮ via tastiera (in jsdom è più affidabile del pointer).
function openActions() {
  fireEvent.keyDown(screen.getByRole("button", { name: "Azioni viaggio" }), { key: "Enter" });
}

function renderCard(trip: Trip, onDeleteRequested?: (trip: Trip) => void, onSelectCompanion?: (name: string) => void) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SettingsProvider>
        <TripCardTicket trip={trip} onDeleteRequested={onDeleteRequested} onSelectCompanion={onSelectCompanion} />
      </SettingsProvider>
    </MemoryRouter>
  );
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "test-id-1",
    created_at: new Date().toISOString(),
    title: "Viaggio",
    country: "Italia",
    city: "Roma",
    country_code: "IT",
    trip_date: "2024-06-01",
    date_end: null,
    rating: null,
    notes: null,
    transport_mode: null,
    waypoints: [],
    latitude: 41.9,
    longitude: 12.5,
    home_latitude: null,
    home_longitude: null,
    home_label: "Milano",
    route_geometry: null,
    temperature_c: null,
    altitude_m: null,
    distance_from_home_km: null,
    max_distance_from_home_km: null,
    max_distance_city: null,
    max_altitude_m: null,
    max_altitude_city: null,
    hottest_temp_c: null,
    hottest_city: null,
    coldest_temp_c: null,
    coldest_city: null,
    region: null,
    region_details: null,
    ...overrides,
  };
}

describe("TripCardTicket — render base", () => {
  beforeEach(() => { localStorage.clear(); mockNavigate.mockClear(); });

  it("renderizza senza crash con campi minimi", () => {
    expect(() => renderCard(makeTrip())).not.toThrow();
  });

  it("mostra city come titolo quando title === city", () => {
    renderCard(makeTrip({ title: "Roma", city: "Roma" }));
    expect(screen.getAllByText("Roma").length).toBeGreaterThanOrEqual(1);
  });

  it("mostra title custom quando title !== city", () => {
    renderCard(makeTrip({ title: "Vacanza estiva", city: "Roma" }));
    expect(screen.getByText("Vacanza estiva")).toBeInTheDocument();
  });

  it("non mostra più il sottotitolo 'città, paese' (ridondante, rimosso dall'header)", () => {
    renderCard(makeTrip({ city: "Roma", country: "Italia" }));
    expect(screen.queryByText("Roma, Italia")).not.toBeInTheDocument();
  });

  it("mostra 🌍 come fallback senza country_code", () => {
    renderCard(makeTrip({ country_code: undefined as any }));
    expect(screen.getByText("🌍")).toBeInTheDocument();
  });

  it("comunica la valutazione agli screen reader (le stelle sono solo colore)", () => {
    renderCard(makeTrip({ rating: 4 }));
    expect(screen.getByRole("img", { name: "Valutazione: 4 su 5" })).toBeInTheDocument();
  });

  it("annuncia 'Nessuna valutazione' quando il rating è assente", () => {
    renderCard(makeTrip({ rating: null }));
    expect(screen.getByRole("img", { name: "Nessuna valutazione" })).toBeInTheDocument();
  });
});

describe("TripCardTicket — date e giorni", () => {
  beforeEach(() => localStorage.clear());

  it("non mostra i giorni se date_end è null", () => {
    renderCard(makeTrip({ trip_date: "2024-01-01", date_end: null }));
    expect(screen.queryByText(/\dg$/)).not.toBeInTheDocument();
  });

  it("mostra 1g se date_end === trip_date (conteggio inclusivo: un solo giorno)", () => {
    renderCard(makeTrip({ trip_date: "2024-01-01", date_end: "2024-01-01" }));
    expect(
      screen.getByText((_content, node) => node?.textContent?.replace(/\s+/g, " ").trim() === "· 1g")
    ).toBeInTheDocument();
  });

  it("mostra i giorni corretti con date_end diversa da trip_date (inclusivo: 1-6 gennaio = 6 giorni)", () => {
    renderCard(makeTrip({ trip_date: "2024-01-01", date_end: "2024-01-06" }));
    // JSX `{days}g` produce due nodi testo adiacenti (numero + "g"); confrontiamo textContent
    expect(
      screen.getByText((_content, node) => node?.textContent?.replace(/\s+/g, " ").trim() === "· 6g")
    ).toBeInTheDocument();
  });
});

describe("seasonColor", () => {
  it("inverno (gennaio, dicembre) è blu", () => {
    expect(seasonColor("2024-01-15")).toBe("#60a5fa");
    expect(seasonColor("2024-12-20")).toBe("#60a5fa");
  });

  it("primavera (aprile) è verde", () => {
    expect(seasonColor("2024-04-10")).toBe("#4ade80");
  });

  it("estate (luglio) è arancio", () => {
    expect(seasonColor("2024-07-09")).toBe("#fb923c");
  });

  it("autunno (ottobre) è ruggine", () => {
    expect(seasonColor("2024-10-01")).toBe("#c2410c");
  });
});

describe("TripCardTicket — colore stagionale della data", () => {
  beforeEach(() => localStorage.clear());

  it("la data di un viaggio estivo usa il colore estate", () => {
    renderCard(makeTrip({ trip_date: "2024-07-09" }));
    const dateEl = screen.getByText("09 lug 2024");
    expect(dateEl).toHaveStyle({ color: "rgb(251, 146, 60)" });
  });

  it("la data di un viaggio invernale usa il colore inverno", () => {
    renderCard(makeTrip({ trip_date: "2024-01-15" }));
    const dateEl = screen.getByText("15 gen 2024");
    expect(dateEl).toHaveStyle({ color: "rgb(96, 165, 250)" });
  });
});

describe("TripCardTicket — transport mode", () => {
  beforeEach(() => localStorage.clear());

  it("mostra label 'Aereo' con transport_mode=plane", () => {
    renderCard(makeTrip({ transport_mode: "plane" }));
    expect(screen.getByText("Aereo")).toBeInTheDocument();
  });

  it("mostra label 'Treno' con transport_mode=train", () => {
    renderCard(makeTrip({ transport_mode: "train" }));
    expect(screen.getByText("Treno")).toBeInTheDocument();
  });

  it("non mostra il badge trasporto senza transport_mode", () => {
    renderCard(makeTrip({ transport_mode: null }));
    expect(screen.queryByText("Aereo")).not.toBeInTheDocument();
    expect(screen.queryByText("Treno")).not.toBeInTheDocument();
  });
});

describe("TripCardTicket — rotta waypoints", () => {
  beforeEach(() => localStorage.clear());

  it("mostra le abbreviazioni delle tappe con waypoints presenti", () => {
    const trip = makeTrip({
      city: "Napoli",
      home_label: "Milano",
      waypoints: [{ city: "Roma", country: "Italia", transport_mode: "train" }],
    });
    renderCard(trip);
    // Abbreviazioni: MIL, ROM, NAP
    expect(screen.getByText("MIL")).toBeInTheDocument();
    expect(screen.getByText("ROM")).toBeInTheDocument();
    expect(screen.getByText("NAP")).toBeInTheDocument();
  });

  it("mostra rotta semplice casa→città senza waypoints", () => {
    const trip = makeTrip({ city: "Venezia", home_label: "Milano", waypoints: [] });
    renderCard(trip);
    expect(screen.getByText("VEN")).toBeInTheDocument();
    expect(screen.getByText("MIL")).toBeInTheDocument();
  });

  it("senza home_label mostra la sigla di 'Casa', non un aeroporto hardcoded", () => {
    const trip = makeTrip({ city: "Venezia", home_label: null, waypoints: [] });
    renderCard(trip);
    expect(screen.getByText("VEN")).toBeInTheDocument();
    expect(screen.getByText("CAS")).toBeInTheDocument();
  });
});

describe("TripCardTicket — edit e delete", () => {
  beforeEach(() => { localStorage.clear(); mockNavigate.mockClear(); });

  it("il menu azioni (⋮) è presente", () => {
    renderCard(makeTrip());
    expect(screen.getByRole("button", { name: "Azioni viaggio" })).toBeInTheDocument();
  });

  it("dal menu, Modifica naviga a /modifica-viaggio/:id", () => {
    renderCard(makeTrip({ id: "abc123" }));
    openActions();
    fireEvent.click(screen.getByText("Modifica"));
    expect(mockNavigate).toHaveBeenCalledWith("/modifica-viaggio/abc123");
  });

  it("dal menu, Elimina chiama onDeleteRequested col viaggio senza toccare lo storage", () => {
    const trip = makeTrip({ id: "del-test" });
    localStorage.setItem("atlas.trips.v1", JSON.stringify([trip]));
    const onDeleteRequested = vi.fn();
    renderCard(trip, onDeleteRequested);
    openActions();
    fireEvent.click(screen.getByText("Elimina"));
    expect(onDeleteRequested).toHaveBeenCalledTimes(1);
    expect(onDeleteRequested).toHaveBeenCalledWith(expect.objectContaining({ id: "del-test" }));
    // La cancellazione vera e propria spetta a chi gestisce onDeleteRequested
    // (per poter offrire "Annulla"): qui il viaggio deve restare intatto.
    expect(JSON.parse(localStorage.getItem("atlas.trips.v1")!)).toHaveLength(1);
  });
});

describe("TripCardTicket — note", () => {
  beforeEach(() => localStorage.clear());

  it("mostra le note quando presenti", () => {
    renderCard(makeTrip({ notes: "Cena fantastica sul lungomare" }));
    expect(screen.getByText("Cena fantastica sul lungomare")).toBeInTheDocument();
  });

  it("non mostra la sezione note se notes è null o solo spazi", () => {
    renderCard(makeTrip({ notes: "   " }));
    expect(screen.queryByRole("button", { name: /note/i })).not.toBeInTheDocument();
  });

  it("note brevi: nessun toggle Mostra tutto", () => {
    renderCard(makeTrip({ notes: "Breve nota" }));
    expect(screen.queryByText("Mostra tutto")).not.toBeInTheDocument();
  });

  it("note lunghe: toggle Mostra tutto/Mostra meno espande e comprime", () => {
    const longNotes = "Una nota molto lunga. ".repeat(10).trim(); // > 120 caratteri
    renderCard(makeTrip({ notes: longNotes }));
    expect(screen.getByText("Mostra tutto")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Espandi le note" }));
    expect(screen.getByText("Mostra meno")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Comprimi le note" }));
    expect(screen.getByText("Mostra tutto")).toBeInTheDocument();
  });

  it("note corte ma su molte righe: vengono troncate comunque", () => {
    renderCard(makeTrip({ notes: "zaino\nscarpe\ncrema\ncappello" })); // < 120 caratteri, 4 righe
    expect(screen.getByText("Mostra tutto")).toBeInTheDocument();
  });
});

describe("TripCardTicket — distanza e temperatura", () => {
  beforeEach(() => localStorage.clear());

  it("mostra i km percorsi se il viaggio ha casa e destinazione (via tripTotalKm)", () => {
    // Casa (45,9) → dest (46,9) ≈ 111 km, niente route_geometry → linea d'aria.
    renderCard(makeTrip({ home_latitude: 45, home_longitude: 9, latitude: 46, longitude: 9 }));
    expect(screen.getByText((c) => /^\d+ km$/.test(c) && Math.abs(parseInt(c) - 111) <= 5)).toBeInTheDocument();
  });

  it("non mostra distanza se manca la posizione di casa (nessun percorso)", () => {
    renderCard(makeTrip({ home_latitude: null, home_longitude: null }));
    expect(screen.queryByText(/km$/)).not.toBeInTheDocument();
  });

  it("mostra la temperatura se temperature_c è presente", () => {
    renderCard(makeTrip({ temperature_c: 24 }));
    expect(screen.getByText("24°C")).toBeInTheDocument();
  });

  it("mostra sia il mezzo che la temperatura quando la distanza manca", () => {
    renderCard(makeTrip({ transport_mode: "plane", distance_from_home_km: null, temperature_c: 24 }));
    expect(screen.getByText("Aereo")).toBeInTheDocument();
    expect(screen.getByText("24°C")).toBeInTheDocument();
  });
});

describe("TripCardTicket — compagni di viaggio", () => {
  beforeEach(() => localStorage.clear());

  it("senza il gestore i nomi restano chip semplici, non toccabili", () => {
    renderCard(makeTrip({ companions: ["Giulia"] } as any));
    expect(screen.getByText(/Giulia/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mappa dei viaggi con/i })).not.toBeInTheDocument();
  });

  it("toccando il nome chiede la mappa dei viaggi con quella persona", () => {
    const onSelectCompanion = vi.fn();
    renderCard(makeTrip({ companions: ["Giulia", "Marco"] } as any), undefined, onSelectCompanion);
    fireEvent.click(screen.getByRole("button", { name: /mappa dei viaggi con Marco/i }));
    expect(onSelectCompanion).toHaveBeenCalledWith("Marco");
  });
});

describe("TripCardTicket — flyover 3D", () => {
  it("dal menu, Rivivi in 3D apre la modale", () => {
    // home_latitude/longitude sono null di default in makeTrip: nessuna
    // tratta disponibile, ma la modale si apre comunque (mostra lo stato "empty").
    renderCard(makeTrip());
    openActions();
    fireEvent.click(screen.getByText("Rivivi in 3D"));
    expect(screen.getByRole("button", { name: "Chiudi" })).toBeInTheDocument();
  });

  it("il bottone Chiudi chiude la modale", () => {
    renderCard(makeTrip());
    openActions();
    fireEvent.click(screen.getByText("Rivivi in 3D"));
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByRole("button", { name: "Chiudi" })).not.toBeInTheDocument();
  });
});

// Mezzo, km e temperatura viaggiano insieme: quando il flex va a capo la
// temperatura restava orfana con un divisore spaiato davanti ("| 24.0°C").
describe("TripCardTicket — blocco solidale delle metriche", () => {
  it("temperatura e km stanno nello stesso blocco nowrap del mezzo", () => {
    renderCard(makeTrip({ transport_mode: "car", temperature_c: 24, latitude: 48.21, longitude: 16.37, home_latitude: 45.46, home_longitude: 9.19 }));
    const temp = screen.getByText("24°C");
    const blocco = temp.closest("span[style*='nowrap']");
    expect(blocco).not.toBeNull();
    expect(blocco!.textContent).toContain("km");
    expect(blocco!.textContent).toContain("24°C");
  });

  it("la temperatura decimale si legge con la virgola", () => {
    renderCard(makeTrip({ temperature_c: 18.5 }));
    expect(screen.getByText("18,5°C")).toBeInTheDocument();
  });
});

describe("TripCardTicket — temperatura correggibile a mano", () => {
  // Il dato dei modelli è a griglia ~10-25 km: in una valle lappone il
  // termometro vero segnava -31 dove l'archivio dà -21. L'utente sa cosa
  // segnava, il satellite no: si corregge dove si legge.
  beforeEach(() => localStorage.clear());

  const salvato = () => JSON.parse(localStorage.getItem("atlas.trips.v1") || "[]")[0];

  it("il numero è un bottone; il tocco apre il campo e Invio salva", () => {
    const trip = makeTrip({ id: "t1", temperature_c: -21.1 });
    localStorage.setItem("atlas.trips.v1", JSON.stringify([trip]));
    renderCard(trip);
    fireEvent.click(screen.getByRole("button", { name: /tocca per correggerla/i }));
    const campo = screen.getByLabelText("Temperatura in gradi");
    fireEvent.change(campo, { target: { value: "-31" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(salvato().temperature_c).toBe(-31);
    expect(screen.getByRole("button", { name: /tocca per correggerla/i }).textContent).toContain("-31");
  });

  it("Escape annulla senza salvare", () => {
    const trip = makeTrip({ id: "t1", temperature_c: 7.3 });
    localStorage.setItem("atlas.trips.v1", JSON.stringify([trip]));
    renderCard(trip);
    fireEvent.click(screen.getByRole("button", { name: /tocca per correggerla/i }));
    const campo = screen.getByLabelText("Temperatura in gradi");
    fireEvent.change(campo, { target: { value: "99" } });
    fireEvent.keyDown(campo, { key: "Escape" });
    expect(salvato().temperature_c).toBe(7.3);
  });

  it("un valore fuori dai record terrestri è un refuso: non si salva", () => {
    const trip = makeTrip({ id: "t1", temperature_c: 7.3 });
    localStorage.setItem("atlas.trips.v1", JSON.stringify([trip]));
    renderCard(trip);
    fireEvent.click(screen.getByRole("button", { name: /tocca per correggerla/i }));
    const campo = screen.getByLabelText("Temperatura in gradi");
    fireEvent.change(campo, { target: { value: "300" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(salvato().temperature_c).toBe(7.3);
  });

  it("stesso valore: nessuna riscrittura (updated_at non si timbra a vuoto)", () => {
    const trip = makeTrip({ id: "t1", temperature_c: 7.3, updated_at: "2025-01-01T00:00:00.000Z" });
    localStorage.setItem("atlas.trips.v1", JSON.stringify([trip]));
    renderCard(trip);
    fireEvent.click(screen.getByRole("button", { name: /tocca per correggerla/i }));
    const campo = screen.getByLabelText("Temperatura in gradi");
    fireEvent.keyDown(campo, { key: "Enter" });    // conferma senza cambiare
    expect(salvato().updated_at).toBe("2025-01-01T00:00:00.000Z");
  });
});
