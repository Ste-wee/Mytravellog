import { Trip } from "@/lib/storage";

/**
 * La catena delle tappe di un viaggio, "Milano → Trieste → Ljubljana → Vienna":
 * partenza, tappe intermedie, destinazione.
 *
 * Esiste perché più punti dell'app devono raccontare lo stesso itinerario nello
 * stesso modo — e dove non lo facevano si leggeva SOLO la destinazione, cioè
 * una meta su quattro (dettaglio della heatmap, cardina del globo).
 *
 * Ritorna `null` quando non ci sono tappe intermedie: lì non c'è un percorso da
 * raccontare, e chi chiama mostra il testo che preferisce (di solito la meta).
 */
export function stopChain(t: Trip): string | null {
  const tappe = t.waypoints ?? [];
  if (tappe.length === 0) return null;
  // Della città di partenza si prende solo il nome: home_label è "Milano, Italia".
  const casa = t.home_label?.split(",")[0]?.trim() || "Casa";
  return [casa, ...tappe.map(w => w.city), t.city].filter(Boolean).join(" → ");
}
