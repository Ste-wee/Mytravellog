/** Le costanti del viaggio in 3D e della Mappa della vita (volo, video,
 *  poster, nomi, stampa). Spostate da TripFlyover.tsx senza cambiarle. */
import type { StyleExpr } from "@/lib/maplibre";
import type { TempiCopione } from "@/lib/copioneVolo";

/**
 * «Per la stampa» (2026-10-19, per il puzzle-calendario puzzleYOU 64×48 cm):
 * un foglio 4:3 di 1200×900 «px di foglio», reso 6,4× = 7680×5760 (≈300 dpi a
 * 64 cm), coi margini da stampa (36 ≈ 2 cm: titolo e firma lontani dal
 * taglio). Si vede prima nell'ANTEPRIMA (la mappa in una cornice 4:3); la
 * stampa ridisegna quella mappa con più pixel. In Satellite le foto si
 * chiedono più dettagliate (tileSize sotto 512) in proporzione alla densità.
 * tileSize qui = quella dei riquadri, disegnati a 6,4×.
 */
export const STAMPA = {
  w: 1200, h: 900, k: 6.4, margine: 36, tileSize: 64, attesaMs: 90000,
  // nomi e riquadri più grandi che a schermo (Stefano, 2026-10-19: «abbiamo un
  // po' di spazio, così non tagliamo nemmeno le strade»; poi «i nomi a 1 cm, i
  // riquadri al 42% più grandi»). Nomi a 16 px ≈ 8,5 mm, NON a 1 cm (19 px):
  // misurato sulla stampa, a 19 px 7 nomi finivano lontani col filo (fino a
  // 249 px: «Budapest» vicino a Reggio Calabria), a 16 px 4 con filo ≤ 77 px
  corpoNomi: 16, riquadri: 1.42,
};

/** I bordi del foglio di stampa, per disponiVita (nomi, riquadri, titolo, firma). */
export const BORDI_STAMPA = {
  margine: STAMPA.margine, firma: STAMPA.margine,
  titolo: { destra: STAMPA.margine, alto: STAMPA.margine, selettore: false },
  corpo: STAMPA.corpoNomi, riquadri: STAMPA.riquadri,
};

// Margini (px) attorno al tracciato nel poster. Con fitBounds questi margini
// fissi fanno sì che il percorso riempia SEMPRE il frame allo stesso modo,
// qualunque sia la lunghezza (lo zoom si adatta). Sono margini attorno ai
// PUNTI (vedi `inquadraturaVera`, che li rispetta davvero): in alto c'è spazio
// per la puntina e il suo nome, che stanno SOPRA il punto, sotto la fila di
// comandi (X, Satellite/Costellazione); in basso per i bottoni.
export const FINALE_PADDING = { top: 100, right: 60, bottom: 110, left: 60 };

// In vista piatta (Costellazione, Mappa della vita) i punti sono stelle,
// centrate sul punto: lo spazio in alto per le puntine non serve, e la Mappa
// della vita resta inquadrata com'era.
export const FINALE_PADDING_STELLE = { ...FINALE_PADDING, top: 50 };

/** La scheda col titolo del poster satellite (in alto a destra, vedi il JSX
 *  «vetro navy»), in px CSS della mappa: compare solo all'arrivo, quindi
 *  l'inquadratura ne usa la forma nota. `spazioPuntina`: la puntina e il nome
 *  stanno SOPRA il punto. */
export const SCHEDA_POSTER = { destra: 16, largaMax: 240, fondo: 145, spazioPuntina: 35 };

// ── Il volo (tornato il 2026-10-06, vedi lib/voloVideo) ─────────────────────
/** Il marker del mezzo corre un filo più della camera: arriva sulla puntina
 *  appena prima della fine della tratta (valore del tag flyover-animato-v1). */
export const VELOCITA_MARKER = 1.12;

/** Il decollo: dalla vista larga d'apertura alla partenza, prima della 1ª tratta. */
export const DECOLLO_MS = 1800;

/** Quanto resta il poster finale nel video, dopo l'atterraggio. */
export const FINALE_VIDEO_MS = 2500;

/** Il titolo d'apertura: resta a schermo (e nel video) per il decollo, poi sfuma. */
export const TITOLO_MS = 2800;

