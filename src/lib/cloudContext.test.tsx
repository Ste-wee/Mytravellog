import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { CloudProvider, useCloud } from "./cloudContext";
import * as sync from "./firebaseSync";
import * as config from "./firebaseConfig";
import { saveTrips, loadTrips, saveTombstones, Trip } from "./storage";
import { BACKUP_VERSION, ArchivioCloud } from "./backup";

vi.mock("./firebaseSync", () => ({
  onAuth: vi.fn(() => () => { /* stop */ }),
  accedi: vi.fn(),
  esci: vi.fn(async () => { /* ok */ }),
  leggiArchivio: vi.fn(async () => null),
  scriviArchivio: vi.fn(async () => { /* ok */ }),
}));
vi.mock("./firebaseConfig", async (orig) => ({
  ...(await orig() as object),
  cloudConfigurato: vi.fn(() => true),
}));

const viaggio = (id: string, over: Partial<Trip> = {}): Trip => ({
  id, title: id, city: id, country: "Italia", country_code: "IT",
  trip_date: "2026-01-10", date_end: null, latitude: 41.9, longitude: 12.5,
  home_latitude: 45.46, home_longitude: 9.19, home_label: "Milano",
  created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
  rating: null, notes: null, transport_mode: "car", waypoints: [],
  route_geometry: null, temperature_c: null, altitude_m: null,
  max_altitude_m: null, max_altitude_city: null, distance_from_home_km: null,
  max_distance_from_home_km: null, max_distance_city: null,
  hottest_temp_c: null, hottest_city: null, coldest_temp_c: null, coldest_city: null,
  region: null, region_details: null,
  ...over,
} as Trip);

function Sonda() {
  const { status, email, errorMsg, connect, disconnect } = useCloud();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{email ?? "-"}</span>
      <span data-testid="err">{errorMsg ?? "-"}</span>
      <button onClick={() => connect()}>Collega</button>
      <button onClick={() => disconnect()}>Scollega</button>
    </div>
  );
}

const monta = () => render(<CloudProvider><Sonda/></CloudProvider>);
/** L'ascoltatore di onAuth registrato dal provider, per pilotarlo dai test. */
const ascoltatore = () => vi.mocked(sync.onAuth).mock.calls[0][0];

