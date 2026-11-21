/**
 * Compone il POSTER su un canvas: mappa (tracciato + puntine — la copia del
 * canvas WebGL fatta da captureSnapshotBlob dentro l'evento "render") +
 * pillola dati in alto a destra. Restituisce il canvas pronto per toBlob.
 * Spostata da TripFlyover.tsx senza cambiarla: quello che serve del
 * componente arriva in `dati`, letto al momento della chiamata.
 */
import { geometriaTitoloVita } from "@/lib/titoloVita";
import type { MapStyleMode } from "./mapStyles";
import type { NomiMappa } from "./tipi";
import { roundRectPath, drawImageCover, drawBrandSignatureCanvas, disegnaNomiSuCanvas, disegnaTitoloVitaSuCanvas } from "./canvasDraw";

export interface DatiPoster {
  lifeMap: boolean;
  nomi: NomiMappa | null;
  /** Lo stile di adesso (la ref) e quello del render che ha chiamato: il
   *  poster li ha sempre letti entrambi, restano distinti. */
  modoAttuale: MapStyleMode;
  modoVista: MapStyleMode;
  titoloVita: string;
  posterTitle: string;
  dateRangeLabel: string | null;
  metriche: () => { v: string; l: string }[];
  rigaStat: () => string;
  misuraTesto: (testo: string, font: string) => number;
}

