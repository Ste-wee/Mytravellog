/**
 * Il passo della rotazione automatica del globo.
 *
 * Vive qui, fuori da WorldMap, per un motivo solo: **il tetto al passo è la
 * parte sottile**, e senza un test si romperebbe in silenzio. Il difetto che
 * evita si vede solo tornando su una scheda lasciata in secondo piano — cioè
 * tardi e per caso. Stesso criterio di `hasCoords` e `postoNoto`: quando una
 * riga incorpora una regola che *morderebbe*, le si dà un nome e un test.
 */

/** Sei gradi al secondo: un giro di globo al minuto. */
export const GRADI_AL_SECONDO = 6;

/**
 * Tetto al singolo passo.
 *
 * Con la scheda in secondo piano `requestAnimationFrame` si ferma, e al ritorno
 * il primo `dt` vale l'intera assenza — secondi, a volte minuti. Senza tetto il
 * globo SALTEREBBE di decine di gradi appena torni a guardarlo. 100 ms = 0,6°
 * al massimo, cioè un passo che a occhio non si distingue da uno normale.
 */
export const PASSO_MAX_MS = 100;

/**
 * Quanti gradi far girare il globo, dati i millisecondi passati dal frame
 * precedente.
 *
 * ⚠️ Il passo è a TEMPO, non per frame. Prima era `+0.1` gradi fissi a ogni
 * frame, che vuol dire 6°/s solo se il dispositivo tiene i 60 fps: misurato con
 * la CPU frenata 6×, il globo girava a **5,3°/s invece di 6** — più piano
 * proprio dove si nota, sui telefoni lenti.
 *
 * `dt` non positivo (primo frame, o due callback con lo stesso timestamp) vale
 * zero: nessun movimento, nessun NaN.
 */
export function gradiDiRotazione(dtMs: number): number {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return 0;
  return GRADI_AL_SECONDO * (Math.min(dtMs, PASSO_MAX_MS) / 1000);
}
