import { describe, it, expect } from "vitest";
import { computeYearRecap, availableYears } from "./recap";
import type { Trip } from "@/lib/storage";

function makeTrip(o: Partial<Trip> = {}): Trip {
  return {
    id: Math.random().toString(36).slice(2), created_at: "2026-01-01T00:00:00Z",
    title: "T", country: "Italia", city: "Roma", country_code: "IT",
    trip_date: "2026-06-01", date_end: null, rating: null, notes: null,
    transport_mode: "car", waypoints: [],
    latitude: 41.9, longitude: 12.5, home_latitude: 45.5, home_longitude: 9.2, home_label: "Milano",
    route_geometry: null, temperature_c: null, altitude_m: null, max_altitude_m: null, max_altitude_city: null,
    distance_from_home_km: null, max_distance_from_home_km: null, max_distance_city: null,
    hottest_temp_c: null, hottest_city: null, coldest_temp_c: null, coldest_city: null,
    region: null, region_details: null, ...o,
  };
}

describe("availableYears", () => {
  it("ritorna gli anni con viaggi, decrescenti e unici", () => {
    const trips = [makeTrip({ trip_date: "2026-01-01" }), makeTrip({ trip_date: "2024-07-01" }), makeTrip({ trip_date: "2026-09-01" })];
    expect(availableYears(trips)).toEqual([2026, 2024]);
  });
});

describe("computeYearRecap", () => {
  it("filtra per anno e conta viaggi/paesi/città/mesi", () => {
    const trips = [
      makeTrip({ trip_date: "2026-06-01", country: "Italia", country_code: "IT", city: "Roma",
        waypoints: [{ city: "Innsbruck", country: "Austria", country_code: "AT", transport_mode: "car", lat: 47.27, lon: 11.39 }] }),
      makeTrip({ trip_date: "2026-08-10", country: "Italia", country_code: "IT", city: "Napoli" }),
      makeTrip({ trip_date: "2025-05-01", country: "Francia", country_code: "FR", city: "Parigi" }),
    ];
    const r = computeYearRecap(trips, 2026);
    expect(r.trips).toBe(2);
    expect(r.countries).toBe(2); // Italia + Austria (la Francia è 2025)
    expect(r.cities).toBe(3);    // Roma, Innsbruck, Napoli
    expect(r.monthsActive).toBe(2); // giugno + agosto
  });

  it("somma i km percorsi e i giorni (inclusivi)", () => {
    const trips = [
      makeTrip({ trip_date: "2026-06-01", date_end: "2026-06-05", home_latitude: 45, home_longitude: 9, latitude: 46, longitude: 9 }), // 5 giorni, ~111 km
      makeTrip({ trip_date: "2026-07-01", date_end: null, home_latitude: 45, home_longitude: 9, latitude: 47, longitude: 9 }),          // 1 giorno, ~222 km
    ];
    const r = computeYearRecap(trips, 2026);
    expect(r.days).toBe(6);
    expect(r.km).toBeGreaterThan(320);
    expect(r.km).toBeLessThan(345);
  });

  it("una date_end assurda (anno 9999) non conta niente, invece di regalare 366 giorni finti", () => {
    const trips = [
      makeTrip({ trip_date: "2026-06-01", date_end: "9999-12-31" }), // span assurdo → saltato
      makeTrip({ trip_date: "2026-07-01", date_end: "2026-07-02" }), // 2 giorni
    ];
    const r = computeYearRecap(trips, 2026);
    expect(r.days).toBe(2);
  });

  it("IL BUG dei giorni condivisi: torni il 5 e riparti il 5, quel giorno conta UNA volta", () => {
    const trips = [
      makeTrip({ trip_date: "2026-06-01", date_end: "2026-06-05" }), // 5 giorni
      makeTrip({ trip_date: "2026-06-05", date_end: "2026-06-07" }), // 3 giorni, il 5 condiviso
    ];
    const r = computeYearRecap(trips, 2026);
    expect(r.days).toBe(7); // 5 + 3 - 1, non 8
  });

  it("individua i record (più lontano/alto/caldo/freddo) e il paese top", () => {
    const trips = [
      makeTrip({ trip_date: "2026-01-01", country: "Italia", country_code: "IT",
        max_distance_from_home_km: 600, max_distance_city: "Vienna", max_altitude_m: 1500, max_altitude_city: "Passo",
        hottest_temp_c: 30, hottest_city: "Roma", coldest_temp_c: -5, coldest_city: "Cortina" }),
      makeTrip({ trip_date: "2026-02-01", country: "Italia", country_code: "IT",
        max_distance_from_home_km: 200, max_altitude_m: 300, hottest_temp_c: 35, hottest_city: "Palermo", coldest_temp_c: 2 }),
      makeTrip({ trip_date: "2026-03-01", country: "Spagna", country_code: "ES" }),
    ];
    const r = computeYearRecap(trips, 2026);
    expect(r.farthest).toEqual({ value: 600, city: "Vienna" });
    expect(r.highest).toEqual({ value: 1500, city: "Passo" });
    expect(r.hottest).toEqual({ value: 35, city: "Palermo" });
    expect(r.coldest).toEqual({ value: -5, city: "Cortina" });
    expect(r.topCountry?.name).toBe("Italia"); // 2 viaggi vs 1 Spagna
  });

  it("anno senza viaggi → tutto a zero, record null", () => {
    const r = computeYearRecap([makeTrip({ trip_date: "2020-01-01" })], 2026);
    expect(r.trips).toBe(0);
    expect(r.km).toBe(0);
    expect(r.farthest).toBeNull();
    expect(r.topCountry).toBeNull();
  });
});

