import { describe, it, expect, beforeEach } from "vitest";
import { shouldShowWelcome } from "./WelcomeGate";
import { saveTrips, Trip } from "@/lib/storage";

const aTrip = { id: "t1", title: "Parigi", trip_date: "2025-01-01", city: "Parigi", latitude: 48.86, longitude: 2.35 } as unknown as Trip;

describe("shouldShowWelcome — regola del primo avvio", () => {
  beforeEach(() => localStorage.clear());

  it("dispositivo vergine: si mostra", () => {
    expect(shouldShowWelcome()).toBe(true);
  });

  it("già saltata (ospite): mai più", () => {
    localStorage.setItem("navta.welcome.dismissed", "1");
    expect(shouldShowWelcome()).toBe(false);
  });

  it("già sincronizzato col cloud: mai", () => {
    localStorage.setItem("navta.cloud.localTs", String(Date.now()));
    expect(shouldShowWelcome()).toBe(false);
  });

  it("ha già dei viaggi (utente esistente): mai — niente muro davanti al diario", () => {
    saveTrips([aTrip]);
    expect(shouldShowWelcome()).toBe(false);
  });
});
