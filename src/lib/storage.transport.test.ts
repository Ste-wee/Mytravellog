import { describe, it, expect, beforeEach } from "vitest";
import { addTrip, loadTrips, type Trip } from "./storage";

type Mode = NonNullable<Trip["transport_mode"]>;
const MODES: Mode[] = ["plane", "train", "car", "ship", "walk", "bici", "moto"];

function baseTrip(mode: Mode): Omit<Trip, "id" | "created_at"> {
  return {
    title: `Viaggio ${mode}`,
    country: "Italia",
    city: "Roma",
    country_code: "IT",
    trip_date: "2024-05-01",
    date_end: "2024-05-05",
    rating: 4,
    notes: null,
    transport_mode: mode,
    waypoints: [
      { city: "Milano", country: "Italia", transport_mode: mode },
    ],
    latitude: 41.9,
    longitude: 12.5,
    home_latitude: 45.5,
    home_longitude: 9.2,
    home_label: "Milano",
    route_geometry: null,
    altitude_m: 20,
    distance_from_home_km: 480,
    max_distance_from_home_km: 480,
    max_distance_city: "Roma",
    max_altitude_m: 20,
    max_altitude_city: "Roma",
    region: "Lazio",
    region_details: [{ name: "Lazio", code: "IT-62" }],
  };
}

describe("addTrip — tutti i mezzi di trasporto", () => {
  beforeEach(() => localStorage.clear());

  it.each(MODES)("crea viaggio con transport_mode=%s", (mode) => {
    const t = addTrip(baseTrip(mode));
    expect(t.id).toBeTruthy();
    expect(t.transport_mode).toBe(mode);
    expect(t.waypoints[0].transport_mode).toBe(mode);

    const stored = loadTrips();
    expect(stored).toHaveLength(1);
    expect(stored[0].transport_mode).toBe(mode);
  });

  it("crea in sequenza un viaggio per ciascun mezzo e li persiste tutti", () => {
    MODES.forEach(m => addTrip(baseTrip(m)));
    const stored = loadTrips();
    expect(stored).toHaveLength(MODES.length);
    const modes = stored.map(t => t.transport_mode).sort();
    expect(modes).toEqual([...MODES].sort());
  });
});
