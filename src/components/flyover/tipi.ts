import type { Box, Disposizione } from "@/lib/etichetteMappa";

/** Mappa della vita: nomi, fili e riquadri della vista di adesso (vedi
 *  calcolaNomi in TripFlyover), con le foto dei riquadri. Li ricopia
 *  l'immagine condivisa.
 *  w/h: il foglio su cui è calcolata la disposizione (lo schermo, o in
 *  anteprima di stampa il foglio 1200×900); scala: quanto quel foglio è
 *  rimpicciolito a schermo; corpo: il carattere dei nomi su quel foglio. */
export type NomiMappa = {
  d: Disposizione;
  foto: Record<number, HTMLCanvasElement>;
  url: Record<number, string>;
  w: number; h: number; scala: number; corpo: number;
};

/** Il riquadro 4:3 della mappa dentro la scheda, in anteprima di stampa. */
export type Cornice = Box;

/** Un riquadro che si sta trascinando, col suo contorno dal vivo (px di foglio). */
export type Trascinamento = { chiave: string; box: Box };

/** Il volo dal vivo: fermo, in volo, in pausa, atterrato sul poster. Tipo
 *  stretto apposta: un confronto con un nome che non esiste (come il
 *  `volo === "onPausa"` che per qualche ora ha tolto Riprendi) non compila. */
export type StatoVolo = "spento" | "inVolo" | "pausa" | "finito";
