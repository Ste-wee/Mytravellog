/** Gli stili della mappa del viaggio in 3D: Satellite (globo o piatto per la
 *  Mappa della vita), Costellazione, e le coste. Spostati da TripFlyover.tsx. */
import type { StyleSpecification } from "maplibre-gl";
import type { StyleExpr } from "@/lib/maplibre";
import { fetchMapStyle } from "@/components/WorldMap";
import { CONFINI } from "@/lib/posterSvg";

export const MAPTILER_KEY = "J3c87wVeji5QqN7DSqJX";

export type MapStyleMode = "satellite" | "constellation";

/** Stile satellite (attuale): imagery MapTiler su globo inclinato. */
export async function buildSatelliteStyle(): Promise<StyleSpecification> {
  const style = await fetchMapStyle();
  style.projection = { type: "globe" };
  style.glyphs = `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${MAPTILER_KEY}`;
  return style;
}

/**
 * Satellite per la Mappa della vita (scelta di prodotto, 2026-10-15): PIATTO
 * (Mercatore, come la Costellazione — i riquadri ingrandiscono la mappa in
 * modo lineare, cosa che il globo non permette) e SENZA i nomi di MapTiler,
 * che si doppierebbero con i nostri (lib/etichetteMappa).
 */
export async function buildSatelliteStylePiatto(): Promise<StyleSpecification> {
  const style = await buildSatelliteStyle();
  style.projection = { type: "mercator" };
  style.layers = style.layers.filter(l => l.type !== "symbol");
  // più viva (scelta B, 2026-10-19, provata sulle Alpi e
  // sull'Adriatico): neve e coste risaltano, sullo schermo e in stampa
  for (const l of style.layers) {
    if (l.type === "raster") l.paint = { ...l.paint, "raster-saturation": SATELLITE_VIVO.saturazione, "raster-contrast": SATELLITE_VIVO.contrasto };
  }
  return style;
}

/** La foto satellitare della Mappa della vita, un po' più viva. */
export const SATELLITE_VIVO = { saturazione: 0.3, contrasto: 0.2 };

/** Le coste nel Satellite della Mappa della vita (scelta E1,
 *  2026-10-19, fra «tenue» e «forte» viste sulla mappa): un alone azzurro
 *  largo e sfumato — l'acqua bassa vicino a riva, che a questa distanza la foto
 *  non mostra — e una schiuma bianca sottile sul bordo. Coste vere
 *  (world-atlas 50m, lib/worldAtlas): ⚠️ da vicino le isole croate escono
 *  semplificate, detto e accettato. */
export const COSTE_E1 = {
  acqua: { colore: "#5fc4cc", largo: 10, sfumato: 10, opacita: 0.35 },
  schiuma: { colore: "#e8fbfb", largo: 1.2, sfumato: 1, opacita: 0.5 },
};

// Confini "a costellazione": tenui e sottili, per fare da
// sfondo stellato senza rubare contrasto al tracciato/alle stelle. Pensata come
// master di stampa (resina + LED): piatta dall'alto, alto contrasto b/n.
export const CONST_WIDTH: StyleExpr = ["interpolate", ["linear"], ["zoom"], 1, 0.35, 4, 0.7, 8, 1.1];

// Confini e coste della costellazione: stessa fonte del master di stampa
// (vedi CONFINI in lib/posterSvg), così schermo e poster non divergono.
export const CONST_COLOR = `rgba(255,255,255,${CONFINI.opacita})`;

export const CONST_BORDER_FILTER: StyleExpr = ["all", ["<=", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]];

export function buildConstellationStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${MAPTILER_KEY}`,
    sources: {
      omt: { type: "vector", url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${MAPTILER_KEY}` },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#000000" } },
      {
        id: "coastline", type: "line", source: "omt", "source-layer": "water",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": CONST_COLOR, "line-width": CONST_WIDTH },
      },
      {
        id: "country-borders", type: "line", source: "omt", "source-layer": "boundary",
        filter: CONST_BORDER_FILTER,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": CONST_COLOR, "line-width": CONST_WIDTH },
      },
    ],
  };
}
