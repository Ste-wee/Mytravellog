// [FROZEN] — Non modificare senza esplicita richiesta
import { AppHeader } from "@/components/AppHeader";
import { useEffect, useMemo, useRef, useState, Component, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { loadTrips, updateTrip, formatTripDate, pulisciSepolti, Trip } from "@/lib/storage";
import { distanceKm } from "@/lib/geo";
import { hasCoords } from "@/lib/coords";
import { tripTotalKm } from "@/lib/flyover";
import { stopChain } from "@/lib/stops";
import { paeseVisibileDiViaggio, paeseVisibileDiTappa } from "@/lib/paesi";
import { separaGite } from "@/lib/gite";
import { ricalcolaTemperature } from "@/lib/ricalcolaTemperature";
import { ricalcolaTracciati } from "@/lib/ricalcolaTracciati";
import { recuperaDatiMancanti } from "@/lib/recuperaDatiMancanti";
import { fmtDistance, fmtNumber, useSettings, useT } from "@/lib/settings";
import { TRANSPORT, isTransportMode } from "@/lib/transport";
import { Route, Globe, MapPin, Pencil, Plane, Plus, Sun, Video, X } from "lucide-react";
import { WorldMap, CityInfo } from "@/components/WorldMap";
import { StarField, StarFieldController } from "@/components/StarField";
import { TripFlyover } from "@/components/TripFlyover";


/**
 * Ogni viaggio tocca anche i paesi/città delle tappe intermedie (waypoint),
 * non solo la destinazione finale (stessa logica di StatsSection.tsx).
 */
export function computeHomeStats(allTrips: Trip[]) {
  // Le gite in giornata stanno FUORI da tutti i conti (scelta di Stefano,
  // 2026-08-24): hanno la loro riga qui sotto. Vedi lib/gite.ts per il perché.
  const { viaggi: trips, gite } = separaGite(allTrips);
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
    // Dentro il Regno Unito conta la NAZIONE (Scozia, Galles...): stessa
    // regola dell'elenco in Statistiche, che legge la stessa funzione.
    const p = paeseVisibileDiViaggio(t);
    addCountry(p.nome, p.codice ?? undefined);
    cities.add(`${t.city}|${t.country}`);
    for (const w of t.waypoints ?? []) {
      // Le tappe britanniche di un viaggio scozzese sono in Scozia: senza
      // questa eredità lo stesso viaggio contava Scozia E Regno Unito.
      const pw = paeseVisibileDiTappa(w, p);
      addCountry(pw.nome, pw.codice ?? undefined);
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
  // Le gite: contate a parte, con le SOLE città che non hai visto in nessun
  // viaggio vero (Torino vista solo in gita conta 1; Roma vista anche in un
  // viaggio vero non si conta due volte). La riga della Home resta a QUATTRO
  // voci — cinque vanno a capo su un telefono — e le gite vivono nella riga
  // sotto, che è dichiarata e quindi non sembra un errore.
  const cittaSoloInGita = new Set<string>();
  for (const g of gite) {
    const suoi = [`${g.city}|${g.country}`, ...(g.waypoints ?? []).map(w => `${w.city}|${w.country}`)];
    for (const c of suoi) if (!cities.has(c)) cittaSoloInGita.add(c);
  }
  return {
    trips: trips.length, countries: countries.size, cities: cities.size, km,
    gite: gite.length,
    giteCitta: cittaSoloInGita.size,
    giteKm: gite.reduce((s, t) => s + tripTotalKm(t), 0),
  };
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

// NB storico: qui viveva StatCard, la card 2×2 del cassetto "Statistiche".
// Il cassetto è stato sostituito da una riga-sommario sotto il globo (vedi
// più giù): quattro icone con i numeri, sempre visibile, che porta alla
// pagina Statistiche invece di duplicarla. Il commento sull'anti-pattern del
// componente-nel-render vive ora in memoria e in StarField.

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
  const { distanceUnit, autoRotate, homeCity, minMarkerScale, maxMarkerScale } = useSettings();
  const t = useT();
  // Inizializzato in modo sincrono (localStorage) invece che [] + effect:
  // così l'invito di benvenuto per chi non ha viaggi non lampeggia mai
  // per un frame agli utenti che invece ne hanno.
  const [trips, setTrips] = useState<Trip[]>(() => loadTrips());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Il globo mostra i paesi visitati (con bandiere) invece dei pallini dei
   *  viaggi. Si accende scorrendo il dito verso l'alto sulla riga dei numeri,
   *  o toccandola; si spegne allo stesso modo. */
  const [modalitaPaesi, setModalitaPaesi] = useState(false);


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

  // Una volta sola: riporta i viaggi già salvati al criterio nuovo della
  // temperatura (l'estremo del periodo invece della media del primo giorno).
  // In sottofondo e senza bloccare nulla; se la Home se ne va prima della
  // fine, il flag non viene scritto e si riprende al prossimo avvio.
  useEffect(() => {
    let annullato = false;
    // Prima di tutto, a costo zero e senza rete: butta via i record già
    // sepolti rimasti nell'archivio. Sono invisibili nell'app ma pesano nel
    // dato e finiscono nel backup — e chi aggiorna l'app può averne in pancia
    // da prima che la scrittura imparasse a scartarli.
    const buttati = pulisciSepolti();
    if (buttati > 0) refresh();
    // Poi le temperature, poi i tracciati mancanti: entrambi girano in fila,
    // per non aprire due raffiche di rete insieme.
    ricalcolaTemperature(() => annullato)
      .then(n => { if (n > 0 && !annullato) refresh(); })
      .then(() => ricalcolaTracciati(() => annullato))
      .then(n => { if (n && n > 0 && !annullato) refresh(); })
      // Ultimo della fila: completa i viaggi a cui manca temperatura,
      // altitudine o regione perché al salvataggio la rete non c'era. Le
      // altre due reti si occupano di dati che esistono e vanno aggiornati;
      // questa dei buchi, e a differenza della migrazione qui sopra non si
      // chiude mai alle spalle (memoria per viaggio, non un flag globale).
      .then(() => recuperaDatiMancanti(() => annullato))
      .then(n => { if (n && n > 0 && !annullato) refresh(); })
      .catch(() => { /* rete giù a metà catena: si riprende al prossimo avvio */ });
    return () => { annullato = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      <div className="container mx-auto px-4 pt-6 pb-2 flex-1 flex flex-col gap-6">
        <div style={{ display:"flex", flex:"1 1 auto", minHeight:"460px", overflow:"hidden", transition:"all 0.3s ease" }}>
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
              minMarkerScale={minMarkerScale}
              maxMarkerScale={maxMarkerScale}
              selectionOpen={!!selectedTrip}
              modalitaPaesi={modalitaPaesi}
            />

            {/* Velo che scioglie il bordo inferiore del cielo nel fondo pagina:
                senza, su desktop il contenitore tagliava stelle e scia con una
                riga netta. Solo CSS in overlay (pointer-events none): il
                rendering WebGL di globo e stelle non viene toccato. */}
            <div aria-hidden style={{ position:"absolute", left:0, right:0, bottom:0, height:64,
              background:"linear-gradient(to bottom, rgba(6,14,30,0), #060e1e)",
              pointerEvents:"none", zIndex:5 }}/>

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
                  <div className="font-display" style={{fontSize:15, fontWeight:700, color:"#f0f4ff"}}>{t("Benvenuto su NAV·TA")}</div>
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
                    <button onClick={() => setSelectedId(null)} aria-label={t("Chiudi scheda viaggio")}
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
                      <Video style={{width:12, height:12}}/> {t("Rivivi in 3D")}
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

        {/* Sommario sotto il globo — sostituisce il cassetto "Statistiche" a
            comparsa (4 card 2×2). Perché: aperto spingeva il globo 118px sotto
            la piega per mostrare quattro numeri, richiedeva un gesto ogni
            volta, e duplicava paesi e km che la pagina Statistiche già mostra.
            Qui i numeri si vedono SEMPRE, a costo zero, e il tocco porta
            all'approfondimento invece di ripeterlo: sommario → dettaglio.
            Solo icone e numeri, niente parole: coi valori grandi
            (24 · 37 · 152 · 145.678 km) icone+parole strabordano a 390px. */}
        {stats.trips > 0 && (() => {
          // I dati stanno NELL'aria-label, non in testi nascosti dentro il
          // bottone: l'aria-label SOSTITUISCE il contenuto per lo screen
          // reader, quindi con gli sr-only dentro si sentiva solo "vai alla
          // pagina Statistiche" — i numeri sparivano proprio a chi non li vede.
          const voce = [
            t(stats.trips === 1 ? "{quanti} viaggio" : "{quanti} viaggi", { quanti: stats.trips }),
            // Le stesse quattro voci della riga, né una di più: chi ascolta
            // deve sentire quello che gli altri vedono.
            t(stats.countries === 1 ? "{quanti} paese" : "{quanti} paesi", { quanti: stats.countries }),
            t("{quanti} città", { quanti: stats.cities }),
            t("{quanti} percorsi", { quanti: fmtDistance(stats.km, distanceUnit) }),
          ].join(", ");
          // La riga dei numeri È l'interruttore: un tocco accende i paesi con
          // le bandiere, un altro torna ai viaggi. Niente maniglia né scritta
          // d'aiuto sotto il globo (scelta di Stefano: erano 20px di testo per
          // spiegare un tocco). Il senso lo porta l'aria-label, che cambia con
          // lo stato e serve anche allo screen reader.
          return (
          <button type="button" onClick={() => setModalitaPaesi(v => !v)}
            aria-label={modalitaPaesi
              ? t("Le tue statistiche: {voce}. Torna ai pallini dei viaggi sul globo", { voce })
              : t("Le tue statistiche: {voce}. Mostra sul globo i paesi che hai visitato", { voce })}
            style={{ display:"flex", alignItems:"center", justifyContent:"center", flexWrap:"wrap",
              gap:12, width:"100%", padding:"9px 12px", background:"none", border:"none", cursor:"pointer" }}>
            {[
              { Icona: Plane,  valore: fmtNumber(stats.trips),     chiave:"viaggi", colore:"#f0f4ff", iconaColore:"#60a5fa" },
              // QUATTRO voci, sempre le stesse: viaggi, paesi, citta`, km.
              // Per un giro ne avevo messe cinque, aggiungendo le gite in
              // giornata: prima AL POSTO delle citta` (Stefano se n'e` accorto
              // subito), poi accanto. Ma cinque voci vanno a capo su un
              // telefono da 390px (misurato: 75px di riga invece di 41), e
              // questa riga e` il colpo d'occhio della Home. Le gite si
              // contano dove c'e` spazio per spiegarle: nell'elenco
              // "I miei viaggi" e in "Come viaggi" dentro Statistiche.
              { Icona: Globe,  valore: fmtNumber(stats.countries), chiave:"paesi",  colore:"#f0f4ff", iconaColore:"#60a5fa" },
              { Icona: MapPin, valore: fmtNumber(stats.cities),    chiave:"citta",  colore:"#f0f4ff", iconaColore:"#60a5fa" },
              // L'ambra è dei km, come le rotte sul globo (regola di colore
              // dell'app: blu = conteggi, ambra = strada percorsa).
              { Icona: Route,  valore: fmtDistance(stats.km, distanceUnit), chiave:"km", colore:"#fbbf24", iconaColore:"#fbbf24" },
            ].map(({ Icona, valore, chiave, colore, iconaColore }, i) => (
              <span key={chiave} style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
                {i > 0 && <span aria-hidden style={{ width:3, height:3, borderRadius:"50%", background:"rgba(255,255,255,0.25)", marginRight:7 }}/>}
                {/* Tutto il contenuto è muto per lo screen reader (aria-hidden
                    sulle icone, numeri senza etichetta): il senso lo porta
                    l'aria-label del bottone qui sopra, che li elenca a parole. */}
                <Icona className="w-[13px] h-[13px]" style={{ color: iconaColore }} aria-hidden/>
                <b className="font-mono" style={{ fontSize:15, fontWeight:700, color: colore }}>{valore}</b>
              </span>
            ))}
          </button>
          );
        })()}

        {/* Le gite in giornata: una riga dichiarata, fuori dai quattro numeri.
            Prima erano un'incoerenza silenziosa (fuori dal conteggio viaggi,
            dentro città e km): scelta di Stefano il 2026-08-24, le gite hanno
            una casa loro. Le città contate qui sono SOLO quelle che nessun
            viaggio vero tocca, così il totale sopra più questo non conta due
            volte lo stesso posto. Compare solo se ne hai. */}
        {stats.gite > 0 && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6,
            padding:"0 12px 8px", fontSize:11.5, color:"rgba(255,255,255,0.5)" }}>
            <Sun className="w-[12px] h-[12px]" style={{ color:"#fbbf24" }} aria-hidden/>
            <span>
              {/* «e inoltre» presuppone qualcosa PRIMA: con soli viaggi in
                  giornata la riga dei quattro numeri non c'è (sarebbero quattro
                  zeri) e il connettivo restava appeso al nulla — visto in
                  revisione, a schermo diceva «e inoltre 2 gite» come prima
                  cosa della pagina. */}
              {(() => {
                const quante = t(stats.gite === 1 ? "{quante} gita in giornata" : "{quante} gite in giornata", { quante: stats.gite });
                return stats.trips > 0 ? t("e inoltre {gite}", { gite: quante }) : quante;
              })()}
              {stats.giteCitta > 0 && " · " + t("{quante} città", { quante: stats.giteCitta })}
              {stats.giteKm >= 1 && ` · ${fmtDistance(stats.giteKm, distanceUnit)}`}
            </span>
          </div>
        )}
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
              <button onClick={() => setSelectedCity(null)} aria-label={t("Chiudi scheda città")}
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
