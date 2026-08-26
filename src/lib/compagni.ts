import { Trip } from "./storage";

/** Una persona con cui hai viaggiato, e quante volte. */
export interface Compagno {
  /** Il nome come lo hai scritto la prima volta (la forma che si mostra). */
  nome: string;
  quanti: number;
}

/**
 * Le persone con cui hai viaggiato, dalla più frequente alla meno.
 *
 * Serve alla Mappa della vita per filtrare la costellazione: «solo i viaggi
 * fatti con Giulia». Il dato è quello che già inserisci nel form (`companions`)
 * — nessun campo nuovo.
 *
 * ⚠️ **Il confronto è senza maiuscole, l'etichetta è la PRIMA forma vista.**
 * «giulia» e «Giulia» sono la stessa persona e un chip solo: due chip per la
 * stessa persona sarebbero un difetto che si vede subito, e chi scrive un nome
 * a mano su venticinque viaggi la maiuscola la sbaglia. Gli spazi ai bordi si
 * tolgono per lo stesso motivo.
 *
 * ⚠️ Ordinamento a parità di conteggio: alfabetico. Senza, l'ordine dipendeva
 * dall'ordine dei viaggi in archivio e i chip si spostavano sotto le dita
 * quando ne aggiungevi uno.
 */
export function compagniDeiViaggi(trips: Trip[]): Compagno[] {
  const conta = new Map<string, Compagno>();
  for (const t of trips) {
    // Una persona citata DUE volte nello stesso viaggio conta una volta: il
    // numero dice «quanti viaggi insieme», non «quante volte l'hai scritta».
    const visti = new Set<string>();
    for (const c of t.companions ?? []) {
      const nome = (c ?? "").trim();
      if (!nome) continue;
      const chiave = nome.toLowerCase();
      if (visti.has(chiave)) continue;
      visti.add(chiave);
      const riga = conta.get(chiave) ?? { nome, quanti: 0 };
      riga.quanti++;
      conta.set(chiave, riga);
    }
  }
  return [...conta.values()].sort((a, b) => b.quanti - a.quanti || a.nome.localeCompare(b.nome));
}

/** I viaggi fatti con quella persona (confronto senza maiuscole). */
export function viaggiCon(trips: Trip[], nome: string | null): Trip[] {
  if (!nome) return trips;
  const cercato = nome.trim().toLowerCase();
  return trips.filter(t => (t.companions ?? []).some(c => (c ?? "").trim().toLowerCase() === cercato));
}
