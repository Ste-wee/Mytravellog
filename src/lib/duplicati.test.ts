import { describe, it, expect } from "vitest";
import { trovaDuplicato } from "./duplicati";
import { Trip } from "./storage";

// Il caso tipico: due viaggi identici nella stessa città, da due risultati di
// ricerca con coordinate leggermente diverse (per questo si confronta il
// NOME, non le coordinate).
const ginevra = (over: Partial<Trip> = {}): Trip => ({
  id: "z1", city: "Ginevra", title: "Ginevra", country: "Svizzera", country_code: "CH",
  trip_date: "2024-05-10", date_end: "2024-05-11", latitude: 46.2044, longitude: 6.1432,
  created_at: "2024-05-10T00:00:00.000Z", transport_mode: "car",
  ...over,
} as Trip);

describe("trovaDuplicato — stesso posto, date che si toccano", () => {
  it("il caso del doppione: stesse date, coordinate diverse → doppione", () => {
    expect(trovaDuplicato([ginevra()], "Ginevra", "2024-05-10", "2024-05-11")?.id).toBe("z1");
  });

  it("maiuscole e spazi non contano", () => {
    expect(trovaDuplicato([ginevra()], "  ginevra ", "2024-05-10", "2024-05-11")).not.toBeNull();
  });

  it("sovrapposizione parziale basta (arrivo il giorno che l'altro finisce)", () => {
    expect(trovaDuplicato([ginevra()], "Ginevra", "2024-05-11", "2024-05-14")).not.toBeNull();
  });

  it("stesso posto ma date DIVERSE non è un doppione: è un ritorno", () => {
    expect(trovaDuplicato([ginevra()], "Ginevra", "2026-03-10", "2026-03-12")).toBeNull();
  });

  it("stesse date ma posto diverso: nessun avviso", () => {
    expect(trovaDuplicato([ginevra()], "Berna", "2024-05-10", "2024-05-11")).toBeNull();
  });

  it("viaggio esistente di un giorno solo (senza date_end)", () => {
    expect(trovaDuplicato([ginevra({ date_end: null })], "Ginevra", "2024-05-10", null)).not.toBeNull();
    expect(trovaDuplicato([ginevra({ date_end: null })], "Ginevra", "2024-05-11", null)).toBeNull();
  });

  it("città vuota o data vuota: nessun controllo, nessun crash", () => {
    expect(trovaDuplicato([ginevra()], "", "2024-05-10")).toBeNull();
    expect(trovaDuplicato([ginevra()], "Ginevra", "")).toBeNull();
  });
});
