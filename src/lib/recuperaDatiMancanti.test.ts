import { describe, it, expect, vi, beforeEach } from "vitest";
import { recuperaDatiMancanti, CHIAVE_DATI } from "./recuperaDatiMancanti";
import { fetchElevation, fetchRegion, mergeRegions } from "./geo";
import { saveTrips, loadTrips, Trip } from "./storage";

vi.mock("./geo", () => ({
  fetchElevation: vi.fn(),
  fetchRegion: vi.fn(),
  mergeRegions: vi.fn((r: { name: string | null; code: string | null }[]) =>
    r.filter(x => x.name).map(x => ({ name: x.name as string, code: x.code }))),
}));
void mergeRegions;

const viaggio = (over: Partial<Trip> = {}): Trip => ({
  id: "zh", title: "Zurigo", city: "Zurigo", country: "Svizzera", country_code: "CH",
  trip_date: "2025-06-10", date_end: "2025-06-12", latitude: 47.3667, longitude: 8.55,
  created_at: "2025-06-01T00:00:00.000Z", transport_mode: "car", rating: 4, notes: null,
  home_latitude: 45.46, home_longitude: 9.19, home_label: "Milano, Italia",
  region: "Zurigo", region_details: null, route_geometry: null, waypoints: [],
  altitude_m: 408,
  distance_from_home_km: 220, max_distance_from_home_km: 220, max_distance_city: "Zurigo",
  ...over,
} as Trip);

/** Un viaggio salvato mentre la rete non c'era: due buchi (fino al 2026-10-06
 *  erano tre — c'era anche la temperatura, rimossa con tutta la feature). */
const senzaNulla = (over: Partial<Trip> = {}) =>
  viaggio({ altitude_m: null, region: null, ...over });

