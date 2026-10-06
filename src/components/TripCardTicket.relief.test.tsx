import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TripCardTicket } from "./TripCardTicket";
import { SettingsProvider } from "@/lib/settings";
import { saveReliefImage, __resetPhotoDB } from "@/lib/photoStorage";
import type { Trip } from "@/lib/storage";
import React from "react";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

// TripFlyover monta MapLibre: non serve qui, lo stubbiamo.
vi.mock("./TripFlyover", () => ({ TripFlyover: () => null }));

function makeTrip(id: string): Trip {
  return {
    id, created_at: new Date().toISOString(), title: "Viaggio", country: "Italia", city: "Roma",
    country_code: "IT", trip_date: "2024-06-01", date_end: null, rating: null, notes: null,
    transport_mode: null, waypoints: [], latitude: 41.9, longitude: 12.5,
    home_latitude: null, home_longitude: null, home_label: "Milano", route_geometry: null,
    altitude_m: null, distance_from_home_km: null, max_distance_from_home_km: null,
    max_distance_city: null, max_altitude_m: null, max_altitude_city: null,
    region: null, region_details: null,
  };
}

function renderCard(trip: Trip) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SettingsProvider>
        <TripCardTicket trip={trip} />
      </SettingsProvider>
    </MemoryRouter>
  );
}

describe("TripCardTicket — miniatura rilievo 3D", () => {
  beforeEach(() => {
    // isola lo store IndexedDB tra i test
    (globalThis as any).indexedDB = new IDBFactory();
    __resetPhotoDB();
    // jsdom non implementa gli object URL: stub minimo per il test.
    (URL as any).createObjectURL = () => "blob:relief-test";
    (URL as any).revokeObjectURL = () => {};
  });

  it("mostra la linguetta del rilievo quando esiste uno snapshot salvato", async () => {
    await saveReliefImage("relief-yes", new Blob(["snapshot"], { type: "image/jpeg" }));
    renderCard(makeTrip("relief-yes"));
    expect(await screen.findByLabelText("Vedi il rilievo 3D del viaggio")).toBeInTheDocument();
  });

  it("non mostra la linguetta se non c'è alcun rilievo salvato", async () => {
    renderCard(makeTrip("relief-no"));
    // la card è renderizzata (titolo presente) ma la linguetta no, anche dopo l'effetto async
    expect(await screen.findByText("Viaggio")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByLabelText("Vedi il rilievo 3D del viaggio")).not.toBeInTheDocument();
    });
  });
});
