import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlanCard } from "./PlanCard";
import { addPlan, loadPlans, type Trip } from "@/lib/storage";

function plan(over: Partial<Omit<Trip, "id" | "created_at" | "status">> = {}) {
  return addPlan({
    title: "Barcellona", country: "Spagna", city: "Barcellona", country_code: "ES",
    trip_date: "2099-09-01", date_end: "2099-09-08", rating: null, notes: null,
    transport_mode: "plane", waypoints: [],
    latitude: 41.39, longitude: 2.15, home_latitude: 45.46, home_longitude: 9.19, home_label: "Milano, Italia",
    temperature_c: null, altitude_m: null, distance_from_home_km: null,
    max_distance_from_home_km: null, max_distance_city: null,
    ...over,
  } as Omit<Trip, "id" | "created_at" | "status">);
}

describe("PlanCard — spunta prenotato", () => {
  beforeEach(() => localStorage.clear());

  it("un piano nuovo parte da 'Da prenotare'", () => {
    render(<PlanCard plan={plan()} onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: /Da prenotare/i })).toBeInTheDocument();
  });

  it("il tocco segna prenotato e lo SALVA nel piano", () => {
    const p = plan();
    render(<PlanCard plan={p} onOpen={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Da prenotare/i }));
    expect(screen.getByRole("button", { name: /Prenotato/i })).toBeInTheDocument();
    expect(loadPlans()[0].booked).toBe(true);   // non solo a schermo: persistito
  });

  it("un secondo tocco torna indietro", () => {
    render(<PlanCard plan={plan({ booked: true })} onOpen={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Prenotato/i }));
    expect(loadPlans()[0].booked).toBe(false);
  });

  // La card era un <button> unico: la spunta annidata dentro sarebbe stata HTML
  // non valido e da tastiera irraggiungibile. Qui si verifica che aprire il
  // pannello e cambiare la spunta restino due gesti distinti.
  it("toccare la spunta NON apre il pannello di pianificazione", () => {
    const onOpen = vi.fn();
    render(<PlanCard plan={plan()} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /Da prenotare/i }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("il resto della card apre il pannello", () => {
    const onOpen = vi.fn();
    render(<PlanCard plan={plan()} onOpen={onOpen} />);
    fireEvent.click(screen.getByText(/Barcellona/i));
    expect(onOpen).toHaveBeenCalled();
  });

  it("non mostra più nulla di economico", () => {
    render(<PlanCard plan={plan({ checklist: [{ text: "Volo", done: true }] })} onOpen={() => {}} />);
    expect(screen.queryByText(/budget/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    expect(screen.getByText(/DA ORGANIZZARE/i)).toBeInTheDocument(); // la checklist resta
  });
});
