import { Trip, Tombstone } from "@/lib/storage";

/**
 * Integrazione Google Drive (client-only, app statica su GitHub Pages).
 *
 * - Login via Google Identity Services (token client): si ottiene un ACCESS
 *   TOKEN di breve durata; nessun client secret nel browser (niente da tenere
 *   segreto).
 * - I dati vivono in `appDataFolder`: una cartella NASCOSTA e riservata all'app
 *   nel Drive dell'utente (l'app non vede/tocca gli altri file). Un solo file
 *   `navta-backup.json` con { version, updatedAt, trips }.
 *
 * Il Client ID è PUBBLICO (è pensato per stare nel client) → hardcoded qui.
 */
export const GOOGLE_CLIENT_ID =
  "238461152099-10eqsi1gobbvqnoibjk81pucicgp9a41.apps.googleusercontent.com";

// ── Tipi minimi per Google Identity Services ─────────────────────────────────
// Su DefinitelyTyped esiste @types/google.accounts, ma per uno script caricato
// a runtime preferiamo descrivere a mano SOLO ciò che usiamo (scelta
// deliberata: meno superficie, nessuna dipendenza in più); così il compilatore
// controlla comunque i punti in cui parliamo con Google (prima era tutto
// `any`, cioè zona cieca proprio attorno ai dati dell'utente).
interface GisTokenResponse { access_token?: string; expires_in?: number | string; error?: string }
interface GisTokenClient {
  callback: (resp: GisTokenResponse) => void;
  error_callback: (err: { type?: string }) => void;
  requestAccessToken(opts: { prompt: string }): void;
}
interface GoogleGlobal {
  accounts?: {
    oauth2?: {
      initTokenClient(cfg: { client_id: string; scope: string; callback: (resp: GisTokenResponse) => void }): GisTokenClient;
      revoke?(token: string, done: () => void): void;
    };
  };
}
declare global { interface Window { google?: GoogleGlobal } }

const SCOPE = "openid email profile https://www.googleapis.com/auth/drive.appdata";
const BACKUP_FILE = "navta-backup.json";
export const BACKUP_VERSION = 1;

export interface DriveBackup {
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

// ---- Caricamento dello script Google Identity Services (una volta sola) ------
let gisPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (gisPromise) return gisPromise;
  const p = new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true;
    // onload non basta: un 200 farlocco (adblocker, captive portal) fa
    // scattare onload senza attaccare l'API a window.google.
    s.onload = () => (window.google?.accounts?.oauth2 ? resolve() : reject(new Error("gis_unavailable")));
    s.onerror = () => { s.remove(); reject(new Error("Impossibile caricare Google (rete?).")); };
    document.head.appendChild(s);
  });
  gisPromise = p;
  // Il FALLIMENTO non va in cache: prima restava lì per sempre e, dopo un
  // avvio senza rete, "Connetti" rispondeva all'istante col vecchio errore
  // anche a connessione tornata — fino a un reload completo della pagina.
  p.catch(() => { if (gisPromise === p) gisPromise = null; });
  return p;
}

export interface TokenResult { token: string; expiresIn: number }

// UN SOLO token client GIS, riusato per tutte le richieste (callback
// riassegnata di volta in volta, prompt passato per-chiamata).
let tokenClient: GisTokenClient | null = null;
// Richiesta in corso: le chiamate concorrenti si agganciano alla stessa
// Promise (evita doppi popup e callback che si pestano i piedi sul client unico).
let pendingToken: Promise<TokenResult> | null = null;
let pendingInteractive = false;

/**
 * Richiede un access token. `interactive`:
 *  - true  → può mostrare popup di consenso/scelta account (per "Connetti");
 *  - false → SILENZIOSO (prompt:"none"), per riconnettersi al riavvio senza UI.
 * Con TIMEOUT di sicurezza (8s silenzioso / 120s interattivo): se GIS non
 * richiama mai né callback né error_callback, la Promise fallisce pulita
 * invece di restare appesa per sempre.
 *
 * Se arriva una richiesta INTERATTIVA mentre è in volo una SILENZIOSA, non ci
 * si aggancia alla silenziosa e basta (fallirebbe senza mai mostrare il popup:
 * era il caso "Connetti premuto durante la riconnessione d'avvio"): si aspetta
 * l'esito — un token è un token — e in caso di fallimento si riprova col popup.
 */
export function requestAccessToken(interactive: boolean): Promise<TokenResult> {
  if (pendingToken && (pendingInteractive || !interactive)) return pendingToken;
  if (pendingToken) {
    const chained = pendingToken.then(tok => tok, () => issueToken(true));
    pendingToken = chained;
    pendingInteractive = true;
    chained.catch(() => { /* gestita dal chiamante */ }).finally(() => {
      if (pendingToken === chained) { pendingToken = null; pendingInteractive = false; }
    });
    return chained;
  }
  const p = issueToken(interactive);
  pendingToken = p;
  pendingInteractive = interactive;
  p.catch(() => { /* gestita dal chiamante */ }).finally(() => {
    if (pendingToken === p) { pendingToken = null; pendingInteractive = false; }
  });
  return p;
}

