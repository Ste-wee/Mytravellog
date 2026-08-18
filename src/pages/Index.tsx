// [FROZEN] — Non modificare senza esplicita richiesta
import { AppHeader } from "@/components/AppHeader";
import { useEffect, useMemo, useRef, useState, Component, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { loadTrips, updateTrip, formatTripDate, Trip } from "@/lib/storage";
import { distanceKm } from "@/lib/geo";
import { hasCoords } from "@/lib/coords";
import { tripTotalKm } from "@/lib/flyover";
import { stopChain } from "@/lib/stops";
import { fmtDistance, useSettings } from "@/lib/settings";
import { TRANSPORT, isTransportMode } from "@/lib/transport";
import { Route, Globe, MapPin, Pencil, Plane, Plus, Video, X, ChevronDown } from "lucide-react";
import { WorldMap, CityInfo } from "@/components/WorldMap";
import { StarField, StarFieldController } from "@/components/StarField";
import { TripFlyover } from "@/components/TripFlyover";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";


/**
 * Ogni viaggio tocca anche i paesi/città delle tappe intermedie (waypoint),
 * non solo la destinazione finale (stessa logica di StatsSection.tsx).
 */
export function computeHomeStats(trips: Trip[]) {
  const countries = new Set<string>();
  const cities = new Set<string>();
  // Deduplica i paesi per NOME normalizzato, non per `country_code || country`:
  // lo stesso paese può comparire col codice ISO (destinazione "IT") e senza
  // (una tappa con country_code vuoto → "Italia"), che col vecchio metodo erano
  // due chiavi diverse e gonfiavano il conteggio (es. "2 paesi" per un viaggio
  // tutto in Italia). Il nome viene dal geocoder in italiano, quindi è stabile.
  // Stessa logica di StatsSection ("Elenco dei paesi").
  const addCountry = (name?: string, code?: string) => {
    const key = (name || code || "").trim().toLowerCase();
    if (key) countries.add(key);
  };
  for (const t of trips) {
    addCountry(t.country, t.country_code);
    cities.add(`${t.city}|${t.country}`);
    for (const w of t.waypoints ?? []) {
      addCountry(w.country, w.country_code);
      cities.add(`${w.city}|${w.country}`);
    }
  }
  // Km "percorsi": stradali reali dove c'è route_geometry (auto/bici/moto),
  // linea d'aria altrimenti — coerente con Statistiche/card/poster (tripTotalKm).
  const km = trips.reduce((s, t) => s + tripTotalKm(t), 0);
  // NB: nessun conteggio "giorni" qui — la Home non lo mostra. I giorni in
  // viaggio vivono nella heatmap (TravelHeatmap), con conteggio INCLUSIVO
  // (Gen 1→Gen 5 = 5 giorni), coerente con TripCardTicket. Il vecchio `days`
  // di questa funzione era codice morto e per giunta non inclusivo: rimosso.
  return { trips: trips.length, countries: countries.size, cities: cities.size, km };
}

/**
 * Ricalcola la distanza da casa di un viaggio percorrendo home → tappa1 →
 * tappa2 → ... → destinazione (non la linea retta home→destinazione, che
 * ignorerebbe le tappe intermedie). Usata per il backfill dei viaggi creati
 * prima che la città di residenza fosse impostata nelle Impostazioni.
 */
export function backfillDistanceFromHome(trip: Trip, homeCity: { lat: number; lon: number }) {
  const waypointStops = (trip.waypoints ?? [])
    .filter(w => w.lat != null && w.lon != null)
    .map(w => ({ lat: w.lat as number, lon: w.lon as number, city: w.city }));
  const allStops = [...waypointStops, { lat: trip.latitude, lon: trip.longitude, city: trip.city }];
  let dist = 0;
  let prev = { lat: homeCity.lat, lon: homeCity.lon };
  for (const stop of allStops) {
    dist += distanceKm(prev.lat, prev.lon, stop.lat, stop.lon);
    prev = stop;
  }
  const distances = allStops.map(p => ({ city: p.city, d: distanceKm(homeCity.lat, homeCity.lon, p.lat, p.lon) }));
  const max = distances.reduce((a, b) => (b.d > a.d ? b : a));
  return {
    distance_from_home_km: dist,
    max_distance_from_home_km: trip.max_distance_from_home_km ?? max.d,
    max_distance_city: trip.max_distance_city ?? max.city,
  };
}

// Card statistica della Home. Definita a livello di MODULO (non dentro
// HomeInner): se fosse dichiarata nel render, ogni ri-render creerebbe una
// nuova funzione — per React un componente "diverso" — che rimonta le card da
// zero e fa ripartire l'animazione fade-up da opacity 0. Durante la rotazione
// del globo il mousemove ri-renderizza la Home decine di volte al secondo,
// quindi le card lampeggiavano/sparivano finché non ci si fermava. Con il tipo
// stabile React riconcilia il nodo esistente e l'animazione parte una volta sola.
interface StatCardProps {
  icon: ReactNode; label: string; value: string; accent: string; bg: string; i?: number;
  /** Unità di misura (km/mi): resa più piccola e tenue, così l'occhio legge
   *  prima il numero — con lo stesso peso si prendeva metà dell'attenzione. */
  unit?: string;
}
function StatCard({ icon, label, value, accent, bg, i = 0, unit }: StatCardProps) {
  return (
    <div className="animate-fade-up" style={{
      background:"#0a1628", border:"0.5px solid #1a2d4a", borderRadius:12,
      padding:"14px 16px", display:"flex", alignItems:"center", gap:12,
      position:"relative", overflow:"hidden",
      // Comparsa scaglionata: prima le quattro card apparivano di colpo
      // tutte insieme (nessuna animazione d'ingresso in Home).
      animationDelay: `${i * 60}ms`,
    }}>
      {/* NB: qui c'era una barretta accento da 2px in cima. Ripeteva il colore
          dell'icona — due decorazioni per la stessa informazione assente. */}
      <div style={{width:36,height:36,borderRadius:9,background:bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <span style={{color:accent}}>{icon}</span>
      </div>
      <div>
        <div className="font-mono" style={{fontSize:20,fontWeight:700,color:"#f0f4ff",lineHeight:1.1}}>
          {/* Lo spazio sta DENTRO il testo, non è un margine: così il valore
              letto resta "10.193 km" come prima anche per un lettore di
              schermo (con il solo margine diventava "10.193km"). */}
          {value}{unit && <span style={{fontSize:12,fontWeight:400,color:"rgba(255,255,255,0.55)"}}> {unit}</span>}
        </div>
        <div style={{fontSize:10,letterSpacing:"1.2px",textTransform:"uppercase",color:"rgba(255,255,255,0.6)",marginTop:3}}>{label}</div>
      </div>
    </div>
  );
}

class ErrorBoundary extends Component<{children:ReactNode},{error:string|null}> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message + "\n" + e.stack }; }
  render() {
    if (this.state.error) return (
      <div style={{padding:20,color:'#f87171',background:'#1a0a0a',minHeight:'100vh',fontFamily:'monospace',whiteSpace:'pre-wrap',fontSize:12}}>
        <h2>Runtime Error:</h2>{this.state.error}
      </div>
    );
    return this.props.children;
  }
}



