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

  it("le DUE caselle ci sono sempre, anche quelle a zero", () => {
    render(<ComeViaggi trips={[viaggio()]} />);
    for (const l of ["Tappa fissa", "Itineranti"]) {
      expect(screen.getByText(l)).toBeTruthy();
    }
    // "In giornata" non è più una forma: le gite sono contate a parte
    // (scelta di Stefano, 2026-08-24) e hanno la loro riga sotto le caselle.
    expect(screen.queryByText("In giornata")).toBeNull();
    // un viaggio con una meta sola sta in "tappa fissa": ci hai dormito
    expect(numeri()).toEqual(["1", "0"]);
  });

  // La domanda di Stefano: "tappa fissa" e "andata e ritorno" erano due nomi
  // per la stessa esperienza (0 contro 10 nei suoi dati).
  it("una meta sola e una meta con gite finiscono nella stessa casella", () => {
    render(<ComeViaggi trips={[
      viaggio(),
      viaggio({ city: "Firenze", latitude: 43.7696, longitude: 11.2558,
        waypoints: [wp("Firenze", 43.7696, 11.2558), wp("Siena", 43.3188, 11.3308)] }),
    ]} />);
    expect(numeri()).toEqual(["2", "0"]);
    expect(screen.getByText(/1 con gite/)).toBeTruthy();
  });

  // L'invariante che rende la sezione onesta: se la somma delle caselle non fa
  // il totale dichiarato, la pagina sta mentendo. Ora il totale sono i VIAGGI,
  // gite escluse — e le gite si contano nella loro riga.
  it("la somma delle caselle fa i viaggi, e le gite stanno nella loro riga", () => {
    const trips = [
      viaggio({ trip_date: "2026-05-10", date_end: "2026-05-10" }),
      viaggio({ city: "Firenze", latitude: 43.7696, longitude: 11.2558,
        waypoints: [wp("Firenze", 43.7696, 11.2558), wp("Siena", 43.3188, 11.3308)] }),
      viaggio({ waypoints: [wp("Lucerna", 47.05, 8.31)] }),
      viaggio(),
    ];
    render(<ComeViaggi trips={trips} />);
    // Il primo .font-mono della riga gite è il suo numero: si scarta contando
    // solo le caselle, che sono due.
    const caselle = numeri().slice(0, 2).reduce((s, n) => s + Number(n), 0);
    expect(caselle).toBe(3);   // 4 schede - 1 gita
    expect(screen.getByText(/3 viaggi\./)).toBeTruthy();
    expect(screen.getByText(/gita in giornata, contate a parte/)).toBeTruthy();
  });

  // Il caso che prima non esisteva: solo gite. Le caselle sono tutte a zero e
  // la riga delle gite è l'unica cosa vera in pagina — deve esserci, o la
  // sezione dice "0 viaggi" senza spiegare dove sono finite le schede.
  it("con SOLE gite le caselle sono a zero e la riga delle gite spiega perché", () => {
    render(<ComeViaggi trips={[
      viaggio({ trip_date: "2026-05-10", date_end: "2026-05-10" }),
      viaggio({ trip_date: "2026-07-20", date_end: "2026-07-20" }),
    ]} />);
    expect(numeri().slice(0, 2)).toEqual(["0", "0"]);
    expect(screen.getByText(/gite in giornata, contate a parte/)).toBeTruthy();
  });

  it("senza gite la loro riga non compare", () => {
    render(<ComeViaggi trips={[viaggio()]} />);
    expect(screen.queryByText(/contate a parte/)).toBeNull();
  });

  it("i dettagli compaiono solo dove c'è qualcosa da dire", () => {
    render(<ComeViaggi trips={[
      viaggio({ city: "Firenze", latitude: 43.7696, longitude: 11.2558,
        waypoints: [wp("Firenze", 43.7696, 11.2558), wp("Siena", 43.3188, 11.3308)] }),
    ]} />);
    expect(screen.getByText(/un posto, più notti · 1 con gite/)).toBeTruthy();
    // la casella "itineranti" è a zero: il suo sottotitolo non si mostra
    expect(screen.queryByText(/tappe in media/)).toBeNull();
  });

  it("senza gite il sottotitolo non le nomina", () => {
    render(<ComeViaggi trips={[viaggio()]} />);
    expect(screen.getByText("un posto, più notti")).toBeTruthy();
    expect(screen.queryByText(/con gite/)).toBeNull();
  });
});
