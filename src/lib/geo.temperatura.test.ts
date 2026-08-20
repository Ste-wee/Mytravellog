import { describe, it, expect, vi, afterEach } from "vitest";
import { temperaturaMemorabile, fetchTemperature } from "./geo";

/**
 * Segnalazione di Stefano (2026-08-20): "ho aggiunto un viaggio in Lapponia
 * ma la temperatura è bassa quando sono stato lì segnava -31°".
 * Due cause: chiedevamo la MEDIA giornaliera (che annacqua di ~10 gradi) e
 * la chiedevamo solo per il GIORNO DI PARTENZA.
 */
describe("temperaturaMemorabile — quale numero si racconta", () => {
  it("viaggio invernale: vince la minima", () => {
    // Rovaniemi, valori veri dall'archivio
    expect(temperaturaMemorabile(-31, -8)).toBe(-31);
    expect(temperaturaMemorabile(-22.4, -17.3)).toBe(-22.4);
  });

  it("viaggio estivo: vince la massima", () => {
    // Siviglia, valori veri dall'archivio
    expect(temperaturaMemorabile(22.2, 40.7)).toBe(40.7);
  });

  it("viaggio mite: vince la massima (l'estate è la norma)", () => {
    expect(temperaturaMemorabile(12, 24)).toBe(24);   // pari distanza da 18
    expect(temperaturaMemorabile(15, 21)).toBe(21);
  });

  it("sotto zero ma con un pomeriggio caldo: vince comunque il freddo", () => {
    expect(temperaturaMemorabile(-15, 20)).toBe(-15);
  });
});

describe("fetchTemperature — l'intero periodo del viaggio", () => {
  afterEach(() => vi.unstubAllGlobals());

  const archivio = (min: number[], max: number[]) => vi.fn(async (url: string) => {
    if (!/archive-api/.test(url)) throw new Error("chiamata inattesa: " + url);
    return { ok: true, json: async () => ({ daily: { temperature_2m_min: min, temperature_2m_max: max } }) };
  });

  it("chiede TUTTI i giorni, non solo la partenza, e ne prende l'estremo", async () => {
    const f = archivio([-18.2, -21.7, -20.8, -31], [-8.5, -9.8, -16.6, -17.3]);
    vi.stubGlobal("fetch", f);
    const t = await fetchTemperature(66.5, 25.73, "2020-01-08", "2020-01-11");
    expect(t).toBe(-31);                                   // il freddo del quarto giorno
    const url = f.mock.calls[0][0] as string;
    expect(url).toContain("start_date=2020-01-08");
    expect(url).toContain("end_date=2020-01-11");
    expect(url).toContain("temperature_2m_min");
    expect(url).not.toContain("temperature_2m_mean");      // la media annacquava
  });

  it("senza data di fine resta il giorno solo", async () => {
    const f = archivio([-12], [-4]);
    vi.stubGlobal("fetch", f);
    await fetchTemperature(66.5, 25.73, "2020-01-08");
    const url = f.mock.calls[0][0] as string;
    expect(url).toContain("start_date=2020-01-08");
    expect(url).toContain("end_date=2020-01-08");
  });

  it("viaggio ancora in corso: il periodo si ferma a oggi, non al futuro", async () => {
    const f = archivio([-5], [3]);
    vi.stubGlobal("fetch", f);
    const oggi = new Date();
    const ieri = new Date(oggi.getTime() - 86400000).toISOString().slice(0, 10);
    const fraUnMese = new Date(oggi.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    await fetchTemperature(45, 9, ieri, fraUnMese);
    const url = f.mock.calls[0][0] as string;
    expect(url).not.toContain(`end_date=${fraUnMese}`);
  });

  it("giorni senza dato (buchi nell'archivio) non fanno saltare il conto", async () => {
    vi.stubGlobal("fetch", archivio([-10, null as unknown as number, -25], [0, null as unknown as number, -12]));
    expect(await fetchTemperature(66.5, 25.73, "2020-01-08", "2020-01-10")).toBe(-25);
  });

  it("archivio vuoto o rotto → null, non un numero inventato", async () => {
    vi.stubGlobal("fetch", archivio([], []));
    expect(await fetchTemperature(66.5, 25.73, "2020-01-08", "2020-01-10")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    expect(await fetchTemperature(66.5, 25.73, "2020-01-08", "2020-01-10")).toBeNull();
  });

  it("viaggio tutto nel futuro: nessuna temperatura", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const fra10 = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    const fra20 = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    expect(await fetchTemperature(45, 9, fra10, fra20)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});
