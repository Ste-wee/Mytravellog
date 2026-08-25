// [FROZEN] — Non modificare senza esplicita richiesta
import { useMemo, useRef } from "react";
import React from "react";
import { Mountain, Globe2, Sun, Snowflake, Moon, ChevronLeft, ChevronRight } from "lucide-react";
import { TRANSPORT, TRANSPORT_MODES, TransportMode, transportBg } from "@/lib/transport";
import { Trip as LocalTrip } from "@/lib/storage";
import { useSettings, useT, formatDistanceKm, formatAltitudeM, formatTemperatureC } from "@/lib/settings";
import { tripTotalKm, buildFlightPath, buildFlightLegs } from "@/lib/flyover";

interface Props {
  trips: LocalTrip[];
}

const EARTH_CIRCUMFERENCE_KM = 40075;
const DISTANCE_TO_MOON_KM = 384400;

type KmByMode = Record<TransportMode, number>;

function guessMode(km: number): TransportMode {
  return km > 1000 ? "plane" : km >= 200 ? "train" : km >= 20 ? "car" : "walk";
}

/**
 * A trip's transport_mode/waypoints[].transport_mode each describe the leg
 * ARRIVING at that stop, not the whole trip — a multi-stop trip can mix
 * modes (e.g. train home->A, plane A->B). Walk the real stop sequence
 * (home -> waypoints -> destination) and attribute each segment's distance
 * to its own arrival mode, instead of dumping the trip's total distance
 * onto a single mode.
 *
 * Usa le STESSE tratte di `tripTotalKm` (buildFlightLegs → pathCoords): la
 * distanza di ogni tratta segue la STRADA reale dove disponibile
 * (route_geometry per auto/bici/moto), altrimenti la linea d'aria. Così la
 * somma del breakdown coincide sempre col totale mostrato in alto — prima il
 * totale era stradale ma il breakdown restava in linea d'aria, e non tornavano.
 */
export function computeKmByTransportMode(trips: LocalTrip[]): KmByMode {
  // Un accumulatore per mezzo, costruito dalla fonte unica: scritto a mano
  // restava indietro di un mezzo a ogni aggiunta.
  const acc = Object.fromEntries(TRANSPORT_MODES.map(m => [m, 0])) as KmByMode;
  for (const t of trips) {
    const legs = buildFlightLegs(buildFlightPath([t]));
    for (const leg of legs) {
      const km = leg.km;   // gia' corretto: strada dichiarata dove c'e', somma dei segmenti altrimenti
      const mode = (leg.to.transportMode as TransportMode | null) ?? guessMode(km);
      acc[mode] += km;
    }
  }
  return acc;
}

