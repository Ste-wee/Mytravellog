/**
 * Il TITOLO della Mappa della vita (scelta di Stefano, 2026-10-16, fra tre
 * stili su mockup: «solo il titolo»): in alto a destra, stesso carattere e
 * stessa inclinazione di 3° della didascalia degli altri poster, niente sotto.
 *
 * Funzione PURA (pixel CSS): la usano lo schermo, l'immagine «Condividi» e il
 * calcolo dei nomi (che gli gira intorno), così le tre cose coincidono.
 * Lo SVG di stampa ha misure sue (vedi posterSvg, `titoloAngolo`).
 */

export const TITOLO_VITA = {
  /** Corpo pieno; si rimpicciolisce solo se il titolo non entra. */
  px: 24,
  pxMin: 14,
  famiglia: '"Cormorant Garamond", Georgia, serif',
  peso: 600,
  /** Gradi, come la didascalia degli altri poster (keyframe flyoverCardIn). */
  inclinazione: -3,
  destra: 20,
  alto: 20,
  /** Il selettore Satellite/Costellazione sta in alto al centro: metà della
   *  sua larghezza (174 px misurati) più un po' d'aria. Se il titolo non entra
   *  alla sua destra, scende sotto di lui (che finisce a 52 px, misurato). */
  selettoreMezzo: 95,
  altoSotto: 70,
  /** Lettere al massimo nella casella. */
  lettere: 50,
} as const;

export interface GeometriaTitolo {
  /** Corpo del carattere in px. */
  px: number;
  font: string;
  /** Bordo destro del testo e linea di base. */
  x: number;
  y: number;
  larghezza: number;
  /** Il perno della rotazione (centro del testo). */
  perno: { x: number; y: number };
  /** Lo spazio che occupa, rotazione compresa, con un po' d'aria: ci girano
   *  intorno nomi e riquadri. */
  ingombro: { x: number; y: number; w: number; h: number };
}

/** Margini diversi da quelli dello schermo (la stampa ne vuole di più) e,
 *  con `selettore: false`, nessun selettore degli stili da scavalcare. */
export interface BordiTitolo { destra?: number; alto?: number; selettore?: boolean }

/** Dove e quanto grande scrivere il titolo in un foglio largo `W` px.
 *  `misura(testo, font)` = larghezza in px (il canvas a schermo). */
export function geometriaTitoloVita(titolo: string, W: number, misura: (testo: string, font: string) => number, bordi: BordiTitolo = {}): GeometriaTitolo | null {
  const t = titolo.trim();
  if (!t || W <= 0) return null;
  const T = TITOLO_VITA;
  const font = (px: number) => `${T.peso} ${px}px ${T.famiglia}`;
  const destra = bordi.destra ?? T.destra;
  const spazio = W - 2 * destra;
  let px: number = T.px;
  let larghezza = misura(t, font(px));
  if (larghezza > spazio && larghezza > 0) {
    px = Math.max(T.pxMin, Math.floor(T.px * spazio / larghezza));
    larghezza = misura(t, font(px));
  }
  const accanto = W / 2 - T.selettoreMezzo - destra;   // lo spazio a destra del selettore
  const alto = bordi.selettore === false || larghezza <= accanto
    ? (bordi.alto ?? T.alto)
    : T.altoSotto;
  const x = W - destra;
  const y = alto + px;            // linea di base: la riga sta fra alto e alto+px
  const perno = { x: x - larghezza / 2, y: y - px * 0.35 };
  // inclinato di 3°, un estremo sale e l'altro scende di metà larghezza·sen3°
  const pendenza = (larghezza / 2) * Math.sin(Math.abs(T.inclinazione) * Math.PI / 180);
  const aria = 6;
  return {
    px, font: font(px), x, y, larghezza, perno,
    ingombro: {
      x: x - larghezza - aria,
      y: alto - pendenza - aria,
      w: larghezza + 2 * aria,
      h: px * 1.25 + 2 * pendenza + 2 * aria,
    },
  };
}

/** Il titolo salvato su QUESTO dispositivo (le impostazioni non vanno nel
 *  cloud: detto a Stefano, accettato). */
const CHIAVE = "navta.vita.titolo";
export function leggiTitoloVita(): string {
  try { return (localStorage.getItem(CHIAVE) ?? "").slice(0, TITOLO_VITA.lettere); } catch { return ""; }
}
export function salvaTitoloVita(titolo: string): void {
  const t = titolo.trim().slice(0, TITOLO_VITA.lettere);
  try {
    if (t) localStorage.setItem(CHIAVE, t);
    else localStorage.removeItem(CHIAVE);
  } catch { /* storage non disponibile: il titolo vale per questa volta */ }
}
