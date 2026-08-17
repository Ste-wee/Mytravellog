import { describe, it, expect } from "vitest";
import { stopChain } from "./stops";
import type { Trip } from "@/lib/storage";

const trip = (over: Partial<Trip> = {}): Trip => ({
  id: "1", created_at: "2024-01-01", title: "Giro", country: "Austria", city: "Vienna",
  country_code: "AT", trip_date: "2024-06-15", date_end: "2024-06-21", rating: null, notes: null,
  transport_mode: "train", waypoints: [],
  latitude: 48.21, longitude: 16.37,
  home_latitude: 45.46, home_longitude: 9.19, home_label: "Milano, Italia",
  route_geometry: null, temperature_c: null, altitude_m: null,
  max_altitude_m: null, max_altitude_city: null,
  distance_from_home_km: null, max_distance_from_home_km: null, max_distance_city: null,
  hottest_temp_c: null, hottest_city: null, coldest_temp_c: null, coldest_city: null,
  region: null, region_details: null,
  ...over,
} as Trip);

const tappa = (city: string) => ({ city, country: "X", transport_mode: "train" as const });

describe("stopChain", () => {
  it("mette in fila partenza, tappe e destinazione", () => {
    expect(stopChain(trip({ waypoints: [tappa("Trieste"), tappa("Ljubljana")] })))
      .toBe("Milano → Trieste → Ljubljana → Vienna");
  });

  it("della città di partenza usa solo il nome, non «Milano, Italia»", () => {
    expect(stopChain(trip({ home_label: "Reggio nell'Emilia, Italia", waypoints: [tappa("Bologna")] })))
      .toBe("Reggio nell'Emilia → Bologna → Vienna");
  });

  it("senza tappe intermedie non c'è percorso da raccontare: null", () => {
    expect(stopChain(trip())).toBeNull();
    expect(stopChain(trip({ waypoints: [] }))).toBeNull();
  });

  it("senza città di partenza salvata ricade su «Casa»", () => {
    expect(stopChain(trip({ home_label: null, waypoints: [tappa("Trieste")] })))
      .toBe("Casa → Trieste → Vienna");
  });
});
