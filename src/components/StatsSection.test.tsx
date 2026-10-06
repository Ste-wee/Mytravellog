import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatsSection } from "./StatsSection";
import { SettingsProvider } from "@/lib/settings";
import type { Trip } from "@/lib/storage";
import React from "react";

// CountryMapModal does a fetch on open — mock it to avoid network calls in tests
vi.mock("./CountryMapModal", () => ({
  CountryMapModal: ({ onClose, countryName }: { onClose: () => void; countryName: string }) => (
    <div data-testid="country-modal">
      <span>{countryName}</span>
      <button onClick={onClose}>Chiudi</button>
    </div>
  ),
}));

function renderStats(trips: Trip[]) {
  return render(
    <SettingsProvider>
      <StatsSection trips={trips} />
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
    date_end: null,
    rating: null,
    notes: null,
    transport_mode: null,
    waypoints: [],
    latitude: 41.9,
    longitude: 12.5,
    home_latitude: null,
    home_longitude: null,
    home_label: null,
    route_geometry: null,
    altitude_m: null,
    distance_from_home_km: null,
    max_distance_from_home_km: null,
    max_distance_city: null,
    max_altitude_m: null,
    max_altitude_city: null,
    region: null,
    region_details: null,
    ...overrides,
  };
}

describe("StatsSection — empty state", () => {
  it("mostra messaggio 'Nessun paese ancora' con trips=[]", () => {
    renderStats([]);
    expect(screen.getByText(/nessun paese ancora/i)).toBeInTheDocument();
  });

  it("mostra 0 paesi visitati con trips=[]", () => {
    renderStats([]);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("mostra 0% del mondo con trips=[]", () => {
    renderStats([]);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});

describe("StatsSection — tripsByCountry e countries", () => {
  it("raggruppa correttamente per country_code", () => {
    const trips = [
      makeTrip({ country: "Italia", country_code: "IT" }),
      makeTrip({ country: "Italia", country_code: "IT" }),
      makeTrip({ country: "Francia", country_code: "FR" }),
    ];
    renderStats(trips);
    // 2 paesi unici — "2" appare sia nell'hero (count) sia nel badge visite IT
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1);
  });

  it("usa country come fallback chiave se country_code è undefined", () => {
    const trips = [
      makeTrip({ country: "Paese Immaginario", country_code: undefined as any }),
      makeTrip({ country: "Paese Immaginario", country_code: undefined as any }),
    ];
    renderStats(trips);
    // 1 solo paese unico → count = 1
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("non duplica lo stesso paese quando un'occorrenza ha il codice ISO e un'altra no", () => {
    // Riproduce il bug dello screenshot: destinazione Italia con "IT" +
    // una tappa Italia senza country_code → prima diventava due chip "Italia"
    // (chiave code||name) e gonfiava il conteggio; ora deve essere 1.
    const trips = [makeTrip({
      country: "Italia", country_code: "IT",
      waypoints: [{ city: "Firenze", country: "Italia", country_code: "", transport_mode: "car" }],
    })];
    renderStats(trips);
    expect(screen.getAllByText("Italia")).toHaveLength(1);
    // Col bug ci sarebbero due chip e hero "2": nessun "2" conferma il fix.
    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });

  it("mostra i nomi dei paesi nell'elenco", () => {
    const trips = [
      makeTrip({ country: "Italia",  country_code: "IT" }),
      makeTrip({ country: "Spagna",  country_code: "ES" }),
    ];
    renderStats(trips);
    expect(screen.getByText("Italia")).toBeInTheDocument();
    expect(screen.getByText("Spagna")).toBeInTheDocument();
  });

  it("ordina i paesi per numero di visite decrescente", () => {
    const trips = [
      makeTrip({ country: "Francia", country_code: "FR" }),
      makeTrip({ country: "Italia",  country_code: "IT" }),
      makeTrip({ country: "Italia",  country_code: "IT" }),
    ];
    renderStats(trips);
    // Italia (2 visite) deve apparire prima di Francia (1)
    const buttons = screen.getAllByRole("button").filter(
      b => b.textContent?.includes("Italia") || b.textContent?.includes("Francia")
    );
    expect(buttons[0].textContent).toContain("Italia");
    expect(buttons[1].textContent).toContain("Francia");
  });

  it("mostra il contatore visite per paese", () => {
    const trips = [
      makeTrip({ country: "Italia", country_code: "IT" }),
      makeTrip({ country: "Italia", country_code: "IT" }),
      makeTrip({ country: "Italia", country_code: "IT" }),
    ];
    renderStats(trips);
    // Badge con "3" visite
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});

describe("StatsSection — paesi visitati tramite waypoint (tappe intermedie)", () => {
  it("conta anche i paesi delle tappe, non solo la destinazione finale", () => {
    const trips = [makeTrip({
      country: "Argentina", country_code: "AR",
      waypoints: [
        { city: "Il Cairo", country: "Egitto", country_code: "EG", transport_mode: "car" },
        { city: "Tokyo", country: "Giappone", country_code: "JP", transport_mode: "walk" },
      ],
    })];
    renderStats(trips);
    // 3 paesi unici (Argentina + Egitto + Giappone) da UN SOLO viaggio
    expect(screen.getByText("Argentina")).toBeInTheDocument();
    expect(screen.getByText("Egitto")).toBeInTheDocument();
    expect(screen.getByText("Giappone")).toBeInTheDocument();
  });

  it("non duplica un paese toccato sia da un waypoint che dalla destinazione nello stesso viaggio", () => {
    const trips = [makeTrip({
      country: "Italia", country_code: "IT",
      waypoints: [{ city: "Milano", country: "Italia", country_code: "IT", transport_mode: "train" }],
    })];
    renderStats(trips);
    // 1 solo pill "Italia" nell'elenco, non due
    const italiaButtons = screen.getAllByRole("button").filter(b => b.textContent?.includes("Italia"));
    expect(italiaButtons).toHaveLength(1);
  });

  it("un secondo viaggio nello stesso paese di un waypoint incrementa le visite", () => {
    const trips = [
      makeTrip({
        country: "Argentina", country_code: "AR",
        waypoints: [{ city: "Il Cairo", country: "Egitto", country_code: "EG", transport_mode: "car" }],
      }),
      makeTrip({ country: "Egitto", country_code: "EG" }), // secondo viaggio, stavolta destinazione diretta
    ];
    renderStats(trips);
    // Egitto ha 2 visite totali (1 come waypoint + 1 come destinazione)
    const egittoButton = screen.getByText("Egitto").closest("button");
    expect(egittoButton?.textContent).toContain("2");
  });

  it("fallback su country_code assente per un waypoint di un viaggio salvato prima del fix", () => {
    const trips = [makeTrip({
      country: "Argentina", country_code: "AR",
      waypoints: [{ city: "Il Cairo", country: "Egitto", transport_mode: "car" }], // niente country_code
    })];
    renderStats(trips);
    expect(screen.getByText("Egitto")).toBeInTheDocument();
  });
});

describe("StatsSection — percent del mondo", () => {
  it("percent = count / 195 * 100, arrotondato (0.5% con 1 paese)", () => {
    // 1 paese su 195 = 0.5128% → percent < 1 → toFixed(1) = "0.5"
    const trips = [makeTrip({ country: "Italia", country_code: "IT" })];
    renderStats(trips);
    expect(screen.getByText("0.5%")).toBeInTheDocument();
  });
});

describe("StatsSection — paginazione showAll", () => {
  function makeCountries(n: number): Trip[] {
    const codes = ["IT","FR","DE","ES","PT","GR","HR","PL","CZ","HU","RO","BG","SK","SI","AT"];
    return Array.from({ length: n }, (_, i) =>
      makeTrip({ country: `Paese${i}`, country_code: codes[i % codes.length] + i })
    );
  }

  it("mostra max 8 paesi con showAll=false (default)", () => {
    renderStats(makeCountries(12));
    // Il bottone "Mostra tutto" deve essere visibile
    expect(screen.getByText(/mostra tutto/i)).toBeInTheDocument();
  });

  it("click su 'Mostra tutto' mostra tutti i paesi", () => {
    renderStats(makeCountries(12));
    fireEvent.click(screen.getByText(/mostra tutto/i));
    expect(screen.getByText(/mostra meno/i)).toBeInTheDocument();
  });

  it("non mostra il bottone 'Mostra tutto' con ≤8 paesi", () => {
    renderStats(makeCountries(5));
    expect(screen.queryByText(/mostra tutto/i)).not.toBeInTheDocument();
  });
});

describe("StatsSection — CountryMapModal", () => {
  it("apre la modal al click su un paese", () => {
    const trips = [makeTrip({ country: "Italia", country_code: "IT" })];
    renderStats(trips);
    fireEvent.click(screen.getByText("Italia"));
    expect(screen.getByTestId("country-modal")).toBeInTheDocument();
  });

  it("chiude la modal al click su 'Chiudi'", () => {
    const trips = [makeTrip({ country: "Italia", country_code: "IT" })];
    renderStats(trips);
    fireEvent.click(screen.getByText("Italia"));
    fireEvent.click(screen.getByText("Chiudi"));
    expect(screen.queryByTestId("country-modal")).not.toBeInTheDocument();
  });
});
