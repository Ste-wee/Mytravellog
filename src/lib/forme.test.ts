import { describe, it, expect } from "vitest";
import { formaDiViaggio, contaForme } from "./forme";
import type { Trip } from "./storage";

const MILANO = { lat: 45.4642, lon: 9.19 };
const wp = (city: string, lat: number, lon: number) =>
  ({ city, country: "Italia", transport_mode: "car" as const, lat, lon });

const viaggio = (over: Partial<Trip> = {}): Trip => ({
  id: Math.random().toString(36).slice(2),
  trip_date: "2026-06-01", date_end: "2026-06-05",
  home_latitude: MILANO.lat, home_longitude: MILANO.lon,
  latitude: 47.3769, longitude: 8.5417, city: "Zurigo", waypoints: [],
  ...over,
} as Trip);

describe("formaDiViaggio — quattro caselle che si escludono", () => {
  it("stesso giorno: in giornata", () => {
    expect(formaDiViaggio(viaggio({ trip_date: "2026-05-10", date_end: "2026-05-10" }))).toBe("giornata");
  });

  // L'ordine delle domande È la definizione: la durata prima della struttura.
  it("una gita CON tappe resta in giornata, non itinerante", () => {
    expect(formaDiViaggio(viaggio({
      trip_date: "2026-05-10", date_end: "2026-05-10",
      waypoints: [wp("Como", 45.81, 9.08)],
    }))).toBe("giornata");
  });

  // Il caso che mette davvero alla prova l'ORDINE delle domande: una giornata
  // sul lago che parte e torna a Como, con Bellagio in mezzo. È insieme una
  // gita E un viaggio con base — e deve vincere la durata.
  // (L'ha scoperto un mutation test: scambiando le due domande i test
  // passavano tutti, perché nessuna gita di prova aveva anche una base.)
  it("una gita che ha ANCHE una base resta in giornata", () => {
    const gitaConBase = viaggio({
      trip_date: "2026-05-10", date_end: "2026-05-10",
      city: "Como", latitude: 45.81, longitude: 9.08,
      waypoints: [wp("Como", 45.81, 9.08), wp("Bellagio", 45.98, 9.26)],
    });
    expect(formaDiViaggio(gitaConBase)).toBe("giornata");
    // e la controprova: le stesse tappe su due giorni diventano tappa fissa
    expect(formaDiViaggio({ ...gitaConBase, date_end: "2026-05-11" })).toBe("base");
  });

  it("rientri nello stesso posto: tappa fissa", () => {
    // Milano → Firenze → Siena → Firenze (destinazione)
    expect(formaDiViaggio(viaggio({
      city: "Firenze", latitude: 43.7696, longitude: 11.2558,
      waypoints: [wp("Firenze", 43.7696, 11.2558), wp("Siena", 43.3188, 11.3308)],
    }))).toBe("base");
  });

  it("tappe senza rientri: itinerante", () => {
    expect(formaDiViaggio(viaggio({
      waypoints: [wp("Lugano", 46.0, 8.95), wp("Lucerna", 47.05, 8.31)],
    }))).toBe("itinerante");
  });

  it("una meta e via: andata e ritorno", () => {
    expect(formaDiViaggio(viaggio())).toBe("diretto");
  });

  it("tappe senza coordinate non fanno un itinerante", () => {
    expect(formaDiViaggio(viaggio({
      waypoints: [{ city: "Ignota", country: "Italia", transport_mode: "car" }],
    } as Partial<Trip>))).toBe("diretto");
  });

  it("senza casa non si cerca nessuna base: si guarda solo le tappe", () => {
    expect(formaDiViaggio(viaggio({
      home_latitude: null, home_longitude: null,
      city: "Firenze", latitude: 43.7696, longitude: 11.2558,
      waypoints: [wp("Firenze", 43.7696, 11.2558), wp("Siena", 43.3188, 11.3308)],
    }))).toBe("itinerante");
  });
});

describe("contaForme — la somma deve fare il totale", () => {
  const archivio = [
    viaggio({ trip_date: "2026-05-10", date_end: "2026-05-10" }),                    // giornata
    viaggio({ trip_date: "2026-05-17", date_end: "2026-05-17" }),                    // giornata
    viaggio({ city: "Firenze", latitude: 43.7696, longitude: 11.2558,                // base, 2 gite
      waypoints: [wp("Firenze", 43.7696, 11.2558), wp("Siena", 43.3188, 11.3308),
        wp("Firenze", 43.7696, 11.2558), wp("Pisa", 43.7228, 10.4017)] }),
    viaggio({ waypoints: [wp("Lugano", 46.0, 8.95), wp("Lucerna", 47.05, 8.31)] }),  // itinerante (2)
    viaggio({ waypoints: [wp("Basilea", 47.56, 7.59)] }),                            // itinerante (1)
    viaggio(),                                                                        // diretto
  ];

  it("ogni viaggio in una casella sola", () => {
    const c = contaForme(archivio);
    expect(c.giornata + c.base + c.itinerante + c.diretto).toBe(archivio.length);
    expect(c).toMatchObject({ giornata: 2, base: 1, itinerante: 2, diretto: 1 });
  });

  it("conta le gite fatte dalle basi", () => {
    expect(contaForme(archivio).giteDallaBase).toBe(2);   // Siena e Pisa
  });

  it("la media delle tappe guarda SOLO gli itineranti", () => {
    // 2 e 1 tappa → media 2 (arrotondata): le tappe della base non entrano
    expect(contaForme(archivio).tappeMedie).toBe(2);
  });

  it("archivio vuoto: tutto a zero, niente divisioni per zero", () => {
    expect(contaForme([])).toEqual({
      giornata: 0, base: 0, itinerante: 0, diretto: 0, giteDallaBase: 0, tappeMedie: 0,
    });
  });
});
