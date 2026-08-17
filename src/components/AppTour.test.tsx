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
    fireEvent.click(screen.getByText("Ho capito"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem("navta.tour.home.v1")).toBe("1");
    prima.unmount();
    renderTour("/");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // Con lo storage PIENO setItem lancia: senza la guardia il tap su
  // "Ho capito" moriva prima di chiudere e il tutorial restava inchiudibile.
  // NB: né vi.spyOn(Storage.prototype) né lo spy sull'istanza mordono il
  // localStorage di jsdom (è un Proxy): va sostituito l'oggetto INTERO.
  it("si chiude anche se localStorage è pieno (setItem che lancia)", () => {
    renderTour("/");
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
