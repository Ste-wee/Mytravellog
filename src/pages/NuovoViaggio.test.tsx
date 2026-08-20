import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import NuovoViaggio from "./NuovoViaggio";
import { SettingsProvider } from "@/lib/settings";
import { loadTrips, todayLocalISO } from "@/lib/storage";

vi.mock("@/components/AppHeader", () => ({
  AppHeader: () => <header data-testid="app-header" />,
}));

// Le chiamate geo (Nominatim/Open-Meteo/OSRM) restano mai risolte finché il
// test non lo decide esplicitamente: permette di ispezionare lo stato della
// UI mentre il salvataggio è "in corso", senza dipendere da rete reale o timer.
// vi.hoisted perché vi.mock viene issato sopra ogni `let`/`const` del modulo.
const geoGate = vi.hoisted(() => ({ resolve: null as (() => void) | null }));
vi.mock("@/lib/geo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/geo")>();
  const pending = new Promise<void>(resolve => { geoGate.resolve = resolve; });
  return {
    ...actual,
    searchPlaces: vi.fn(async (q: string) => (q.length < 2 ? [] : [
      { id: 1, name: "Parigi", country: "Francia", country_code: "FR", latitude: 48.85, longitude: 2.35 },
    ])),
    // La ricerca delle tappe passa da qui (città + laghi/monumenti): senza
    // questo mock il campo resta vuoto e i test non trovano nulla da scegliere.
    searchAnyPlace: vi.fn(async (q: string) => (q.length < 2 ? [] : [
      { id: 1, name: "Parigi", country: "Francia", country_code: "FR", latitude: 48.85, longitude: 2.35 },
    ])),
    fetchRegion: vi.fn(async () => { await pending; return { name: null, code: null }; }),
    fetchTemperature: vi.fn(async () => { await pending; return null; }),
    fetchElevation: vi.fn(async () => { await pending; return null; }),
    fetchDrivingRoute: vi.fn(async () => { await pending; return null; }),
  };
});

// Il form usa ResizeObserver (RouteHero) per adattare la larghezza dell'SVG:
// non implementato in jsdom.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/nuovo-viaggio"]}>
      <SettingsProvider>
        <Routes>
          <Route path="/nuovo-viaggio" element={<NuovoViaggio />} />
          <Route path="/" element={<div>HOME</div>} />
        </Routes>
      </SettingsProvider>
    </MemoryRouter>
  );
}

describe("NuovoViaggio — protezione modifiche non salvate", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("senza modifiche, 'Annulla' naviga via senza chiedere conferma", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    renderPage();
    fireEvent.click(screen.getByRole("link", { name: "Annulla" }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByText("HOME")).toBeInTheDocument();
  });

  it("dopo una modifica, 'Annulla' chiede conferma; se annulli la conferma resti sulla pagina", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Viaggio di nozze/), { target: { value: "Le mie vacanze" } });
    fireEvent.click(screen.getByRole("link", { name: "Annulla" }));
    expect(confirmSpy).toHaveBeenCalledWith("Hai modifiche non salvate. Uscire senza salvare?");
    expect(screen.queryByText("HOME")).not.toBeInTheDocument();
  });

  it("dopo una modifica, confermando l'uscita si naviga comunque via", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Viaggio di nozze/), { target: { value: "Le mie vacanze" } });
    fireEvent.click(screen.getByRole("link", { name: "Annulla" }));
    expect(screen.getByText("HOME")).toBeInTheDocument();
  });

  it("registra un handler beforeunload solo dopo una modifica", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    renderPage();
    const beforeUnloadCallsBefore = addSpy.mock.calls.filter(c => c[0] === "beforeunload").length;
    fireEvent.change(screen.getByPlaceholderText(/Viaggio di nozze/), { target: { value: "x" } });
    const beforeUnloadCallsAfter = addSpy.mock.calls.filter(c => c[0] === "beforeunload").length;
    expect(beforeUnloadCallsAfter).toBeGreaterThan(beforeUnloadCallsBefore);
  });
});

describe("NuovoViaggio — validazione date", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("ritorno prima della partenza: mostra l'errore e blocca il salvataggio", async () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "+ Aggiungi tappa" }));
    fireEvent.change(screen.getByPlaceholderText(/Cerca città/), { target: { value: "par" } });
    await screen.findByText("Parigi");
    fireEvent.click(screen.getByText("Parigi").closest("button")!);

    const [dateStartInput, dateEndInput] = container.querySelectorAll('input[type="date"]');
    fireEvent.change(dateStartInput, { target: { value: "2024-06-10" } });
    fireEvent.change(dateEndInput, { target: { value: "2024-06-05" } });

    expect(screen.getByText("Il ritorno non può essere prima della partenza")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Salva viaggio/ }));
    expect(screen.queryByRole("button", { name: /Salvataggio…/ })).not.toBeInTheDocument();
    expect(screen.queryByText("HOME")).not.toBeInTheDocument();
  });
});

