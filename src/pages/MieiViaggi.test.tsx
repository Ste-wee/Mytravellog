import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MieiViaggi from "./MieiViaggi";
import { SettingsProvider } from "@/lib/settings";
import { addTrip, loadTrips, loadTombstones } from "@/lib/storage";
import type { Trip } from "@/lib/storage";
import React from "react";

// Mock AppHeader to avoid rendering full nav
vi.mock("@/components/AppHeader", () => ({
  AppHeader: () => <header data-testid="app-header" />,
}));

// Mock TripCardTicket to keep tests focused on MieiViaggi logic. Il bottone
// "Elimina" simula il secondo tap di conferma sul cestino reale.
vi.mock("@/components/TripCardTicket", () => ({
  TripCardTicket: ({ trip, onDeleteRequested }: { trip: Trip; onDeleteRequested?: (trip: Trip) => void }) => (
    <div data-testid="trip-card" data-city={trip.city} data-year={trip.trip_date?.slice(0, 4)}>
      <span>{trip.city}</span>
      <span>{trip.country}</span>
      <span>{trip.title}</span>
      <button onClick={() => onDeleteRequested?.(trip)}>Elimina {trip.city}</button>
    </div>
  ),
}));

// Mock di sonner: il toast reale non renderizza nulla senza un <Toaster/>
// montato, quindi qui catturiamo la chiamata per poter simulare il click
// su "Annulla" chiamando direttamente action.onClick.
const mockToast = vi.fn();
const mockToastDismiss = vi.fn();
vi.mock("sonner", () => {
  const toastFn = (...args: unknown[]) => mockToast(...args);
  (toastFn as any).dismiss = (...args: unknown[]) => mockToastDismiss(...args);
  return { toast: toastFn };
});

// photoStorage usa IndexedDB, non disponibile in questo ambiente di test
// (a differenza di photoStorage.test.ts, che lo polyfilla): qui non serve
// verificarne il comportamento interno, solo che venga invocato. Il resto
// del modulo resta reale: TripFlyover (montato dai test del recap 3D) usa
// anche destinationPhotoKey/getPhotosForTrip.
const mockDeletePhotosForTrip = vi.fn();
vi.mock("@/lib/photoStorage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/photoStorage")>();
  return {
    ...actual,
    deletePhotosForTrip: (...args: unknown[]) => mockDeletePhotosForTrip(...args),
  };
});

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SettingsProvider>
        <MieiViaggi />
      </SettingsProvider>
    </MemoryRouter>
  );
}

