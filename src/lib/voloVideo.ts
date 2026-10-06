/**
 * Il "viaggio in 3D" animato: le regole PURE del volo e del video.
 *
 * Il volo è tornato il 2026-10-06 (era stato tolto il 2026-07-23 per un video
 * «non convincente e fragile su Safari/iOS»; l'animazione stava nel tag git
 * `flyover-animato-v1`). Qui vive solo quello che si può provare senza WebGL:
 * il componente (TripFlyover) fa il resto.
 */

/** Il formato del video, nell'ordine in cui si prova. */
export interface FormatoVideo { mime: string; estensione: "webm" | "mp4" }

const CANDIDATI: FormatoVideo[] = [
  { mime: "video/webm;codecs=vp9", estensione: "webm" },
  { mime: "video/webm", estensione: "webm" },
  // Safari/iPhone non registra in webm ma sa farlo in mp4: il tag nascondeva
  // il video su iPhone, qui ci si prova. ⚠️ Non verificabile da un PC: se su
  // un iPhone vero non funziona, il bottone semplicemente non compare.
  { mime: "video/mp4;codecs=avc1", estensione: "mp4" },
  { mime: "video/mp4", estensione: "mp4" },
];

/** Il primo formato che il browser dichiara di saper registrare, o null. */
export function scegliFormatoVideo(supporta: (mime: string) => boolean): FormatoVideo | null {
  for (const c of CANDIDATI) {
    try { if (supporta(c.mime)) return c; } catch { /* un browser che lancia vale "no" */ }
  }
  return null;
}

/** Il browser corrente sa registrare il volo? (canvas → stream → registratore) */
export function formatoRegistrabile(): FormatoVideo | null {
  try {
    if (typeof HTMLCanvasElement === "undefined" || typeof MediaRecorder === "undefined") return null;
    if (typeof (HTMLCanvasElement.prototype as { captureStream?: unknown }).captureStream !== "function") return null;
    return scegliFormatoVideo(m => MediaRecorder.isTypeSupported(m));
  } catch {
    return null;
  }
}

/**
 * I km che il contatore deve AGGIUNGERE per ogni tratta.
 *
 * ⚠️ Nel volo di un anno il percorso concatena i viaggi: fra la meta di uno e
 * la casa del successivo c'è una tratta di RIENTRO che nessun viaggio ha
 * percorso davvero (la casa è una tappa con `casa: true`). Si vola lo stesso —
 * è il filo che lega i viaggi — ma i suoi km non si contano: il contatore deve
 * finire sullo stesso numero della scheda del poster, che somma `tripTotalKm`.
 */
export function kmContatiPerTratta(tratte: { km: number; to: { casa?: boolean } }[]): number[] {
  return tratte.map(t => (t.to.casa ? 0 : (Number.isFinite(t.km) ? t.km : 0)));
}

/**
 * Le misure del video: quelle del canvas della mappa, ma mai più larghe di
 * `maxLato` sul lato lungo (su un telefono a densità 3 il canvas supera i
 * 1000×1800 px, e codificarlo a 30 fps scalda e scatta). Pari, perché alcuni
 * codificatori rifiutano le dimensioni dispari.
 */
export function misureVideo(larghezza: number, altezza: number, maxLato = 1280): { w: number; h: number } {
  const lato = Math.max(larghezza, altezza);
  const k = lato > maxLato ? maxLato / lato : 1;
  const pari = (n: number) => Math.max(2, Math.round((n * k) / 2) * 2);
  return { w: pari(larghezza), h: pari(altezza) };
}

/** Il nome del file: il titolo del viaggio ripulito, o "viaggio". */
export function nomeFileVideo(titolo: string, formato: FormatoVideo): string {
  const base = titolo.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "viaggio";
  return `${base}-3d.${formato.estensione}`;
}
