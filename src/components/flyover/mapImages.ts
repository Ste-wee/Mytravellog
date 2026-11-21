/** Le immagini delle tappe sulla mappa (stelle, punti, puntine) e le icone
 *  dei mezzi, disegnate su canvas. Spostate da TripFlyover.tsx. */
import { createElement, type ElementType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TRANSPORT } from "@/lib/transport";

// Icona + colore del mezzo dalla fonte unica (@/lib/transport): il medaglione
// sulla tappa finale usa la stessa simbologia di biglietto e globo.
export const TRANSPORT_MAP: Record<string, { color: string; Icon: ElementType }> = TRANSPORT;

/** Rasterizza un'icona (lucide o Motorcycle) in un'immagine, via SVG data URI. */
export function loadModeIcon(Icon: ElementType, color: string): Promise<HTMLImageElement> {
  const svg = renderToStaticMarkup(createElement(Icon, { color, stroke: color, width: 48, height: 48, strokeWidth: 2.4 }));
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("icon load error"));
    img.src = url;
    setTimeout(() => (img.complete && img.naturalWidth > 0 ? resolve(img) : reject(new Error("icon load timeout"))), 2000);
  });
}

/** Nodo "stella": nucleo bianco pieno + alone morbido (radial gradient). Usato
 *  come icon-image delle tappe nella vista Costellazione — i punti-LED naturali. */
/**
 * La stella della costellazione, in tre forme:
 *
 * - «larga»: l'alone originale (raggio s/2) — è la stella del POSTER per
 *   anno/viaggio singolo, dove le stelle sono poche e il bagliore è il look
 *   scelto per il master resina+LED. ⚠️ Non farsi tentare dall'unificare: la
 *   prima versione del banco qui sotto cambiava anche questa, e l'interruttore
 *   della Mappa della vita modificava un poster dove non è nemmeno visibile.
 * - «soffusa» / «secca»: il BANCO DI PROVA della Mappa della vita (2026-08-27,
 *   da smontare quando Stefano sceglie): lì le tappe si ammassano e l'alone
 *   largo le impastava (il suo screenshot dell'arco alpino). Soffusa = alone
 *   stretto e tenue; secca = solo il nucleo.
 */
export function createStarImageData(forma: "larga" | "soffusa" | "secca", scala = 1): ImageData {
  const s = 48;
  const c = document.createElement("canvas");
  c.width = s * scala; c.height = s * scala;
  const ctx = c.getContext("2d")!;
  ctx.scale(scala, scala);
  const cx = s / 2, cy = s / 2;
  if (forma === "larga") {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.16, "rgba(255,255,255,0.95)");
    g.addColorStop(0.4, "rgba(255,255,255,0.28)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  } else if (forma === "soffusa") {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.28);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.11, 0, Math.PI * 2); ctx.fill();
  return ctx.getImageData(0, 0, s * scala, s * scala);
}

/** La tappa della Mappa della vita in Satellite: un punto ambra (il colore dei
 *  km e del tracciato satellite) con il bordo bianco, che si legge sulle foto
 *  dall'alto dove una stella bianca sparirebbe sulla neve e sulle città. */
export function createDotImageData(scala = 1): ImageData {
  const s = 32;
  const c = document.createElement("canvas");
  c.width = s * scala; c.height = s * scala;
  const ctx = c.getContext("2d")!;
  ctx.scale(scala, scala);
  const cx = s / 2, cy = s / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s / 2);
  g.addColorStop(0.35, "rgba(251,191,36,0.35)");
  g.addColorStop(1, "rgba(251,191,36,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.17, 0, Math.PI * 2);
  ctx.fillStyle = "#fbbf24"; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "#ffffff"; ctx.stroke();
  return ctx.getImageData(0, 0, s * scala, s * scala);
}

/**
 * Immagine di una "puntina da mappa" (testa tonda ambra + punta), disegnata su
 * canvas e usata come icon-image di un symbol layer per le tappe. Essendo un
 * layer WebGL della mappa finisce automaticamente anche nello snapshot del
 * poster. icon-anchor "bottom" mette la punta sulla coordinata; pitch-alignment
 * viewport la tiene "in piedi" sulla mappa inclinata, come uno spillo.
 */
export function createPinImageData(): ImageData {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = s; c.height = s;
  const ctx = c.getContext("2d")!;
  const cx = s / 2, headCy = s * 0.32, headR = s * 0.24, tipY = s * 0.92;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.7, headCy + headR * 0.6);
  ctx.lineTo(cx, tipY);
  ctx.lineTo(cx + headR * 0.7, headCy + headR * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, headCy, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#fff";
  ctx.beginPath(); ctx.arc(cx, headCy, headR, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(cx, headCy, headR * 0.42, 0, Math.PI * 2); ctx.fill();
  return ctx.getImageData(0, 0, s, s);
}

/**
 * Come createPinImageData, ma con un "medaglione" del mezzo agganciato in basso
 * a destra della testa: cerchio del colore del mezzo (identico alle card) +
 * icona bianca. Usato SOLO per la tappa finale. Essendo un icon-image di symbol
 * layer, finisce automaticamente anche nello snapshot del poster.
 */
export function createFinalPinImageData(iconImg: HTMLImageElement, color: string): ImageData {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = s; c.height = s;
  const ctx = c.getContext("2d")!;
  const cx = s / 2, headCy = s * 0.32, headR = s * 0.24, tipY = s * 0.92;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.7, headCy + headR * 0.6);
  ctx.lineTo(cx, tipY);
  ctx.lineTo(cx + headR * 0.7, headCy + headR * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); ctx.arc(cx, headCy, headR, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2.5; ctx.strokeStyle = "#fff";
  ctx.beginPath(); ctx.arc(cx, headCy, headR, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(cx, headCy, headR * 0.42, 0, Math.PI * 2); ctx.fill();
  // Medaglione mezzo, basso-destra della testa.
  const bx = cx + headR * 0.9, by = headCy + headR * 0.95, br = s * 0.185;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2; ctx.strokeStyle = "#0a1628";
  ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.stroke();
  const isz = br * 1.5;
  ctx.drawImage(iconImg, bx - isz / 2, by - isz / 2, isz, isz);
  return ctx.getImageData(0, 0, s, s);
}
