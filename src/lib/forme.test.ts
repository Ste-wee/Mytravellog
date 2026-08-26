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

describe("formaDiViaggio — due caselle che si escludono", () => {
  // Per due giorni "in giornata" era una TERZA casella, e vinceva sulla
  // struttura: una gita con base restava "in giornata". La feature delle gite
  // in giornata è stata rimossa il 2026-08-26 — l'app censisce solo viaggi con
  // più giorni — e con lei la casella. Qui resta il paletto: la durata non
  // decide più niente, decide come ti sei mosso.
  it("stesso giorno: nessuna casella a parte, decide la struttura", () => {
    const unGiorno = { trip_date: "2026-05-10", date_end: "2026-05-10" };
    // una meta e basta
    expect(formaDiViaggio(viaggio(unGiorno))).toBe("fissa");
    // Como → Bellagio → Como: prima era "in giornata", ora è una base
    expect(formaDiViaggio(viaggio({ ...unGiorno,
      city: "Como", latitude: 45.81, longitude: 9.08,
      waypoints: [wp("Como", 45.81, 9.08), wp("Bellagio", 45.98, 9.26)],
    }))).toBe("fissa");
    // tappe senza rientri: itinerante, come su cinque giorni
    expect(formaDiViaggio(viaggio({ ...unGiorno,
      waypoints: [wp("Lugano", 46.0, 8.95), wp("Lucerna", 47.05, 8.31)],
    }))).toBe("itinerante");
  });

  it("rientri nello stesso posto: tappa fissa", () => {
    // Milano → Firenze → Siena → Firenze (destinazione)
    expect(formaDiViaggio(viaggio({
      city: "Firenze", latitude: 43.7696, longitude: 11.2558,
      waypoints: [wp("Firenze", 43.7696, 11.2558), wp("Siena", 43.3188, 11.3308)],
    }))).toBe("fissa");
  });

  // La domanda di Stefano guardando i suoi numeri (0 tappe fisse, 10 andata e
  // ritorno): «non sono la stessa cosa?». Sì: in entrambi i casi dormi in un
  // posto solo, e la differenza che avevo codificato era se il rientro fosse
  // stato censito come tappa. Ora finiscono nella stessa casella.
  it("una meta sola e una meta con gite stanno nella STESSA casella", () => {
    const soloFirenze = viaggio({ city: "Firenze", latitude: 43.7696, longitude: 11.2558 });
    const firenzeConGite = viaggio({
      city: "Firenze", latitude: 43.7696, longitude: 11.2558,
      waypoints: [wp("Firenze", 43.7696, 11.2558), wp("Siena", 43.3188, 11.3308)],
    });
    expect(formaDiViaggio(soloFirenze)).toBe("fissa");
    expect(formaDiViaggio(firenzeConGite)).toBe("fissa");
    // e il dettaglio che le distingue resta contato a parte
    const c = contaForme([soloFirenze, firenzeConGite]);
    expect(c.fissa).toBe(2);
    expect(c.conGite).toBe(1);
  });

  it("tappe senza rientri: itinerante", () => {
    expect(formaDiViaggio(viaggio({
      waypoints: [wp("Lugano", 46.0, 8.95), wp("Lucerna", 47.05, 8.31)],
    }))).toBe("itinerante");
  });

  it("una meta e via: tappa fissa (ci hai dormito)", () => {
    expect(formaDiViaggio(viaggio())).toBe("fissa");
  });

  // I viaggi salvati da versioni vecchie possono non avere affatto il campo
  // waypoints: nessuna delle quattro domande deve inciamparci.
  it("un viaggio senza il campo tappe è a tappa fissa, non un errore", () => {
    const legacy = { trip_date: "2026-06-01", date_end: "2026-06-05",
      home_latitude: MILANO.lat, home_longitude: MILANO.lon,
      latitude: 47.3769, longitude: 8.5417, city: "Zurigo" } as Trip;
    expect(formaDiViaggio(legacy)).toBe("fissa");
    expect(contaForme([legacy])).toMatchObject({ fissa: 1, tappeMedie: 0 });
  });

  it("tappe senza coordinate non fanno un itinerante", () => {
    expect(formaDiViaggio(viaggio({
      waypoints: [{ city: "Ignota", country: "Italia", transport_mode: "car" }],
    } as Partial<Trip>))).toBe("fissa");
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
    viaggio({ trip_date: "2026-05-10", date_end: "2026-05-10" }),                    // fissa (un giorno)
    viaggio({ city: "Genova", latitude: 44.4056, longitude: 8.9463 }),               // fissa (una meta)
    viaggio({ city: "Firenze", latitude: 43.7696, longitude: 11.2558,                // base, 2 gite
      waypoints: [wp("Firenze", 43.7696, 11.2558), wp("Siena", 43.3188, 11.3308),
        wp("Firenze", 43.7696, 11.2558), wp("Pisa", 43.7228, 10.4017)] }),
    viaggio({ waypoints: [wp("Lugano", 46.0, 8.95), wp("Lucerna", 47.05, 8.31)] }),  // itinerante (2)
    viaggio({ waypoints: [wp("Basilea", 47.56, 7.59)] }),                            // itinerante (1)
    viaggio(),                                                                        // fissa (una meta)
  ];

  it("ogni viaggio in una casella sola, e la somma fa il totale", () => {
    const c = contaForme(archivio);
    expect(c.fissa + c.itinerante).toBe(archivio.length);
    expect(c).toMatchObject({ fissa: 4, itinerante: 2, conGite: 1 });
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
      fissa: 0, itinerante: 0, conGite: 0, giteDallaBase: 0, tappeMedie: 0,
    });
  });
});