/** Durante il volo il tracciato ancora da fare NON si vede: compare solo man
 *  mano che l'icona lo percorre (layer `flyover-traccia`), come Relive. Scelta di
 *  Stefano fra «ombra al 30%» e «niente» rese nel video vero (2026-10-06): le
 *  puntine delle tappe restano, quindi si vede dove si va, non come. */
export const OPACITA_DA_FARE = 0;

/** Il taglio della linea del volo: piena prima di `p`, trasparente dopo. */
export const TAGLIO = {
  "flyover-traccia": (p: number): StyleExpr => ["step", ["line-progress"], "#fbbf24", Math.max(0, p), "rgba(251,191,36,0)"],
  "flyover-traccia-casing": (p: number): StyleExpr => ["step", ["line-progress"], "rgba(6,14,30,0.65)", Math.max(0, p), "rgba(6,14,30,0)"],
};

/** Quanto si aspetta, al massimo, che arrivino i riquadri della tratta che
 *  comincia (lib/riquadriVolo): prima del decollo, e a ogni tappa. */
export const ATTESA_DECOLLO_MS = 3000;

export const ATTESA_TAPPA_MS = 1500;

/** Durante l'attesa d'apertura la camera si avvicina piano (livelli di zoom
 *  in tutta l'attesa): un globo fermo per tre secondi sembrava un video bloccato. */
export const AVVICINAMENTO_ZOOM = 0.3;

/** Il carattere dei nomi della Mappa della vita (lo stesso a schermo e
 *  nell'immagine condivisa: Noto Serif corsivo, già caricato per le didascalie). */
export const FONT_NOMI = { px: 11, famiglia: '"Noto Serif", Georgia, serif' };

/** L'alone nero dietro ai nomi, perché si leggano su confini, linee e foto. */
export const ALONE_NOMI = { paintOrder: "stroke", stroke: "rgba(0,0,0,0.85)", strokeWidth: 2.6, strokeLinejoin: "round" } as const;

/** Le stelle dentro un riquadro che non sono del riquadro: più piccole e
 *  spente (le stesse misure nel master SVG, vedi posterSvg). */
export const ATTENUATE = { misura: 0.55, opacita: 0.3 };

/** Il filo che lega un nome lontano alla sua stella (scelta D, 2026-10-16):
 *  tratteggiato, così non si scambia per una tratta, con un puntino
 *  all'attacco del nome. Lo stesso a schermo e nell'immagine condivisa; nel
 *  master SVG le stesse forme alla scala della stampa (posterSvg). */
export const FILO_NOME = { colore: "rgba(255,255,255,0.9)", spessore: 1, tratteggio: [3, 2.5], puntino: 2 };

/** Il numero di zone e riquadri in un bollino (scelta D, 2026-10-15): cerchio
 *  scuro col bordo bianco, uguale sul tratteggio e nell'angolo del riquadro.
 *  Il raggio sulla zona lo dà la sua casella (lib/etichetteMappa). */
export const BOLLINO = { raggio: 8.5, font: 10, angolo: 12, fondo: "#05070d" };

/** Il video costruito («Crea video»): 30 fotogrammi al secondo, e per ognuno
 *  si aspettano i riquadri al massimo questo tempo. */
export const FPS_VIDEO = 30;

export const ATTESA_FOTOGRAMMA_MS = 3000;

/** Il ritmo del video costruito: le STESSE fasi e curve del volo dal vivo
 *  (vedi lib/copioneVolo), con l'apertura fissa — lì non c'è rete da aspettare. */
export const TEMPI_VIDEO: TempiCopione = {
  aperturaMs: 2500, avvicinamentoZoom: AVVICINAMENTO_ZOOM, decolloMs: DECOLLO_MS,
  arrivoMs: 1500, arrivoZoom: 0.15, finaleMs: FINALE_VIDEO_MS,
  titoloMs: TITOLO_MS, sfumaturaMs: 500, velocitaIcona: VELOCITA_MARKER,
};

/** I bottoni del volo (Pausa, Salta, Scarica video, Rivivi): stessa forma di «Condividi». */
export const stileBottoneVolo = {
  display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
  padding: "8px 16px", borderRadius: 999, fontFamily: "inherit",
  background: "rgba(10,22,40,0.85)", border: "0.5px solid #1a2d4a", color: "rgba(255,255,255,0.85)",
} as const;
