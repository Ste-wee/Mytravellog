import { describe, it, expect } from "vitest";
import { tracciatoProgressivo, pointAlongPath } from "./flyover";

/** Mercatore calcolato qui a parte, per non provare la funzione con sé stessa. */
const y = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

describe("tracciatoProgressivo", () => {
  const A: [number, number][] = [[9.19, 45.46], [9.0, 46.0], [8.95, 46.0]];
  const B: [number, number][] = [[8.95, 46.0], [8.54, 47.38]];

  it("unisce le tratte in una linea sola, senza ripetere il punto di giunzione", () => {
    const { percorso } = tracciatoProgressivo([A, B]);
    expect(percorso).toEqual([...A, B[1]]);
  });

  it("va da 0 a 1, cresce sempre e non salta fra una tratta e l'altra", () => {
    const { progresso } = tracciatoProgressivo([A, B]);
    expect(progresso(0, 0)).toBe(0);
    expect(progresso(1, 1)).toBeCloseTo(1, 12);
    expect(progresso(0, 1)).toBeCloseTo(progresso(1, 0), 12);
    let prima = -1;
    for (const [i, t] of [[0, 0], [0, 0.3], [0, 0.7], [0, 1], [1, 0.2], [1, 0.6], [1, 1]] as const) {
      const p = progresso(i, t);
      expect(p).toBeGreaterThanOrEqual(prima);
      prima = p;
    }
  });

  it("misura come la mappa (Mercatore), non a km: il taglio cade sotto l'icona", () => {
    // una tratta lungo un meridiano, dall'equatore a 60°N: a metà dei km l'icona
    // è a 30°N, ma sulla mappa (Mercatore) quel punto NON è a metà della linea
    const meridiano: [number, number][] = [[10, 0], [10, 60]];
    const { progresso } = tracciatoProgressivo([meridiano]);
    const icona = pointAlongPath(meridiano, 0.5);
    expect(icona[1]).toBeCloseTo(30, 6);
    expect(progresso(0, 0.5)).toBeCloseTo(y(30) / y(60), 6);   // ≈ 0.416, non 0.5
  });

  it("oltre il 180° la linea resta continua (niente giro del mondo)", () => {
    const figi: [number, number][] = [[178.4, -18.1], [179.9, -17.0]];
    const samoa: [number, number][] = [[179.9, -17.0], [-171.8, -13.8]];
    const { percorso, progresso } = tracciatoProgressivo([figi, samoa]);
    for (let i = 1; i < percorso.length; i++) {
      expect(Math.abs(percorso[i][0] - percorso[i - 1][0])).toBeLessThan(180);
    }
    // e la tratta corta sul Pacifico non pesa come mezzo mondo
    expect(progresso(1, 0)).toBeGreaterThan(0.1);
  });

  it("una tratta vuota in mezzo non fa slittare gli indici delle altre", () => {
    const { progresso } = tracciatoProgressivo([A, [], B]);
    expect(progresso(2, 0)).toBeCloseTo(progresso(0, 1), 12);
    expect(progresso(2, 1)).toBeCloseTo(1, 12);
  });

  it("tratte vuote o ferme non fanno NaN", () => {
    const fermo: [number, number][] = [[9.19, 45.46], [9.19, 45.46]];
    const { progresso } = tracciatoProgressivo([fermo, []]);
    expect(Number.isNaN(progresso(0, 0.5))).toBe(false);
    expect(progresso(5, 0.5)).toBe(0);
  });
});
