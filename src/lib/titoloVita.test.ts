import { describe, it, expect, beforeEach } from "vitest";
import { geometriaTitoloVita, leggiTitoloVita, salvaTitoloVita, TITOLO_VITA } from "./titoloVita";

/** Una misura finta ma onesta: 0,5 em per lettera al corpo del font. */
const misura = (testo: string, font: string) => testo.length * Number(/(\d+)px/.exec(font)![1]) * 0.5;

describe("geometriaTitoloVita", () => {
  it("niente titolo, niente geometria", () => {
    expect(geometriaTitoloVita("", 1200, misura)).toBeNull();
    expect(geometriaTitoloVita("   ", 1200, misura)).toBeNull();
  });

  it("in alto a destra, al corpo pieno, quando entra", () => {
    const g = geometriaTitoloVita("Le nostre strade", 1200, misura)!;
    expect(g.px).toBe(TITOLO_VITA.px);
    expect(g.x).toBe(1200 - TITOLO_VITA.destra);
    expect(g.y).toBe(TITOLO_VITA.alto + TITOLO_VITA.px);
    expect(g.ingombro.x + g.ingombro.w).toBeGreaterThanOrEqual(g.x);   // il bordo destro è dentro
    expect(g.ingombro.x).toBeLessThanOrEqual(g.x - g.larghezza);        // e anche quello sinistro
  });

  it("sul telefono scende sotto il selettore degli stili (che finisce a 52 px)", () => {
    const g = geometriaTitoloVita("Le nostre strade", 340, misura)!;
    expect(g.y).toBe(TITOLO_VITA.altoSotto + g.px);
    expect(g.ingombro.y).toBeGreaterThan(52);
  });

  it("anche su un foglio largo, se non entra a destra del selettore scende sotto", () => {
    const corto = geometriaTitoloVita("Le nostre strade", 878, misura)!;
    expect(corto.y).toBe(TITOLO_VITA.alto + corto.px);
    const lungo = geometriaTitoloVita("Tutte le strade che abbiamo fatto insieme", 878, misura)!;
    expect(lungo.larghezza).toBeGreaterThan(878 / 2 - TITOLO_VITA.selettoreMezzo - TITOLO_VITA.destra);
    expect(lungo.y).toBe(TITOLO_VITA.altoSotto + lungo.px);
  });

  it("la stampa: margini suoi e nessun selettore da scavalcare (resta in alto)", () => {
    const lungo = "Tutte le strade che abbiamo fatto insieme";
    const schermo = geometriaTitoloVita(lungo, 1200, misura)!;
    const stampa = geometriaTitoloVita(lungo, 1200, misura, { destra: 36, alto: 36, selettore: false })!;
    expect(schermo.y).toBe(TITOLO_VITA.altoSotto + schermo.px);   // a schermo scende sotto il selettore
    expect(stampa.y).toBe(36 + stampa.px);                         // in stampa no
    expect(stampa.x).toBe(1200 - 36);
  });

  it("un titolo lungo si rimpicciolisce per stare nel foglio, mai sotto il minimo", () => {
    const lungo = "Tutte le strade che abbiamo fatto insieme fin qui";
    const g = geometriaTitoloVita(lungo, 390, misura)!;
    expect(g.px).toBeLessThan(TITOLO_VITA.px);
    expect(g.px).toBeGreaterThanOrEqual(TITOLO_VITA.pxMin);
    expect(g.ingombro.x).toBeGreaterThanOrEqual(0);
    expect(g.larghezza).toBeLessThanOrEqual(390 - 2 * TITOLO_VITA.destra);
  });

  it("l'ingombro tiene conto dell'inclinazione: più alto della sola riga", () => {
    const g = geometriaTitoloVita("Le nostre strade per l'Europa", 1200, misura)!;
    expect(g.ingombro.h).toBeGreaterThan(g.px * 1.25 + 12);
  });
});

describe("titolo salvato sul dispositivo", () => {
  beforeEach(() => localStorage.clear());

  it("si salva, si rilegge, e vuoto si cancella", () => {
    salvaTitoloVita("  Le nostre strade  ");
    expect(leggiTitoloVita()).toBe("Le nostre strade");
    salvaTitoloVita("   ");
    expect(leggiTitoloVita()).toBe("");
    expect(localStorage.getItem("navta.vita.titolo")).toBeNull();
  });

  it("non oltre il massimo di lettere", () => {
    salvaTitoloVita("x".repeat(200));
    expect(leggiTitoloVita()).toHaveLength(TITOLO_VITA.lettere);
  });
});
