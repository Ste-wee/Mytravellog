import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ricalcolaTemperature, CHIAVE_RICALCOLO } from "./ricalcolaTemperature";
import { fetchTemperature } from "./geo";
import { saveTrips, loadTrips, Trip } from "./storage";

vi.mock("./geo", () => ({ fetchTemperature: vi.fn() }));

const viaggio = (over: Partial<Trip> = {}): Trip => ({
  id: "t1", title: "Lapponia", city: "Rovaniemi", country: "Finlandia", country_code: "FI",
  trip_date: "2025-01-08", date_end: "2025-01-14", latitude: 66.5, longitude: 25.73,
  created_at: "2025-01-01T00:00:00.000Z", transport_mode: "plane", rating: 5, notes: null,
  home_latitude: 45.46, home_longitude: 9.19, home_label: "Milano, Italia",
  region: null, region_details: null, route_geometry: null, waypoints: [],
  temperature_c: -12, hottest_temp_c: -12, hottest_city: "Rovaniemi",
  coldest_temp_c: -12, coldest_city: "Rovaniemi",
  distance_from_home_km: 2400, max_distance_from_home_km: 2400, max_distance_city: "Rovaniemi",
  ...over,
} as Trip);

describe("ricalcolaTemperature — i viaggi vecchi passano al criterio nuovo", () => {
  beforeEach(() => { localStorage.clear(); vi.mocked(fetchTemperature).mockReset(); });
  afterEach(() => vi.restoreAllMocks());

  it("riscrive la temperatura e passa il PERIODO, non il solo giorno", async () => {
    saveTrips([viaggio()]);
    vi.mocked(fetchTemperature).mockResolvedValue(-31);
    const n = await ricalcolaTemperature();
    expect(n).toBe(1);
    expect(loadTrips()[0].temperature_c).toBe(-31);
    expect(fetchTemperature).toHaveBeenCalledWith(66.5, 25.73, "2025-01-08", "2025-01-14");
  });

  it("aggiorna anche la tappa più calda e la più fredda (o resterebbero incoerenti)", async () => {
    saveTrips([viaggio({
      waypoints: [{ id: "w1", city: "Helsinki", country: "Finlandia", country_code: "FI", lat: 60.17, lon: 24.94, transport_mode: "plane" }],
    } as Partial<Trip>)]);
    vi.mocked(fetchTemperature)
      .mockResolvedValueOnce(-9)     // Helsinki
      .mockResolvedValueOnce(-31);   // Rovaniemi (destinazione)
    await ricalcolaTemperature();
    const t = loadTrips()[0];
    expect(t.temperature_c).toBe(-31);          // la destinazione
    expect(t.coldest_temp_c).toBe(-31);
    expect(t.coldest_city).toBe("Rovaniemi");
    expect(t.hottest_temp_c).toBe(-9);
    expect(t.hottest_city).toBe("Helsinki");
  });

  it("gira UNA volta sola: al secondo avvio non tocca più la rete", async () => {
    saveTrips([viaggio()]);
    vi.mocked(fetchTemperature).mockResolvedValue(-31);
    await ricalcolaTemperature();
    expect(localStorage.getItem(CHIAVE_RICALCOLO)).toBeTruthy();
    vi.mocked(fetchTemperature).mockClear();
    const n = await ricalcolaTemperature();
    expect(n).toBe(0);
    expect(fetchTemperature).not.toHaveBeenCalled();
  });

  it("se il valore non cambia NON riscrive: updated_at timbrato a vuoto farebbe vincere questa copia nel sync", async () => {
    saveTrips([viaggio({ temperature_c: -31, hottest_temp_c: -31, coldest_temp_c: -31 })]);
    const prima = loadTrips()[0].updated_at;
    vi.mocked(fetchTemperature).mockResolvedValue(-31);
    expect(await ricalcolaTemperature()).toBe(0);
    expect(loadTrips()[0].updated_at).toBe(prima);
  });

  it("interrotto a metà: nessun flag, si riprende al prossimo avvio", async () => {
    saveTrips([viaggio({ id: "a" }), viaggio({ id: "b" })]);
    vi.mocked(fetchTemperature).mockResolvedValue(-31);
    let visti = 0;
    await ricalcolaTemperature(() => ++visti > 1);   // si ferma dopo il primo giro
    expect(localStorage.getItem(CHIAVE_RICALCOLO)).toBeNull();
  });

  it("temperatura non disponibile (futuro, API muta) → il viaggio resta com'è", async () => {
    saveTrips([viaggio()]);
    vi.mocked(fetchTemperature).mockResolvedValue(null);
    expect(await ricalcolaTemperature()).toBe(0);
    expect(loadTrips()[0].temperature_c).toBe(-12);
  });

  it("viaggio senza coordinate valide: saltato senza errori", async () => {
    // NB: (0,0) NON è "senza coordinate" — è l'equatore a Greenwich, e
    // hasCoords lo accetta di proposito. Il caso vero è null/NaN.
    saveTrips([viaggio({ latitude: null as unknown as number, longitude: null as unknown as number, waypoints: [] })]);
    expect(await ricalcolaTemperature()).toBe(0);
    expect(fetchTemperature).not.toHaveBeenCalled();
  });
});