describe("CloudProvider — macchina a stati", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(sync.onAuth).mockClear();
    vi.mocked(sync.accedi).mockReset();
    vi.mocked(sync.esci).mockClear().mockResolvedValue(undefined);
    vi.mocked(sync.leggiArchivio).mockReset().mockResolvedValue(null);
    vi.mocked(sync.scriviArchivio).mockReset().mockResolvedValue(undefined);
    vi.mocked(config.cloudConfigurato).mockReturnValue(true);
  });

  it("parte da guest e resta guest se la sessione non c'è", async () => {
    monta();
    act(() => ascoltatore()(null));
    expect(screen.getByTestId("status").textContent).toBe("guest");
  });

  it("sessione ripescata al riavvio: sincronizza senza chiedere niente", async () => {
    saveTrips([viaggio("locale")]);
    monta();
    act(() => ascoltatore()({ uid: "u1", email: "s@x.it" }));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("connected"));
    expect(screen.getByTestId("email").textContent).toBe("s@x.it");
    expect(sync.scriviArchivio).toHaveBeenCalled();
  });

  it("il pull FONDE, non sovrascrive: locale e remoto sopravvivono entrambi", async () => {
    saveTrips([viaggio("locale")]);
    vi.mocked(sync.leggiArchivio).mockResolvedValue({
      version: BACKUP_VERSION, updatedAt: 5,
      trips: [viaggio("remoto")], plans: [],
    } as ArchivioCloud);
    monta();
    act(() => ascoltatore()({ uid: "u1", email: null }));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("connected"));
    expect(loadTrips().map(t => t.id).sort()).toEqual(["locale", "remoto"]);
  });

  it("archivio corrotto: stato dedicato e NESSUNA scrittura sopra", async () => {
    saveTrips([viaggio("locale")]);
    vi.mocked(sync.leggiArchivio).mockRejectedValue(new Error("archivio_corrotto"));
    monta();
    act(() => ascoltatore()({ uid: "u1", email: null }));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("corrotto"));
    expect(sync.scriviArchivio).not.toHaveBeenCalled();
    // e i dati locali sono ancora lì
    expect(loadTrips().map(t => t.id)).toEqual(["locale"]);
  });

  it("corrotto: il watcher NON riprova ogni 4 secondi (niente sfarfallio)", async () => {
    // Il difetto: lo stato "corrotto" prometteva niente ritentativi, ma il
    // watcher partiva comunque e ogni 4s rifaceva la stessa lettura, facendo
    // lampeggiare la UI fra "syncing" e l'avviso — per sempre.
    vi.useFakeTimers();
    try {
      saveTrips([viaggio("locale")]);
      vi.mocked(sync.leggiArchivio).mockRejectedValue(new Error("archivio_corrotto"));
      monta();
      act(() => ascoltatore()({ uid: "u1", email: null }));
      await act(async () => { await vi.advanceTimersByTimeAsync(50); });
      expect(screen.getByTestId("status").textContent).toBe("corrotto");
      const letture = vi.mocked(sync.leggiArchivio).mock.calls.length;

      await act(async () => { await vi.advanceTimersByTimeAsync(13_000); });   // tre giri di watcher
      expect(vi.mocked(sync.leggiArchivio).mock.calls.length).toBe(letture);
      expect(screen.getByTestId("status").textContent).toBe("corrotto");
      expect(sync.scriviArchivio).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("pull fallito per rete: errore, e si RIPROVA quando l'app torna visibile", async () => {
    vi.mocked(sync.leggiArchivio).mockRejectedValueOnce(new Error("rete"));
    monta();
    act(() => ascoltatore()({ uid: "u1", email: null }));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));

    vi.mocked(sync.leggiArchivio).mockResolvedValue(null);
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("connected"));
  });

  it("doppio tocco su Collega: un solo popup", async () => {
    let sblocca: (() => void) | null = null;
    vi.mocked(sync.accedi).mockImplementation(() =>
      new Promise(res => { sblocca = () => res({ uid: "u1", email: null }); }));
    monta();
    act(() => ascoltatore()(null));
    screen.getByText("Collega").click();
    screen.getByText("Collega").click();
    await waitFor(() => expect(sync.accedi).toHaveBeenCalledTimes(1));
    act(() => sblocca?.());
  });

  it("accesso annullato: torna guest col messaggio, senza sync", async () => {
    vi.mocked(sync.accedi).mockRejectedValue(new Error("auth/popup-closed-by-user"));
    monta();
    act(() => ascoltatore()(null));
    await act(async () => { screen.getByText("Collega").click(); });
    await waitFor(() => expect(screen.getByTestId("err").textContent).toBe("Accesso annullato."));
    expect(screen.getByTestId("status").textContent).toBe("guest");
    expect(sync.scriviArchivio).not.toHaveBeenCalled();
  });

  // Segnalato da Stefano: premuto "Disconnetti" MENTRE l'app diceva
  // "Sincronizzazione…", si tornava subito connessi. La sincronizzazione in
  // volo atterrava dopo lo scollegamento e rimetteva lo stato "connected":
  // il suo finale era protetto solo dal montaggio, non dal fatto che
  // quell'utente ci fosse ancora.
  it("Disconnetti durante una sincronizzazione: si resta scollegati", async () => {
    saveTrips([viaggio("locale")]);
    let atterra: (() => void) | null = null;
    vi.mocked(sync.leggiArchivio).mockImplementation(() =>
      new Promise(res => { atterra = () => res(null); }));

    monta();
    act(() => ascoltatore()({ uid: "u1", email: "s@x.it" }));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("syncing"));

    await act(async () => { screen.getByText("Scollega").click(); });
    expect(screen.getByTestId("status").textContent).toBe("guest");

    // la sincronizzazione in volo atterra ORA, a scollegamento avvenuto
    await act(async () => { atterra?.(); await Promise.resolve(); });
    expect(screen.getByTestId("status").textContent).toBe("guest");
    expect(screen.getByTestId("email").textContent).toBe("-");
  });

  // Due finestre diverse, due guardie: sopra ci si scollega mentre si LEGGE,
  // qui mentre si SCRIVE nel cloud. La seconda l'ha scoperta un mutation test:
  // togliendo la guardia della scrittura i test passavano tutti, perché
  // nessuno arrivava fin lì.
  it("Disconnetti durante la SCRITTURA nel cloud: si resta scollegati", async () => {
    saveTrips([viaggio("locale")]);
    let scritturaFinita: (() => void) | null = null;
    vi.mocked(sync.scriviArchivio).mockImplementation(() =>
      new Promise(res => { scritturaFinita = () => res(undefined); }));

    monta();
    act(() => ascoltatore()({ uid: "u1", email: "s@x.it" }));
    await waitFor(() => expect(sync.scriviArchivio).toHaveBeenCalled());

    await act(async () => { screen.getByText("Scollega").click(); });
    expect(screen.getByTestId("status").textContent).toBe("guest");

    await act(async () => { scritturaFinita?.(); await Promise.resolve(); });
    expect(screen.getByTestId("status").textContent).toBe("guest");
    expect(screen.getByTestId("email").textContent).toBe("-");
  });

  it("Disconnetti durante una sincronizzazione che FALLISCE: nessun errore al guest", async () => {
    saveTrips([viaggio("locale")]);
    let esplodi: (() => void) | null = null;
    vi.mocked(sync.leggiArchivio).mockImplementation(() =>
      new Promise((_, rej) => { esplodi = () => rej(new Error("rete")); }));

    monta();
    act(() => ascoltatore()({ uid: "u1", email: "s@x.it" }));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("syncing"));
    await act(async () => { screen.getByText("Scollega").click(); });
    await act(async () => { esplodi?.(); await Promise.resolve(); });

    expect(screen.getByTestId("status").textContent).toBe("guest");
    expect(screen.getByTestId("err").textContent).toBe("-");
  });

  it("scollegato offline: il flag resta e al riavvio si completa l'uscita", async () => {
    // Il riavvio: la sessione c'è ancora ma l'utente aveva scelto di uscire.
    localStorage.setItem("navta.cloud.scollegato", "1");
    monta();
    act(() => ascoltatore()({ uid: "u1", email: "s@x.it" }));
    await waitFor(() => expect(sync.esci).toHaveBeenCalled());
    expect(screen.getByTestId("status").textContent).toBe("guest");
    expect(sync.scriviArchivio).not.toHaveBeenCalled();
  });

  it("archivio oltre il tetto: errore chiaro, i dati locali restano", async () => {
    saveTrips([viaggio("locale")]);
    vi.mocked(sync.scriviArchivio).mockRejectedValue(new Error("archivio_troppo_grande"));
    monta();
    act(() => ascoltatore()({ uid: "u1", email: null }));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));
    expect(screen.getByTestId("err").textContent).toMatch(/tetto/);
    expect(loadTrips().map(t => t.id)).toEqual(["locale"]);
  });

  it("le lapidi locali partono col push: le cancellazioni si propagano", async () => {
    saveTrips([viaggio("vivo")]);
    saveTombstones("trips", [{ id: "ucciso-qui", at: Date.now() }]);
    monta();
    act(() => ascoltatore()({ uid: "u1", email: null }));
    await waitFor(() => expect(sync.scriviArchivio).toHaveBeenCalled());
    const scritto = vi.mocked(sync.scriviArchivio).mock.calls[0][1] as ArchivioCloud;
    expect(scritto.deletedTrips?.map(d => d.id)).toContain("ucciso-qui");
  });

  it("cloud non configurato: la sezione lo dice e non si prova nemmeno", () => {
    vi.mocked(config.cloudConfigurato).mockReturnValue(false);
    monta();
    // configurato=false arriva alla UI; onAuth del mock è comunque innocuo
    expect(screen.getByTestId("status").textContent).toBe("guest");
  });
});
