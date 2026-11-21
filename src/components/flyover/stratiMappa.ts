/**
 * Gli strati nostri sopra lo stile della mappa: coste, tracciato, tappe
 * (stelle, puntine, punti). Spostati da TripFlyover.tsx senza cambiarli: quello
 * che serve del componente arriva in `dati`, letto al momento della chiamata.
 */
import type { Map as MapLibreMap } from "maplibre-gl";
import { COSTE_E1, type MapStyleMode } from "./mapStyles";
import { createDotImageData, createPinImageData, createStarImageData } from "./mapImages";

export interface DatiStrati {
  lifeMap: boolean;
  stellaSecca: boolean;
  coste: GeoJSON.Feature<GeoJSON.MultiLineString> | null;
  stops: { lat: number; lon: number; label: string }[];
  segmenti: [number, number][][];
  finalPin: ImageData | null;
}

/** Le coste (COSTE_E1) sotto tracciati e tappe: solo Mappa della vita, solo
 *  Satellite, e solo quando sono arrivate (se arrivano dopo, le aggiunge
 *  l'effetto che le carica). */
export function aggiungiCosteVita(map: MapLibreMap, mode: MapStyleMode, dati: DatiStrati) {
  const coste = dati.coste;
  if (!dati.lifeMap || mode !== "satellite" || !coste || map.getSource("vita-coste")) return;
  const sotto = map.getLayer("flyover-route-casing") ? "flyover-route-casing" : undefined;
  map.addSource("vita-coste", { type: "geojson", data: coste });
  for (const [id, c] of [["vita-coste-acqua", COSTE_E1.acqua], ["vita-coste-schiuma", COSTE_E1.schiuma]] as const) {
    map.addLayer({
      id, type: "line", source: "vita-coste", layout: { "line-join": "round" },
      paint: { "line-color": c.colore, "line-width": c.largo, "line-blur": c.sfumato, "line-opacity": c.opacita },
    }, sotto);
  }
}

/**
 * (Ri)aggiunge tracciato + puntine SOPRA lo stile corrente. Idempotente e
 * necessaria dopo ogni `setStyle` (che azzera sorgenti/layer/immagini
 * personalizzati): le guardie `getSource`/`getLayer`/`hasImage` evitano i
 * doppioni al primo caricamento e ricreano tutto dopo un cambio stile.
 */
export function aggiungiStrati(map: MapLibreMap, mode: MapStyleMode, dati: DatiStrati) {
  const stops = dati.stops;
  if (!stops.length) return;
  const constellation = mode === "constellation";
  aggiungiCosteVita(map, mode, dati);   // per prime: sotto tracciati e tappe
  if (!map.getSource("flyover-route")) {
    // MultiLineString: un segmento per viaggio nella Mappa della vita (linee
    // separate, senza collegamenti), un solo segmento negli altri poster.
    map.addSource("flyover-route", {
      type: "geojson",
      data: { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: dati.segmenti } },
    });
  }
  if (!map.getLayer("flyover-route-casing")) {
    // Casing: alone bianco morbido (costellazione) o contorno scuro (satellite/linee).
    map.addLayer({
      id: "flyover-route-casing", type: "line", source: "flyover-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: constellation
        // Alone dimezzato (era 9/blur 4). Con venticinque viaggi che partono
        // tutti da casa gli aloni si fondevano in una macchia bianca sul
        // perno: metà del "caos" segnalato da Stefano era questo, non la
        // topologia. Scelto da lui provandolo (2026-08-26).
        ? { "line-color": "rgba(255,255,255,0.10)", "line-width": 5, "line-blur": 2 }
        : { "line-color": "rgba(6,14,30,0.65)", "line-width": 8.5 },
    });
  }
  if (!map.getLayer("flyover-route")) {
    // Tracciato: bianco luminoso (costellazione) o ambra (satellite/linee).
    map.addLayer({
      id: "flyover-route", type: "line", source: "flyover-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: constellation
        // 1.1 invece di 2.5: le rotte si distinguono una per una invece di
        // impastarsi. ⚠️ Se un domani si vuole tornare più spesso, ricordarsi
        // che i confini sono tarati CONTRO questo spessore (CONFINI in
        // lib/posterSvg, portati a 0.45 proprio dopo questo cambio).
        ? { "line-color": "#ffffff", "line-width": 1.1, "line-opacity": 0.85 }
        : { "line-color": "#fbbf24", "line-width": 4.5, "line-opacity": 1 },
    });
  }
  if (!map.getSource("flyover-stops")) {
    map.addSource("flyover-stops", {
      type: "geojson",
      data: { type: "FeatureCollection", features: stops.map((s, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: { name: s.label, final: i === stops.length - 1, i } })) },
    });
  }
  if (!map.hasImage("flyover-pin")) map.addImage("flyover-pin", createPinImageData(), { pixelRatio: 2 });
  if (constellation && !map.hasImage("flyover-star")) {
    map.addImage("flyover-star",
      createStarImageData(dati.lifeMap ? (dati.stellaSecca ? "secca" : "soffusa") : "larga"),
      { pixelRatio: 2 });
  }
  // Mappa della vita in Satellite: punti ambra invece delle puntine
  const puntiVita = dati.lifeMap && !constellation;
  if (puntiVita && !map.hasImage("flyover-dot")) map.addImage("flyover-dot", createDotImageData(), { pixelRatio: 2 });
  // Pin della tappa finale col medaglione del mezzo (solo viste con puntine).
  const hasFinalPin = !constellation && !!dati.finalPin;
  if (hasFinalPin && !map.hasImage("flyover-pin-final")) {
    map.addImage("flyover-pin-final", dati.finalPin as ImageData, { pixelRatio: 2 });
  }
  if (!map.getLayer("flyover-stops")) {
    map.addLayer({
      id: "flyover-stops", type: "symbol", source: "flyover-stops",
      layout: {
        "icon-image": constellation
          ? "flyover-star"
          : puntiVita ? "flyover-dot"
          : (hasFinalPin ? ["case", ["get", "final"], "flyover-pin-final", "flyover-pin"] : "flyover-pin"),
        "icon-size": constellation ? 0.8 : puntiVita ? 1 : 0.9,   // ⚠️ la rilegge mappaPerRiquadri (stelle attenuate nei riquadri)
        "icon-anchor": constellation || puntiVita ? "center" : "bottom",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-pitch-alignment": "viewport",
        // Mappa della vita: nessun nome città sulle stelle (scelta utente:
        // con molte mete i nomi si accavallano → costellazione "pulita").
        "text-field": dati.lifeMap ? "" : ["get", "name"],
        // Costellazione: serif corsivo elegante (fallback a un sans se MapTiler
        // non serve Noto Serif Italic). Altre viste: bold sans come prima.
        "text-font": constellation ? ["Noto Serif Italic", "Open Sans Regular"] : ["Open Sans Bold"],
        "text-size": 13,
        "text-anchor": constellation ? "bottom" : "bottom",
        "text-offset": constellation ? [0, -1.1] : [0, -2.6],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-optional": true,
        "text-pitch-alignment": "viewport",
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": constellation ? "rgba(0,0,0,0.85)" : "rgba(6,14,30,0.9)",
        "text-halo-width": constellation ? 1.2 : 1.6,
        "text-halo-blur": 0.5,
      },
    });
  }
}
