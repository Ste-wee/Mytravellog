import { Plane, Train, Car, Ship, Footprints, Bike, Bus } from "lucide-react";
import { tr } from "@/lib/settings";
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

/**
 * ⚠️ Le etichette sono **getter**, non stringhe: restituiscono la traduzione
 * nella lingua attiva al momento in cui le si legge.
 *
 * Perché così e non tradotte al punto d'uso: `TRANSPORT[m].label` si legge in
 * sette posti, due dei quali sono file FROZEN (Index e TravelHighlights). Con i
 * getter quei sette posti non cambiano di una virgola, e la pillola del mezzo
 * sul biglietto — che era rimasta «Aereo» anche in inglese — si traduce da sé.
 *
 * ⚠️ E perché **getter** e non valori tradotti una volta: cambiare lingua nelle
 * Impostazioni ri-renderizza, NON ricarica la pagina. Un valore calcolato
 * all'import resterebbe nella lingua di allora. Per lo stesso motivo qui sotto
 * `TRANSPORT_LIST` non fa lo spread delle etichette (lo spread le valuterebbe
 * subito, congelandole).
 */
export const TRANSPORT: Record<TransportMode, TransportInfo> = {
  plane: { color: "#378ADD", get label() { return tr("Aereo"); },   get labelWith() { return tr("In aereo"); }, get labelShort() { return tr("Aereo"); }, Icon: Plane,      emoji: "✈️" },
  train: { color: "#BA7517", get label() { return tr("Treno"); },   get labelWith() { return tr("In treno"); }, get labelShort() { return tr("Treno"); }, Icon: Train,      emoji: "🚆" },
  car:   { color: "#A855F7", get label() { return tr("Auto"); },    get labelWith() { return tr("In auto"); },  get labelShort() { return tr("Auto"); },  Icon: Car,        emoji: "🚗" },
  ship:  { color: "#0F6E56", get label() { return tr("Nave"); },    get labelWith() { return tr("In nave"); },  get labelShort() { return tr("Nave"); },  Icon: Ship,       emoji: "🚢" },
  walk:  { color: "#D85A30", get label() { return tr("A piedi"); }, get labelWith() { return tr("A piedi"); },  get labelShort() { return tr("Piedi"); }, Icon: Footprints, emoji: "🚶" },
  bici:  { color: "#22C55E", get label() { return tr("Bici"); },    get labelWith() { return tr("In bici"); },  get labelShort() { return tr("Bici"); },  Icon: Bike,       emoji: "🚲" },
  moto:  { color: "#EAB308", get label() { return tr("Moto"); },    get labelWith() { return tr("In moto"); },  get labelShort() { return tr("Moto"); },  Icon: Motorcycle, emoji: "🏍️" },
  bus:   { color: "#06B6D4", get label() { return tr("Bus"); },     get labelWith() { return tr("In bus"); },   get labelShort() { return tr("Bus"); },   Icon: Bus,        emoji: "🚌" },
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

/**
 * Elenco ordinato, per i selettori del mezzo nei form.
 * ⚠️ Niente spread delle etichette: `{...TRANSPORT[value]}` **valuterebbe i
 * getter subito**, congelando la lingua all'import del modulo.
 */
export const TRANSPORT_LIST = TRANSPORT_MODES.map(value => ({
  value,
  color: TRANSPORT[value].color,
  Icon: TRANSPORT[value].Icon,
  emoji: TRANSPORT[value].emoji,
  get label() { return TRANSPORT[value].label; },
  get labelWith() { return TRANSPORT[value].labelWith; },
  get labelShort() { return TRANSPORT[value].labelShort; },
}));