function HomeInner() {
  const navigate = useNavigate();
  const { distanceUnit, autoRotate, homeCity } = useSettings();
  // Inizializzato in modo sincrono (localStorage) invece che [] + effect:
  // così l'invito di benvenuto per chi non ha viaggi non lampeggia mai
  // per un frame agli utenti che invece ne hanno.
  const [trips, setTrips] = useState<Trip[]>(() => loadTrips());
  const [selectedId, setSelectedId] = useState<string | null>(null);


  const [selectedCity, setSelectedCity] = useState<CityInfo | null>(null);
  // Interazione stelle via handle imperativo, NON via state: con lo state la
  // Home si ri-renderizzava per intero ad ogni mousemove sul globo (60-120/s)
  // — vedi il commento storico su StatCard, che ne curava solo il sintomo.
  const starCtl = useRef<StarFieldController | null>(null);
  // Ultima posizione del dito per il parallax delle stelle su touch: il globo
  // (MapLibre) ruota col drag anche su mobile, ma onMouseMove non scatta col
  // dito, quindi lo sfondo stellato restava fermo — a differenza del browser
  // (mouse). Con questo ref calcoliamo lo spostamento tra due touchmove.
  const lastTouchRef = useRef<{x:number;y:number}|null>(null);
  // Solo su mobile le 4 card sono a comparsa (chiuse di default, per non
  // occupare spazio sopra il globo) — da desktop restano sempre visibili,
  // vedi il rendering "hidden sm:grid" più sotto.
  const [statsOpen, setStatsOpen] = useState(false);
  // Clean up legacy visited cities data
  useEffect(() => { localStorage.removeItem("atlas.visited.v1"); }, []);
  const refresh = () => setTrips(loadTrips());
  // NB: nessun refresh() al mount — lo stato è già inizializzato in modo
  // sincrono da loadTrips() qui sopra; rileggerlo subito forzava un secondo
  // render con un array di identità diversa (e a cascata ordered/stats).

  // Esc chiude il popup città (modale) e la mini-card del viaggio selezionato:
  // prima erano chiudibili solo col mouse (click fuori / X).
  useEffect(() => {
    if (!selectedCity && !selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSelectedCity(null);
      setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedCity, selectedId]);

  // Ricalcola distanze per viaggi senza distance_from_home_km quando homeCity è impostata
  useEffect(() => {
    if (!homeCity) return;
    const allTrips = loadTrips();
    let changed = false;
    allTrips.forEach(t => {
      if (hasCoords(t.latitude, t.longitude) &&
          (t.distance_from_home_km == null || t.distance_from_home_km === 0)) {
        updateTrip(t.id, backfillDistanceFromHome(t, homeCity));
        changed = true;
      }
    });
    if (changed) refresh();
  }, [homeCity]);

  const stats = useMemo(() => computeHomeStats(trips), [trips]);

  // Viaggio selezionato toccando un pallino sul globo: prima evidenziava solo
  // la rotta, senza mostrare alcuna informazione né un modo per aprirlo.
  const selectedTrip = useMemo(() => trips.find(t => t.id === selectedId) ?? null, [trips, selectedId]);
  const [flyoverTrip, setFlyoverTrip] = useState<Trip | null>(null);

  return (
    // min-h-screen (non h-screen): con la tendina statistiche APERTA il
    // contenuto supera il viewport e il main deve poter crescere — bloccato a
    // h-screen il globo strabordava visivamente fuori dal main (fondo del
    // globo/CASA irraggiungibili e firma "By" che finiva in mezzo al cielo).
    <main className="min-h-screen flex flex-col" style={{backgroundColor:"#060e1e"}}>
      <AppHeader/>

      <div className="container mx-auto px-4 py-6 flex-1 flex flex-col gap-6">
        {(() => {
          // Distanza: numero ed unità separati, così l'unità può essere resa
          // più piccola nella card (fmtDistance dà "34.812 km", oppure "—").
          const dist = fmtDistance(stats.km, distanceUnit);
          const distSpace = dist.lastIndexOf(" ");
          // Colore con una REGOLA, non a scacchiera: i conteggi sono blu,
          // l'ambra è riservata ai km perché sul globo le rotte sono ambra —
          // così il colore dice "questa è la strada percorsa". Prima blu e
          // ambra si alternavano senza significato (Paesi ambra, Città blu).
          const statItems = [
            { icon: <Plane  className="w-[18px] h-[18px]"/>, label: "Viaggi", value: stats.trips.toString(),     accent: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
            { icon: <Globe  className="w-[18px] h-[18px]"/>, label: "Paesi",  value: stats.countries.toString(), accent: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
            { icon: <MapPin className="w-[18px] h-[18px]"/>, label: "Città",  value: stats.cities.toString(),    accent: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
            { icon: <Route  className="w-[18px] h-[18px]"/>, label: "Totali",
              value: distSpace > 0 ? dist.slice(0, distSpace) : dist,
              unit: distSpace > 0 ? dist.slice(distSpace + 1) : undefined,
              accent: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
          ];
          return (
            <>
              {/* Statistiche a comparsa ovunque (desktop = mobile): chiuse di
                  default per non occupare spazio sopra il globo, si aprono 2×2
                  dalla maniglia. Prima su desktop erano 4 card sempre visibili. */}
              <div>
                <Collapsible open={statsOpen} onOpenChange={setStatsOpen}>
                  <CollapsibleTrigger asChild>
                    <button type="button" className="flex flex-col items-center w-full py-1.5 gap-0.5"
                      aria-label={statsOpen ? "Nascondi le tue statistiche" : "Mostra le tue statistiche"}>
                      <span style={{width:30,height:3,borderRadius:2,background:"rgba(255,255,255,0.25)"}}/>
                      {/* Etichetta VISIBILE, non solo aria-label: chi vede era
                          informato peggio di chi ascolta (maniglia muta). */}
                      <span style={{fontSize:9, letterSpacing:".08em", textTransform:"uppercase", color:"rgba(255,255,255,0.6)"}}>Statistiche</span>
                      <ChevronDown className="w-3 h-3 transition-transform" style={{ color:"rgba(255,255,255,0.6)", transform: statsOpen ? "rotate(180deg)" : "none" }}/>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="grid grid-cols-2 gap-2.5">
                      {statItems.map((item, i) => <StatCard key={item.label} {...item} i={i}/>)}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </>
          );
        })()}

        <div style={{ display:"flex", height:"calc(100vh - 220px)", minHeight:"460px", overflow:"hidden", transition:"all 0.3s ease" }}>
          {/* Globe */}
          <div style={{ flex:1, position:"relative", overflow:"hidden", transition:"all 0.3s ease" }}
            onMouseMove={(e) => {
              const drag = e.buttons === 1;
              starCtl.current?.pointerMove(e.clientX, e.clientY,
                drag ? e.movementX * 0.5 : 0, drag ? e.movementY * 0.5 : 0);
            }}
            onMouseLeave={() => starCtl.current?.pointerLeave()}
            onTouchStart={(e) => { const t = e.touches[0]; if (t) { lastTouchRef.current = { x: t.clientX, y: t.clientY }; starCtl.current?.pointerMove(t.clientX, t.clientY); } }}
            onTouchMove={(e) => {
              // Stesso parallax del mouse ma col dito: spostamento tra due
              // touchmove (il touch non ha movementX/Y), stesso fattore 0.5.
              // pointerMove aggiorna anche il NOME della costellazione più
              // vicina (prima su touch restava fermo → niente nomi).
              const t = e.touches[0]; if (!t) return;
              const last = lastTouchRef.current;
              starCtl.current?.pointerMove(t.clientX, t.clientY,
                last ? (t.clientX - last.x) * 0.5 : 0, last ? (t.clientY - last.y) * 0.5 : 0);
              lastTouchRef.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchEnd={() => { lastTouchRef.current = null; starCtl.current?.pointerLeave(); }}>
            <StarField controllerRef={starCtl} />
            <WorldMap
              trips={trips}
              selectedId={selectedId}
              onSelectTrip={(t) => setSelectedId(t.id)}
              onSelectCity={(city) => setSelectedCity(city)}
              autoRotateSetting={autoRotate}
              selectionOpen={!!selectedTrip}
            />

            {/* Primo avvio: senza viaggi il globo era muto (zeri e nessun
                invito). Card di benvenuto con la prima azione da fare. */}
            {trips.length === 0 && (
              <div style={{position:"absolute", inset:0, zIndex:25, display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none"}}>
                <div style={{
                  pointerEvents:"auto", width:"100%", maxWidth:320, margin:"0 16px",
                  background:"rgba(10,22,40,0.92)", border:"0.5px solid #1a2d4a",
                  borderRadius:16, padding:"24px 22px", textAlign:"center", backdropFilter:"blur(6px)",
                }}>
                  <div style={{width:48, height:48, borderRadius:"50%", background:"rgba(96,165,250,0.12)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px"}}>
                    <Plane style={{width:22, height:22, color:"#60a5fa"}}/>
                  </div>
                  <div className="font-display" style={{fontSize:15, fontWeight:700, color:"#f0f4ff"}}>Benvenuto su NAV·TA</div>
                  <p style={{fontSize:12, color:"rgba(255,255,255,0.6)", lineHeight:1.5, margin:"6px 0 16px"}}>
                    Aggiungi il tuo primo viaggio e guarda il globo prendere vita.
                  </p>
                  <button onClick={() => navigate("/nuovo-viaggio")}
                    style={{
                      width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                      fontSize:13, fontWeight:600, padding:"10px 0", borderRadius:999, cursor:"pointer",
                      background:"#60a5fa", border:"none", color:"#0a1628",
                    }}>
                    <Plus style={{width:14, height:14}}/> Aggiungi il primo viaggio
                  </button>
                  {!homeCity && (
                    <button onClick={() => navigate("/impostazioni")}
                      style={{marginTop:10, fontSize:11, background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.6)", textDecoration:"underline"}}>
                      Prima imposta la tua città di casa
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Mini-card del viaggio selezionato: flottante (non modale) così
                la rotta evidenziata sul globo resta visibile dietro. Zoom e
                legenda CASA si nascondono mentre è aperta (selectionOpen su
                WorldMap): a 390px si accavallavano ai suoi bottoni. */}
            {selectedTrip && (
              <div style={{position:"absolute", left:12, right:12, bottom:12, zIndex:30, display:"flex", justifyContent:"center", pointerEvents:"none"}}>
                <div style={{
                  pointerEvents:"auto", width:"100%", maxWidth:380,
                  background:"rgba(10,22,40,0.92)", border:"0.5px solid #1a2d4a",
                  borderRadius:14, padding:"12px 14px", backdropFilter:"blur(6px)",
                }}>
                  <div style={{display:"flex", alignItems:"flex-start", gap:10}}>
                    <div style={{width:26, height:26, borderRadius:"50%", overflow:"hidden", border:"1px solid rgba(255,255,255,0.1)", flexShrink:0}}>
                      {selectedTrip.country_code
                        ? <img src={"https://flagcdn.com/w80/"+selectedTrip.country_code.toLowerCase()+".png"} width="26" height="26" loading="lazy" style={{objectFit:"cover"}} alt=""/>
                        : <div style={{width:26, height:26, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14}}>🌍</div>}
                    </div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:13, fontWeight:700, color:"#f0f4ff", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
                        {selectedTrip.title && selectedTrip.title !== selectedTrip.city ? selectedTrip.title : selectedTrip.city}
                      </div>
                      {/* Con le tappe si legge l'itinerario, non solo l'arrivo:
                          prima un Milano→Trieste→Ljubljana→Vienna diceva
                          "Vienna, Austria" e le tappe di passaggio sparivano.
                          Senza tappe non c'è percorso da dire: resta città+paese.
                          E la catena VA A CAPO invece di troncarsi: l'ellipsis
                          si rimangiava l'arrivo ("Vienn…") — la card cresce di
                          una riga quando serve. */}
                      <div style={{fontSize:11, color:"rgba(255,255,255,0.6)", lineHeight:1.5}}>
                        {stopChain(selectedTrip) ?? `${selectedTrip.city}, ${selectedTrip.country}`}
                      </div>
                    </div>
                    <button onClick={() => setSelectedId(null)} aria-label="Chiudi scheda viaggio"
                      style={{width:24, height:24, background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.6)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0}}>
                      <X style={{width:14, height:14}}/>
                    </button>
                  </div>

                  <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", margin:"8px 0 10px"}}>
                    <span style={{fontSize:11, color:"rgba(255,255,255,0.55)", fontWeight:600}}>
                      {formatTripDate(selectedTrip.trip_date)}
                      {selectedTrip.date_end && selectedTrip.date_end !== selectedTrip.trip_date && (
                        <span style={{color:"rgba(255,255,255,0.6)", fontWeight:400}}> → {formatTripDate(selectedTrip.date_end)}</span>
                      )}
                    </span>
                    {isTransportMode(selectedTrip.transport_mode) && (
                      <span style={{
                        fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:99,
                        color: TRANSPORT[selectedTrip.transport_mode].color,
                        // "1f" in coda all'esadecimale = alpha ~0.12, come transportBg.
                        background: TRANSPORT[selectedTrip.transport_mode].color + "1f",
                      }}>
                        {TRANSPORT[selectedTrip.transport_mode].label}
                      </span>
                    )}
                    {(() => {
                      // Una sola invocazione (itera su tutti i waypoint), non due.
                      const km = tripTotalKm(selectedTrip);
                      return km > 0 && (
                        <span style={{fontSize:11, color:"rgba(255,255,255,0.6)"}}>{fmtDistance(km, distanceUnit)}</span>
                      );
                    })()}
                  </div>

                  <div style={{display:"flex", gap:8}}>
                    <button onClick={() => setFlyoverTrip(selectedTrip)}
                      style={{
                        flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                        fontSize:11, fontWeight:600, padding:"7px 0", borderRadius:999, cursor:"pointer",
                        background:"rgba(96,165,250,0.15)", border:"1px solid #60a5fa", color:"#60a5fa",
                      }}>
                      <Video style={{width:12, height:12}}/> Rivivi in 3D
                    </button>
                    <button onClick={() => navigate("/modifica-viaggio/"+selectedTrip.id)}
                      style={{
                        flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                        fontSize:11, fontWeight:600, padding:"7px 0", borderRadius:999, cursor:"pointer",
                        background:"rgba(255,255,255,0.06)", border:"0.5px solid #1a2d4a", color:"rgba(255,255,255,0.7)",
                      }}>
                      <Pencil style={{width:12, height:12}}/> Modifica
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>


        </div>
      </div>

      {selectedCity && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSelectedCity(null)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <div className="text-2xl">
                {selectedCity.country_code.length === 2
                  ? String.fromCodePoint(...selectedCity.country_code.toUpperCase().split("").map(c => 0x1f1e6 + c.charCodeAt(0) - 65))
                  : "🌍"}
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-base">{selectedCity.name}</h2>
                <p className="text-xs text-muted-foreground">{selectedCity.country}</p>
              </div>
              <button onClick={() => setSelectedCity(null)} aria-label="Chiudi scheda città"
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            {/* Actions */}
            <div className="p-3 flex flex-col gap-2">
              <button
                className="w-full btn-primary py-3 text-sm font-semibold flex items-center justify-center gap-2"
                onClick={() => {
                  if (selectedCity) {
                    sessionStorage.setItem("navta.prefill.city", JSON.stringify(selectedCity));
                  }
                  setSelectedCity(null);
                  navigate("/nuovo-viaggio");
                }}
              >
                <Plus className="w-4 h-4" /> Aggiungi come viaggio
              </button>

            </div>
          </div>
        </div>
      )}

      {flyoverTrip && <TripFlyover trips={[flyoverTrip]} onClose={() => setFlyoverTrip(null)} />}

          </main>
  );
}


export default function Home() {
  return <ErrorBoundary><HomeInner /></ErrorBoundary>;
}
