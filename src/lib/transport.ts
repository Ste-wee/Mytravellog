import { Plane, Train, Car, Ship, Footprints, Bike, Bus } from "lucide-react";
import { Motorcycle } from "@/components/icons/Motorcycle";
import type { ElementType } from "react";

/**
 * Fonte unica dei mezzi di trasporto: tipo, colore, etichette, icona, emoji.
 *
 * Prima queste informazioni erano ricopiate a mano in 10 punti dentro 7 file
 * (70 valori di colore duplicati) e il tipo `TransportMode` era ridichiarato 5
 * volte. Il drift era già iniziato — sfondi con opacità diversa e ripieghi
 * diversi per il mezzo mancante — quindi il rischio non era teorico: aggiungere
 * un mezzo significava ricordarsi di sette posti.
 */

export const TRANSPORT_MODES = ["plane", "train", "car", "ship", "walk", "bici", "moto", "bus"] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

/** Ripiego per un viaggio/tratta senza mezzo indicato: il blu del tema. */
export const TRANSPORT_FALLBACK_COLOR = "#60a5fa";

interface TransportInfo {
  color: string;
  /** Forma canonica, usata quasi ovunque: "Aereo", "A piedi". */
  label: string;
  /** Forma discorsiva del carosello delle Statistiche: "In aereo", "A piedi". */
  labelWith: string;
  /** Forma compatta per le legende strette: "Piedi" invece di "A piedi". */
  labelShort: string;
  Icon: ElementType;
  /** Usata dal globo: i layer "circle" di MapLibre non mostrano icone, così
   *  l'emoji viene disegnata su un canvas e registrata con addImage. */
  emoji: string;
}

export const TRANSPORT: Record<TransportMode, TransportInfo> = {
  plane: { color: "#378ADD", label: "Aereo",   labelWith: "In aereo", labelShort: "Aereo", Icon: Plane,      emoji: "✈️" },
  train: { color: "#BA7517", label: "Treno",   labelWith: "In treno", labelShort: "Treno", Icon: Train,      emoji: "🚆" },
  car:   { color: "#A855F7", label: "Auto",    labelWith: "In auto",  labelShort: "Auto",  Icon: Car,        emoji: "🚗" },
  ship:  { color: "#0F6E56", label: "Nave",    labelWith: "In nave",  labelShort: "Nave",  Icon: Ship,       emoji: "🚢" },
  walk:  { color: "#D85A30", label: "A piedi", labelWith: "A piedi",  labelShort: "Piedi", Icon: Footprints, emoji: "🚶" },
  bici:  { color: "#22C55E", label: "Bici",    labelWith: "In bici",  labelShort: "Bici",  Icon: Bike,       emoji: "🚲" },
  moto:  { color: "#EAB308", label: "Moto",    labelWith: "In moto",  labelShort: "Moto",  Icon: Motorcycle, emoji: "🏍️" },
  bus:   { color: "#06B6D4", label: "Bus",     labelWith: "In bus",   labelShort: "Bus",   Icon: Bus,        emoji: "🚌" },
};

/**
 * Mezzi che percorrono strade vere: per loro si chiede a OSRM il tracciato
 * stradale (route_geometry) invece della linea d'aria. Era ricopiata come
 * `m === "car" || m === "bici" || m === "moto"` nei due form, e aggiungere il
 * pullman avrebbe voluto dire ricordarsi di entrambi.
 */
export function followsRoad(m: string | null | undefined): boolean {
  return m === "car" || m === "bici" || m === "moto" || m === "bus";
}

/** Vero se la stringa è un mezzo conosciuto (i dati salvati sono `string`). */
export function isTransportMode(m: string | null | undefined): m is TransportMode {
  return !!m && m in TRANSPORT;
}

/** Colore del mezzo, o il blu di tema se manca/è sconosciuto. */
export function transportColor(m: string | null | undefined): string {
  return isTransportMode(m) ? TRANSPORT[m].color : TRANSPORT_FALLBACK_COLOR;
}

/** Etichetta del mezzo; `fallback` per i viaggi senza mezzo indicato. */
export function transportLabel(m: string | null | undefined, fallback = ""): string {
  return isTransportMode(m) ? TRANSPORT[m].label : fallback;
}

/**
 * Sfondo tenue tinta-mezzo per pillole e badge. L'opacità di default (0.12) è
 * quella usata da biglietto e Statistiche; resta un parametro perché qualche
 * superficie potrebbe volerne una diversa senza reintrodurre colori a mano.
 */
export function transportBg(m: string | null | undefined, alpha = 0.12): string {
  const hex = transportColor(m).replace("#", "");
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Elenco ordinato, per i selettori del mezzo nei form. */
export const TRANSPORT_LIST = TRANSPORT_MODES.map(value => ({ value, ...TRANSPORT[value] }));
