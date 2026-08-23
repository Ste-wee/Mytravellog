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
  it("archivio vuoto: la sezione non c'è (niente quattro zeri)", () => {
    const { container } = render(<ComeViaggi trips={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("le quattro caselle ci sono sempre, anche quelle a zero", () => {
    render(<ComeViaggi trips={[viaggio()]} />);
    for (const l of ["In giornata", "Tappa fissa", "Itineranti", "Andata e ritorno"]) {
      expect(screen.getByText(l)).toBeTruthy();
    }
    expect(numeri()).toEqual(["0", "0", "0", "1"]);
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
    expect(screen.getByText(/4 in tutto/)).toBeTruthy();
  });

  it("i dettagli compaiono solo dove c'è qualcosa da dire", () => {
    render(<ComeViaggi trips={[
      viaggio({ city: "Firenze", latitude: 43.7696, longitude: 11.2558,
        waypoints: [wp("Firenze", 43.7696, 11.2558), wp("Siena", 43.3188, 11.3308)] }),
    ]} />);
    expect(screen.getByText("1 gita dalla base")).toBeTruthy();
    // la casella "in giornata" è a zero: il suo sottotitolo non si mostra
    expect(screen.queryByText("parti e torni")).toBeNull();
  });
});