// `dpr` va passato dal canvas VIVO della mappa: la copia fuori-DOM fatta da
// captureSnapshotBlob non ha layout (clientWidth 0) e il ripiego darebbe 1,
// rimpicciolendo firma e didascalia sui telefoni con devicePixelRatio 2-3.
export function componiPoster(dati: DatiPoster, mapCanvas: HTMLCanvasElement, flagImgs: HTMLImageElement[], logoImg: HTMLImageElement | null, dpr = mapCanvas.width / (mapCanvas.clientWidth || mapCanvas.width)): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = mapCanvas.width; c.height = mapCanvas.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(mapCanvas, 0, 0);
  // Firma "By 🐻" in basso a destra, prima di ogni uscita (tutte le viste).
  const stamp = () => { if (logoImg) drawBrandSignatureCanvas(ctx, c.width, c.height, dpr, logoImg); };

  // Mappa della vita: nessuna caption nemmeno nell'immagine salvata/condivisa
  // (coerente con la vista a schermo, mappa "nuda") — ma i NOMI, i fili e i
  // riquadri della vista sì, gli stessi dello schermo (vedi calcolaNomi).
  if (dati.lifeMap) {
    if (dati.nomi) disegnaNomiSuCanvas(ctx, dati.nomi, dpr, dati.modoAttuale === "satellite" ? "#fbbf24" : "#ffffff");
    const gT = geometriaTitoloVita(dati.titoloVita, c.width / dpr, dati.misuraTesto);
    if (gT) disegnaTitoloVitaSuCanvas(ctx, dati.titoloVita, gT, dpr);
    stamp();
    return c;
  }

  // Costellazione: DIDASCALIA senza riquadro (serif elegante, monocromatica),
  // allineata a destra, come la caption di una stampa celeste. Disegnata qui
  // così lo snapshot è fedele alla vista a schermo, poi si esce.
  if (dati.modoVista === "constellation") {
    const u = dpr;
    const pad = 20 * u;
    const rightX = c.width - pad;
    const title = dati.posterTitle;
    const flags = flagImgs.filter(im => im.complete && im.naturalWidth > 0);
    const flagW = 22 * u, flagH = 15 * u, flagStep = 16 * u, fgap = 9 * u;
    const flagsW = flags.length > 0 ? (flagW + (flags.length - 1) * flagStep + fgap) : 0;
    const titleCy = pad + 13 * u;
    const stats = dati.rigaStat();
    // Inclina la didascalia di -3° come a schermo (keyframe flyoverCardIn): a
    // schermo la card resta ruotata di -3°, e l'utente vuole lo stesso taglio
    // nel poster salvato. Perno al centro del blocco per non spostarlo dal frame.
    ctx.font = `600 ${24 * u}px "Cormorant Garamond", serif`;
    const titleW = ctx.measureText(title).width;
    ctx.font = `italic ${12 * u}px "Noto Serif", serif`;
    const datesW = dati.dateRangeLabel ? ctx.measureText(dati.dateRangeLabel).width : 0;
    ctx.font = `600 ${16 * u}px "Cormorant Garamond", serif`;
    const statsW = ctx.measureText(stats).width;
    const blockW = Math.max(titleW + flagsW, datesW, statsW);
    const pivotX = rightX - blockW / 2, pivotY = pad + 26 * u;
    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.rotate(-3 * Math.PI / 180);
    ctx.translate(-pivotX, -pivotY);
    ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 5 * u; ctx.shadowOffsetY = 1 * u;
    // bandiere flat, allineate al bordo destro
    for (let i = 0; i < flags.length; i++) {
      const fx = rightX - flagW - (flags.length - 1 - i) * flagStep;
      ctx.fillStyle = "#fff";
      roundRectPath(ctx, fx - 1.2 * u, titleCy - flagH / 2 - 1.2 * u, flagW + 2.4 * u, flagH + 2.4 * u, 2 * u);
      ctx.fill();
      ctx.save();
      roundRectPath(ctx, fx, titleCy - flagH / 2, flagW, flagH, 1.5 * u);
      ctx.clip();
      drawImageCover(ctx, flags[i], fx, titleCy - flagH / 2, flagW, flagH);
      ctx.restore();
    }
    // titolo serif, ancorato a destra (subito a sinistra delle bandiere)
    ctx.font = `600 ${24 * u}px "Cormorant Garamond", serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(title, rightX - flagsW, titleCy);
    // date corsive
    let y = pad + 30 * u;
    if (dati.dateRangeLabel) {
      ctx.font = `italic ${12 * u}px "Noto Serif", serif`;
      ctx.fillStyle = "rgba(255,255,255,0.68)";
      ctx.textBaseline = "top";
      ctx.fillText(dati.dateRangeLabel, rightX, y);
      y += 20 * u;
    }
    // km · tappe (serif)
    ctx.font = `600 ${16 * u}px "Cormorant Garamond", serif`;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.textBaseline = "top";
    ctx.fillText(stats, rightX, y);
    ctx.restore();
    ctx.textAlign = "left";
    stamp();
    return c;
  }

  // Card dati (vista Satellite) — vetro navy, FEDELE a quella a schermo
  // (bandiere a ventaglio + titolo + date + pill km/tappe).
  const u = dpr;
  const cardBg = "rgba(10,22,40,0.92)";
  const cardBorder = "#1a2d4a";
  const titleFont = `700 ${15 * u}px "Space Grotesk", sans-serif`;
  const dateFont = `400 ${11 * u}px sans-serif`;
  const pillBg = "rgba(255,255,255,0.06)";
  const pillBorder = "#1a2d4a";
  const pillNumColor = "#fff";
  const pillNumFont = `700 ${15 * u}px "JetBrains Mono", monospace`;
  const innerPad = 14 * u;
  const flagW = 24 * u, flagH = 17 * u, flagStep = 15 * u; // ~9px di sovrapposizione
  const title = dati.posterTitle;
  const flags = flagImgs.filter(im => im.complete && im.naturalWidth > 0);

  ctx.font = titleFont;
  const titleW = ctx.measureText(title).width;
  const flagsW = flags.length > 0 ? (flagW + (flags.length - 1) * flagStep + 8 * u) : 0;
  const headerW = flagsW + titleW;

  ctx.font = dateFont;
  const datesW = dati.dateRangeLabel ? ctx.measureText(dati.dateRangeLabel).width : 0;

  const pills = dati.metriche().map(m => ({ v: m.v, l: m.l.toUpperCase() }));
  const pillWs = pills.map(p => {
    ctx.font = pillNumFont;
    const nw = ctx.measureText(p.v).width;
    ctx.font = `700 ${9 * u}px sans-serif`;
    const lw = ctx.measureText(p.l).width;
    return Math.max(nw, lw) + 24 * u;
  });
  const pillsW = pills.length ? pillWs.reduce((a, b) => a + b, 0) + 8 * u * (pills.length - 1) : 0;

  const contentW = Math.max(headerW, datesW, pillsW);
  const cardW = contentW + innerPad * 2;
  // Senza pillole (Mappa della vita) la card è solo header (+ eventuali date):
  // niente spazio/altezza per le pillole.
  const headerH = 22 * u, dateH = dati.dateRangeLabel ? 16 * u : 0, gap = pills.length ? 8 * u : 0, pillH = pills.length ? 42 * u : 0;
  const cardH = innerPad * 2 + headerH + dateH + gap + pillH;
  const cardX = c.width - cardW - 16 * u;
  const cardY = 16 * u;

  ctx.fillStyle = cardBg;
  roundRectPath(ctx, cardX, cardY, cardW, cardH, 14 * u);
  ctx.fill();
  ctx.lineWidth = Math.max(1, 0.5 * u); ctx.strokeStyle = cardBorder; ctx.stroke();

  // header: bandiere a ventaglio + titolo, centrati verticalmente
  const headerCy = cardY + innerPad + headerH / 2;
  const hx = cardX + innerPad;
  for (let i = 0; i < flags.length; i++) {
    ctx.save();
    ctx.translate(hx + flagW / 2 + i * flagStep, headerCy);
    ctx.rotate(((i - (flags.length - 1) / 2) * 7 * Math.PI) / 180);
    ctx.fillStyle = "#fff";
    roundRectPath(ctx, -flagW / 2 - 1.5 * u, -flagH / 2 - 1.5 * u, flagW + 3 * u, flagH + 3 * u, 3 * u);
    ctx.fill();
    ctx.save();
    roundRectPath(ctx, -flagW / 2, -flagH / 2, flagW, flagH, 2.5 * u);
    ctx.clip();
    drawImageCover(ctx, flags[i], -flagW / 2, -flagH / 2, flagW, flagH);
    ctx.restore();
    ctx.restore();
  }
  ctx.font = titleFont;
  ctx.fillStyle = "#f0f4ff";
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(title, hx + flagsW, headerCy);

  // date
  let cursorY = cardY + innerPad + headerH;
  if (dati.dateRangeLabel) {
    ctx.font = dateFont;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.textBaseline = "top";
    ctx.fillText(dati.dateRangeLabel, hx, cursorY);
    cursorY += dateH;
  }

  // pill km / tappe
  const pillY = cursorY + gap;
  let px = hx;
  for (let i = 0; i < pills.length; i++) {
    const pw = pillWs[i];
    ctx.fillStyle = pillBg;
    roundRectPath(ctx, px, pillY, pw, pillH, 10 * u);
    ctx.fill();
    ctx.lineWidth = Math.max(1, 0.5 * u); ctx.strokeStyle = pillBorder; ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = pillNumColor;
    ctx.font = pillNumFont;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(pills[i].v, px + pw / 2, pillY + 20 * u);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = `700 ${9 * u}px sans-serif`;
    ctx.fillText(pills[i].l, px + pw / 2, pillY + 33 * u);
    px += pw + 8 * u;
  }
  ctx.textAlign = "left";

  stamp();
  return c;
}
