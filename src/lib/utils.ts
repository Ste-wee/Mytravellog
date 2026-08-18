import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Applica fn a ogni elemento in sequenza, con una pausa tra una chiamata e la
 * successiva — invece di un Promise.all che le spara tutte in parallelo. Va
 * usato per le API con un rate limit basato sul tempo (es. Nominatim, che
 * nella sua usage policy chiede di non superare 1 richiesta/secondo): un
 * viaggio con molte tappe rischierebbe altrimenti un rate-limit silenzioso,
 * con alcune tappe che restano senza regione senza che l'utente se ne accorga.
 */
export async function sequentialMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  delayMs = 1100
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i++) {
    if (i > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    out.push(await fn(items[i], i));
  }
  return out;
}

/**
 * Sposta un elemento dalla posizione `from` alla posizione `to`, restituendo
 * un array nuovo (l'originale resta intatto: i tre form lo passano dentro un
 * setState). Gli indici fuori intervallo lasciano l'array com'è, così un
 * trascinamento che finisce fuori dalla lista non può perdere una tappa.
 */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to) return items;
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return items;
  const out = items.slice();
  const [preso] = out.splice(from, 1);
  out.splice(to, 0, preso);
  return out;
}
