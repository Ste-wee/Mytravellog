import { describe, it, expect } from "vitest";
import { compagniDeiViaggi, viaggiCon } from "./compagni";
import type { Trip } from "./storage";

const v = (id: string, companions?: string[]): Trip => ({
  id, created_at: "2024-01-01T00:00:00.000Z", title: id, city: id,
  country: "Italia", country_code: "IT", trip_date: "2026-01-01", date_end: "2026-01-05",
  rating: null, notes: null, transport_mode: null, waypoints: [],
  latitude: 45, longitude: 9, home_latitude: null, home_longitude: null, home_label: null,
  route_geometry: null, temperature_c: null, altitude_m: null,
  distance_from_home_km: null, max_distance_from_home_km: null, max_distance_city: null,
  max_altitude_m: null, max_altitude_city: null, hottest_temp_c: null, hottest_city: null,
  coldest_temp_c: null, coldest_city: null, region: null, region_details: null,
  companions,
} as Trip);

describe("compagniDeiViaggi", () => {
  it("conta le persone e le ordina dalla più frequente", () => {
    const out = compagniDeiViaggi([v("a", ["Giulia"]), v("b", ["Giulia", "Marco"]), v("c", ["Giulia"])]);
    expect(out.map(c => [c.nome, c.quanti])).toEqual([["Giulia", 3], ["Marco", 1]]);
  });

  it("«giulia» e «Giulia» sono la stessa persona, e si mostra la prima forma", () => {
    const out = compagniDeiViaggi([v("a", ["Giulia"]), v("b", ["giulia"]), v("c", ["  GIULIA  "])]);
    expect(out).toEqual([{ nome: "Giulia", quanti: 3 }]);
  });

  it("una persona citata due volte nello STESSO viaggio conta una volta", () => {
    // Il numero dice «quanti viaggi insieme», non «quante volte l'hai scritta».
    expect(compagniDeiViaggi([v("a", ["Marco", "marco"])])).toEqual([{ nome: "Marco", quanti: 1 }]);
  });

  it("a parità di conteggio l'ordine è alfabetico, non quello dell'archivio", () => {
    // Senza questo i chip si spostavano sotto le dita aggiungendo un viaggio.
    const out = compagniDeiViaggi([v("a", ["Zoe"]), v("b", ["Anna"])]);
    expect(out.map(c => c.nome)).toEqual(["Anna", "Zoe"]);
  });

  it("nomi vuoti o di soli spazi non diventano un chip", () => {
    expect(compagniDeiViaggi([v("a", ["", "   ", "Ada"])])).toEqual([{ nome: "Ada", quanti: 1 }]);
  });

  it("viaggi senza compagni: nessuna persona, nessun chip", () => {
    expect(compagniDeiViaggi([v("a"), v("b", [])])).toEqual([]);
  });
});

describe("viaggiCon", () => {
  it("filtra i viaggi fatti con quella persona, senza guardare le maiuscole", () => {
    const trips = [v("a", ["Giulia"]), v("b", ["Marco"]), v("c", ["giulia", "Marco"])];
    expect(viaggiCon(trips, "GIULIA").map(t => t.id)).toEqual(["a", "c"]);
  });

  it("senza nome restituisce TUTTI i viaggi (la stessa lista, non una copia vuota)", () => {
    const trips = [v("a", ["Giulia"]), v("b")];
    expect(viaggiCon(trips, null)).toBe(trips);
  });

  it("una persona che non c'è dà una lista vuota, non tutti i viaggi", () => {
    expect(viaggiCon([v("a", ["Giulia"])], "Ada")).toEqual([]);
  });
});
