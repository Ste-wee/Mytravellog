import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TripPlanner } from "./TripPlanner";
import { addPlan, loadPlans, type Trip } from "@/lib/storage";
import { SettingsProvider } from "@/lib/settings";

/**
 * L'isola nulla, metà "in programma".
 *
 * Il pannello del piano scompone l'itinerario allo mount e lo RISCRIVE alla
 * chiusura: con `lat: w.lat ?? 0` bastava aprirlo, toccare una voce della
 * checklist e chiuderlo perché una tappa senza coordinate diventasse (0,0) —
 * un punto nel Golfo di Guinea. Da lì basi inventate e puntine in mezzo
 * all'oceano. Gemello del caso ModificaViaggio: la guardia `postoNoto` regge
 * comunque, ma il rubinetto va chiuso o l'archivio continua a sporcarsi.
 */

const piano = (waypoints: Trip["waypoints"]) => addPlan({
  title: "Bulgaria", country: "Bulgaria", city: "Plovdiv", country_code: "BG",
  trip_date: "2099-07-01", date_end: "2099-07-05", rating: null, notes: null,
  transport_mode: "car", waypoints,
  latitude: 42.1354, longitude: 24.7453,
  home_latitude: 45.4642, home_longitude: 9.19, home_label: "Milano, Italia",
  temperature_c: null, altitude_m: null, distance_from_home_km: null,
  max_distance_from_home_km: null, max_distance_city: null,
} as Omit<Trip, "id" | "created_at" | "status">);

const apriEChiudi = (p: Trip) => {
  render(
    <MemoryRouter>
      <SettingsProvider>
        <TripPlanner plan={p} onClose={() => {}} onChanged={() => {}} />
      </SettingsProvider>
    </MemoryRouter>,
  );
  // Serve un tocco: `persist` non scrive niente se nessuno ha toccato nulla.
  fireEvent.click(screen.getAllByRole("checkbox")[0]);
  fireEvent.click(screen.getByLabelText("Chiudi la pianificazione"));
};

describe("pannello dei piani: (0,0) non entra nei dati", () => {
  beforeEach(() => {
    localStorage.clear();
    // jsdom non ha ResizeObserver, e ItineraryPanel misura il contenitore.
    if (!("ResizeObserver" in globalThis)) {
      (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
        observe() {} unobserve() {} disconnect() {}
      };
    }
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  it("una tappa senza coordinate resta senza, non diventa (0,0)", () => {
    const p = piano([
      { id: "w1", city: "Ignota", country: "Bulgaria", country_code: "BG", transport_mode: "car" },
      { id: "w2", city: "Rila", country: "Bulgaria", country_code: "BG", transport_mode: "car", lat: 42.1333, lon: 23.34 },
    ]);
    apriEChiudi(p);
    const dopo = loadPlans()[0];
    // La prima tappa è l'unica intermedia rimasta: l'ultima diventa la meta.
    const ignota = dopo.waypoints.find(w => w.city === "Ignota");
    expect(ignota).toBeDefined();
    expect(ignota?.lat ?? null).toBeNull();
    expect(ignota?.lat).not.toBe(0);
    expect(ignota?.lon ?? null).toBeNull();
  });

  it("le coordinate vere passano intatte", () => {
    const p = piano([
      { id: "w1", city: "Sofia", country: "Bulgaria", country_code: "BG", transport_mode: "car", lat: 42.6977, lon: 23.3219 },
      { id: "w2", city: "Rila", country: "Bulgaria", country_code: "BG", transport_mode: "car", lat: 42.1333, lon: 23.34 },
    ]);
    apriEChiudi(p);
    const sofia = loadPlans()[0].waypoints.find(w => w.city === "Sofia");
    expect(sofia?.lat).toBeCloseTo(42.6977, 4);
    expect(sofia?.lon).toBeCloseTo(23.3219, 4);
  });

  it("e uno ZERO VERO non viene confuso con il nulla (Greenwich, l'equatore)", () => {
    const p = piano([
      { id: "w1", city: "Accra", country: "Ghana", country_code: "GH", transport_mode: "plane", lat: 5.6, lon: 0 },
      { id: "w2", city: "Rila", country: "Bulgaria", country_code: "BG", transport_mode: "car", lat: 42.1333, lon: 23.34 },
    ]);
    apriEChiudi(p);
    const accra = loadPlans()[0].waypoints.find(w => w.city === "Accra");
    expect(accra?.lat).toBeCloseTo(5.6, 4);
    expect(accra?.lon).toBe(0);
  });
});