describe("il momento dell'anno (diario → recap)", () => {
  it("senza giorni marcati il momento è null (layout del recap invariato)", () => {
    const r = computeYearRecap([makeTrip({ diary: [{ date: "2026-06-02", text: "Bello." }] })], 2026);
    expect(r.moment).toBeNull();
  });

  it("pesca la voce marcata (highlight) col titolo del viaggio", () => {
    const trips = [makeTrip({
      title: "Giappone, primavera", city: "Tokyo", trip_date: "2026-04-03",
      diary: [
        { date: "2026-04-04", text: "Arrivo col fuso." },
        { date: "2026-04-06", text: "I ciliegi di Ueno al picco.", highlight: true },
      ],
    })];
    const r = computeYearRecap(trips, 2026);
    expect(r.moment).toEqual({
      text: "I ciliegi di Ueno al picco.", date: "2026-04-06",
      tripTitle: "Giappone, primavera", city: "Tokyo",
    });
  });

  it("più viaggi marcati nell'anno: vince il momento più recente", () => {
    const trips = [
      makeTrip({ trip_date: "2026-03-01", title: "A", diary: [{ date: "2026-03-02", text: "Primo.", highlight: true }] }),
      makeTrip({ trip_date: "2026-09-01", title: "B", diary: [{ date: "2026-09-03", text: "Secondo.", highlight: true }] }),
    ];
    expect(computeYearRecap(trips, 2026).moment?.text).toBe("Secondo.");
  });

  it("ignora i marcati senza testo e i viaggi di altri anni", () => {
    const trips = [
      makeTrip({ trip_date: "2026-05-01", diary: [{ date: "2026-05-02", text: "   ", highlight: true }] }),
      makeTrip({ trip_date: "2025-05-01", diary: [{ date: "2025-05-02", text: "Anno sbagliato.", highlight: true }] }),
    ];
    expect(computeYearRecap(trips, 2026).moment).toBeNull();
  });
});

// Per due giorni le gite in giornata stavano FUORI dal recap, e un anno di
// sole gite andava detto invece di sparire (`anniDiSoleGite`). La feature è
// stata rimossa il 2026-08-26: un viaggio di un giorno solo è un viaggio, e
// il suo anno è un anno. Questo blocco è il paletto che tiene la regola nuova.
describe("un viaggio di un giorno solo è un viaggio come gli altri", () => {
  it("entra nei numeri dell'anno", () => {
    const r = computeYearRecap([
      makeTrip({ trip_date: "2026-06-01", date_end: "2026-06-05", city: "Zurigo", country: "Svizzera", country_code: "CH" }),
      makeTrip({ trip_date: "2026-05-10", date_end: "2026-05-10", city: "Como", country: "Italia" }),
    ], 2026);
    expect(r.trips).toBe(2);
    expect(r.cities).toBe(2);
  });

  it("il suo anno compare fra gli anni disponibili", () => {
    const anni = availableYears([
      makeTrip({ trip_date: "2026-06-01", date_end: "2026-06-05" }),
      makeTrip({ trip_date: "2017-08-30", date_end: "2017-08-30" }),
    ]);
    expect(anni).toEqual([2026, 2017]);
  });
});