describe("NuovoViaggio — la partenza è obbligatoria", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it("senza città di casa non salva: il viaggio sparirebbe dalle mappe", async () => {
    // Nessuna homeCity nelle impostazioni: il form parte senza partenza.
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "+ Aggiungi tappa" }));
    fireEvent.change(screen.getByPlaceholderText(/Cerca città/), { target: { value: "par" } });
    await screen.findByText("Parigi");
    fireEvent.click(screen.getByText("Parigi").closest("button")!);

    fireEvent.click(screen.getByRole("button", { name: /Salva viaggio/ }));

    // Resta sulla pagina: niente salvataggio, niente navigazione alla Home.
    await waitFor(() => expect(screen.queryByText("HOME")).not.toBeInTheDocument());
    expect(loadTrips()).toHaveLength(0);
  });
});

describe("NuovoViaggio — feedback durante il salvataggio lento", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    // La città di casa ora è obbligatoria (senza, il viaggio sparirebbe dalle
    // mappe): il form la prende dalle impostazioni, quindi qui va impostata o
    // il salvataggio si ferma prima di partire.
    localStorage.setItem("atlas.settings.v1", JSON.stringify({
      homeCity: { label: "Milano, Italia", lat: 45.46, lon: 9.19 },
    }));
  });

  it("mentre salva: bottone e Annulla lo dicono chiaramente, invece di sembrare bloccati", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "+ Aggiungi tappa" }));
    fireEvent.change(screen.getByPlaceholderText(/Cerca città/), { target: { value: "par" } });
    await screen.findByText("Parigi");
    fireEvent.click(screen.getByText("Parigi").closest("button")!);

    fireEvent.click(screen.getByRole("button", { name: /Salva viaggio/ }));

    expect(await screen.findByRole("button", { name: /Salvataggio…/ })).toBeInTheDocument();
    expect(screen.getByText(/Recupero regione, meteo e altitudine/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Annulla" })).toHaveAttribute("aria-disabled", "true");

    geoGate.resolve?.();
    await waitFor(() => expect(screen.getByText("HOME")).toBeInTheDocument());
  });
});


describe("NuovoViaggio — avviso doppione", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("atlas.settings.v1", JSON.stringify({
      homeCity: { label: "Milano, Italia", lat: 45.46, lon: 9.19 },
    }));
    // Un viaggio a Parigi già in archivio, stesse date del form (oggi).
    // Data LOCALE come quella che il form propone: con toISOString (UTC) il
    // test falliva fra mezzanotte e le 2 italiane, quando in UTC è ancora ieri
    // — l'archivio finiva un giorno indietro rispetto al form e le date non si
    // sovrapponevano più. Un test che dipende dall'ora del giorno è rotto.
    const oggi = todayLocalISO();
    localStorage.setItem("atlas.trips.v1", JSON.stringify([{
      id: "esistente", city: "Parigi", title: "Parigi", country: "Francia", country_code: "FR",
      trip_date: oggi, date_end: null, latitude: 48.85, longitude: 2.35,
      created_at: "2025-01-01T00:00:00.000Z", transport_mode: "plane",
    }]));
  });

  async function compilaParigi() {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "+ Aggiungi tappa" }));
    fireEvent.change(screen.getByPlaceholderText(/Cerca città/), { target: { value: "par" } });
    await screen.findByText("Parigi");
    fireEvent.click(screen.getByText("Parigi").closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: /Salva viaggio/ }));
  }

  it("stesso posto e date sovrapposte: compare l'avviso, niente salvataggio", async () => {
    await compilaParigi();
    expect(await screen.findByRole("alertdialog", { name: /viaggio simile/i })).toBeInTheDocument();
    expect(loadTrips()).toHaveLength(1);          // solo quello esistente
  });

  it("'Salva lo stesso' procede col salvataggio", async () => {
    await compilaParigi();
    await screen.findByRole("alertdialog", { name: /viaggio simile/i });
    fireEvent.click(screen.getByRole("button", { name: "Salva lo stesso" }));
    // l'avviso sparisce e il salvataggio va fino in fondo (il gate geo è
    // già stato aperto da un test precedente: le fetch completano subito)
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() => expect(loadTrips()).toHaveLength(2));
  });

  it("senza sovrapposizione di date nessun avviso", async () => {
    // sposto il viaggio esistente a un anno fa
    localStorage.setItem("atlas.trips.v1", JSON.stringify([{
      id: "esistente", city: "Parigi", title: "Parigi", country: "Francia", country_code: "FR",
      trip_date: "2024-01-10", date_end: "2024-01-12", latitude: 48.85, longitude: 2.35,
      created_at: "2024-01-01T00:00:00.000Z", transport_mode: "plane",
    }]));
    await compilaParigi();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
