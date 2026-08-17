import { describe, it, expect } from "vitest";
import { calendarDayKeys } from "./travelDays";
import type { Trip } from "./storage";

const viaggio = (trip_date: string, date_end: string | null = null, over: Partial<Trip> = {}): Trip => ({
  id: Math.random().toString(36).slice(2), created_at: "2024-01-01", title: "T",
  country: "Italia", city: "Roma", country_code: "IT",
  trip_date, date_end, rating: null, notes: null, transport_mode: null, waypoints: [],
  latitude: 41.9, longitude: 12.5, home_latitude: 45.46, home_longitude: 9.19,
  home_label: "Milano", route_geometry: null, temperature_c: null, altitude_m: null,
  max_altitude_m: null, max_altitude_city: null, distance_from_home_km: null,
  max_distance_from_home_km: null, max_distance_city: null,
  hottest_temp_c: null, hottest_city: null, coldest_temp_c: null, coldest_city: null,
  region: null, region_details: null, ...over,
} as Trip);

describe("calendarDayKeys — giorni di calendario unici", () => {
  it("caso standard: un itinerario 1-5 giugno = 5 giorni (estremi inclusi)", () => {
    expect(calendarDayKeys([viaggio("2024-06-01", "2024-06-05")]).size).toBe(5);
  });

  it("IL BUG: due viaggi back-to-back (torni il 21, riparti il 21) contano il 21 UNA volta", () => {
    const set = calendarDayKeys([
      viaggio("2024-06-15", "2024-06-21"), // 7 giorni
      viaggio("2024-06-21", "2024-06-25"), // 5 giorni, il 21 è condiviso
    ]);
    expect(set.size).toBe(11); // 7 + 5 - 1, non 12
  });

  it("sovrapposizione piena: un weekend dentro un viaggio lungo non aggiunge nulla", () => {
    const set = calendarDayKeys([
      viaggio("2024-06-01", "2024-06-10"),
      viaggio("2024-06-03", "2024-06-04"), // interamente contenuto
    ]);
    expect(set.size).toBe(10);
  });

  it("ritorno prima della partenza → il viaggio non conta (come prima)", () => {
    expect(calendarDayKeys([viaggio("2024-06-10", "2024-06-01")]).size).toBe(0);
  });

  it("date malformate e span assurdi vengono saltati senza congelare", () => {
    expect(calendarDayKeys([viaggio("boh", null)]).size).toBe(0);
    expect(calendarDayKeys([viaggio("2024-06-01", "9999-06-01")]).size).toBe(0);
  });

  it("un viaggio a cavallo d'anno mette i giorni in entrambi gli anni", () => {
    const set = calendarDayKeys([viaggio("2024-12-30", "2025-01-02")]);
    expect(set.size).toBe(4);
    expect([...set].some(k => k.startsWith("2024-"))).toBe(true);
    expect([...set].some(k => k.startsWith("2025-"))).toBe(true);
  });
});