describe("recuperaDatiMancanti — i viaggi salvati senza rete", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchElevation).mockReset().mockResolvedValue(500);
    vi.mocked(fetchRegion).mockReset().mockResolvedValue({ name: "Canton Zurigo", code: "CH-ZH" });
  });

  it("riempie altitudine e regione mancanti", async () => {
    saveTrips([senzaNulla()]);
    expect(await recuperaDatiMancanti(undefined, 0)).toBe(1);
    const t = loadTrips()[0];
    expect(t.altitude_m).toBe(500);
    expect(t.region).toBe("Canton Zurigo");
    expect(t.region_details).toEqual([{ name: "Canton Zurigo", code: "CH-ZH" }]);
  });

  it("non chiede niente a chi ha già tutto", async () => {
    saveTrips([viaggio()]);
    expect(await recuperaDatiMancanti(undefined, 0)).toBe(0);
    expect(fetchElevation).not.toHaveBeenCalled();
    expect(fetchRegion).not.toHaveBeenCalled();
  });

  // ⚠️ Il paletto della rimozione: i viaggi salvati prima del 2026-10-06 senza
  // temperatura la facevano cercare ogni settimana. Ora una temperatura
  // mancante non è più un buco: nessuna richiesta deve partire.
  it("una temperatura mancante nel dato vecchio non fa partire niente", async () => {
    const vecchio = { ...viaggio(), temperature_c: null, hottest_temp_c: null } as unknown as Trip;
    saveTrips([vecchio]);
    expect(await recuperaDatiMancanti(undefined, 0)).toBe(0);
    expect(fetchElevation).not.toHaveBeenCalled();
    expect(fetchRegion).not.toHaveBeenCalled();
  });

  it("chiede solo quello che manca davvero", async () => {
    saveTrips([viaggio({ altitude_m: null })]);
    await recuperaDatiMancanti(undefined, 0);
    expect(fetchElevation).toHaveBeenCalled();
    expect(fetchRegion).not.toHaveBeenCalled();
  });

  it("ricava anche la tappa più alta", async () => {
    vi.mocked(fetchElevation).mockResolvedValueOnce(1800).mockResolvedValueOnce(400);
    saveTrips([senzaNulla({
      waypoints: [{ city: "Gottardo", country: "Svizzera", transport_mode: "car", lat: 46.55, lon: 8.56 }],
    })]);
    await recuperaDatiMancanti(undefined, 0);
    const t = loadTrips()[0];
    expect(t.altitude_m).toBe(400);                    // la destinazione
    expect(t.max_altitude_city).toBe("Gottardo");
    expect(t.max_altitude_m).toBe(1800);
  });

  // Il cuore della faccenda: la rete NON deve disarmarsi dopo il primo giro.
  it("prova un viaggio nuovo anche se gli altri sono già stati timbrati", async () => {
    saveTrips([senzaNulla()]);
    await recuperaDatiMancanti(undefined, 0);
    vi.mocked(fetchElevation).mockClear();

    saveTrips([...loadTrips(), senzaNulla({ id: "os", city: "Oslo", trip_date: "2025-07-01" })]);
    expect(await recuperaDatiMancanti(undefined, 0)).toBe(1);
    expect(fetchElevation).toHaveBeenCalled();
    expect(loadTrips().find(t => t.id === "os")?.altitude_m).toBe(500);
  });

  it("non ritenta lo stesso viaggio prima di una settimana, e dopo sì", async () => {
    saveTrips([senzaNulla()]);
    vi.mocked(fetchElevation).mockResolvedValue(null);     // il servizio non risponde
    vi.mocked(fetchRegion).mockResolvedValue({ name: null, code: null });
    await recuperaDatiMancanti(undefined, 0);
    vi.mocked(fetchElevation).mockClear();

    await recuperaDatiMancanti(undefined, 0);
    expect(fetchElevation).not.toHaveBeenCalled();

    const vecchio = new Date(Date.now() - 8 * 86_400_000).toISOString();
    localStorage.setItem(CHIAVE_DATI, JSON.stringify({ zh: vecchio }));
    await recuperaDatiMancanti(undefined, 0);
    expect(fetchElevation).toHaveBeenCalled();
  });

  it("non scrive niente se non è arrivato niente", async () => {
    saveTrips([senzaNulla()]);
    const prima = loadTrips()[0].updated_at;
    vi.mocked(fetchElevation).mockResolvedValue(null);
    vi.mocked(fetchRegion).mockResolvedValue({ name: null, code: null });
    expect(await recuperaDatiMancanti(undefined, 0)).toBe(0);
    expect(loadTrips()[0].updated_at).toBe(prima);
  });

  it("dimentica i viaggi cancellati invece di gonfiare l'elenco", async () => {
    saveTrips([senzaNulla(), senzaNulla({ id: "os", city: "Oslo" })]);
    await recuperaDatiMancanti(undefined, 0);
    expect(Object.keys(JSON.parse(localStorage.getItem(CHIAVE_DATI) || "{}")).sort()).toEqual(["os", "zh"]);

    saveTrips([loadTrips()[0]]);
    await recuperaDatiMancanti(undefined, 0);
    expect(Object.keys(JSON.parse(localStorage.getItem(CHIAVE_DATI) || "{}"))).toHaveLength(1);
  });

  it("si ferma a metà se la schermata se ne va", async () => {
    saveTrips([senzaNulla(), senzaNulla({ id: "os", city: "Oslo" })]);
    let chiamate = 0;
    vi.mocked(fetchElevation).mockImplementation(async () => { chiamate++; return 10; });
    await recuperaDatiMancanti(() => chiamate >= 1, 0);
    expect(chiamate).toBeLessThanOrEqual(2);
  });

  // Il ritmo va tenuto su tutto il giro, non dentro il singolo viaggio: nove
  // viaggi a tappa singola sparavano nove richieste a Nominatim in due secondi
  // e mezzo (274 ms di distanza minima, misurati dal vivo).
  it("non spara raffiche a Nominatim con tanti viaggi a tappa singola", async () => {
    const istanti: number[] = [];
    vi.mocked(fetchRegion).mockImplementation(async () => {
      istanti.push(Date.now());
      return { name: "Una regione", code: "IT-XX" };
    });
    saveTrips([senzaNulla({ id: "a" }), senzaNulla({ id: "b" }), senzaNulla({ id: "c" })]);

    await recuperaDatiMancanti(undefined, 60);

    expect(istanti).toHaveLength(3);
    const distanze = istanti.slice(1).map((t, i) => t - istanti[i]);
    for (const d of distanze) expect(d).toBeGreaterThanOrEqual(50);
  });

  it("un viaggio senza coordinate non manda nessuno a cercare niente", async () => {
    saveTrips([senzaNulla({ latitude: NaN as unknown as number, longitude: NaN as unknown as number })]);
    expect(await recuperaDatiMancanti(undefined, 0)).toBe(0);
    expect(fetchElevation).not.toHaveBeenCalled();
  });
});
