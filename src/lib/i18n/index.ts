import { en } from "./en";

/**
 * Traduzione dell'interfaccia.
 *
 * ⚠️ **L'italiano È la chiave.** `t("Gite in giornata")` ritorna quella stringa
 * in italiano e la sua traduzione in inglese. Scelta deliberata contro le
 * chiavi inventate (`t("trips.dayTrips")`), per tre motivi concreti:
 *
 * 1. **Il diff resta leggibile**: `"Gite in giornata"` → `t("Gite in giornata")`.
 *    Con 200 stringhe su 27 file, un diff dove ogni riga cambia in una sigla
 *    non è più revisionabile da nessuno.
 * 2. **Una chiave sbagliata non può rendere una scritta vuota**: il peggio che
 *    può succedere è che resti in italiano. Con le sigle, un errore di battitura
 *    lascia un buco a schermo.
 * 3. **TypeScript obbliga a tradurre**: `Chiave` è `keyof typeof en`, quindi
 *    una stringa senza inglese **non compila**. È la rete che tiene insieme
 *    tutto il resto: non esiste "mi sono dimenticato una traduzione".
 *
 * Il prezzo: cambiare una scritta italiana vuol dire cambiare anche la chiave
 * nel dizionario. Il typecheck lo dice subito, quindi è un prezzo che si paga
 * in compilazione, non a schermo.
 */

export type Lingua = "it" | "en";
/** Quello che l'utente sceglie: una lingua, o "seguimi il sistema". */
export type PreferenzaLingua = Lingua | "sistema";

export type Chiave = keyof typeof en;

/** Le lingue elencate nel selettore: SOLO quelle tradotte al 100%.
 *  Aggiungerne una = un file nuovo e una riga qui. */
export const LINGUE: { valore: PreferenzaLingua; etichetta: string }[] = [
  { valore: "it", etichetta: "Italiano" },
  { valore: "en", etichetta: "English" },
  { valore: "sistema", etichetta: "Sistema" },
];

/**
 * Da "sistema" alla lingua vera, guardando il browser.
 *
 * Qualunque cosa non cominci per `it` va in inglese: è la lingua di ripiego
 * più utile per chi non parla italiano, e non c'è una terza opzione da
 * indovinare.
 */
export function risolviLingua(pref: PreferenzaLingua, lingueBrowser?: readonly string[]): Lingua {
  if (pref === "it" || pref === "en") return pref;
  const prima = (lingueBrowser ?? (typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : []))[0];
  return (prima ?? "it").toLowerCase().startsWith("it") ? "it" : "en";
}

/** I segnaposto `{nome}` riempiti coi valori passati. */
function riempi(testo: string, params?: Record<string, string | number>): string {
  if (!params) return testo;
  return testo.replace(/\{(\w+)\}/g, (intero, nome) =>
    Object.prototype.hasOwnProperty.call(params, nome) ? String(params[nome]) : intero);
}

/**
 * La traduzione, senza React: usabile dai test, dalle funzioni pure e dal
 * codice che disegna su canvas (dove non ci sono hook).
 *
 * Se il dizionario inglese non ha la chiave — non dovrebbe mai succedere, il
 * typecheck lo impedisce, ma i dati e i `as` esistono — **resta l'italiano**.
 * Mai una scritta vuota.
 */
export function traduci(lingua: Lingua, chiave: Chiave, params?: Record<string, string | number>): string {
  if (lingua === "it") return riempi(chiave, params);
  const tradotta = en[chiave];
  return riempi(typeof tradotta === "string" && tradotta ? tradotta : chiave, params);
}

/** Il locale per date e numeri: `Intl` e `toLocaleDateString` vogliono questo. */
export function localeDi(lingua: Lingua): string {
  return lingua === "it" ? "it-IT" : "en-GB";
}
