import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { HomeCityGate } from "./HomeCityGate";
import { SettingsProvider } from "@/lib/settings";
import { addTrip, loadTrips, saveTrips, type Trip } from "@/lib/storage";

/**
 * La città di partenza è obbligatoria: senza, un viaggio non produce nessuna
 * tratta e sparisce da globo, poster dell'anno e mappa della vita.
 */

vi.mock("@/lib/geo", () => ({
  searchPlaces: vi.fn(async () => ([
    { name: "Milano", country: "Italia", country_code: "IT", latitude: 45.46, longitude: 9.19 },
  ])),
}));

const trip = (over: Partial<Trip> = {}) => addTrip({
  title: "Roma", city: "Roma", country: "Italia", country_code: "IT",
  trip_date: "2025-05-10", date_end: null, rating: null, notes: null,
  transport_mode: "plane", waypoints: [], latitude: 41.9, longitude: 12.5,
  home_latitude: null, home_longitude: null, home_label: null,
  route_geometry: null, temperature_c: null, altitude_m: null, max_altitude_m: null,
  max_altitude_city: null, distance_from_home_km: null, max_distance_from_home_km: null,
  max_distance_city: null, hottest_temp_c: null, hottest_city: null,
  coldest_temp_c: null, coldest_city: null, region: null, region_details: null,
  ...over,
} as any);

const renderGate = () => render(<SettingsProvider><HomeCityGate /></SettingsProvider>);

describe("HomeCityGate — la partenza è obbligatoria", () => {
  beforeEach(() => {
    localStorage.clear();
    // Benvenuto già archiviato: altrimenti il gate aspetta il suo turno.
    localStorage.setItem("navta.welcome.dismissed", "1");
  });

  it("senza città di casa sbarra la strada", () => {
    renderGate();
    expect(screen.getByRole("dialog", { name: /Da dove parti/i })).toBeInTheDocument();
  });

  it("con la città già impostata non compare", () => {
    localStorage.setItem("atlas.settings.v1", JSON.stringify({ homeCity: { label: "Milano", lat: 45.46, lon: 9.19 } }));
    renderGate();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("aspetta che il benvenuto sia stato archiviato", () => {
    localStorage.removeItem("navta.welcome.dismissed"); // dispositivo vergine
    renderGate();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    act(() => { window.dispatchEvent(new Event("navta:welcome-dismissed")); });
    expect(screen.getByRole("dialog", { name: /Da dove parti/i })).toBeInTheDocument();
  });

  it("scegliendo la città il muro cade e i viaggi orfani la ereditano", async () => {
    const orfano = trip();
    const suo = trip({ home_latitude: 48.85, home_longitude: 2.35, home_label: "Parigi" } as any);
    renderGate();

    fireEvent.change(screen.getByLabelText(/Cerca la tua città/i), { target: { value: "Mila" } });
    const opzione = await screen.findByRole("option", { name: /Milano/ }, { timeout: 3000 });
    fireEvent.click(opzione);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const dopo = loadTrips();
    expect(dopo.find(t => t.id === orfano.id)!.home_label).toBe("Milano, Italia");
    // Chi la partenza ce l'aveva se la tiene.
    expect(dopo.find(t => t.id === suo.id)!.home_label).toBe("Parigi");
  });

  it("a chi ha viaggi orfani dice quanti sono", () => {
    trip(); trip();
    renderGate();
    expect(screen.getByText(/2/)).toBeInTheDocument();
    expect(screen.getByText(/MANCA UNA COSA/i)).toBeInTheDocument();
  });

  it("al primo avvio (nessun viaggio) niente allarmi, solo la domanda", () => {
    saveTrips([]);
    renderGate();
    expect(screen.queryByText(/MANCA UNA COSA/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Ogni viaggio parte da casa/i)).toBeInTheDocument();
  });
});