function issueToken(interactive: boolean): Promise<TokenResult> {
  return loadGis().then(() => new Promise<TokenResult>((resolve, reject) => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) { reject(new Error("gis_unavailable")); return; }
    if (!tokenClient) {
      tokenClient = oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPE,
        callback: () => { /* riassegnata per-richiesta qui sotto */ },
      });
    }
    let done = false;
    const timeout = window.setTimeout(() => {
      if (!done) { done = true; reject(new Error("timeout")); }
    }, interactive ? 120_000 : 8_000);
    tokenClient.callback = (resp) => {
      if (done) return; done = true; clearTimeout(timeout);
      if (resp?.access_token) resolve({ token: resp.access_token, expiresIn: Number(resp.expires_in) || 3600 });
      else reject(new Error(resp?.error || "no_token"));
    };
    tokenClient.error_callback = (err) => {
      if (done) return; done = true; clearTimeout(timeout);
      reject(new Error(err?.type || "token_error"));
    };
    try { tokenClient.requestAccessToken({ prompt: interactive ? "" : "none" }); }
    catch (e) { if (!done) { done = true; clearTimeout(timeout); reject(e as Error); } }
  }));
}

/** Revoca il token (al "Disconnetti"): l'app perde l'accesso finché non ri-consenti. */
export function revokeAccessToken(token: string): void {
  try { window.google?.accounts?.oauth2?.revoke?.(token, () => {}); } catch { /* best effort */ }
}

/** Email dell'utente connesso (per mostrarla in Impostazioni). */
export async function fetchUserEmail(token: string): Promise<string | null> {
  try {
    const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.email ?? null;
  } catch { return null; }
}

// ---- File di backup nell'appDataFolder --------------------------------------

// Id del file di backup, trovato UNA volta e riusato: senza cache ogni push
// pagava una GET di ricerca in più. Invalidata sui 404 (file sparito/da
// ricreare) e al disconnect (un altro account avrebbe un altro file).
let cachedFileId: string | null = null;

/** Da chiamare al disconnect: l'id del file appartiene all'account corrente. */
export function clearDriveCache(): void { cachedFileId = null; }

async function findBackupFileId(token: string, force = false): Promise<string | null> {
  if (cachedFileId && !force) return cachedFileId;
  const q = encodeURIComponent(`name='${BACKUP_FILE}'`);
  // orderBy=createdTime: Drive NON ha unicità sul nome, e due dispositivi al
  // primissimo sync possono creare due backup in gara. Senza un ordine
  // esplicito ciascuno poteva agganciarsi a un file diverso (l'ordine della
  // list non è specificato) e i due backup divergevano in silenzio per sempre.
  // Così tutti scelgono lo STESSO file: il più vecchio.
  const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name)&q=${q}&orderBy=createdTime`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error("drive_list_failed");
  const j = await r.json();
  const f = (j.files ?? []).find((x: { name?: string; id?: string }) => x.name === BACKUP_FILE);
  cachedFileId = f?.id ?? null;
  return cachedFileId;
}

/** Legge il backup dal Drive (null se non esiste ancora). */
export async function readBackup(token: string): Promise<DriveBackup | null> {
  const id = await findBackupFileId(token);
  if (!id) return null;
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 401) throw new Error("unauthorized");
  if (r.status === 404) { cachedFileId = null; return null; } // id stantio: come "nessun backup"
  if (!r.ok) throw new Error("drive_read_failed");
  return await r.json();
}

async function patchBackup(token: string, id: string, body: string): Promise<Response> {
  return fetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body,
  });
}

async function createBackup(token: string, body: string): Promise<void> {
  const boundary = "navta_" + Math.random().toString(36).slice(2);
  const metadata = { name: BACKUP_FILE, parents: ["appDataFolder"] };
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error("drive_create_failed");
  try { const j = await r.json(); if (j?.id) cachedFileId = j.id; } catch { /* id alla prossima find */ }
}

/** Scrive/aggiorna il backup nel Drive (appDataFolder). */
export async function writeBackup(token: string, data: DriveBackup): Promise<void> {
  const body = JSON.stringify(data);
  const id = await findBackupFileId(token);
  if (!id) { await createBackup(token, body); return; }
  let r = await patchBackup(token, id, body);
  if (r.status === 404) {
    // id in cache stantio (file cancellato da Drive): ricerca fresca e riprova.
    cachedFileId = null;
    const fresh = await findBackupFileId(token, true);
    if (!fresh) { await createBackup(token, body); return; }
    r = await patchBackup(token, fresh, body);
  }
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error("drive_update_failed");
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
    out.push(v.trip);
  }
  return out;
}
