import { describe, it, expect } from "vitest";
import { eGitaInGiornata, contaViaggiEGite, separaGite } from "./gite";
import type { Trip } from "./storage";

const v = (trip_date: string, date_end: string | null): Trip =>
  ({ id: Math.random().toString(36).slice(2), trip_date, date_end } as Trip);

describe("eGitaInGiornata — la distinzione la fanno le date", () => {
  it("parti e torni lo stesso giorno: è una gita", () => {
    expect(eGitaInGiornata(v("2026-05-10", "2026-05-10"))).toBe(true);
  });

  it("due giorni o più: è un viaggio", () => {
    expect(eGitaInGiornata(v("2026-05-10", "2026-05-11"))).toBe(false);
    expect(eGitaInGiornata(v("2026-06-01", "2026-06-05"))).toBe(false);
  });

  // Il punto delicato: un ritorno non compilato NON è una gita, o declasserei
  // i viaggi di chi non mette mai la data di ritorno.
  it("ritorno mancante: resta un viaggio, non si indovina", () => {
    expect(eGitaInGiornata(v("2026-05-10", null))).toBe(false);
    expect(eGitaInGiornata(v("2026-05-10", ""))).toBe(false);
  });

  it("date malformate o assurde: resta un viaggio", () => {
    expect(eGitaInGiornata(v("2026-5-10", "2026-5-10"))).toBe(false);   // senza zeri
    expect(eGitaInGiornata(v("1800-05-10", "1800-05-10"))).toBe(false); // fuori intervallo
    expect(eGitaInGiornata(v("", ""))).toBe(false);
  });

  it("il ritorno prima della partenza non è una gita", () => {
    expect(eGitaInGiornata(v("2026-05-11", "2026-05-10"))).toBe(false);
  });
});

describe("contaViaggiEGite", () => {
  it("separa i due conteggi", () => {
    const conta = contaViaggiEGite([
      v("2026-05-10", "2026-05-10"),   // gita
      v("2026-05-17", "2026-05-17"),   // gita
      v("2026-06-01", "2026-06-05"),   // viaggio
      v("2026-07-01", null),           // viaggio (durata sconosciuta)
    ]);
    expect(conta).toEqual({ viaggi: 2, gite: 2 });
  });

  it("archivio vuoto: due zeri", () => {
    expect(contaViaggiEGite([])).toEqual({ viaggi: 0, gite: 0 });
  });

  it("solo gite: nessun viaggio", () => {
    expect(contaViaggiEGite([v("2026-05-10", "2026-05-10")])).toEqual({ viaggi: 0, gite: 1 });
  });

  it("nessuna gita: il totale resta quello di prima", () => {
    const trips = [v("2026-06-01", "2026-06-05"), v("2026-07-01", "2026-07-03")];
    expect(contaViaggiEGite(trips)).toEqual({ viaggi: 2, gite: 0 });
  });
});

describe("separaGite — la porta da cui passa tutta l'app", () => {
  it("divide i due mucchi tenendo l'ordine", () => {
    const g1 = v("2026-05-10", "2026-05-10");
    const t1 = v("2026-06-01", "2026-06-05");
    const g2 = v("2026-05-17", "2026-05-17");
    const t2 = v("2026-07-01", null);
    const { viaggi, gite } = separaGite([g1, t1, g2, t2]);
    expect(viaggi).toEqual([t1, t2]);
    expect(gite).toEqual([g1, g2]);
  });

  it("i due mucchi insieme fanno sempre il totale, e non si sovrappongono", () => {
    const trips = [
      v("2026-05-10", "2026-05-10"), v("2026-06-01", "2026-06-05"),
      v("2026-07-01", null), v("2026-08-02", "2026-08-02"),
    ];
    const { viaggi, gite } = separaGite(trips);
    expect(viaggi.length + gite.length).toBe(trips.length);
    expect(viaggi.some(t => gite.includes(t))).toBe(false);
  });

  it("dice la stessa cosa di contaViaggiEGite: una definizione sola", () => {
    const trips = [
      v("2026-05-10", "2026-05-10"), v("2026-06-01", "2026-06-05"), v("2026-07-01", null),
    ];
    const { viaggi, gite } = separaGite(trips);
    expect({ viaggi: viaggi.length, gite: gite.length }).toEqual(contaViaggiEGite(trips));
  });

  it("archivio vuoto: due mucchi vuoti", () => {
    expect(separaGite([])).toEqual({ viaggi: [], gite: [] });
  });
});
