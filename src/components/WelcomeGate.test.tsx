import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { shouldShowWelcome, WelcomeGate } from "./WelcomeGate";
import { CloudProvider, EVENTO_SCOLLEGATO } from "@/lib/cloudContext";
import { saveTrips, Trip } from "@/lib/storage";

// Il provider vero monterebbe il motore di sync: qui serve solo il contesto.
vi.mock("@/lib/firebaseSync", () => ({
  onAuth: () => () => { /* nessuna sessione */ },
  accedi: vi.fn(),
  esci: vi.fn(async () => { /* ok */ }),
  leggiArchivio: vi.fn(async () => null),
  scriviArchivio: vi.fn(async () => { /* ok */ }),
}));

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

  // Segnalato da Stefano: "cliccando su disconnetti non mi riporta alla
  // homepage di login". Il cancello si archiviava per sempre al primo avvio,
  // e un'uscita voluta non lo riapriva.
  it("scollegato a mano: si mostra ANCHE con i viaggi in casa", () => {
    saveTrips([aTrip]);
    localStorage.setItem("navta.cloud.localTs", String(Date.now()));
    localStorage.setItem("navta.cloud.scollegato", "1");
    expect(shouldShowWelcome()).toBe(true);
  });

  it("scollegato, poi entrato come ospite: non si mostra più", () => {
    saveTrips([aTrip]);
    localStorage.setItem("navta.cloud.scollegato", "1");
    localStorage.setItem("navta.welcome.dismissed", "1");   // "Entra come ospite"
    expect(shouldShowWelcome()).toBe(false);
  });
});

describe("WelcomeGate — il cancello riappare quando ci si scollega", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("navta.welcome.dismissed", "1");   // già visto e archiviato
  });

  const monta = () => render(
    <MemoryRouter><CloudProvider><WelcomeGate/></CloudProvider></MemoryRouter>,
  );

  it("all'avvio normale non c'è", () => {
    monta();
    expect(screen.queryByText("Entra come ospite")).toBeNull();
  });

  it("all'evento di scollegamento riappare SUBITO, senza ricaricare", () => {
    monta();
    act(() => {
      localStorage.removeItem("navta.welcome.dismissed");
      window.dispatchEvent(new Event(EVENTO_SCOLLEGATO));
    });
    expect(screen.getByText("Entra come ospite")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Accedi con Google/ })).toBeTruthy();
  });

  it("e da lì «Entra come ospite» lo richiude", () => {
    monta();
    act(() => {
      localStorage.removeItem("navta.welcome.dismissed");
      window.dispatchEvent(new Event(EVENTO_SCOLLEGATO));
    });
    act(() => { screen.getByText("Entra come ospite").click(); });
    expect(screen.queryByText("Entra come ospite")).toBeNull();
    expect(localStorage.getItem("navta.welcome.dismissed")).toBe("1");
  });
});
