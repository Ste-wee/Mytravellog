import { describe, it, expect, vi, beforeEach } from "vitest";
import { ricalcolaTracciati, CHIAVE_TRACCIATI } from "./ricalcolaTracciati";
import { fetchDrivingRoute } from "./geo";
import { saveTrips, loadTrips, Trip } from "./storage";

vi.mock("./geo", () => ({ fetchDrivingRoute: vi.fn() }));

const PERCORSO: [number, number][] = [[9.19, 45.46], [8.9, 46.2], [8.55, 47.37]];
// Il servizio restituisce il disegno E la sua lunghezza vera: sommare i
// segmenti del disegno semplificato darebbe un numero piu' corto del vero.
const ROTTA = { coords: PERCORSO, km: 282 };

const viaggio = (over: Partial<Trip> = {}): Trip => ({
  id: "zh", title: "Zurigo", city: "Zurigo", country: "Svizzera", country_code: "CH",
  trip_date: "2025-06-10", date_end: "2025-06-12", latitude: 47.3667, longitude: 8.55,
  created_at: "2025-06-01T00:00:00.000Z", transport_mode: "car", rating: 4, notes: null,
  home_latitude: 45.46, home_longitude: 9.19, home_label: "Milano, Italia",
  region: null, region_details: null, route_geometry: null, waypoints: [], temperature_c: 20,
  distance_from_home_km: 220, max_distance_from_home_km: 220, max_distance_city: "Zurigo",
  ...over,
} as Trip);

describe("ricalcolaTracciati — i viaggi su strada rimasti senza percorso", () => {
  beforeEach(() => { localStorage.clear(); vi.mocked(fetchDrivingRoute).mockReset(); });

  it("recupera il tracciato mancante di un viaggio in auto", async () => {
    saveTrips([viaggio()]);
    vi.mocked(fetchDrivingRoute).mockResolvedValue(ROTTA);
    expect(await ricalcolaTracciati()).toBe(1);
    expect(loadTrips()[0].route_geometry).toEqual(PERCORSO);
    expect(fetchDrivingRoute).toHaveBeenCalledWith(45.46, 9.19, 47.3667, 8.55);
  });

  it("non tocca chi ha già tracciato E lunghezza", async () => {
    saveTrips([viaggio({ route_geometry: PERCORSO, route_km: 282 })]);
    expect(await ricalcolaTracciati()).toBe(0);
    expect(fetchDrivingRoute).not.toHaveBeenCalled();
  });

  it("ripesca la lunghezza vera di chi ha il tracciato ma non il numero", async () => {
    // I viaggi salvati prima del 2026-08-22 hanno il disegno e basta: i loro km
    // venivano sommati dai segmenti semplificati, cioè sottostimati del 2-7%.
    saveTrips([viaggio({ route_geometry: PERCORSO })]);
    vi.mocked(fetchDrivingRoute).mockResolvedValue(ROTTA);
    expect(await ricalcolaTracciati()).toBe(1);
    expect(loadTrips()[0].route_km).toBe(282);
    expect(loadTrips()[0].route_geometry).toEqual(PERCORSO);
  });

  it("lascia in pace le tracce GPX fitte, che sono già esatte", async () => {
    // Una traccia registrata sul campo ha punti ogni pochi metri: sommarla dà
    // già la lunghezza vera. Andare a chiedere il percorso su strada
    // sovrascriverebbe il viaggio davvero fatto con un altro itinerario.
    const gpx: [number, number][] = Array.from({ length: 200 }, (_, i) => [9.19 + i * 0.001, 45.46 + i * 0.001]);
    saveTrips([viaggio({ route_geometry: gpx })]);
    expect(await ricalcolaTracciati()).toBe(0);
    expect(fetchDrivingRoute).not.toHaveBeenCalled();
    expect(loadTrips()[0].route_geometry).toEqual(gpx);
  });

  it("non perde le tappe senza coordinate mentre ripara le altre", async () => {
    // Il filtro iniziale le buttava via, e il salvataggio le CANCELLAVA.
    saveTrips([viaggio({
      waypoints: [
        { city: "Sconosciuta", country: "Italia", transport_mode: "car" },
        { city: "Lugano", country: "Svizzera", transport_mode: "car", lat: 46.0, lon: 8.95 },
      ],
    })]);
    vi.mocked(fetchDrivingRoute).mockResolvedValue(ROTTA);
    await ricalcolaTracciati();
    const tappe = loadTrips()[0].waypoints;
    expect(tappe.map(w => w.city)).toEqual(["Sconosciuta", "Lugano"]);
    expect(tappe[1].route_km).toBe(282);
  });

  it("i mezzi non stradali restano senza tracciato (aereo, treno, nave)", async () => {
    saveTrips([viaggio({ transport_mode: "plane" }), viaggio({ id: "b", transport_mode: "train" }),
      viaggio({ id: "c", transport_mode: "ship" })]);
    expect(await ricalcolaTracciati()).toBe(0);
    expect(fetchDrivingRoute).not.toHaveBeenCalled();
  });

  it("bici, moto e bus seguono la strada come l'auto", async () => {
    saveTrips([viaggio({ transport_mode: "bici" }), viaggio({ id: "b", transport_mode: "moto" }),
      viaggio({ id: "c", transport_mode: "bus" })]);
    vi.mocked(fetchDrivingRoute).mockResolvedValue(ROTTA);
    expect(await ricalcolaTracciati()).toBe(3);
  });

  it("viaggio con tappe: ogni tratta stradale parte dalla fermata PRECEDENTE", async () => {
    saveTrips([viaggio({
      waypoints: [{ id: "w1", city: "Lugano", country: "Svizzera", country_code: "CH",
        lat: 46.0, lon: 8.95, transport_mode: "car", route_geometry: null }],
    } as Partial<Trip>)]);
    vi.mocked(fetchDrivingRoute).mockResolvedValue(ROTTA);
    expect(await ricalcolaTracciati()).toBe(2);
    // prima tratta: casa → Lugano; seconda: Lugano → Zurigo (non casa → Zurigo)
    expect(fetchDrivingRoute).toHaveBeenNthCalledWith(1, 45.46, 9.19, 46.0, 8.95);
    expect(fetchDrivingRoute).toHaveBeenNthCalledWith(2, 46.0, 8.95, 47.3667, 8.55);
    const t = loadTrips()[0];
    expect(t.waypoints?.[0].route_geometry).toEqual(PERCORSO);
    expect(t.route_geometry).toEqual(PERCORSO);
  });

  it("senza città di partenza non si può instradare: viaggio saltato", async () => {
    saveTrips([viaggio({ home_latitude: null, home_longitude: null })]);
    expect(await ricalcolaTracciati()).toBe(0);
    expect(fetchDrivingRoute).not.toHaveBeenCalled();
  });

  it("se il servizio non risponde non si riscrive nulla, ma non si riprova all'infinito", async () => {
    saveTrips([viaggio()]);
    const prima = loadTrips()[0].updated_at;
    vi.mocked(fetchDrivingRoute).mockResolvedValue(null);
    expect(await ricalcolaTracciati()).toBe(0);
    expect(loadTrips()[0].updated_at).toBe(prima);      // niente timbro gratuito
    expect(localStorage.getItem(CHIAVE_TRACCIATI)).toBeTruthy();
  });

  it("non ritenta un viaggio già tentato", async () => {
    saveTrips([viaggio()]);
    vi.mocked(fetchDrivingRoute).mockResolvedValue(ROTTA);
    await ricalcolaTracciati();
    vi.mocked(fetchDrivingRoute).mockClear();
    expect(await ricalcolaTracciati()).toBe(0);
    expect(fetchDrivingRoute).not.toHaveBeenCalled();
  });

  it("interrotto a metà: nessun flag, si riprende al prossimo avvio", async () => {
    saveTrips([viaggio({ id: "a" }), viaggio({ id: "b" })]);
    vi.mocked(fetchDrivingRoute).mockResolvedValue(ROTTA);
    let giri = 0;
    await ricalcolaTracciati(() => ++giri > 1);
    expect(localStorage.getItem(CHIAVE_TRACCIATI)).toBeNull();
  });
});

