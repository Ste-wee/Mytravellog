import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TravelHeatmap } from "./TravelHeatmap";
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

/** Apre la cella del mese cliccando il primo bottone della griglia. */
function apriMese() {
  const celle = screen.getAllByRole("button").filter(b => /giu/i.test(b.getAttribute("aria-label") ?? ""));
  fireEvent.click(celle[0]);
}

describe("TravelHeatmap — dettaglio del mese", () => {
  // IL CASO SEGNALATO: la riga nominava solo la destinazione, quindi di un
  // viaggio con tre mete se ne leggeva una. Ora c'è la catena, come sul biglietto.
  it("mostra tutte le tappe del viaggio, non solo la destinazione", () => {
    render(<TravelHeatmap trips={[trip({ waypoints: [tappa("Trieste"), tappa("Ljubljana")] })]} />);
    apriMese();
    expect(screen.getByText(/Milano → Trieste → Ljubljana → Vienna/)).toBeInTheDocument();
  });

  it("un viaggio senza tappe resta la sola meta (niente percorso da raccontare)", () => {
    render(<TravelHeatmap trips={[trip()]} />);
    apriMese();
    expect(screen.getByText(/^Vienna/)).toBeInTheDocument();
    expect(screen.queryByText(/→ Vienna/)).not.toBeInTheDocument();
  });

  it("la riga porta anche le date del viaggio", () => {
    render(<TravelHeatmap trips={[trip({ waypoints: [tappa("Trieste")] })]} />);
    apriMese();
    expect(screen.getByText(/15 giu 2024/)).toBeInTheDocument();
  });

  // La catena NON si tronca: l'ellipsis si mangiava proprio l'arrivo
  // ("Vienn…") e la data che stava sulla stessa riga. jsdom non disegna,
  // quindi il taglio non si può "vedere": si inchioda lo stile che lo
  // causava e la data su una riga separata.
  it("la catena va a capo invece di troncarsi, e la data vive su una riga sua", () => {
    render(<TravelHeatmap trips={[trip({ waypoints: [tappa("Innsbruck"), tappa("Salisburgo")] })]} />);
    apriMese();
    const catena = screen.getByText(/Milano → Innsbruck → Salisburgo → Vienna/);
    expect(catena.style.textOverflow).not.toBe("ellipsis");
    expect(catena.style.whiteSpace).not.toBe("nowrap");
    const data = screen.getByText(/15 giu 2024/);
    expect(data).not.toBe(catena);
    expect(data.textContent).not.toContain("Vienna");
  });
});
