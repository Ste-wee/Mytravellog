/** I disegni su canvas del poster, dell'immagine condivisa, della stampa e
 *  del video (nomi, riquadri, titolo, firma, icona, contatore). Spostati da
 *  TripFlyover.tsx. */
import type { Disposizione } from "@/lib/etichetteMappa";
import { TITOLO_VITA, type GeometriaTitolo } from "@/lib/titoloVita";
import { FONT_NOMI, FILO_NOME, BOLLINO, ATTENUATE } from "./constants";

/**
 * I nomi, i fili e i riquadri della Mappa della vita sull'immagine condivisa:
 * la STESSA disposizione dello schermo (pixel CSS), moltiplicata per `k`.
 * Un riquadro la cui foto non è ancora arrivata ha comunque le sue stelle, del
 * `coloreStelle` della vista: prima usciva un rettangolo nero coi soli nomi.
 */
export function disegnaNomiSuCanvas(ctx: CanvasRenderingContext2D,
  n: { d: Disposizione; foto: Record<number, HTMLCanvasElement> }, k: number, coloreStelle: string, corpo = FONT_NOMI.px) {
  const { d, foto } = n;
  ctx.save();
  ctx.scale(k, k);
  const linea = (f: { x1: number; y1: number; x2: number; y2: number }, colore: string, spessore: number) => {
    ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2);
    ctx.strokeStyle = colore; ctx.lineWidth = spessore; ctx.setLineDash([]); ctx.stroke();
  };
  /** Il filo di un nome: tratteggiato + puntino all'attacco (FILO_NOME). */
  const filoNome = (f: { x1: number; y1: number; x2: number; y2: number }) => {
    ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2);
    ctx.strokeStyle = FILO_NOME.colore; ctx.lineWidth = FILO_NOME.spessore; ctx.lineCap = "round";
    ctx.setLineDash(FILO_NOME.tratteggio); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(f.x2, f.y2, FILO_NOME.puntino, 0, Math.PI * 2); ctx.fillStyle = "#ffffff"; ctx.fill();
  };
  const testo = (s: string, x: number, y: number, allinea: "middle" | "start" | "end", font: string) => {
    ctx.font = font;
    ctx.textAlign = allinea === "middle" ? "center" : allinea === "start" ? "left" : "right";
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round"; ctx.lineWidth = 2.6; ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(s, x, y);
    ctx.fillStyle = "#ffffff"; ctx.fillText(s, x, y);
  };
  const fontNome = `italic ${corpo}px ${FONT_NOMI.famiglia}`;
  const bollino = (numero: number, cx: number, cy: number, raggio: number) => {
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(cx, cy, raggio, 0, Math.PI * 2);
    ctx.fillStyle = BOLLINO.fondo; ctx.fill();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = `${BOLLINO.font}px Georgia, serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff"; ctx.fillText(String(numero), cx, cy + 0.5);
  };
  // le zone tratteggiate e i loro fili
  for (const r of d.riquadri) {
    ctx.setLineDash([3, 3]); ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 1;
    roundRectPath(ctx, r.zona.x, r.zona.y, r.zona.w, r.zona.h, 3); ctx.stroke();
    linea(r.filo, "rgba(255,255,255,0.5)", 0.9);
    bollino(r.numero, r.numeroZona.x + r.numeroZona.w / 2, r.numeroZona.y + r.numeroZona.h / 2, r.numeroZona.w / 2);
  }
  for (const e of d.conFilo) filoNome(e.filo);
  // i riquadri: la foto della zona ingrandita, il bordo, il numero, i nomi
  for (const r of d.riquadri) {
    ctx.save();
    roundRectPath(ctx, r.posto.x, r.posto.y, r.posto.w, r.posto.h, 6); ctx.clip();
    ctx.fillStyle = "#000"; ctx.fillRect(r.posto.x, r.posto.y, r.posto.w, r.posto.h);
    const f = foto[r.numero];
    if (f) ctx.drawImage(f, r.posto.x, r.posto.y, r.posto.w, r.posto.h);
    else {
      for (const s of r.stelle) {
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 7);
        g.addColorStop(0, coloreStelle); g.addColorStop(0.35, coloreStelle); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.fillRect(s.x - 7, s.y - 7, 14, 14);
      }
      ctx.globalAlpha = ATTENUATE.opacita; ctx.fillStyle = coloreStelle;
      for (const s of r.altre) { ctx.beginPath(); ctx.arc(s.x, s.y, 3 * ATTENUATE.misura, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.setLineDash([]); ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1;
    roundRectPath(ctx, r.posto.x, r.posto.y, r.posto.w, r.posto.h, 6); ctx.stroke();
    bollino(r.numero, r.posto.x + BOLLINO.angolo, r.posto.y + BOLLINO.angolo, BOLLINO.raggio);
    for (const e of r.conFilo) filoNome(e.filo);
    for (const e of [...r.nomi, ...r.conFilo]) testo(e.nome, e.testo.x, e.testo.y, e.testo.allinea, fontNome);
  }
  for (const e of [...d.accanto, ...d.conFilo]) testo(e.nome, e.testo.x, e.testo.y, e.testo.allinea, fontNome);
  ctx.restore();
}

/** Il titolo della Mappa della vita sull'immagine condivisa: la STESSA
 *  geometria dello schermo (lib/titoloVita), in pixel CSS moltiplicati per `k`. */
export function disegnaTitoloVitaSuCanvas(ctx: CanvasRenderingContext2D, titolo: string, g: GeometriaTitolo, k: number) {
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(g.perno.x, g.perno.y);
  ctx.rotate(TITOLO_VITA.inclinazione * Math.PI / 180);
  ctx.translate(-g.perno.x, -g.perno.y);
  ctx.font = g.font; ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 5 * k; ctx.shadowOffsetY = 1 * k;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(titolo.trim(), g.x, g.y);
  ctx.restore();
}

/** Rettangolo con angoli arrotondati (per comporre il poster su canvas). */
export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Emula object-fit:cover disegnando l'immagine sul canvas del poster. */
export function drawImageCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale, sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/** Firma "By 🐻" in basso a destra dello snapshot raster (Salva/Condividi),
 *  equivalente a quella degli export SVG. Ombra morbida così gli orsi bianchi
 *  restano visibili anche su porzioni chiare della mappa. */
export function drawBrandSignatureCanvas(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number, logo: HTMLImageElement, margine = 18) {
  const u = dpr;
  const size = 34 * u, pad = margine * u, gap = 7 * u;
  const top = H - pad - size, logoX = W - pad - size;
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 4 * u; ctx.shadowOffsetY = 1 * u;
  ctx.drawImage(logo, logoX, top, size, size);
  ctx.font = `italic ${16 * u}px Georgia, 'Times New Roman', serif`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  ctx.fillText("By", logoX - gap, top + size / 2);
  ctx.restore();
}

// ── Quello che il video disegna sopra la mappa ───────────────────────────────
// Le stesse forme per il video registrato dal vivo e per quello costruito
// fotogramma per fotogramma. `k` = px del video per px CSS della mappa.

/** L'icona del mezzo: cerchio col colore del mezzo, bordo bianco, simbolo. */
export function disegnaIcona(ctx: CanvasRenderingContext2D, x: number, y: number, k: number,
  veste: { color: string; img: HTMLImageElement | null }) {
  ctx.beginPath(); ctx.arc(x, y, 15 * k, 0, Math.PI * 2);
  ctx.fillStyle = veste.color; ctx.fill();
  ctx.lineWidth = 2 * k; ctx.strokeStyle = "#ffffff"; ctx.stroke();
  if (veste.img) ctx.drawImage(veste.img, x - 8 * k, y - 8 * k, 16 * k, 16 * k);
}

/** Il contatore dei km, in alto al centro (la stessa pillola che c'è a schermo). */
export function disegnaContatore(ctx: CanvasRenderingContext2D, testo: string, w: number, k: number) {
  ctx.font = `600 ${13 * k}px ui-monospace, Menlo, monospace`;
  const tw = ctx.measureText(testo).width + 28 * k;
  ctx.fillStyle = "rgba(10,22,40,0.85)";
  roundRectPath(ctx, w / 2 - tw / 2, 16 * k, tw, 28 * k, 14 * k); ctx.fill();
  ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(testo, w / 2, 30 * k + k);
}

/** Il titolo d'apertura (nome + date), in basso, con l'opacità data. */
export function disegnaTitolo(ctx: CanvasRenderingContext2D, alpha: number, titolo: string,
  date: string | null | undefined, w: number, h: number, k: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const maxW = w - 32 * k;
  let fs = 20;
  ctx.font = `700 ${fs * k}px "Space Grotesk", sans-serif`;
  while (fs > 12 && ctx.measureText(titolo).width > maxW - 32 * k) {
    fs -= 1; ctx.font = `700 ${fs * k}px "Space Grotesk", sans-serif`;
  }
  const tw2 = ctx.measureText(titolo).width;
  ctx.font = `400 ${12 * k}px sans-serif`;
  const dw = date ? ctx.measureText(date).width : 0;
  const bw = Math.min(maxW, Math.max(tw2, dw) + 32 * k);
  const bh = (date ? 56 : 40) * k;
  const by = h - 76 * k - bh;
  ctx.fillStyle = "rgba(10,22,40,0.88)";
  roundRectPath(ctx, w / 2 - bw / 2, by, bw, bh, 14 * k); ctx.fill();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#f0f4ff";
  ctx.font = `700 ${fs * k}px "Space Grotesk", sans-serif`;
  ctx.fillText(titolo, w / 2, by + (date ? 21 : 20) * k);
  if (date) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `400 ${12 * k}px sans-serif`;
    ctx.fillText(date, w / 2, by + 41 * k);
  }
  ctx.restore();
}
