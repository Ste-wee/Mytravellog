import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppTour } from "./AppTour";
import React from "react";

function renderTour(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppTour />
    </MemoryRouter>
  );
}

describe("AppTour", () => {
  beforeEach(() => {
    localStorage.clear();
    // Il tour aspetta che la welcome sia stata congedata: qui lo è già stata.
    localStorage.setItem("navta.welcome.dismissed", "1");
  });
  afterEach(() => vi.restoreAllMocks());

  it("alla prima visita della Home mostra il tutorial", () => {
    renderTour("/");
    expect(screen.getByText("Benvenuto in NAV·TA")).toBeInTheDocument();
  });

  it("completandolo scrive il flag e non ricompare", () => {
    const prima = renderTour("/");
    fireEvent.click(screen.getByText("Avanti"));
    fireEvent.click(screen.getByText("Avanti"));
    fireEvent.click(screen.getByText("Ho capito"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem("navta.tour.home.v2")).toBe("1");
    prima.unmount();
    renderTour("/");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("il bump di versione fa ricomparire la sezione a chi aveva visto la vecchia", () => {
    // Chi ha visto la Home v1 ha il flag v1: la v2 (scheda del cloud) deve
    // passargli davanti una volta — è il senso del numero di versione.
    localStorage.setItem("navta.tour.home.v1", "1");
    renderTour("/");
    expect(screen.getByText("Benvenuto in NAV·TA")).toBeInTheDocument();
  });

  it("il form di Nuovo viaggio ha il suo capitolo (l'itinerario e la tenda)", () => {
    renderTour("/nuovo-viaggio");
    expect(screen.getByText("L'itinerario prende forma")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Avanti"));
    expect(screen.getByText("Dormi sempre nello stesso posto?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Ho capito"));
    expect(localStorage.getItem("navta.tour.form.v1")).toBe("1");
  });

  it("«Rivedi il tutorial» (evento navta:tour-replay) mostra TUTTI i capitoli in fila, anche se già visti", () => {
    // Tutto già visto: alla prima visita non comparirebbe niente.
    [["home", 2], ["trips", 1], ["plans", 1], ["stats", 2], ["form", 1]]
      .forEach(([k, v]) => localStorage.setItem(`navta.tour.${k}.v${v}`, "1"));
    renderTour("/");
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent(window, new Event("navta:tour-replay"));
    // Parte dal primo capitolo, con la riga di orientamento (solo nel replay).
    expect(screen.getByText("Benvenuto in NAV·TA")).toBeInTheDocument();
    expect(screen.getByText(/La tua Home · 1 di 3/)).toBeInTheDocument();

    // Fine di un capitolo = si passa al successivo, non si chiude.
    fireEvent.click(screen.getByText("Avanti"));
    fireEvent.click(screen.getByText("Avanti"));
    expect(screen.getByText("I viaggi ti seguono")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Avanti"));   // ultima scheda Home → capitolo Viaggi
    expect(screen.getByText(/I tuoi viaggi · 1 di 3/)).toBeInTheDocument();

    // «Salta» nel replay salta il CAPITOLO, non tutto il tour.
    fireEvent.click(screen.getByText("Salta"));
    expect(screen.getByText(/In programma · 1 di 2/)).toBeInTheDocument();

    // L'ultimissima scheda dice «Ho capito» e chiude tutto.
    fireEvent.click(screen.getByText("Salta"));    // → Statistiche
    fireEvent.click(screen.getByText("Salta"));    // → Nuovo viaggio
    fireEvent.click(screen.getByText("Avanti"));
    fireEvent.click(screen.getByText("Ho capito"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("nel replay la X abbandona tutto, non passa al capitolo dopo", () => {
    renderTour("/impostazioni");   // rotta senza tour: si apre solo col replay
    fireEvent(window, new Event("navta:tour-replay"));
    expect(screen.getByText("Benvenuto in NAV·TA")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Salta il tutorial"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // Con lo storage PIENO setItem lancia: senza la guardia il tap su
  // "Ho capito" moriva prima di chiudere e il tutorial restava inchiudibile.
  // NB: né vi.spyOn(Storage.prototype) né lo spy sull'istanza mordono il
  // localStorage di jsdom (è un Proxy): va sostituito l'oggetto INTERO.
  it("si chiude anche se localStorage è pieno (setItem che lancia)", () => {
    renderTour("/");
    fireEvent.click(screen.getByText("Avanti"));
    fireEvent.click(screen.getByText("Avanti"));
    const vero = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vero.getItem.bind(vero), removeItem: vero.removeItem.bind(vero),
        clear: vero.clear.bind(vero), key: vero.key.bind(vero),
        setItem: () => { throw new Error("QuotaExceededError"); },
        get length() { return vero.length; },
      },
    });
    try {
      fireEvent.click(screen.getByText("Ho capito"));
    } finally {
      Object.defineProperty(window, "localStorage", { configurable: true, value: vero });
    }
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