export function TravelHighlights({ trips }: Props) {
  const { distanceUnit, temperatureUnit } = useSettings();
  const t = useT();
  const transportScrollRef = useRef<HTMLDivElement>(null);
  const scrollTransportBy = (dir: 1 | -1) => {
    transportScrollRef.current?.scrollBy({ left: dir * 140, behavior: "smooth" });
  };

  const highest = useMemo(
    () => trips
      .filter(t => (t.max_altitude_m ?? t.altitude_m) != null)
      .sort((a, b) => (b.max_altitude_m ?? b.altitude_m!) - (a.max_altitude_m ?? a.altitude_m!))[0],
    [trips]
  );
  const farthest = useMemo(
    () => trips
      .filter(t => (t.max_distance_from_home_km ?? t.distance_from_home_km) != null)
      .sort((a, b) =>
        (b.max_distance_from_home_km ?? b.distance_from_home_km!) -
        (a.max_distance_from_home_km ?? a.distance_from_home_km!)
      )[0],
    [trips]
  );
  const hottest = useMemo(
    () => trips
      .filter(t => (t.hottest_temp_c ?? t.temperature_c) != null)
      .sort((a, b) => (b.hottest_temp_c ?? b.temperature_c!) - (a.hottest_temp_c ?? a.temperature_c!))[0],
    [trips]
  );
  const coldest = useMemo(
    () => trips
      .filter(t => (t.coldest_temp_c ?? t.temperature_c) != null)
      .sort((a, b) => (a.coldest_temp_c ?? a.temperature_c!) - (b.coldest_temp_c ?? b.temperature_c!))[0],
    [trips]
  );
  // Km percorsi: stradali reali dove disponibile (tripTotalKm), coerente con
  // Home/card/poster. (Il "più distante da casa" qui sotto resta invece la
  // distanza max in linea d'aria — è un'altra metrica.)
  const totalKm = useMemo(
    () => trips.reduce((sum, t) => sum + tripTotalKm(t), 0),
    [trips]
  );
  const aroundWorld = totalKm / EARTH_CIRCUMFERENCE_KM;
  const toMoon = totalKm / DISTANCE_TO_MOON_KM;
  const byMode = useMemo(() => computeKmByTransportMode(trips), [trips]);

  return (
    <div className="space-y-6 animate-fade-up">

      {/* A differenza delle altre sezioni della pagina Statistiche (che hanno
          già un proprio h2 interno, es. "Distanze" più sotto), la griglia di
          card qui sotto non aveva alcun titolo. Stesso stile delle altre. */}
      <h2 className="text-lg font-bold">{t("Highlights di viaggio")}</h2>

      {/* Highlights grid — "Giorni in viaggio" è ora nella sezione Anni e mesi
          di viaggio, insieme a "giorni senza viaggiare" (metrica complementare) */}
      {(() => {
        type HlItem = { label: string; value: string; sub?: string; color: string; Icon: React.ElementType };
        const items: HlItem[] = [
          { label:t("Altitudine più alta"),  value: highest ? formatAltitudeM(highest.max_altitude_m ?? highest.altitude_m, distanceUnit) : "—",      sub: highest?.max_altitude_city ?? highest?.city,                                                color:"#34d399", Icon:Mountain    },
          { label:t("Più distante da casa"), value: farthest ? formatDistanceKm(farthest.max_distance_from_home_km ?? farthest.distance_from_home_km, distanceUnit) : "—", sub: farthest?.max_distance_city ?? farthest?.city, color:"#f472b6", Icon:Globe2 },
          { label:t("Il posto più caldo"),   value: hottest  ? formatTemperatureC(hottest.hottest_temp_c ?? hottest.temperature_c, temperatureUnit) : "—", sub: hottest?.hottest_city ?? hottest?.city,  color:"#fb7185", Icon:Sun      },
          { label:t("Il posto più freddo"),  value: coldest  ? formatTemperatureC(coldest.coldest_temp_c ?? coldest.temperature_c, temperatureUnit) : "—",  sub: coldest?.coldest_city ?? coldest?.city,  color:"#93c5fd", Icon:Snowflake },
        ];
        // Icona grande "illustrata" invece del badge circolare piccolo (spunto
        // preso da un'app concorrente, poi estesa anche al desktop su richiesta
        // di Stefano — è pura estetica, non una soluzione "di spazio" come il
        // carosello o il menu hamburger, quindi ha senso unificarla ovunque.
        const Card = ({ item }: { item: HlItem }) => (
          <div style={{background:"#0a1628",border:"0.5px solid #1a2d4a",borderRadius:14,padding:"18px 10px",display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",gap:4}}>
            <item.Icon style={{width:30,height:30,color:item.color,strokeWidth:1.6}}/>
            <div className="font-mono" style={{fontSize:19,fontWeight:800,color:"#f0f4ff",marginTop:4}}>{item.value}</div>
            <div style={{fontSize:10,letterSpacing:"0.5px",textTransform:"uppercase",fontWeight:700,color:item.color}}>{item.label}</div>
            {item.sub && <div style={{fontSize:11,color:"rgba(255,255,255,0.6)"}}>{item.sub}</div>}
          </div>
        );
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {items.map(item => <Card key={item.label} item={item}/>)}
          </div>
        );
      })()}

      <div className="mt-6 glass-card p-6">
        <h2 className="text-lg font-bold mb-4">{t("Distanze")}</h2>

        {/* Hero row — layout unico ovunque (desktop = mobile): km totali come
            "momento hero" con icona grande, intorno-al-mondo/alla-luna compatte
            affiancate 2x2 sotto. Prima su desktop erano 3 numeri in riga. */}
        <div className="pb-5 border-b border-border mb-5">
          <div className="flex flex-col items-center text-center gap-1.5 mb-4">
            <div style={{width:76,height:76,borderRadius:"50%",border:"2px dashed #378ADD",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <Globe2 style={{width:32,height:32,color:"#378ADD"}} strokeWidth={1.5}/>
            </div>
            <div className="text-2xl font-bold font-mono mt-1">{formatDistanceKm(totalKm, distanceUnit)}</div>
            <div className="text-xs text-muted-foreground">{t("chilometri percorsi in totale")}</div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col items-center text-center gap-1.5 rounded-xl py-3" style={{background:"rgba(99,153,34,0.08)"}}>
              <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" stroke="#639922" strokeWidth="1.5"/>
                <ellipse cx="11" cy="11" rx="3.5" ry="6.5" stroke="#639922" strokeWidth="1.2"/>
                <line x1="4.5" y1="11" x2="17.5" y2="11" stroke="#639922" strokeWidth="1.2"/>
                <path d="M6.5 7Q11 9 15.5 7" stroke="#639922" strokeWidth="1" fill="none"/>
                <path d="M6.5 15Q11 13 15.5 15" stroke="#639922" strokeWidth="1" fill="none"/>
              </svg>
              <div className="text-lg font-bold font-mono">{aroundWorld.toFixed(3).replace(".",",")}×</div>
              <div className="text-[11px] text-muted-foreground">{t("intorno al mondo")}</div>
            </div>
            <div className="flex flex-col items-center text-center gap-1.5 rounded-xl py-3" style={{background:"rgba(127,119,221,0.08)"}}>
              <Moon className="w-5 h-5" style={{color:"#7F77DD"}} strokeWidth={1.5}/>
              <div className="text-lg font-bold font-mono">{toMoon.toFixed(3).replace(".",",")}×</div>
              <div className="text-[11px] text-muted-foreground">{t("alla luna")}</div>
            </div>
          </div>
        </div>

        {/* 5 mezzi di trasporto — i non usati (0 km) sono attenuati per far
            risaltare solo quelli effettivamente usati nei viaggi. */}
        {(() => {
          // Colori, icone ed etichette dalla fonte unica (@/lib/transport);
          // qui la forma discorsiva "In aereo", che sta sotto i km.
          // SOLO i mezzi davvero usati: prima c'erano sempre tutti e sette e
          // con un viaggio in auto si scorreva fra sei schede da "0 km".
          const usedModes = TRANSPORT_MODES.filter(m => byMode[m] > 0);
          const transportItems = usedModes.map(m => {
            const t = TRANSPORT[m];
            return {
              icon: <t.Icon strokeWidth={1.5}/>, color: t.color,
              bg: transportBg(m), border: transportBg(m, 0.3),
              km: byMode[m], val: formatDistanceKm(byMode[m], distanceUnit),
              label: t.labelWith,
            };
          });
          // Le frecce servono solo se c'è davvero qualcosa da scorrere: con
          // uno o due mezzi resterebbero due comandi che non fanno nulla.
          const scorrevole = transportItems.length > 3;
          if (transportItems.length === 0) return null;
          return (
            <>
              {/* Mezzi — carosello unico ovunque (desktop = mobile): scroll
                  orizzontale con freccine ◀▶, icona grande senza badge. Prima su
                  desktop era una griglia a 7 colonne. */}
              <div className="relative mb-4">
                {scorrevole && <button type="button" onClick={() => scrollTransportBy(-1)} aria-label={t("Scorri a sinistra")}
                  className="absolute left-0 top-1/2 z-10 flex items-center justify-center"
                  style={{ transform: "translateY(-50%)", width: 26, height: 26, borderRadius: "50%", background: "rgba(10,22,40,0.92)", border: "1px solid #1a2d4a" }}>
                  <ChevronLeft className="w-3.5 h-3.5"/>
                </button>}
                {/* Senza frecce niente corsie laterali vuote: le schede
                    partono dal bordo come il resto della pagina. */}
                <div ref={transportScrollRef} className="flex gap-2.5 overflow-x-auto"
                  style={{ scrollbarWidth: "none", paddingLeft: scorrevole ? 32 : 0, paddingRight: scorrevole ? 32 : 0 }}>
                  {transportItems.map(({ icon, color, val, label }) => (
                    <div key={label} className="flex-shrink-0 flex flex-col items-center justify-center gap-1.5 rounded-xl border"
                      style={{ width: 92, padding: "14px 8px", background: "#0a1628", borderColor: "#1a2d4a" }}>
                      <span style={{color}}>{React.cloneElement(icon, { style: { width: 26, height: 26 } })}</span>
                      <div className="text-sm font-extrabold font-mono" style={{color}}>{val}</div>
                      <div style={{fontSize:10,letterSpacing:"0.3px",textTransform:"uppercase",fontWeight:700,textAlign:"center",color}}>{label}</div>
                    </div>
                  ))}
                </div>
                {scorrevole && <button type="button" onClick={() => scrollTransportBy(1)} aria-label={t("Scorri a destra")}
                  className="absolute right-0 top-1/2 z-10 flex items-center justify-center"
                  style={{ transform: "translateY(-50%)", width: 26, height: 26, borderRadius: "50%", background: "rgba(10,22,40,0.92)", border: "1px solid #1a2d4a" }}>
                  <ChevronRight className="w-3.5 h-3.5"/>
                </button>}
              </div>
            </>
          );
        })()}

        {/* Proportional bar */}
        <div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground mb-1.5">
            {/* Etichette in forma compatta ("Piedi"): la legenda è stretta.
                Solo i mezzi presenti nella barra: prima ne elencava sette, sei
                dei quali sbiaditi al 30% per dire "questo non c'è". */}
            {TRANSPORT_MODES.filter(m => byMode[m] > 0).map(m => ({ color: TRANSPORT[m].color, label: TRANSPORT[m].labelShort })).map(x => (
              <span key={x.label} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{background:x.color}}/>
                {x.label}
              </span>
            ))}
          </div>
          <div className="h-2 rounded-full overflow-hidden flex bg-muted">
            {totalKm > 0 ? TRANSPORT_MODES.map((m, k) => ({ color: TRANSPORT[m].color, w: byMode[m], k })).map(x => (
              <div key={x.k} className="h-full transition-all duration-700" style={{flexGrow:x.w, background:x.color}}/>
            )) : <div className="h-full w-full rounded-full bg-muted"/>}
          </div>
        </div>
      </div>
    </div>
  );
}


