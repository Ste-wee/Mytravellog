// [FROZEN] — Non modificare senza esplicita richiesta
//
// Tutto ciò che NuovoViaggio.tsx e ModificaViaggio.tsx condividono: prima era
// duplicato quasi riga per riga nei due file (~600 righe a testa), e i bug si
// correggevano in uno dimenticando l'altro — è successo davvero: la regione
// veniva salvata in inglese da un form e in italiano dall'altro, e le icone
// dei mezzi erano Lucide in Nuovo e SVG disegnati a mano in Modifica. Ora la
// versione è una sola (icone Lucide, le stesse delle Statistiche).
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { GeoResult, PlaceKind, distanceKm, placeSubtitle } from "@/lib/geo";
import { hasCoords } from "@/lib/coords";
import { fmtDistance, useSettings } from "@/lib/settings";
import { parseLocalDate } from "@/lib/storage";
import { Loader2, MapPin, Plane, Route, Search, AlertCircle, X } from "lucide-react";
import { TRANSPORT as TRANSPORT_INFO, TRANSPORT_MODES, TRANSPORT_LIST, transportBg, type TransportMode } from "@/lib/transport";

// Il tipo vive in @/lib/transport; qui si ri-esporta perché i due form e i
// loro test lo importano storicamente da questo modulo.
export type { TransportMode };
export type Waypoint = { id: string; city: string; country: string; country_code: string; lat: number; lon: number; transport_mode: TransportMode };

// Elenco per il selettore del mezzo, dalla fonte unica (@/lib/transport).
const TRANSPORT: { value: TransportMode; label: string; color: string; bg: string }[] =
  TRANSPORT_LIST.map(t => ({ value: t.value, label: t.label, color: t.color, bg: transportBg(t.value) }));

// Tinte delle etichette di categoria nei risultati di ricerca. Restano fuori
// dalla scala blu/ambra dell'app (che significa conteggi/km) perché qui il
// colore distingue il TIPO di posto, non un dato.
const PLACE_KIND_COLOR: Record<PlaceKind, string> = {
  lago: "#22d3ee", monumento: "#c084fc", montagna: "#94a3b8",
  parco: "#4ade80", spiaggia: "#fcd34d", luogo: "#94a3b8",
};

const RATING_LABELS: Record<number, string> = {
  1: "Non memorabile", 2: "Nella media", 3: "Bello", 4: "Fantastico", 5: "Indimenticabile"
};

// Inclusivo (1-5 giugno = 5 giorni): stessa convenzione della heatmap in
// Statistiche, che con il vecchio calcolo per differenza di date contava un
// giorno in più per lo stesso identico viaggio (v. TripCardTicket.tsx).
function daysBetween(a: string, b: string) {
  if (!a || !b) return null;
  const d = Math.round((parseLocalDate(b).getTime() - parseLocalDate(a).getTime()) / 86400000) + 1;
  return d > 0 ? d : null;
}

/** Ritorno prima della partenza: usato per l'errore inline e per bloccare il salvataggio. */
export function isReturnBeforeDeparture(dateStart: string, dateEnd: string): boolean {
  return !!dateEnd && dateEnd < dateStart;
}

// Lucide transport icons — same as statistics section
// Le stesse icone della fonte unica, ma come funzioni: qui servono dentro
// l'SVG dell'itinerario, con colore e dimensione decisi al momento del disegno.
const TRANSPORT_SVG: Record<string, (color: string, size?: number) => React.ReactElement> =
  Object.fromEntries(TRANSPORT_MODES.map(m => {
    const Icon = TRANSPORT_INFO[m].Icon;
    return [m, (c: string, s = 24) => <Icon width={s} height={s} stroke={c} strokeWidth={1.5}/>];
  }));

type Pt = { x: number; y: number };
type ArcSeg = { p0: Pt; p1: Pt; p2: Pt; transport: string | null };

/**
 * Rende azionabile da tastiera un gruppo SVG che ha solo onClick: gli <g> non
 * sono focalizzabili né rispondono a Invio/Spazio come farebbe un <button>.
 * Stesso pattern già usato sui paesi della mappa in ContinentsMap.
 */
function svgButton(label: string, activate: () => void) {
  return {
    tabIndex: 0,
    role: "button" as const,
    "aria-label": label,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
    },
  };
}

/** Mezzo che scorre di continuo lungo l'intera catena di archi (serpentina
 *  verticale). Legge gli stessi archi bézier 2D disegnati dai nodi. */
