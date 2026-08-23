import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComeViaggi } from "./ComeViaggi";
import type { Trip } from "@/lib/storage";

const wp = (city: string, lat: number, lon: number) =>
  ({ city, country: "Italia", transport_mode: "car" as const, lat, lon });

const viaggio = (over: Partial<Trip> = {}): Trip => ({
  id: Math.random().toString(36).slice(2),
  trip_date: "2026-06-01", date_end: "2026-06-05",
  home_latitude: 45.4642, home_longitude: 9.19,
  latitude: 47.3769, longitude: 8.5417, city: "Zurigo", waypoints: [],
  ...over,
} as Trip);

const numeri = () => [...document.querySelectorAll(".font-mono")].map(n => n.textContent);

describe("ComeViaggi", () => {
  it("archivio vuoto: la sezione non c'è", () => {
    const { container } = render(<ComeViaggi trips={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("le tre caselle ci sono sempre, anche quelle a zero", () => {
    render(<ComeViaggi trips={[viaggio()]} />);
    for (const l of ["In giornata", "Tappa fissa", "Itineranti"]) {
      expect(screen.getByText(l)).toBeTruthy();
    }
    // un viaggio con una meta sola sta in "tappa fissa": ci hai dormito
    expect(numeri()).toEqual(["0", "1", "0"]);
  });

  // La domanda di Stefano: "tappa fissa" e "andata e ritorno" erano due nomi
  // per la stessa esperienza (0 contro 10 nei suoi dati).
  it("una meta sola e una meta con gite finiscono nella stessa casella", () => {
    render(<ComeViaggi trips={[
      viaggio(),
      viaggio({ city: "Firenze", latitude: 43.7696, longitude: 11.2558,
        waypoints: [wp("Firenze", 43.7696, 11.2558), wp("Siena", 43.3188, 11.3308)] }),
    ]} />);
    expect(numeri()).toEqual(["0", "2", "0"]);
    expect(screen.getByText(/1 con gite/)).toBeTruthy();
  });

  // L'invariante che rende la sezione onesta: se la somma non fa il totale,
  // la pagina sta mentendo.
  it("la somma delle caselle fa il totale dichiarato", () => {
    const trips = [
      viaggio({ trip_date: "2026-05-10", date_end: "2026-05-10" }),
      viaggio({ city: "Firenze", latitude: 43.7696, longitude: 11.2558,
        waypoints: [wp("Firenze", 43.7696, 11.2558), wp("Siena", 43.3188, 11.3308)] }),
      viaggio({ waypoints: [wp("Lucerna", 47.05, 8.31)] }),
      viaggio(),
    ];
    render(<ComeViaggi trips={trips} />);
    const somma = numeri().reduce((s, n) => s + Number(n), 0);
    expect(somma).toBe(trips.length);
    // Il totale distingue le gite, o non torna con la Home (che le esclude
    // dai "viaggi"): 3 viaggi + 1 gita = 4 schede.
    expect(screen.getByText(/3 viaggi e 1 gita in giornata/)).toBeTruthy();
  });

  it("i dettagli compaiono solo dove c'è qualcosa da dire", () => {
    render(<ComeViaggi trips={[
      viaggio({ city: "Firenze", latitude: 43.7696, longitude: 11.2558,
        waypoints: [wp("Firenze", 43.7696, 11.2558), wp("Siena", 43.3188, 11.3308)] }),
    ]} />);
    expect(screen.getByText(/un posto, più notti · 1 con gite/)).toBeTruthy();
    // la casella "in giornata" è a zero: il suo sottotitolo non si mostra
    expect(screen.queryByText("parti e torni")).toBeNull();
  });

  it("senza gite il sottotitolo non le nomina", () => {
    render(<ComeViaggi trips={[viaggio()]} />);
    expect(screen.getByText("un posto, più notti")).toBeTruthy();
    expect(screen.queryByText(/con gite/)).toBeNull();
  });
});
