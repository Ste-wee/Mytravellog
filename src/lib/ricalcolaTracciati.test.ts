import { describe, it, expect, vi, beforeEach } from "vitest";
import { ricalcolaTracciati, CHIAVE_TRACCIATI } from "./ricalcolaTracciati";
import { fetchDrivingRoute } from "./geo";
import { saveTrips, loadTrips, Trip } from "./storage";

vi.mock("./geo", () => ({ fetchDrivingRoute: vi.fn() }));

const PERCORSO: [number, number][] = [[9.19, 45.46], [8.9, 46.2], [8.55, 47.37]];

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
    vi.mocked(fetchDrivingRoute).mockResolvedValue(PERCORSO);
    expect(await ricalcolaTracciati()).toBe(1);
    expect(loadTrips()[0].route_geometry).toEqual(PERCORSO);
    expect(fetchDrivingRoute).toHaveBeenCalledWith(45.46, 9.19, 47.3667, 8.55);
  });

  it("non tocca chi il tracciato ce l'ha già", async () => {
    saveTrips([viaggio({ route_geometry: PERCORSO })]);
    expect(await ricalcolaTracciati()).toBe(0);
    expect(fetchDrivingRoute).not.toHaveBeenCalled();
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
    vi.mocked(fetchDrivingRoute).mockResolvedValue(PERCORSO);
    expect(await ricalcolaTracciati()).toBe(3);
  });

  it("viaggio con tappe: ogni tratta stradale parte dalla fermata PRECEDENTE", async () => {
    saveTrips([viaggio({
      waypoints: [{ id: "w1", city: "Lugano", country: "Svizzera", country_code: "CH",
        lat: 46.0, lon: 8.95, transport_mode: "car", route_geometry: null }],
    } as Partial<Trip>)]);
    vi.mocked(fetchDrivingRoute).mockResolvedValue(PERCORSO);
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

  it("gira una volta sola", async () => {
    saveTrips([viaggio()]);
    vi.mocked(fetchDrivingRoute).mockResolvedValue(PERCORSO);
    await ricalcolaTracciati();
    vi.mocked(fetchDrivingRoute).mockClear();
    expect(await ricalcolaTracciati()).toBe(0);
    expect(fetchDrivingRoute).not.toHaveBeenCalled();
  });

  it("interrotto a metà: nessun flag, si riprende al prossimo avvio", async () => {
    saveTrips([viaggio({ id: "a" }), viaggio({ id: "b" })]);
    vi.mocked(fetchDrivingRoute).mockResolvedValue(PERCORSO);
    let giri = 0;
    await ricalcolaTracciati(() => ++giri > 1);
    expect(localStorage.getItem(CHIAVE_TRACCIATI)).toBeNull();
  });
});