function ContinuousFlyer({ arcs, vbw }: { arcs: ArcSeg[]; vbw: number }) {
  const [progress, setProgress] = React.useState(0);
  const animRef = React.useRef<number>();
  const startRef = React.useRef<number>();
  const DURATION = 5000; // ms per full journey

  React.useEffect(() => {
    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = (ts - startRef.current) % DURATION;
      setProgress(elapsed / DURATION);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);

  if (arcs.length === 0) return null;

  const n = arcs.length;
  const arcIdx = Math.min(Math.floor(progress * n), n - 1);
  const bt = (progress * n) - arcIdx;
  const a = arcs[arcIdx];
  const t = a.transport ?? "plane";

  // Punto e tangente della bézier quadratica (in 2D).
  const x = Math.pow(1-bt,2)*a.p0.x + 2*(1-bt)*bt*a.p1.x + Math.pow(bt,2)*a.p2.x;
  const y = Math.pow(1-bt,2)*a.p0.y + 2*(1-bt)*bt*a.p1.y + Math.pow(bt,2)*a.p2.y;
  const dx = 2*(1-bt)*(a.p1.x-a.p0.x) + 2*bt*(a.p2.x-a.p1.x);
  const dy = 2*(1-bt)*(a.p1.y-a.p0.y) + 2*bt*(a.p2.y-a.p1.y);
  const angle = Math.atan2(dy, dx) * (180/Math.PI);

  const color = TRANSPORT.find(x => x.value === t)?.color ?? "#378ADD";
  const pct = (x / vbw) * 100;

  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      <div style={{
        position: "absolute",
        left: `${pct}%`,
        top: y,
        transform: `translate(-50%, -50%) rotate(${angle}deg)`,
        filter: `drop-shadow(0 0 5px ${color}) drop-shadow(0 0 12px ${color}) drop-shadow(0 0 24px ${color}80)`,
        lineHeight: 1, transition: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {(TRANSPORT_SVG[t] ?? TRANSPORT_SVG.plane)(color, 24)}
      </div>
    </div>
  );
}

export interface RouteHeroProps {
  waypoints: Waypoint[];
  home: { lat: number; lon: number; label: string } | null;
  onEditHome: () => void;
  editingHome: boolean;
  homeQuery: string;
  setHomeQuery: (v: string) => void;
  homeResults: GeoResult[];
  onSelectHome: (r: GeoResult) => void;
  onRemoveWaypoint: (i: number) => void;
  /** Cambia il mezzo della tappa `i`. Prima il selettore mutava
   *  `waypoints[i].transport_mode` in place e chiamava `onRemoveWaypoint(-99)`
   *  come trucco per forzare un nuovo array: funzionava solo grazie a come è
   *  implementata la rimozione, e la mutazione avveniva fuori dal setter. */
  onChangeTransport: (i: number, mode: TransportMode) => void;
  /** Sposta la tappa `from` nella posizione `to` (indici sui waypoints).
   *  Il mezzo viaggia con la tappa: `transport_mode` descrive come ci si
   *  arriva, quindi resta attaccato alla tappa che si muove. */
  onMoveWaypoint: (from: number, to: number) => void;
  wpTransport: TransportMode;
  setWpTransport: (v: TransportMode) => void;
  wpOpen: boolean;
  setWpOpen: (v: boolean) => void;
  wpQuery: string;
  setWpQuery: (v: string) => void;
  wpResults: GeoResult[];
  wpLoading: boolean;
  onAddWaypoint: (r: GeoResult) => void;
  destinationError?: boolean;
}

function RouteHero({
  waypoints, home, onEditHome, editingHome,
  homeQuery, setHomeQuery, homeResults, onSelectHome, onRemoveWaypoint, onChangeTransport,
  onMoveWaypoint,
  wpTransport, setWpTransport, wpOpen, setWpOpen, wpQuery, setWpQuery,
  wpResults, wpLoading, onAddWaypoint, destinationError
}: RouteHeroProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [containerW, setContainerW] = React.useState(600);
  const [activeArc, setActiveArc] = React.useState<number | null>(null);
  // Per i km della tratta nel selettore: rispetta l'unità scelta (km/mi).
  const { distanceUnit } = useSettings();
  /** Trascinamento in corso: quale tappa ho in mano, dov'è il dito e dove
   *  cadrebbe se lo alzassi adesso. `null` = nessun trascinamento. */
  const [drag, setDrag] = React.useState<{ da: number; y: number; a: number } | null>(null);
  /** Copia sempre aggiornata di `drag` per gli handler su window: al
   *  rilascio serve sapere dove si è arrivati SENZA leggerlo dentro un
   *  updater di setState — React in sviluppo esegue gli updater due volte, e
   *  chiamare lì onMoveWaypoint spostava la tappa DUE VOLTE (visibile solo
   *  nel browser, non nei test). */
  const dragRef = React.useRef<{ da: number; y: number; a: number } | null>(null);
  const aggiornaDrag = (v: { da: number; y: number; a: number } | null) => {
    dragRef.current = v;
    setDrag(v);
  };

  React.useEffect(() => {
    const obs = new ResizeObserver(entries => setContainerW(entries[0].contentRect.width));
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Il selettore del mezzo si chiudeva solo ri-toccando l'arco o scegliendo:
  // da tastiera non c'era via d'uscita.
  React.useEffect(() => {
    if (activeArc == null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setActiveArc(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeArc]);

  const homeLabel = home?.label?.split(",")[0] ?? "Casa";
  const stops = [
    { label: homeLabel, countryCode: null as string | null, isHome: true, transport: null as TransportMode | null },
    ...waypoints.map(w => ({ label: w.city, countryCode: w.country_code as string | null, isHome: false, transport: w.transport_mode as TransportMode | null })),
  ];

  const n = stops.length;
  const VBW = Math.max(300, containerW);
  const nodeR = 22;
  const xL = 68, xR = VBW - 68;
  const padTop = 40, vStep = 84;
  const nodeX = (i: number) => (i % 2 === 0 ? xL : xR);
  const nodeY = (i: number) => padTop + i * vStep;
  const H = padTop + (n - 1) * vStep + nodeR + 34;
  const showArcs = waypoints.length > 0;

  // ——— Trascinamento delle tappe (la casa resta ferma: è la partenza).
  // L'ordine sulla serpentina è verticale, quindi la posizione di arrivo si
  // legge dalla sola Y: riga = quanti passi da padTop, limitata alle tappe.
  const rigaDallaY = (y: number) =>
    Math.min(n - 1, Math.max(1, Math.round((y - padTop) / vStep)));

  const iniziaTrascinamento = (i: number) => () => {
    if (n <= 2) return;                       // una sola tappa: niente da riordinare
    setActiveArc(null);
    aggiornaDrag({ da: i, y: nodeY(i), a: i });
  };

  // Il seguito del trascinamento vive su `window`, non sul nodo: il nodo si
  // sposta sotto il puntatore mentre lo si trascina, e affidarsi al pointer
  // capture faceva arrivare un solo pointermove e poi più niente (col mouse
  // la tappa non si spostava affatto). Su window gli eventi arrivano sempre,
  // anche se il dito esce dalla card.
  React.useEffect(() => {
    if (!drag) return;
    const muovi = (e: PointerEvent) => {
      const corrente = dragRef.current;
      const box = svgRef.current?.getBoundingClientRect();
      if (!corrente || !box || box.height === 0) return;
      const y = ((e.clientY - box.top) / box.height) * H;
      aggiornaDrag({ ...corrente, y, a: rigaDallaY(y) });
    };
    const concludi = () => {
      const finale = dragRef.current;
      aggiornaDrag(null);
      if (finale && finale.a !== finale.da) onMoveWaypoint(finale.da - 1, finale.a - 1);  // la casa è 0
    };
    const annulla = () => aggiornaDrag(null);
    window.addEventListener("pointermove", muovi);
    window.addEventListener("pointerup", concludi);
    window.addEventListener("pointercancel", annulla);
    return () => {
      window.removeEventListener("pointermove", muovi);
      window.removeEventListener("pointerup", concludi);
      window.removeEventListener("pointercancel", annulla);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.da, H, n]);

  /** Frecce ↑/↓ sulla tappa a fuoco: il trascinamento non esiste per chi
   *  naviga da tastiera, e senza questo la funzione sarebbe irraggiungibile. */
  const tastiereRiordino = (i: number) => (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const a = e.key === "ArrowUp" ? i - 1 : i + 1;
    if (a < 1 || a > n - 1) return;
    e.preventDefault();
    onMoveWaypoint(i - 1, a - 1);
  };

  // Durante il trascinamento la serpentina mostra già l'ordine finale: le
  // altre tappe scorrono, quella in mano segue il dito.
  const ordineMostrato = React.useMemo(() => {
    const idx = stops.map((_, i) => i);
    if (!drag) return idx;
    const [preso] = idx.splice(drag.da, 1);
    idx.splice(drag.a, 0, preso);
    return idx;
  }, [drag, stops.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  /** Dove sta il nodo `i` mentre trascino (posizione nell'ordine mostrato). */
  const rigaDi = (i: number) => (drag ? ordineMostrato.indexOf(i) : i);

  // Archi bézier tra tappe consecutive: colonne alternate (sx/dx) → serpentina
  // verticale, ciascun arco bomba verso l'esterno della colonna di arrivo.
  const arcSegs: ArcSeg[] = [];
  for (let i = 1; i < n; i++) {
    const p0 = { x: nodeX(i - 1), y: nodeY(i - 1) };
    const p2 = { x: nodeX(i), y: nodeY(i) };
    const bowRight = i % 2 === 1;
    const bow = 46;
    const p1 = { x: bowRight ? Math.max(p0.x, p2.x) + bow : Math.min(p0.x, p2.x) - bow, y: (p0.y + p2.y) / 2 };
    // La geometria della serpentina è fissa: quello che cambia mentre si
    // trascina è CHI occupa la riga, quindi anche il mezzo dell'arco.
    arcSegs.push({ p0, p1, p2, transport: stops[ordineMostrato[i]]?.transport ?? null });
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <div ref={containerRef} style={{ flex:1, padding:"12px 0 0", position:"relative" }}>
        {showArcs ? (
          <div style={{ position:"relative", width:"100%" }}>
            <svg ref={svgRef} width="100%" height={H} viewBox={`0 0 ${VBW} ${H}`}
              style={{ display:"block", overflow:"visible" }}>
              <defs>
                {TRANSPORT.map(t => (
                  <marker key={t.value} id={`tf-arr-${t.value}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill={t.color} opacity="0.8"/>
                  </marker>
                ))}
              </defs>

              {/* Archi (serpentina verticale) */}
              {arcSegs.map((a, k) => {
                const t = TRANSPORT.find(t => t.value === a.transport) ?? TRANSPORT[0];
                const d = `M ${a.p0.x} ${a.p0.y} Q ${a.p1.x} ${a.p1.y} ${a.p2.x} ${a.p2.y}`;
                return (
                  <g key={k}>
                    <path d={d} stroke={t.color} strokeWidth="8" fill="none" opacity="0.06"/>
                    <path d={d} stroke={t.color} strokeWidth="2" strokeDasharray="5 3"
                      fill="none" opacity="0.6" markerEnd={`url(#tf-arr-${t.value})`}/>
                    {/* outline-none: al tocco/click Chromium disegnava l'anello
                        di focus sul BOUNDING BOX dell'arco — un riquadrone
                        bianco su mezza serpentina. Da tastiera il focus resta
                        visibile (focus-visible). */}
                    <path d={d} stroke="transparent" strokeWidth="22" fill="none" style={{cursor:"pointer"}}
                      className="outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#60a5fa]"
                      onClick={() => setActiveArc(activeArc === k + 1 ? null : k + 1)}
                      {...svgButton(`Cambia il mezzo per arrivare a ${stops[k + 1]?.label ?? "questa tappa"}`,
                        () => setActiveArc(activeArc === k + 1 ? null : k + 1))}/>
                  </g>
                );
              })}

              {/* Nodi */}
              {stops.map((stop, i) => {
                // `riga` = posizione sulla serpentina (cambia mentre trascino),
                // `i` = identità della tappa (non cambia mai).
                const riga = rigaDi(i);
                const inMano = drag?.da === i;
                const x = nodeX(riga);
                const y = inMano ? drag.y : nodeY(riga);
                const isLast = riga === n - 1 && n > 1;
                const lastT = isLast ? TRANSPORT.find(t => t.value === stop.transport) ?? TRANSPORT[0] : null;
                const borderColor = stop.isHome ? "#fbbf24" : lastT ? lastT.color : "#60a5fa";
                const bgFill = stop.isHome ? "rgba(251,191,36,0.1)" : lastT ? lastT.bg : "rgba(96,165,250,0.08)";
                const r = isLast ? nodeR + 5 : nodeR;
                const leftCol = riga % 2 === 0;
                const labelX = leftCol ? x + r + 9 : x - r - 9;
                const trascinabile = !stop.isHome && n > 2;
                return (
                  <g key={i} style={{ opacity: drag && !inMano ? 0.75 : 1 }}>
                    {/* Posto libero dove la tappa cadrà, così si vede dove va */}
                    {inMano && (
                      <circle cx={nodeX(drag.a)} cy={nodeY(drag.a)} r={nodeR} fill="none"
                        stroke="rgba(96,165,250,0.5)" strokeWidth="1.5" strokeDasharray="5 4"/>
                    )}
                    {/* La presa per trascinare NON sta qui ma sul div HTML
                        della bandiera, qui sopra: `touch-action` non ha
                        effetto sulle forme SVG (non generano un box CSS), e
                        senza di esso su telefono scorre la pagina invece di
                        muovere la tappa. */}
                    <circle cx={x} cy={y} r={r} fill={bgFill} stroke={borderColor}
                      strokeWidth={isLast ? 2.5 : 1.5} strokeDasharray={stop.isHome ? "3 2" : "none"}
                      style={{ filter: inMano ? "drop-shadow(0 4px 10px rgba(0,0,0,0.5))" : undefined }}/>
                    {stop.isHome ? (
                      <g style={{cursor:"pointer"}} onClick={onEditHome}
                        {...svgButton("Cambia la città di partenza", onEditHome)}>
                        <circle cx={x+r-4} cy={y-r+4} r="20" fill="transparent"/>
                        <circle cx={x+r-4} cy={y-r+4} r="10" fill="#0d1f3c" stroke="#fbbf24" strokeWidth="1.5"/>
                        <text x={x+r-4} y={y-r+8} fontSize="11" textAnchor="middle" fill="#fbbf24">✎</text>
                      </g>
                    ) : (
                      <g style={{cursor:"pointer"}} onClick={() => onRemoveWaypoint(i-1)}
                        {...svgButton(`Rimuovi la tappa ${stop.label}`, () => onRemoveWaypoint(i-1))}>
                        <circle cx={x+r-3} cy={y-r+3} r="20" fill="transparent"/>
                        <circle cx={x+r-3} cy={y-r+3} r="9" fill="#060e1e"
                          stroke={isLast ? borderColor : "#1a2d4a"} strokeWidth="1.5"/>
                        <text x={x+r-3} y={y-r+7} fontSize="10" textAnchor="middle"
                          fill={isLast ? borderColor : "rgba(255,255,255,0.4)"}>×</text>
                      </g>
                    )}
                    <text x={labelX} y={y+4} fontSize="12" textAnchor={leftCol ? "start" : "end"}
                      fill={isLast ? borderColor : stop.isHome ? "#fbbf24" : "rgba(255,255,255,0.7)"}
                      fontWeight={isLast || stop.isHome ? "700" : "500"}>
                      {stop.label.length > 16 ? stop.label.slice(0,15)+"…" : stop.label}
                    </text>
                  </g>
                );
              })}

              {/* Selettore mezzo (sopra tutto): centrato, sull'altezza dell'arco attivo */}
              {activeArc != null && activeArc >= 1 && activeArc < n && (() => {
                const a = arcSegs[activeArc - 1];
                const stop = stops[activeArc];
                const midX = VBW / 2;
                const py = Math.max(6, (a.p0.y + a.p2.y) / 2 - 30);
                // La distanza della tratta: stai decidendo COME percorrerla,
                // e quanto è lunga è l'informazione che serve in quel momento.
                // Linea d'aria (~): il percorso stradale vero si calcola solo
                // al salvataggio. Se mancano le coordinate, il titolo resta
                // "Cambia mezzo" e basta.
                const daCoord = activeArc === 1
                  ? (home ? { lat: home.lat, lon: home.lon } : null)
                  : (waypoints[activeArc - 2] ?? null);
                const aCoord = waypoints[activeArc - 1] ?? null;
                const kmTratta = daCoord && aCoord
                  && hasCoords(daCoord.lat, daCoord.lon) && hasCoords(aCoord.lat, aCoord.lon)
                  ? distanceKm(daCoord.lat, daCoord.lon, aCoord.lat, aCoord.lon)
                  : null;
                return (
                  <g onClick={e => e.stopPropagation()} role="group" aria-label="Scegli il mezzo">
                    {/* Larghezza derivata dal numero di mezzi: era fissa a 238
                        (tarata su 7) e l'ottavo, il pullman, sforava dal
                        riquadro di 25px. */}
                    <rect x={midX - (TRANSPORT.length * 32 + 14) / 2} y={py}
                      width={TRANSPORT.length * 32 + 14} height="60" rx="10"
                      fill="#0d1f3c" stroke="#1a2d4a" strokeWidth="0.5"/>
                    <text x={midX} y={py+18} fontSize="9" textAnchor="middle" fill="rgba(255,255,255,0.4)">
                      {kmTratta != null
                        ? `Cambia mezzo · ~${fmtDistance(Math.round(kmTratta), distanceUnit)}`
                        : "Cambia mezzo"}
                    </text>
                    {TRANSPORT.map((opt, j) => {
                      const bx = midX - ((TRANSPORT.length - 1) * 32) / 2 + j * 32, by = py + 40;
                      return (
                        <g key={opt.value} style={{cursor:"pointer"}} aria-pressed={stop.transport === opt.value}
                          onClick={() => { onChangeTransport(activeArc-1, opt.value); setActiveArc(null); }}
                          {...svgButton(opt.label, () => { onChangeTransport(activeArc-1, opt.value); setActiveArc(null); })}>
                          <rect x={bx-16} y={by-18} width="32" height="36" fill="transparent"/>
                          <rect x={bx-14} y={by-14} width="28" height="28" rx="8"
                            fill={stop.transport === opt.value ? opt.bg : "rgba(255,255,255,0.05)"}
                            stroke={stop.transport === opt.value ? opt.color : "#1a2d4a"} strokeWidth="1"/>
                          <foreignObject x={bx-11} y={by-11} width="22" height="22">
                            <div style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",height:"100%"}}>
                              {TRANSPORT_SVG[opt.value]?.(opt.color, 19)}
                            </div>
                          </foreignObject>
                        </g>
                      );
                    })}
                  </g>
                );
              })()}
            </svg>

            {/* Overlay HTML: emoji casa + bandiere */}
            <div style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", pointerEvents:"none" }}>
              {stops.map((stop, i) => {
                // Stessa aritmetica dei nodi: bandiera e cerchio devono
                // muoversi insieme, altrimenti durante il trascinamento la
                // bandiera resta indietro.
                const riga = rigaDi(i);
                const inMano = drag?.da === i;
                const x = nodeX(riga);
                const y = inMano ? drag.y : nodeY(riga);
                const isLast = riga === n - 1 && n > 1;
                const r = isLast ? nodeR + 5 : nodeR;
                const size = r * 1.3;
                const trascinabile = !stop.isHome && n > 2;
                return (
                  <div key={i}
                    className={trascinabile ? "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#60a5fa] focus-visible:rounded-full" : undefined}
                    tabIndex={trascinabile ? 0 : undefined}
                    role={trascinabile ? "button" : undefined}
                    aria-label={trascinabile
                      ? `${stop.label}, tappa ${riga} di ${n - 1}. Trascina per spostarla, o usa le frecce su e giù`
                      : undefined}
                    onPointerDown={trascinabile ? iniziaTrascinamento(i) : undefined}
                    onKeyDown={trascinabile ? tastiereRiordino(i) : undefined}
                    style={{
                    position:"absolute",
                    left: (x / VBW) * 100 + "%",
                    top: y - r * 0.65,
                    transform: "translateX(-50%)",
                    width: size, height: size,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    overflow: "hidden", borderRadius: "50%",
                    // Il contenitore è trasparente ai puntatori: qui li
                    // riaccendo solo sulle tappe che si possono spostare.
                    pointerEvents: trascinabile ? "auto" : "none",
                    // Dichiarato PRIMA del tocco: il browser sceglie se
                    // scorrere già al pointerdown, e metterlo a trascinamento
                    // iniziato sarebbe tardi (la pagina scivolava e la tappa
                    // restava ferma). Solo sul nodo: altrove la card scorre.
                    touchAction: trascinabile ? "none" : undefined,
                    userSelect: trascinabile ? "none" : undefined,
                    cursor: trascinabile ? (inMano ? "grabbing" : "grab") : undefined,
                  }}>
                    {stop.isHome
                      ? <span style={{ fontSize: r * 0.75, lineHeight:1 }}>🏠</span>
                      : stop.countryCode
                        ? <img src={`https://flagcdn.com/w80/${stop.countryCode.toLowerCase()}.png`}
                            // Senza questo, trascinare la bandiera col mouse
                            // avvia il drag&drop nativo del browser, che
                            // zittisce i pointermove successivi: la tappa
                            // restava incollata (col dito non succedeva).
                            draggable={false}
                            style={{ width:"100%", height:"100%", objectFit:"cover" }}
                            onError={e => { (e.target as HTMLImageElement).style.display="none"; }}/>
                        : <span style={{ fontSize: r * 0.65, lineHeight:1 }}>🌍</span>
                    }
                  </div>
                );
              })}
            </div>

            {/* Mezzo animato lungo l'intera serpentina */}
            <ContinuousFlyer arcs={arcSegs} vbw={VBW}/>
          </div>
        ) : (
          /* Stato vuoto (solo casa): casa in alto, arco tratteggiato verso "+ destinazione" */
          <div style={{ position:"relative", width:"100%" }}>
            {(() => {
              const eh = padTop + vStep + 60;
              const hx = xL, hy = padTop, dx = xR, dy = padTop + vStep;
              return (
                <svg width="100%" height={eh} viewBox={`0 0 ${VBW} ${eh}`} style={{ display:"block", overflow:"visible" }}>
                  <path d={`M ${hx} ${hy} Q ${xR+46} ${(hy+dy)/2} ${dx} ${dy}`}
                    stroke="#1a2d4a" strokeWidth="1.5" strokeDasharray="6 4" fill="none"/>
                  <circle cx={hx} cy={hy} r="26" fill="rgba(251,191,36,0.1)" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="3 2"/>
                  <g style={{cursor:"pointer"}} onClick={onEditHome}
                    {...svgButton("Cambia la città di partenza", onEditHome)}>
                    <circle cx={hx+22} cy={hy-22} r="20" fill="transparent"/>
                    <circle cx={hx+22} cy={hy-22} r="10" fill="#0d1f3c" stroke="#fbbf24" strokeWidth="1.5"/>
                    <text x={hx+22} y={hy-18} fontSize="11" textAnchor="middle" fill="#fbbf24">✎</text>
                  </g>
                  <text x={hx+38} y={hy+4} fontSize="12" textAnchor="start" fill="#fbbf24" fontWeight="700">{homeLabel}</text>
                  <circle cx={dx} cy={dy} r="26" fill="rgba(255,255,255,0.02)" stroke="#1a2d4a" strokeWidth="1.5" strokeDasharray="3 2"/>
                  <text x={dx} y={dy+6} fontSize="22" textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.15)">+</text>
                  <text x={dx-38} y={dy+4} fontSize="12" textAnchor="end" fill="rgba(255,255,255,0.3)">destinazione</text>
                </svg>
              );
            })()}
            {/* L'emoji casa è cliccabile: aria-hidden perché il controllo vero
                (con nome) è la ✎ qui sopra — non va annunciata due volte. */}
            <div aria-hidden="true" style={{ position:"absolute", left:(xL/VBW)*100+"%", top:padTop-14, transform:"translateX(-50%)",
              width:36, height:36, display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:22, cursor:"pointer" }} onClick={onEditHome}>🏠</div>
          </div>
        )}

        {/* Home edit field */}
        {editingHome && (
          <div style={{ margin:"0 20px 8px", background:"#0d1f3c", border:"0.5px solid #fbbf24",
            borderRadius:8, padding:"8px 12px", display:"flex", alignItems:"center", gap:8, position:"relative" }}>
            <span style={{ fontSize:14, color:"#fbbf24" }}>🏠</span>
            <input autoFocus style={{ background:"transparent", border:"none", outline:"none", color:"#f0f4ff", fontSize:13, flex:1 }}
              value={homeQuery} onChange={e => setHomeQuery(e.target.value)} placeholder="La tua città…"/>
            <Search className="w-4 h-4" style={{ color:"rgba(255,255,255,0.6)", flexShrink:0 }}/>
            {homeResults.length > 0 && (
              <div style={{ position:"absolute", bottom:"100%", left:0, right:0, background:"#0d1f3c",
                border:"0.5px solid #1a2d4a", borderRadius:8, zIndex:10, overflow:"hidden", marginBottom:4 }}>
                {homeResults.map((r,i) => (
                  <button key={i} type="button" onClick={() => onSelectHome(r)}
                    style={{ width:"100%", textAlign:"left", padding:"9px 14px", fontSize:13,
                      color:"#f0f4ff", background:"none", border:"none", cursor:"pointer",
                      display:"flex", alignItems:"center", gap:8, borderBottom:"0.5px solid #1a2d4a" }}>
                    <MapPin className="w-3.5 h-3.5" style={{ color:"rgba(255,255,255,0.6)" }}/>{r.name}, {r.country}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Aggiungi tappa */}
      <div style={{ padding:"8px 20px 20px" }}>
        {wpOpen ? (
          <div style={{ background:"#0a1e38", border:"0.5px solid #1a2d4a", borderRadius:10, overflow:"hidden" }}>
            <div style={{ padding:"10px 14px 8px", borderBottom:"0.5px solid #1a2d4a",
              display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
              <span style={{ fontSize:9, color:"rgba(255,255,255,0.6)", letterSpacing:"1px",
                textTransform:"uppercase", marginRight:4 }}>Mezzo</span>
              {TRANSPORT.map(t => (
                <button key={t.value} type="button" onClick={() => setWpTransport(t.value)}
                  style={{ fontSize:10, padding:"7px 10px", minHeight:30, borderRadius:99, cursor:"pointer",
                    background: wpTransport === t.value ? t.bg : "transparent",
                    color: wpTransport === t.value ? t.color : "rgba(255,255,255,0.25)",
                    border: `0.5px solid ${wpTransport === t.value ? t.color : "#1a2d4a"}` }}>
                  <span style={{display:"flex",alignItems:"center",gap:4}}>
                    {TRANSPORT_SVG[t.value]?.(wpTransport === t.value ? t.color : "rgba(255,255,255,0.3)", 14)}
                    {t.label}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ padding:"10px 14px", display:"flex", alignItems:"center", gap:8 }}>
              {wpLoading
                ? <Loader2 className="w-4 h-4 animate-spin" style={{ color:"rgba(255,255,255,0.6)", flexShrink:0 }}/>
                : <Search className="w-4 h-4" style={{ color:"rgba(255,255,255,0.6)", flexShrink:0 }}/>
              }
              <input autoFocus style={{ background:"transparent", border:"none", outline:"none",
                color:"#f0f4ff", fontSize:13, flex:1 }}
                value={wpQuery} onChange={e => setWpQuery(e.target.value)} placeholder="Cerca città, lago, monumento…"/>
              <button type="button" onClick={() => { setWpQuery(""); setWpOpen(false); }}
                aria-label="Chiudi ricerca tappa"
                style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.6)", display:"flex", alignItems:"center", flexShrink:0 }}>
                <X className="w-4 h-4"/>
              </button>
            </div>
            {wpResults.map((r,i) => (
              <button key={i} type="button" onClick={() => onAddWaypoint(r)}
                style={{ width:"100%", textAlign:"left", padding:"10px 14px", fontSize:13,
                  color:"#f0f4ff", background:"none", border:"none", cursor:"pointer",
                  display:"flex", alignItems:"center", gap:10, borderTop:"0.5px solid #1a2d4a" }}>
                <img src={`https://flagcdn.com/w20/${(r.country_code || "").toLowerCase()}.png`}
                  width="20" style={{ borderRadius:2, flexShrink:0 }}
                  onError={e => { (e.target as HTMLImageElement).style.display="none"; }}/>
                {/* Regione in grigio accanto al nome: due "Garda" in province
                    diverse erano indistinguibili (è il meccanismo che mandava
                    a Machu Picchu in Bolivia). Paese e regione possono
                    mancare sui luoghi: si mostra ciò che c'è, senza virgole
                    appese nel vuoto. */}
                <span style={{ flex:1, minWidth:0 }}>
                  <span style={{ color:"#f0f4ff" }}>{r.name}</span>
                  {placeSubtitle(r) && (
                    <span style={{ color:"rgba(255,255,255,0.45)", fontSize:12 }}>
                      {" · "}{placeSubtitle(r)}
                    </span>
                  )}
                </span>
                {/* Solo i luoghi non abitati portano l'etichetta: per le città
                    sarebbe rumore, sono la stragrande maggioranza. */}
                {r.kind && (
                  <span style={{ fontSize:9.5, flexShrink:0, whiteSpace:"nowrap", padding:"3px 7px",
                    borderRadius:6, color: PLACE_KIND_COLOR[r.kind],
                    border:`0.5px solid ${PLACE_KIND_COLOR[r.kind]}55`,
                    background:`${PLACE_KIND_COLOR[r.kind]}14` }}>{r.kind}</span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
            <button type="button" onClick={() => setWpOpen(true)}
              style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:12,
                color: destinationError ? "#f87171" : "rgba(255,255,255,0.4)",
                border: `1.5px dashed ${destinationError ? "#f87171" : "#1a2d4a"}`,
                borderRadius:99, padding:"6px 20px", cursor:"pointer", background:"transparent" }}>
              + Aggiungi tappa
            </button>
            {destinationError && (
              <span style={{ fontSize:11, color:"#f87171" }}>Seleziona una destinazione</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** La card "Itinerario" completa (intestazione + editor visuale): la colonna sinistra dei due form. */
export function ItineraryPanel(props: RouteHeroProps) {
  return (
    <div style={{ background:"#0a1628", border:"0.5px solid #1a2d4a",
      borderRadius:14, overflow:"hidden", display:"flex", flexDirection:"column", height:"100%" }}>

      <div style={{ padding:"18px 20px", borderBottom:"0.5px solid #1a2d4a",
        display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:32, height:32, borderRadius:9, background:"rgba(96,165,250,0.12)",
          display:"flex", alignItems:"center", justifyContent:"center" }}>
          <Route className="w-4 h-4" style={{color:"#60a5fa"}}/>
        </div>
        <div>
          <div className="font-display" style={{ fontSize:15, fontWeight:700, color:"#f0f4ff" }}>Itinerario</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)", marginTop:1 }}>
            {/* L'indizio del trascinamento compare solo quando il riordino
                esiste (≥2 tappe): prima la funzione era invisibile — nulla
                diceva che i pallini si possono prendere. */}
            {props.waypoints.length >= 2
              ? "Tocca 🏠 per la partenza · trascina le tappe per riordinarle"
              : "Tocca 🏠 per cambiare città di partenza"}
          </div>
        </div>
      </div>

      <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
        <RouteHero {...props}/>
      </div>
    </div>
  );
}

/** Nome, Periodo (con durata ed errore date invertite), Note e Valutazione: la parte alta della colonna destra. */
export function TripFormFields({
  title, setTitle, dateStart, setDateStart, dateEnd, setDateEnd,
  notes, setNotes, rating, setRating,
}: {
  title: string; setTitle: (v: string) => void;
  dateStart: string; setDateStart: (v: string) => void;
  dateEnd: string; setDateEnd: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
  rating: number; setRating: (v: number) => void;
}) {
  const [hoverRating, setHoverRating] = useState(0);
  const days = daysBetween(dateStart, dateEnd);
  const dateOrderError = isReturnBeforeDeparture(dateStart, dateEnd);

  return (
    <>
      {/* Nome */}
      <div style={{ background:"#0a1628", border:"0.5px solid #1a2d4a", borderRadius:8, padding:"14px 16px" }}>
        <label style={{ fontSize:9, color:"rgba(255,255,255,0.6)", letterSpacing:"1.5px",
          textTransform:"uppercase", display:"block", marginBottom:6 }}>Nome del viaggio <span style={{ opacity:0.4, fontSize:9, textTransform:"none" }}>(opzionale)</span></label>
        <input style={{ background:"#060e1e", border:"0.5px solid #1a2d4a", borderRadius:8,
          padding:"9px 12px", fontSize:13, color:"#f0f4ff", width:"100%",
          outline:"none", boxSizing:"border-box" }}
          value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Es. Viaggio di nozze…"
          onFocus={e => (e.target.style.borderColor="#60a5fa")}
          onBlur={e => (e.target.style.borderColor="#1a2d4a")}/>
      </div>

      {/* Periodo */}
      <div style={{ background:"#0a1628", border:"0.5px solid #1a2d4a", borderRadius:8, padding:"14px 16px" }}>

        {/* Riga superiore: Titolo a sinistra, Durata a destra */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <label style={{ fontSize:9, color:"rgba(255,255,255,0.6)", letterSpacing:"1.5px", textTransform:"uppercase", display:"block", margin: 0 }}>
            Periodo
          </label>

          {days && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 8, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 1 }}>Durata</span>
              <div style={{
                background: "rgba(96, 165, 250, 0.15)", color: "#60a5fa",
                fontWeight: 700, fontSize: 11, padding: "2px 8px",
                borderRadius: 6, border: "1px solid rgba(96, 165, 250, 0.25)"
              }}>
                {days}g
              </div>
            </div>
          )}
        </div>

        {/* Box degli Input Rettangolare */}
        <div
          style={{
            display:"flex", alignItems:"center", background:"#060e1e",
            border:"1px solid transparent", borderColor:"#1a2d4a", borderRadius:8,
            padding:"8px 10px", transition:"border-color 0.2s ease"
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor="rgba(96, 165, 250, 0.4)")}
          onMouseLeave={e => (e.currentTarget.style.borderColor="#1a2d4a")}
        >

          {/* ICONA AEREO */}
          <div style={{ display:"flex", alignItems:"center", paddingLeft:2, paddingRight:2, flexShrink:0 }}>
            <Plane className="w-4 h-4" style={{ color:"#60a5fa", transform:"rotate(-45deg)" }}/>
          </div>

          {/* PARTENZA */}
          <div style={{ display:"flex", flexDirection:"column", flex:1, minWidth:0, marginLeft:4 }}>
            <span style={{ fontSize:9, color:"rgba(255,255,255,0.6)", textTransform:"uppercase", letterSpacing:1 }}>Partenza</span>
            <input type="date"
              // min/max: su desktop l'anno si digita a mano e un refuso tipo
              // "20261" produceva una data che avvelenava biglietto/timeline.
              min="1900-01-01" max="2100-12-31"
              style={{ background:"transparent", border:"none", outline:"none",
                color:"#f0f4ff", fontSize:12, fontWeight:600, width:"100%",
                colorScheme:"dark", padding:0, marginTop:1 }}
              value={dateStart} onChange={e => setDateStart(e.target.value)}/>
          </div>

          {/* CONNETTORE TRATTEGGIATO */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:"0 6px", flexShrink:0 }}>
            <div style={{
              height:2, width:16, position:"relative",
              backgroundImage: "linear-gradient(to right, rgba(255, 255, 255, 0.15) 20%, rgba(255,255,255,0) 0%)",
              backgroundPosition: "bottom", backgroundSize: "6px 2px", backgroundRepeat: "repeat-x"
            }}>
              <div style={{
                position:"absolute", right:-4, top:-3, width:0, height:0,
                borderTop:"4px solid transparent", borderBottom:"4px solid transparent",
                borderLeft:"6px solid rgba(255, 255, 255, 0.15)"
              }}/>
            </div>
          </div>

          {/* RITORNO */}
          <div style={{ display:"flex", flexDirection:"column", flex:1, minWidth:0, marginLeft:2 }}>
            <span style={{ fontSize:9, color:"rgba(255,255,255,0.6)", textTransform:"uppercase", letterSpacing:1 }}>Ritorno</span>
            <input type="date"
              min="1900-01-01" max="2100-12-31"
              style={{ background:"transparent", border:"none", outline:"none",
                color: dateEnd ? "#f0f4ff" : "rgba(255,255,255,0.35)", fontSize:12, fontWeight:600, width:"100%",
                colorScheme:"dark", padding:0, marginTop:1 }}
              value={dateEnd} onChange={e => setDateEnd(e.target.value)}/>
          </div>

        </div>
        {/* Prima si salvava senza errori anche con il ritorno prima della
            partenza: la durata spariva silenziosamente (daysBetween
            tornava null), senza dire perché. */}
        {dateOrderError && (
          <p style={{ fontSize:11, color:"#f87171", marginTop:8, display:"flex", alignItems:"center", gap:4 }}>
            <AlertCircle className="w-3 h-3"/> Il ritorno non può essere prima della partenza
          </p>
        )}
      </div>

      {/* Note */}
      <div style={{ background:"#0a1628", border:"0.5px solid #1a2d4a", borderRadius:8, padding:"14px 16px" }}>
        <label style={{ fontSize:9, color:"rgba(255,255,255,0.6)", letterSpacing:"1.5px",
          textTransform:"uppercase", display:"block", marginBottom:6 }}>
          Note <span style={{ opacity:0.4, fontSize:9, textTransform:"none" }}>(opzionale)</span>
        </label>
        {/* Il testo digitato usa il colore pieno #f0f4ff come il campo Nome:
            prima era rgba(0.4) (~3.8:1, sotto AA) — cioè il contenuto scritto
            dall'utente risultava poco leggibile. Il placeholder resta tenue. */}
        <textarea style={{ background:"#060e1e", border:"0.5px solid #1a2d4a", borderRadius:8,
          padding:"9px 12px", fontSize:13, color:"#f0f4ff", width:"100%",
          outline:"none", resize:"none", boxSizing:"border-box", height:80, fontFamily:"inherit" }}
          value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Aggiungi una nota…"
          onFocus={e => (e.target.style.borderColor="#60a5fa")}
          onBlur={e => (e.target.style.borderColor="#1a2d4a")}/>
      </div>

      {/* Valutazione */}
      <div style={{ background:"#0a1628", border:"0.5px solid #1a2d4a", borderRadius:8, padding:"14px 16px" }}>
        <label style={{ fontSize:9, color:"rgba(255,255,255,0.6)", letterSpacing:"1.5px",
          textTransform:"uppercase", display:"block", marginBottom:8 }}>
          Valutazione <span style={{ opacity:0.4, fontSize:9, textTransform:"none" }}>(opzionale)</span>
        </label>
        {/* Cinque bottoni il cui unico contenuto era "★": uno screen reader
            leggeva cinque volte lo stesso nome. Ora ognuno dice quante stelle
            assegna e se è quella scelta. */}
        <div style={{ display:"flex", gap:4 }} role="group" aria-label="Valutazione del viaggio">
          {[1,2,3,4,5].map(i => (
            <button key={i} type="button"
              aria-label={`${i} ${i === 1 ? "stella" : "stelle"} su 5`}
              aria-pressed={rating === i}
              onMouseEnter={() => setHoverRating(i)}
              onMouseLeave={() => setHoverRating(0)}
              onFocus={() => setHoverRating(i)}
              onBlur={() => setHoverRating(0)}
              onClick={() => setRating(rating === i ? 0 : i)}
              style={{ fontSize:26, background:"none", border:"none", cursor:"pointer", padding:0,
                color: i <= (hoverRating||rating) ? "#fbbf24" : "rgba(255,255,255,0.15)",
                transform: i <= (hoverRating||rating) ? "scale(1.15)" : "scale(1)",
                transition:"color 0.1s, transform 0.1s" }}><span aria-hidden="true">★</span></button>
          ))}
        </div>
        {/* aria-live: il giudizio cambia senza che il focus si sposti, quindi
            va annunciato o resta muto per chi non vede. */}
        <div aria-live="polite" style={{ fontSize:11, color:"#fbbf24", marginTop:6, minHeight:(hoverRating||rating) > 0 ? undefined : 0 }}>
          {(hoverRating||rating) > 0 ? RATING_LABELS[hoverRating||rating] : ""}
        </div>
      </div>
    </>
  );
}


/** Annulla + Salva viaggio, con lo stato di salvataggio esplicito. */
export function TripFormActions({ saving, confirmDiscard, onSave }: {
  saving: boolean;
  confirmDiscard: (e: React.MouseEvent) => void;
  onSave: () => void;
}) {
  return (
    <>
      <div style={{ display:"flex", gap:8, paddingTop:4 }}>
        <Link to="/" onClick={saving ? (e) => e.preventDefault() : confirmDiscard}
          aria-disabled={saving}
          style={{ flex:1, textAlign:"center", padding:"10px", borderRadius:10,
          fontSize:13, color:"rgba(255,255,255,0.6)", border:"0.5px solid #1a2d4a",
          textDecoration:"none", background:"transparent",
          opacity: saving ? 0.4 : 1, pointerEvents: saving ? "none" : "auto" }}>
          Annulla
        </Link>
        <button onClick={onSave} disabled={saving}
          style={{ flex:2, padding:"10px", borderRadius:10, fontSize:13, fontWeight:700,
            color:"#060e1e", background:"#60a5fa", border:"none", cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
          {saving && <Loader2 className="w-4 h-4 animate-spin"/>}
          {saving ? "Salvataggio…" : "Salva viaggio"}
        </button>
      </div>
      {/* Un viaggio con più tappe può richiedere qualche secondo: senza
          questa riga il form sembra bloccato invece che al lavoro. */}
      {saving && (
        <p style={{ fontSize:11, color:"rgba(255,255,255,0.6)", textAlign:"center", margin:0 }}>
          Recupero regione, meteo e altitudine delle tappe…
        </p>
      )}
    </>
  );
}

/**
 * Traccia se qualcosa è stato modificato dopo il primo render e protegge
 * l'uscita: beforeunload sul browser, window.confirm su "Annulla". Il ref
 * salta il giro iniziale (i valori di default/caricati non contano come
 * "modifica").
 */
export function useUnsavedChangesGuard(deps: readonly unknown[]) {
  const [dirty, setDirty] = useState(false);
  const skipDirtyRef = useRef(true);
  useEffect(() => {
    if (skipDirtyRef.current) { skipDirtyRef.current = false; return; }
    setDirty(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const confirmDiscard = (e: React.MouseEvent) => {
    if (dirty && !window.confirm("Hai modifiche non salvate. Uscire senza salvare?")) {
      e.preventDefault();
    }
  };

  return { dirty, confirmDiscard };
}
