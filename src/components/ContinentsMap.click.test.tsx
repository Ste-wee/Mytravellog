import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContinentsMap, __clearCountryFeatsCache } from "./ContinentsMap";
import { __clearWorldAtlasCache } from "@/lib/worldAtlas";
import type { Trip } from "@/lib/storage";
import React from "react";

// CountryMapModal fa un fetch all'apertura — mockato per isolare il test dal
// comportamento reale del componente (già coperto dai suoi test dedicati).
vi.mock("./CountryMapModal", () => ({
  CountryMapModal: ({ onClose, countryName, countryCode, trips }: any) => (
    <div data-testid="country-modal">
      <span>{countryName} ({countryCode})</span>
      <span>{trips.length} viaggi</span>
      <button onClick={onClose}>Chiudi</button>
    </div>
  ),
}));

// Un solo paese quadrato che copre Roma (41.9, 12.5), così un viaggio con
// quella destinazione ci risulta "dentro" senza dover costruire una vera
// codifica ad archi TopoJSON.
const ITALY_LIKE_POLYGON = [[[5, 35], [5, 47], [19, 47], [19, 35], [5, 35]]];
vi.mock("topojson-client", () => ({
  feature: () => ({
    features: [
      { id: "1", properties: { name: "Italy" }, geometry: { type: "Polygon", coordinates: ITALY_LIKE_POLYGON } },
    ],
  }),
}));

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "t1", created_at: "2024-01-01", title: "Roma", country: "Italia", city: "Roma",
    country_code: "IT", trip_date: "2024-06-01", date_end: null, rating: null, notes: null,
    transport_mode: null, waypoints: [], latitude: 41.9, longitude: 12.5,
    home_latitude: null, home_longitude: null, home_label: null, route_geometry: null,
    temperature_c: null, altitude_m: null, max_altitude_m: null, max_altitude_city: null,
    distance_from_home_km: null, max_distance_from_home_km: null, max_distance_city: null,
    hottest_temp_c: null, hottest_city: null, coldest_temp_c: null, coldest_city: null,
    region: null, region_details: null,
    ...overrides,
  };
}

describe("ContinentsMap — click su un paese visitato", () => {
  beforeEach(() => { __clearCountryFeatsCache(); __clearWorldAtlasCache(); });
  afterEach(() => vi.restoreAllMocks());

  const fakeTopo = { objects: { countries: {} } };

  it("apre CountryMapModal con nome/codice/viaggi presi dal viaggio, non dal topojson", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => fakeTopo });
    render(<ContinentsMap trips={[makeTrip()]} />);

    // L'etichetta è nella lingua dell'utente: il topojson dice "Italy", il
    // viaggio dice "Italia" — e il tooltip/lettore di schermo devono dire quella.
    const country = await waitFor(() => screen.getByRole("button", { name: "Viaggi in Italia" }));
    fireEvent.click(country);

    // "Italia"/"IT" vengono dal viaggio stesso (lingua dell'utente), non
    // "Italy" dal topojson — prima il tap non apriva nulla.
    expect(screen.getByText("Italia (IT)")).toBeInTheDocument();
    expect(screen.getByText("1 viaggi")).toBeInTheDocument();
  });

  // IL BUG: nome e codice venivano dal PRIMO viaggio che tocca il paese. Per un
  // paese solo attraversato era il viaggio sbagliato — toccando l'Italia si
  // apriva "Austria", con bandiera e CONFINI austriaci scaricati.
  it("un paese toccato solo da una TAPPA prende il nome della tappa, non della destinazione", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => fakeTopo });
    const viennaViaTrieste = makeTrip({
      city: "Vienna", country: "Austria", country_code: "AT",
      latitude: 48.21, longitude: 16.37,   // FUORI dal quadrato "Italia"
      waypoints: [{ id: "w1", city: "Trieste", country: "Italia", country_code: "IT",
        transport_mode: "train", lat: 45.65, lon: 13.77 }],
    });
    render(<ContinentsMap trips={[viennaViaTrieste]} />);

    const italia = await waitFor(() => screen.getByRole("button", { name: "Viaggi in Italia" }));
    fireEvent.click(italia);
    expect(screen.getByText("Italia (IT)")).toBeInTheDocument();
    expect(screen.queryByText(/Austria/)).not.toBeInTheDocument();
  });

  it("un paese senza viaggi non è cliccabile (nessun bottone/ruolo)", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => fakeTopo });
    render(<ContinentsMap trips={[]} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Viaggi in/ })).not.toBeInTheDocument();
  });
});

describe("ContinentsMap — errore nel caricamento dei confini", () => {
  beforeEach(() => { __clearCountryFeatsCache(); __clearWorldAtlasCache(); });
  afterEach(() => vi.restoreAllMocks());

  it("mostra un messaggio invece di un'area vuota per sempre", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    render(<ContinentsMap trips={[]} />);
    expect(await screen.findByText(/non è stato possibile caricare la mappa/i)).toBeInTheDocument();
  });
});