function baseTrip(overrides: Partial<Omit<Trip, "id" | "created_at">> = {}): Omit<Trip, "id" | "created_at"> {
  return {
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
    home_label: null,
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

describe("MieiViaggi — empty state", () => {
  beforeEach(() => localStorage.clear());

  it("mostra 'Nessun viaggio ancora' senza viaggi", () => {
    renderPage();
    expect(screen.getByText(/nessun viaggio ancora/i)).toBeInTheDocument();
  });

  it("mostra '0 viaggi' nel sottotitolo", () => {
    renderPage();
    expect(screen.getByText(/0 viaggi/i)).toBeInTheDocument();
  });
});

describe("MieiViaggi — lista viaggi", () => {
  beforeEach(() => localStorage.clear());

  it("mostra le card dei viaggi presenti", () => {
    addTrip(baseTrip({ city: "Roma" }));
    addTrip(baseTrip({ city: "Milano" }));
    renderPage();
    expect(screen.getAllByTestId("trip-card")).toHaveLength(2);
  });

  it("mostra '1 viaggio' (singolare) con un solo viaggio", () => {
    addTrip(baseTrip());
    renderPage();
    expect(screen.getByText("1 viaggio")).toBeInTheDocument();
  });

  it("mostra '3 viaggi' (plurale) con tre viaggi", () => {
    addTrip(baseTrip());
    addTrip(baseTrip());
    addTrip(baseTrip());
    renderPage();
    expect(screen.getByText("3 viaggi")).toBeInTheDocument();
  });
});

describe("MieiViaggi — raggruppamento per anno", () => {
  beforeEach(() => localStorage.clear());

  it("raggruppa correttamente i viaggi per anno", () => {
    addTrip(baseTrip({ trip_date: "2023-03-10" }));
    addTrip(baseTrip({ trip_date: "2024-07-15" }));
    renderPage();
    // "2023"/"2024" compaiono sia nel chip filtro anno che nell'intestazione di sezione
    expect(screen.getAllByText("2023").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("2024").length).toBeGreaterThanOrEqual(1);
  });

  it("ordina gli anni in modo decrescente (più recente prima)", () => {
    addTrip(baseTrip({ trip_date: "2022-01-01" }));
    addTrip(baseTrip({ trip_date: "2024-01-01" }));
    addTrip(baseTrip({ trip_date: "2023-01-01" }));
    renderPage();
    const years = screen.getAllByText(/^202[2-4]$/);
    expect(years[0].textContent).toBe("2024");
    expect(years[1].textContent).toBe("2023");
    expect(years[2].textContent).toBe("2022");
  });

  it("mostra il contatore corretto per anno", () => {
    addTrip(baseTrip({ trip_date: "2024-01-01" }));
    addTrip(baseTrip({ trip_date: "2024-06-15" }));
    addTrip(baseTrip({ trip_date: "2023-08-20" }));
    renderPage();
    // Anno 2024 → 2 viaggi, 2023 → 1 viaggio
    const counters = screen.getAllByText("2");
    expect(counters.length).toBeGreaterThanOrEqual(1);
  });
});

describe("MieiViaggi — ricerca", () => {
  beforeEach(() => localStorage.clear());

  it("filtra per city (case-insensitive)", () => {
    addTrip(baseTrip({ city: "Roma",   title: "Roma" }));
    addTrip(baseTrip({ city: "Milano", title: "Milano" }));
    renderPage();
    const input = screen.getByPlaceholderText(/cerca città/i);
    fireEvent.change(input, { target: { value: "roma" } });
    const cards = screen.getAllByTestId("trip-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("data-city", "Roma");
  });

  it("filtra per country (case-insensitive)", () => {
    addTrip(baseTrip({ country: "Italia",  city: "Roma" }));
    addTrip(baseTrip({ country: "Francia", city: "Parigi" }));
    renderPage();
    const input = screen.getByPlaceholderText(/cerca città/i);
    fireEvent.change(input, { target: { value: "francia" } });
    const cards = screen.getAllByTestId("trip-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("data-city", "Parigi");
  });

  it("filtra per title", () => {
    addTrip(baseTrip({ title: "Vacanza estiva", city: "Palermo" }));
    addTrip(baseTrip({ title: "Weekend Milano", city: "Milano" }));
    renderPage();
    const input = screen.getByPlaceholderText(/cerca città/i);
    fireEvent.change(input, { target: { value: "estiva" } });
    const cards = screen.getAllByTestId("trip-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("data-city", "Palermo");
  });

  it("ricerca vuota mostra tutti i viaggi", () => {
    addTrip(baseTrip({ city: "Roma" }));
    addTrip(baseTrip({ city: "Milano" }));
    addTrip(baseTrip({ city: "Napoli" }));
    renderPage();
    const input = screen.getByPlaceholderText(/cerca città/i);
    fireEvent.change(input, { target: { value: "roma" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getAllByTestId("trip-card")).toHaveLength(3);
  });

  it("nessun risultato → mostra 'Nessun risultato'", () => {
    addTrip(baseTrip({ city: "Roma" }));
    renderPage();
    const input = screen.getByPlaceholderText(/cerca città/i);
    fireEvent.change(input, { target: { value: "xyzabc" } });
    expect(screen.getByText(/nessun risultato/i)).toBeInTheDocument();
  });

  it("click sul pulsante X resetta la ricerca", () => {
    addTrip(baseTrip({ city: "Roma" }));
    addTrip(baseTrip({ city: "Milano" }));
    renderPage();
    const input = screen.getByPlaceholderText(/cerca città/i);
    fireEvent.change(input, { target: { value: "roma" } });
    expect(screen.getAllByTestId("trip-card")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancella la ricerca" }));
    expect(screen.getAllByTestId("trip-card")).toHaveLength(2);
  });

  it("trova un viaggio anche se la città cercata è solo una tappa intermedia", () => {
    addTrip(baseTrip({
      city: "Parigi", country: "Francia",
      waypoints: [{ id: "w1", city: "Firenze", country: "Italia", transport_mode: "car" }],
    }));
    addTrip(baseTrip({ city: "Milano" }));
    renderPage();
    const input = screen.getByPlaceholderText(/cerca città/i);
    fireEvent.change(input, { target: { value: "firenze" } });
    const cards = screen.getAllByTestId("trip-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("data-city", "Parigi");
  });

  it("filtra anche per contenuto delle note", () => {
    addTrip(baseTrip({ city: "Roma", notes: "Visto il Colosseo al tramonto" }));
    addTrip(baseTrip({ city: "Milano", notes: null }));
    renderPage();
    const input = screen.getByPlaceholderText(/cerca città/i);
    fireEvent.change(input, { target: { value: "colosseo" } });
    const cards = screen.getAllByTestId("trip-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("data-city", "Roma");
  });
});

describe("MieiViaggi — filtro per anno", () => {
  beforeEach(() => localStorage.clear());

  it("non mostra i chip degli anni se c'è un solo anno", () => {
    addTrip(baseTrip({ trip_date: "2024-01-01", city: "Roma" }));
    addTrip(baseTrip({ trip_date: "2024-06-15", city: "Milano" }));
    renderPage();
    expect(screen.queryByRole("button", { name: "Tutti" })).not.toBeInTheDocument();
  });

  it("filtra i viaggi cliccando un chip anno", () => {
    addTrip(baseTrip({ trip_date: "2023-03-10", city: "Roma" }));
    addTrip(baseTrip({ trip_date: "2024-07-15", city: "Milano" }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "2023" }));
    const cards = screen.getAllByTestId("trip-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("data-city", "Roma");
  });

  it("cliccare di nuovo lo stesso chip anno rimuove il filtro", () => {
    addTrip(baseTrip({ trip_date: "2023-03-10", city: "Roma" }));
    addTrip(baseTrip({ trip_date: "2024-07-15", city: "Milano" }));
    renderPage();
    const chip2023 = screen.getByRole("button", { name: "2023" });
    fireEvent.click(chip2023);
    expect(screen.getAllByTestId("trip-card")).toHaveLength(1);
    fireEvent.click(chip2023);
    expect(screen.getAllByTestId("trip-card")).toHaveLength(2);
  });

  it("il chip 'Tutti' resetta il filtro per anno", () => {
    addTrip(baseTrip({ trip_date: "2023-03-10", city: "Roma" }));
    addTrip(baseTrip({ trip_date: "2024-07-15", city: "Milano" }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "2023" }));
    expect(screen.getAllByTestId("trip-card")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Tutti" }));
    expect(screen.getAllByTestId("trip-card")).toHaveLength(2);
  });

  it("combina ricerca testuale e filtro per anno", () => {
    addTrip(baseTrip({ trip_date: "2023-03-10", city: "Roma", title: "Roma" }));
    addTrip(baseTrip({ trip_date: "2024-07-15", city: "Roma", title: "Roma" }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "2023" }));
    const input = screen.getByPlaceholderText(/cerca città/i);
    fireEvent.change(input, { target: { value: "roma" } });
    const cards = screen.getAllByTestId("trip-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("data-year", "2023");
  });
});

describe("MieiViaggi — recap 3D per anno", () => {
  beforeEach(() => localStorage.clear());

  it("non mostra il bottone di recap se l'anno ha un solo viaggio", () => {
    addTrip(baseTrip({ trip_date: "2024-01-01", city: "Roma" }));
    renderPage();
    expect(screen.queryByRole("button", { name: /Rivivi il 2024 in 3D/ })).not.toBeInTheDocument();
  });

  it("mostra il bottone di recap se l'anno ha almeno due viaggi", () => {
    addTrip(baseTrip({ trip_date: "2024-01-01", city: "Roma" }));
    addTrip(baseTrip({ trip_date: "2024-06-15", city: "Milano" }));
    renderPage();
    expect(screen.getByRole("button", { name: /Rivivi il 2024 in 3D/ })).toBeInTheDocument();
  });

  it("click sul bottone di recap apre la modale del flyover", () => {
    addTrip(baseTrip({ trip_date: "2024-01-01", city: "Roma" }));
    addTrip(baseTrip({ trip_date: "2024-06-15", city: "Milano" }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Rivivi il 2024 in 3D/ }));
    expect(screen.getByRole("button", { name: "Chiudi" })).toBeInTheDocument();
  });

  it("il bottone Chiudi chiude la modale del recap", () => {
    addTrip(baseTrip({ trip_date: "2024-01-01", city: "Roma" }));
    addTrip(baseTrip({ trip_date: "2024-06-15", city: "Milano" }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Rivivi il 2024 in 3D/ }));
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByRole("button", { name: "Chiudi" })).not.toBeInTheDocument();
  });
});

describe("MieiViaggi — eliminazione con Annulla", () => {
  beforeEach(() => {
    localStorage.clear();
    mockToast.mockClear();
    mockToastDismiss.mockClear();
    mockDeletePhotosForTrip.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("richiedere l'eliminazione mostra un toast con azione Annulla, senza toccare subito lo storage", () => {
    addTrip(baseTrip({ city: "Roma" }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Elimina Roma" }));

    expect(mockToast).toHaveBeenCalledTimes(1);
    const [, options] = mockToast.mock.calls[0];
    expect(options.action.label).toBe("Annulla");
    expect(loadTrips()).toHaveLength(1); // ancora lì: la cancellazione è sospesa
  });

  it("dopo l'animazione la card sparisce dalla lista, ma il viaggio resta in storage durante la finestra di grazia", () => {
    addTrip(baseTrip({ city: "Roma" }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Elimina Roma" }));

    act(() => { vi.advanceTimersByTime(200); }); // DELETE_ANIM_MS
    expect(screen.queryAllByTestId("trip-card")).toHaveLength(0);
    expect(loadTrips()).toHaveLength(1);
  });

  it("cliccare Annulla prima che scada la finestra ripristina il viaggio ed evita la cancellazione", () => {
    addTrip(baseTrip({ city: "Roma" }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Elimina Roma" }));
    act(() => { vi.advanceTimersByTime(200); }); // la card è già sparita dalla lista

    const [, options] = mockToast.mock.calls[0];
    act(() => { options.action.onClick(); }); // "Annulla"

    expect(screen.getAllByTestId("trip-card")).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(5000); }); // scade la finestra: non deve eliminare nulla
    expect(loadTrips()).toHaveLength(1);
    // …e NESSUN tombstone: altrimenti alla prossima sincronizzazione il backup
    // ucciderebbe un viaggio che l'utente ha appena recuperato con "Annulla".
    expect(loadTombstones("trips")).toHaveLength(0);
  });

  it("senza Annulla, allo scadere della finestra il viaggio viene eliminato per davvero", () => {
    const t = addTrip(baseTrip({ city: "Roma" }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Elimina Roma" }));

    act(() => { vi.advanceTimersByTime(5000); }); // UNDO_GRACE_MS
    expect(loadTrips()).toHaveLength(0);
    expect(mockDeletePhotosForTrip).toHaveBeenCalledTimes(1);
    // tombstone registrato: la cancellazione deve propagarsi agli altri dispositivi
    expect(loadTombstones("trips").map(d => d.id)).toEqual([t.id]);
  });

  it("Annulla immediato (prima della fine dell'animazione) non fa sparire la card", () => {
    addTrip(baseTrip({ city: "Roma" }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Elimina Roma" }));

    const [, options] = mockToast.mock.calls[0];
    act(() => { options.action.onClick(); }); // "Annulla" entro i 200ms dell'animazione

    act(() => { vi.advanceTimersByTime(300); }); // il timer dell'animazione non deve rimuoverla
    expect(screen.getAllByTestId("trip-card")).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(loadTrips()).toHaveLength(1);
  });

  it("una seconda conferma sulla stessa card viene ignorata (nessun timer orfano)", () => {
    addTrip(baseTrip({ city: "Roma" }));
    renderPage();
    const btn = screen.getByRole("button", { name: "Elimina Roma" });
    fireEvent.click(btn);
    fireEvent.click(btn); // doppio tap durante l'animazione di uscita
    expect(mockToast).toHaveBeenCalledTimes(1);

    // L'Annulla del primo (unico) toast deve ancora funzionare fino in fondo.
    const [, options] = mockToast.mock.calls[0];
    act(() => { options.action.onClick(); });
    act(() => { vi.advanceTimersByTime(6000); });
    expect(loadTrips()).toHaveLength(1);
  });

  it("uscendo dalla pagina le cancellazioni in sospeso vengono eseguite e il toast chiuso", () => {
    addTrip(baseTrip({ city: "Roma" }));
    const { unmount } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Elimina Roma" }));

    unmount();
    expect(loadTrips()).toHaveLength(0); // eseguita subito, non lasciata a metà
    expect(mockToastDismiss).toHaveBeenCalledTimes(1); // niente "Annulla" ingannevole rimasto
  });
});

describe("MieiViaggi — vista a griglia", () => {
  beforeEach(() => {
    localStorage.clear();
    // jsdom non implementa scrollIntoView: l'atterraggio dalla griglia lo usa.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("il toggle porta alla griglia: card compatte al posto dei biglietti", () => {
    addTrip(baseTrip({ city: "Roma", title: "Capitale" }));
    addTrip(baseTrip({ city: "Milano", title: "Design week" }));
    renderPage();
    expect(screen.getAllByTestId("trip-card")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Griglia/ }));
    // biglietti spariti, card compatte presenti (una per viaggio)
    expect(screen.queryByTestId("trip-card")).toBeNull();
    expect(screen.getByRole("button", { name: "Apri il biglietto di Capitale" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apri il biglietto di Design week" })).toBeInTheDocument();
    // la preferenza si ricorda
    expect(localStorage.getItem("navta.viaggi.vista.v1")).toBe("griglia");
  });

  it("toccare una card riporta alla lista, scrollata sul biglietto", () => {
    addTrip(baseTrip({ city: "Roma", title: "Capitale" }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Griglia/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apri il biglietto di Capitale" }));
    // di nuovo in lista, e l'occhio viene portato sul biglietto
    expect(screen.getByTestId("trip-card")).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("la preferenza griglia sopravvive al ritorno sulla pagina", () => {
    localStorage.setItem("navta.viaggi.vista.v1", "griglia");
    addTrip(baseTrip({ city: "Roma", title: "Capitale" }));
    renderPage();
    expect(screen.queryByTestId("trip-card")).toBeNull();
    expect(screen.getByRole("button", { name: "Apri il biglietto di Capitale" })).toBeInTheDocument();
  });
});

/**
 * Le DUE SCHEDE (2026-08-26). Stefano: «non sono convinto che le gite in
 * giornata debbano stare insieme ai miei viaggi». Prima erano una sezione
 * dentro l'elenco dei viaggi — separate a metà; ora sono una scheda a sé.
 *
 * ⚠️ Questi test guardano la SEPARAZIONE, che è il punto: una gita non deve
 * comparire mentre guardi i viaggi, e viceversa. Se un domani qualcuno fa
 * partire l'elenco da `trips` grezzo invece che da `separaGite`, cadono qui.
 */
describe("MieiViaggi — le due schede: viaggi e gite", () => {
  // ⚠️ Serve anche qui: il `beforeEach` che azzera vive dentro l'altro
  // `describe`, e senza questo i primi test leggevano i viaggi lasciati dai
  // test precedenti — «Viaggi 2» con un viaggio solo in archivio, e zero card
  // perché era rimasta accesa la vista a griglia.
  beforeEach(() => localStorage.clear());

  const conGite = () => {
    addTrip(baseTrip({ city: "Zurigo", title: "Zurigo", trip_date: "2026-06-01", date_end: "2026-06-05" }));
    addTrip(baseTrip({ city: "Como", title: "Como", trip_date: "2026-11-14", date_end: "2026-11-14" }));
    addTrip(baseTrip({ city: "Mantova", title: "Mantova", trip_date: "2025-04-06", date_end: "2025-04-06" }));
  };
  const cittaAScehrmo = () =>
    screen.queryAllByTestId("trip-card").map(e => e.getAttribute("data-city"));

  it("mostra due schede col conteggio dei due mucchi", () => {
    conGite();
    renderPage();
    expect(screen.getByRole("tab", { name: /Viaggi/ })).toHaveTextContent("1");
    expect(screen.getByRole("tab", { name: /Gite/ })).toHaveTextContent("2");
  });

  it("la scheda Viaggi non mostra le gite", () => {
    conGite();
    renderPage();
    expect(cittaAScehrmo()).toEqual(["Zurigo"]);
  });

  it("la scheda Gite mostra SOLO le gite", () => {
    conGite();
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /Gite/ }));
    expect(cittaAScehrmo().sort()).toEqual(["Como", "Mantova"]);
  });

  it("senza gite in archivio le schede non compaiono affatto", () => {
    addTrip(baseTrip({ city: "Zurigo", trip_date: "2026-06-01", date_end: "2026-06-05" }));
    renderPage();
    expect(screen.queryByRole("tab", { name: /Gite/ })).toBeNull();
    expect(screen.queryAllByTestId("trip-card").length).toBe(1);
  });

  it("i chip degli anni sono quelli della scheda attiva", () => {
    conGite();
    renderPage();
    // viaggi: solo 2026 → un anno solo, niente chip
    expect(screen.queryByRole("button", { name: "2025" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Gite/ }));
    // gite: 2026 e 2025
    expect(screen.getByRole("button", { name: "2025" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2026" })).toBeInTheDocument();
  });

  it("cambiando scheda l'anno selezionato si azzera", () => {
    conGite();
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /Gite/ }));
    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    expect(cittaAScehrmo()).toEqual(["Mantova"]);
    // Tornando ai viaggi, un 2025 rimasto acceso darebbe una pagina vuota
    fireEvent.click(screen.getByRole("tab", { name: /Viaggi/ }));
    expect(cittaAScehrmo()).toEqual(["Zurigo"]);
  });

  it("la ricerca vale dentro la scheda aperta", () => {
    conGite();
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /Gite/ }));
    fireEvent.change(screen.getByPlaceholderText(/Cerca/), { target: { value: "como" } });
    expect(cittaAScehrmo()).toEqual(["Como"]);
  });
});
