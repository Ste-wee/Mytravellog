import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TravelHighlights, computeKmByTransportMode } from "./TravelHighlights";
import { tripTotalKm } from "@/lib/flyover";
import { SettingsProvider } from "@/lib/settings";
import type { Trip } from "@/lib/storage";
import React from "react";

// Wrap with SettingsProvider (required by useSettings inside TravelHighlights)
function renderHighlights(trips: Trip[]) {
  return render(
    <SettingsProvider>
      <TravelHighlights trips={trips} />
    </SettingsProvider>
  );
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: Math.random().toString(36).slice(2),
    created_at: new Date().toISOString(),
    title: "Test",
    country: "Italia",
    city: "Roma",
    country_code: "IT",
    trip_date: "2024-01-01",
    date_end: "2024-01-03",
    rating: null,
    notes: null,
    transport_mode: null,
    waypoints: [],
    latitude: 41.9,
    longitude: 12.5,
    home_latitude: 45.5,
    home_longitude: 9.2,
    home_label: "Milano",
    route_geometry: null,
    temperature_c: null,
    altitude_m: null,
    distance_from_home_km: null,
    max_distance_from_home_km: null,
    max_distance_city: null,
    max_altitude_m: null,
    max_altitude_city: null,
    hottest_temp_c: null,
    hottest_city: null,
    coldest_temp_c: null,
    coldest_city: null,
    region: null,
    region_details: null,
    ...overrides,
  };
}

