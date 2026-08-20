import { describe, it, expect } from "vitest";
import { trovaDuplicato } from "./duplicati";
import { Trip } from "./storage";

// Il caso vero: due Zurigo identici, 1-2 nov 2025, da due risultati di
// ricerca con coordinate leggermente diverse (per questo si confronta il
// NOME, non le coordinate).
const zurigo = (over: Partial<Trip> = {}): Trip => ({
  id: "z1", city: "Zurigo", title: "Zurigo", country: "Svizzera", country_code: "CH",
  trip_date: "2025-11-01", date_end: "2025-11-02", latitude: 47.3798, longitude: 8.5414,
  created_at: "2025-11-01T00:00:00.000Z", transport_mode: "car",
  ...over,
} as Trip);

describe("trovaDuplicato — stesso posto, date che si toccano", () => {
  it("il caso Zurigo: stesse date, coordinate diverse → doppione", () => {
    expect(trovaDuplicato([zurigo()], "Zurigo", "2025-11-01", "2025-11-02")?.id).toBe("z1");
  });

  it("maiuscole e spazi non contano", () => {
    expect(trovaDuplicato([zurigo()], "  zurigo ", "2025-11-01", "2025-11-02")).not.toBeNull();
  });

  it("sovrapposizione parziale basta (arrivo il giorno che l'altro finisce)", () => {
    expect(trovaDuplicato([zurigo()], "Zurigo", "2025-11-02", "2025-11-05")).not.toBeNull();
  });

  it("stesso posto ma date DIVERSE non è un doppione: è un ritorno", () => {
    expect(trovaDuplicato([zurigo()], "Zurigo", "2026-03-10", "2026-03-12")).toBeNull();
  });

  it("stesse date ma posto diverso: nessun avviso", () => {
    expect(trovaDuplicato([zurigo()], "Berna", "2025-11-01", "2025-11-02")).toBeNull();
  });

  it("viaggio esistente di un giorno solo (senza date_end)", () => {
    expect(trovaDuplicato([zurigo({ date_end: null })], "Zurigo", "2025-11-01", null)).not.toBeNull();
    expect(trovaDuplicato([zurigo({ date_end: null })], "Zurigo", "2025-11-02", null)).toBeNull();
  });

  it("città vuota o data vuota: nessun controllo, nessun crash", () => {
    expect(trovaDuplicato([zurigo()], "", "2025-11-01")).toBeNull();
    expect(trovaDuplicato([zurigo()], "Zurigo", "")).toBeNull();
  });
});
