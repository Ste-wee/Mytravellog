import { describe, it, expect } from "vitest";
import { planCountdown } from "./plans";
import type { Trip } from "./storage";

function plan(trip_date: string, date_end: string | null = null): Trip {
  return { trip_date, date_end } as Trip; // planCountdown legge solo le date
}

const TODAY = "2026-07-30";

describe("planCountdown", () => {
  it("partenza lontana → 'tra N giorni', non urgente", () => {
    expect(planCountdown(plan("2026-09-30"), TODAY)).toEqual({ text: "tra 62 giorni", urgent: false, returned: false });
  });

  it("partenza ad anni di distanza → giorni col separatore delle migliaia", () => {
    // ~2,9 anni dopo TODAY: senza fmtNumber si leggerebbe "tra 1025 giorni"
    expect(planCountdown(plan("2029-05-20"), TODAY).text).toBe("tra 1.025 giorni");
  });

  it("partenza entro 14 giorni → urgente", () => {
    expect(planCountdown(plan("2026-08-10"), TODAY)).toEqual({ text: "tra 11 giorni", urgent: true, returned: false });
  });

  it("domani / oggi", () => {
    expect(planCountdown(plan("2026-07-31"), TODAY).text).toBe("domani");
    expect(planCountdown(plan("2026-07-30"), TODAY).text).toBe("oggi");
  });

  it("tra partenza e ritorno → 'in corso'", () => {
    expect(planCountdown(plan("2026-07-28", "2026-08-02"), TODAY)).toEqual({ text: "in corso", urgent: false, returned: false });
  });

  it("ritorno passato → 'sei tornato?' (returned)", () => {
    expect(planCountdown(plan("2026-07-01", "2026-07-10"), TODAY)).toEqual({ text: "sei tornato?", urgent: false, returned: true });
  });

  it("senza data di ritorno, partenza passata → returned", () => {
    expect(planCountdown(plan("2026-07-20"), TODAY).returned).toBe(true);
  });

  it("data malformata → 'data non valida', non 'sei tornato?' né 'tra NaN giorni'", () => {
    expect(planCountdown(plan("non-una-data"), TODAY)).toEqual({ text: "data non valida", urgent: false, returned: false });
    expect(planCountdown(plan("2026-09-01", "boh"), TODAY)).toEqual({ text: "data non valida", urgent: false, returned: false });
  });
});