/**
 * Il caso che ha fatto nascere la riscrittura (segnalato da Stefano il
 * 2026-08-21): aveva cancellato e ricreato un Milano→Zurigo in auto, il
 * salvataggio non aveva ottenuto il percorso, e la vecchia rete di sicurezza
 * — un flag "già girato" per dispositivo — non scattava più. Il viaggio
 * sarebbe rimasto senza tracciato per sempre.
 */
describe("ricalcolaTracciati — la rete di sicurezza non si disarma", () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

  it("un viaggio creato DOPO il primo giro viene comunque riparato", async () => {
    saveTrips([viaggio({ id: "vecchio" })]);
    vi.mocked(fetchDrivingRoute).mockResolvedValue(ROTTA);
    await ricalcolaTracciati();                       // primo giro: ripara il vecchio

    saveTrips([...loadTrips(), viaggio({ id: "zurigo" })]);   // ne arriva uno nuovo
    vi.mocked(fetchDrivingRoute).mockClear();
    expect(await ricalcolaTracciati()).toBe(1);
    expect(loadTrips().find(t => t.id === "zurigo")?.route_geometry).toEqual(PERCORSO);
    expect(fetchDrivingRoute).toHaveBeenCalledTimes(1);   // e il vecchio NON si ritenta
  });

  it("un viaggio irreparabile si ritenta, ma solo dopo una settimana", async () => {
    saveTrips([viaggio({ id: "senza-strade" })]);
    vi.mocked(fetchDrivingRoute).mockResolvedValue(null);
    await ricalcolaTracciati();
    vi.mocked(fetchDrivingRoute).mockClear();

    await ricalcolaTracciati();                       // subito dopo: non si insiste
    expect(fetchDrivingRoute).not.toHaveBeenCalled();

    const otto = new Date(Date.now() - 8 * 86400000).toISOString();
    localStorage.setItem(CHIAVE_TRACCIATI, JSON.stringify({ "senza-strade": otto }));
    vi.mocked(fetchDrivingRoute).mockResolvedValue(ROTTA);
    expect(await ricalcolaTracciati()).toBe(1);       // dopo 8 giorni sì
  });

  it("il vecchio flag (una stringa) non blocca il recupero", async () => {
    // chi aggiorna l'app ha in memoria il formato vecchio: va ignorato, non
    // interpretato come "tutto già fatto"
    localStorage.setItem(CHIAVE_TRACCIATI, "2026-08-20T18:00:00.000Z");
    saveTrips([viaggio({ id: "zurigo" })]);
    vi.mocked(fetchDrivingRoute).mockResolvedValue(ROTTA);
    expect(await ricalcolaTracciati()).toBe(1);
  });

  it("i viaggi cancellati escono dall'elenco dei tentativi", async () => {
    saveTrips([viaggio({ id: "a" }), viaggio({ id: "b" })]);
    vi.mocked(fetchDrivingRoute).mockResolvedValue(ROTTA);
    await ricalcolaTracciati();
    saveTrips(loadTrips().filter(t => t.id === "a"));   // "b" cancellato
    await ricalcolaTracciati();
    const memoria = JSON.parse(localStorage.getItem(CHIAVE_TRACCIATI) ?? "{}");
    expect(Object.keys(memoria)).toEqual(["a"]);
  });
});