describe("TravelHighlights — empty state", () => {
  it("mostra '—' per altitudine con trips=[]", () => {
    renderHighlights([]);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

});

describe("TravelHighlights — highest (altitudine)", () => {
  it("mostra il valore di altitude_m del viaggio più alto", () => {
    const trips = [
      makeTrip({ altitude_m: 500, city: "Basso" }),
      makeTrip({ altitude_m: 2000, city: "Alto" }),
      makeTrip({ altitude_m: 100,  city: "Pianura" }),
    ];
    renderHighlights(trips);
    // In metric (default), fmtAltitude(2000, "metric") → "2.000 m" (separatore sempre, anche a 4 cifre).
    // Compare toBeGreaterThanOrEqual(1) invece di toBeInTheDocument: la card
    // è renderizzata sia nella versione desktop che in quella mobile (una
    // sola visibile per volta via CSS, ma entrambe presenti nel DOM in jsdom).
    expect(screen.getAllByText("2.000 m").length).toBeGreaterThanOrEqual(1);
  });

  it("mostra la città del viaggio più alto come sottotitolo", () => {
    const trips = [
      makeTrip({ altitude_m: 3000, city: "Everest" }),
      makeTrip({ altitude_m: 100,  city: "Basso" }),
    ];
    renderHighlights(trips);
    expect(screen.getAllByText("Everest").length).toBeGreaterThanOrEqual(1);
  });

  it("preferisce max_altitude_m (tappa più alta) su altitude_m (solo destinazione)", () => {
    // La destinazione è a 100m, ma una tappa intermedia ha raggiunto 3000m
    const trips = [makeTrip({ altitude_m: 100, max_altitude_m: 3000, max_altitude_city: "Passo Alpino", city: "Destinazione" })];
    renderHighlights(trips);
    expect(screen.getAllByText("3.000 m").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Passo Alpino").length).toBeGreaterThanOrEqual(1);
  });

  it("usa altitude_m se max_altitude_m è null (viaggi salvati prima del fix)", () => {
    const trips = [makeTrip({ altitude_m: 750, max_altitude_m: null, city: "Destinazione" })];
    renderHighlights(trips);
    expect(screen.getAllByText("750 m").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Destinazione").length).toBeGreaterThanOrEqual(1);
  });
});

describe("TravelHighlights — farthest (distanza)", () => {
  it("preferisce max_distance_from_home_km su distance_from_home_km", () => {
    const trips = [
      makeTrip({ distance_from_home_km: 500,  max_distance_from_home_km: 1200, city: "Lontano" }),
      makeTrip({ distance_from_home_km: 800,  max_distance_from_home_km: null, city: "Meno lontano" }),
    ];
    renderHighlights(trips);
    // 1200 viene scelto su 800 grazie a max_distance_from_home_km
    expect(screen.getAllByText("1.200 km").length).toBeGreaterThanOrEqual(1);
  });

  it("usa distance_from_home_km se max_distance_from_home_km è null", () => {
    const trips = [
      makeTrip({ distance_from_home_km: 900,  max_distance_from_home_km: null }),
      makeTrip({ distance_from_home_km: 300,  max_distance_from_home_km: null }),
    ];
    renderHighlights(trips);
    expect(screen.getAllByText("900 km").length).toBeGreaterThanOrEqual(1);
  });
});

describe("TravelHighlights — hottest / coldest", () => {
  it("mostra la temperatura più alta (hottest_temp_c prioritario)", () => {
    const trips = [
      makeTrip({ hottest_temp_c: 38, temperature_c: 25, hottest_city: "Palermo" }),
      makeTrip({ hottest_temp_c: 30, temperature_c: 28 }),
    ];
    renderHighlights(trips);
    expect(screen.getAllByText("38°C").length).toBeGreaterThanOrEqual(1);
  });

  it("usa temperature_c se hottest_temp_c è null", () => {
    const trips = [
      makeTrip({ hottest_temp_c: null, temperature_c: 33 }),
      makeTrip({ hottest_temp_c: null, temperature_c: 20 }),
    ];
    renderHighlights(trips);
    expect(screen.getAllByText("33°C").length).toBeGreaterThanOrEqual(1);
  });

  it("mostra la temperatura più bassa (coldest_temp_c prioritario)", () => {
    const trips = [
      makeTrip({ coldest_temp_c: -10, temperature_c: 5, coldest_city: "Oslo" }),
      makeTrip({ coldest_temp_c: 2,   temperature_c: 8 }),
    ];
    renderHighlights(trips);
    expect(screen.getAllByText("-10°C").length).toBeGreaterThanOrEqual(1);
  });
});

describe("TravelHighlights — totalKm, aroundWorld, toMoon", () => {
  it("mostra la distanza totale = somma dei km percorsi (tripTotalKm)", () => {
    // Casa (45,9) → dest (46,9) ≈ 111 km ciascuno, niente route_geometry → linea
    // d'aria. Totale ≈ 222 km (il valore non viene più da distance_from_home_km).
    const trips = [
      makeTrip({ home_latitude: 45, home_longitude: 9, latitude: 46, longitude: 9 }),
      makeTrip({ home_latitude: 45, home_longitude: 9, latitude: 46, longitude: 9 }),
    ];
    renderHighlights(trips);
    const near222 = (content: string) => /^\d+ km$/.test(content) && Math.abs(parseInt(content) - 222) <= 6;
    expect(screen.getAllByText(near222).length).toBeGreaterThanOrEqual(1);
  });

  it("mostra 0 km totali con trips=[] (in più celle: totale + breakdown per mezzo)", () => {
    renderHighlights([]);
    // "0 km" compare 6 volte: 1 totale + 5 breakdown transport
    expect(screen.getAllByText("0 km").length).toBeGreaterThanOrEqual(1);
  });
});

describe("TravelHighlights — byMode breakdown", () => {
  // home (Milano, 45.5/9.2) -> destinazione (Roma, 41.9/12.5): distanza reale ~480 km.
  it("assegna distanza a 'plane' con transport_mode='plane' esplicito", () => {
    const trips = [makeTrip({ transport_mode: "plane" })];
    renderHighlights(trips);
    expect(screen.getAllByText("In aereo").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("480 km").length).toBeGreaterThanOrEqual(1);
  });

  it("assegna distanza a 'train' con transport_mode='train' esplicito", () => {
    const trips = [makeTrip({ transport_mode: "train" })];
    renderHighlights(trips);
    expect(screen.getAllByText("In treno").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("480 km").length).toBeGreaterThanOrEqual(1);
  });

  it("fallback a 'plane' per distanza >1000 km senza transport_mode", () => {
    // Milano -> Tokyo: ~9710 km, nessun transport_mode → plane
    const trips = [makeTrip({ transport_mode: null, latitude: 35.68, longitude: 139.65 })];
    renderHighlights(trips);
    expect(screen.getAllByText("In aereo").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("9.710 km").length).toBeGreaterThanOrEqual(1);
  });

  it("fallback a 'car' per distanza 20-200 km senza transport_mode", () => {
    // Milano -> Torino: ~128 km, nessun transport_mode → car
    const trips = [makeTrip({ transport_mode: null, latitude: 45.07, longitude: 7.68 })];
    renderHighlights(trips);
    expect(screen.getAllByText("In auto").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("128 km").length).toBeGreaterThanOrEqual(1);
  });

  it("fallback a 'walk' per distanza <20 km senza transport_mode", () => {
    const trips = [makeTrip({ transport_mode: null, latitude: 45.51, longitude: 9.21 })];
    renderHighlights(trips);
    expect(screen.getAllByText("A piedi").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("1 km").length).toBeGreaterThanOrEqual(1);
  });

  it("viaggio multi-tappa: ripartisce la distanza per mezzo di ciascuna tratta, non tutto sull'ultimo", () => {
    // home (Milano) --train--> waypoint (Torino) --plane--> destinazione (Roma)
    const trips = [makeTrip({
      transport_mode: "plane", // mezzo dell'ultima tratta: Torino -> Roma
      waypoints: [
        { city: "Torino", country: "Italia", transport_mode: "train", lat: 45.07, lon: 7.68 },
      ],
      latitude: 41.9, longitude: 12.5, // Roma
    })];
    renderHighlights(trips);
    // Milano->Torino (train) ~128km, Torino->Roma (plane) ~525km — NON deve finire tutto su "In aereo"
    expect(screen.getAllByText("128 km").length).toBeGreaterThanOrEqual(1); // In treno
    expect(screen.getAllByText("525 km").length).toBeGreaterThanOrEqual(1); // In aereo
  });

  it("la somma del breakdown per mezzo coincide col totale (tripTotalKm) anche con route_geometry stradale", () => {
    // Viaggio in auto con tracciato stradale reale: una deviazione a est più
    // lunga della retta. Il breakdown "auto" deve usare i km STRADALI (via
    // pathCoords), così la somma per mezzo = tripTotalKm, non la linea d'aria.
    const trip = makeTrip({
      transport_mode: "car",
      route_geometry: [[9.2, 45.5], [20, 45.5], [12.5, 41.9]],
    });
    const byMode = computeKmByTransportMode([trip]);
    const sum = Object.values(byMode).reduce((a, b) => a + b, 0);
    const total = tripTotalKm(trip);
    expect(sum).toBeCloseTo(total, 5);
    // e tutti i km sono attribuiti all'auto (unico mezzo del viaggio)
    expect(byMode.car).toBeCloseTo(total, 5);
    // il totale stradale è nettamente più lungo della retta Milano→Roma (~477)
    expect(total).toBeGreaterThan(900);
  });

  it("il breakdown usa la lunghezza dichiarata, non la somma del disegno", () => {
    // Stessa regola del totale: se il servizio ci ha detto quanti km sono, il
    // conteggio per mezzo deve dire lo stesso numero, altrimenti il dettaglio
    // e il totale non tornerebbero (è già successo una volta).
    const trip = makeTrip({
      transport_mode: "car",
      route_geometry: [[9.2, 45.5], [20, 45.5], [12.5, 41.9]],
      route_km: 999,
    });
    const byMode = computeKmByTransportMode([trip]);
    expect(byMode.car).toBe(999);
    expect(Object.values(byMode).reduce((a, b) => a + b, 0)).toBeCloseTo(tripTotalKm(trip), 5);
  });
});
