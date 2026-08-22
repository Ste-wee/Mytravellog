import { Trip, Tombstone, stripBudget } from "@/lib/storage";

/**
 * La FORMA dell'archivio nel cloud e la sua fusione: tutto ciò che non dipende
 * da CHI lo trasporta.
 *
 * Nato dentro l'integrazione Google Drive, estratto qui il 2026-08-22 quando il
 * trasporto è passato a Firestore. La fusione è la parte preziosa — è dove
 * vivevano i viaggi che resuscitavano — e cambiare fornitore non deve
 * nemmeno sfiorarla.
 */
export const BACKUP_VERSION = 1;


export interface ArchivioCloud {
  version: number;
  /** ms epoch dell'ultimo salvataggio (per last-write-wins tra dispositivi). */
  updatedAt: number;
  trips: Trip[];
  /** Viaggi "in programma" (bucket separato). Opzionale per retro-compatibilità
   *  con backup più vecchi che non lo avevano. */
  plans?: Trip[];
  /** Cancellazioni da propagare, per bucket (vedi Tombstone in storage.ts).
   *  Opzionali: i backup scritti prima di questa versione non le hanno. */
  deletedTrips?: Tombstone[];
  deletedPlans?: Tombstone[];
}

/**
 * Unione dei viaggi locali e remoti (nessuna perdita di dati).
 *
 * Il confronto è PER VIAGGIO, non per collezione: ogni viaggio porta il proprio
 * `updated_at` e vince la versione modificata più di recente. Prima si decideva
 * un lato "autoritativo" guardando solo i timestamp di collezione, e il
 * dispositivo col timestamp più vecchio perdeva le proprie modifiche anche sui
 * viaggi che l'altro non aveva mai toccato.
 * Sui viaggi vecchi (senza `updated_at`) si ricade sul timestamp di collezione,
 * cioè esattamente il comportamento precedente → nessuna regressione.
 *
 * `tombstones` (unione dei due lati) propaga le CANCELLAZIONI: senza, l'union
 * faceva resuscitare un viaggio cancellato altrove. Una cancellazione più
 * recente della versione sopravvissuta vince; una modifica successiva alla
 * cancellazione invece la batte (last-write-wins coerente).
 */
export function mergeTrips(
  local: Trip[], localTs: number,
  remote: Trip[], remoteTs: number,
  tombstones: Tombstone[] = [],
): Trip[] {
  const stampOf = (t: Trip, fallback: number): number => {
    const upd = t.updated_at ? Date.parse(t.updated_at) : NaN;
    if (Number.isFinite(upd)) return upd;
    // Legacy senza updated_at: si usa created_at, che è STABILE. Il timestamp
    // di collezione (fallback) avanza ad ogni push: un tombstone su un viaggio
    // legacy non vinceva MAI (`at >= ts` sempre falso) e il viaggio cancellato
    // resuscitava per sempre. created_at è per forza anteriore alla cancellazione.
    const cre = t.created_at ? Date.parse(t.created_at) : NaN;
    if (Number.isFinite(cre)) return cre;
    return fallback;
  };
  const byId = new Map<string, { trip: Trip; ts: number }>();
  const consider = (t: Trip, fallback: number) => {
    if (!t || typeof t.id !== "string") return;
    const ts = stampOf(t, fallback);
    const cur = byId.get(t.id);
    // `>` e non `>=`: a parità vince chi è entrato prima, cioè il locale —
    // come faceva il vecchio `remoteTs > localTs`.
    if (!cur || ts > cur.ts) byId.set(t.id, { trip: t, ts });
  };
  for (const t of local) consider(t, localTs);
  for (const t of remote) consider(t, remoteTs);

  const deletedAt = new Map<string, number>();
  for (const d of tombstones ?? []) {
    if (!d || typeof d.id !== "string" || !Number.isFinite(d.at)) continue;
    const cur = deletedAt.get(d.id);
    if (cur == null || d.at > cur) deletedAt.set(d.id, d.at);
  }

  const out: Trip[] = [];
  for (const [id, v] of byId) {
    const at = deletedAt.get(id);
    if (at != null && at >= v.ts) continue; // cancellato dopo l'ultima modifica
    // I budget sono stati rimossi dall'app: se un record remoto ne porta
    // ancora (backup scritto da una versione precedente, o da un dispositivo
    // non ancora aggiornato) il campo muore qui, prima di tornare in locale e
    // prima di essere riscritto sul backup. Nessuna data falsificata.
    out.push(stripBudget(v.trip));
  }
  return out;
}
