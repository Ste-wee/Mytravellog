// [FROZEN] — Non modificare senza esplicita richiesta
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useNavigate } from "react-router-dom";
import { fetchElevation, fetchTemperature, fetchRegion, fetchDrivingRoute, mergeRegions, distanceKm, GeoResult } from "@/lib/geo";
import { usePlaceSearch } from "@/lib/usePlaceSearch";
import { hasCoords } from "@/lib/coords";
import { followsRoad } from "@/lib/transport";
import { addTrip, loadTrips, formatTripDate, todayLocalISO, Trip } from "@/lib/storage";
import { trovaDuplicato } from "@/lib/duplicati";
import { createPortal } from "react-dom";
import { useSettings } from "@/lib/settings";
import { sequentialMap, moveItem } from "@/lib/utils";
import { toast } from "sonner";
import {
  TransportMode, Waypoint, ItineraryPanel, TripFormFields,
  TripFormActions, useUnsavedChangesGuard, isReturnBeforeDeparture,
} from "@/components/TripFormParts";
import { TripPurposeCompanions } from "@/components/TripPurposeCompanions";
import { CalendarClock, ArrowRight } from "lucide-react";

const NuovoViaggio = () => {
  const navigate = useNavigate();
  const s = useSettings();

  const [title, setTitle] = useState("");
  const [dateStart, setDateStart] = useState(() => todayLocalISO());
  const [dateEnd, setDateEnd] = useState("");
  // Note rimosse dal form (2026-08-20): il valore resta per il salvataggio
  // (i viaggi vecchi lo conservano); in un viaggio nuovo è sempre vuoto.
  const [notes] = useState("");
  const [rating, setRating] = useState(0);
  const [purpose, setPurpose] = useState<string | null>(null);
  const [companions, setCompanions] = useState<string[]>([]);
  // Prefill da un clic su una città della Home. L'initializer SOLO LEGGE: prima
  // faceva anche removeItem, ed era impuro — in StrictMode React invoca gli
  // initializer due volte, la prima (scartata) cancellava la chiave e la seconda
  // trovava null → prefill perso. La rimozione sta nell'effect qui sotto.
  // Tenuto qui (e non tutto in un effect) perché impostare i waypoint dopo il
  // mount farebbe scattare subito la guardia "modifiche non salvate".
  const [waypoints, setWaypoints] = useState<Waypoint[]>(() => {
    try {
      const raw = sessionStorage.getItem("navta.prefill.city");
      if (!raw) return [];
      const city = JSON.parse(raw);
      return [{
        id: crypto.randomUUID(),
        city: city.name,
        country: city.country,
        country_code: city.country_code ?? "",
        lat: city.latitude ?? 0,
        lon: city.longitude ?? 0,
        transport_mode: "plane" as TransportMode,
      }];
    } catch { return []; }
  });
  // Consuma il prefill: una volta montato il form, la città non deve ricomparire
  // al prossimo ingresso. Idempotente (StrictMode rimonta gli effect).
  useEffect(() => { try { sessionStorage.removeItem("navta.prefill.city"); } catch { /* storage negato */ } }, []);
  const [wpQuery, setWpQuery] = useState("");
  const [wpOpen, setWpOpen] = useState(false);
  const [wpTransport, setWpTransport] = useState<TransportMode>("plane");
  const homeCity = s.homeCity;
  const [home, setHome] = useState<{ lat: number; lon: number; label: string } | null>(
    homeCity ? { lat: homeCity.lat, lon: homeCity.lon, label: homeCity.label } : null
  );
  const [editingHome, setEditingHome] = useState(false);
  const [homeQuery, setHomeQuery] = useState(homeCity?.label ?? "");
  const [saving, setSaving] = useState(false);
  // Il viaggio già esistente che collide con quello in salvataggio (null = nessuno).
  const [duplicato, setDuplicato] = useState<Trip | null>(null);
  const [destinationError, setDestinationError] = useState(false);

  // Id di bozza, stabile per tutta la vita di questo form: prima le foto si
  // potevano aggiungere solo riaprendo il viaggio in Modifica dopo averlo già
  // salvato, perché le chiavi foto (photoStorage.ts) richiedono un id di
  // viaggio che addTrip generava solo al salvataggio. Generandolo qui e
  // passandolo ad addTrip (che ora lo accetta) invece di farne generare uno
  // nuovo, le foto caricate prima di "Salva viaggio" restano collegate.
  const draftIdRef = useRef<string | null>(null);
  if (draftIdRef.current === null) draftIdRef.current = crypto.randomUUID();
  const draftId = draftIdRef.current;

  const { confirmDiscard } = useUnsavedChangesGuard([title, dateStart, dateEnd, notes, rating, purpose, companions, waypoints, home]);

  // Le due ricerche (residenza e mete) vivono in usePlaceSearch: debounce,
  // guardia anti-race e scelta della fonte sono scritti UNA volta sola.
  // ignora: aprendo ✎ la query parte già uguale all'etichetta corrente e
  // senza guardia si cercava subito "Milano, Italia" aprendo una lista inutile
  // (stessa semantica di Impostazioni).
  const { results: homeResults, clear: clearHomeResults } = usePlaceSearch(homeQuery, { ignora: home?.label ?? null });
  const { results: wpResults, loading: wpLoading, clear: clearWpResults } = usePlaceSearch(wpQuery, { luoghi: true, limite: 5 });

  const addWaypoint = (r: GeoResult) => {
    setWaypoints(prev => [...prev, {
      id: crypto.randomUUID(),
      city: r.name, country: r.country, country_code: r.country_code ?? "",
      lat: r.latitude, lon: r.longitude, transport_mode: wpTransport,
    }]);
    setWpQuery(""); clearWpResults(); setWpOpen(false);
    setDestinationError(false);
  };

  const removeWaypoint = (i: number) => setWaypoints(prev => prev.filter((_, idx) => idx !== i));
  const moveWaypoint = (from: number, to: number) =>
    setWaypoints(prev => moveItem(prev, from, to));
  const changeTransport = (i: number, mode: TransportMode) =>
    setWaypoints(prev => prev.map((w, idx) => idx === i ? { ...w, transport_mode: mode } : w));

  // Data di partenza nel futuro: quasi certamente l'utente sta PROGRAMMANDO un
  // viaggio, non registrando un ricordo (salvarlo qui sporcherebbe statistiche
  // e globo). Il banner sotto le date lo porta alla mini-form di "In programma"
  // trasferendo quanto già compilato (titolo, destinazione, date) via
  // sessionStorage — stesso pattern di navta.prefill.city.
  const goToPlanner = () => {
    sessionStorage.setItem("navta.prefill.plan", JSON.stringify({
      title: title.trim() || undefined,
      dateStart, dateEnd: dateEnd || undefined,
      // TUTTE le tappe coi loro mezzi (l'ultima è la meta): il piano le
      // conserva intere, niente si perde nel passaggio.
      waypoints: waypoints.length ? waypoints.map(w => ({
        id: w.id, city: w.city, country: w.country, country_code: w.country_code,
        lat: w.lat, lon: w.lon, transport_mode: w.transport_mode,
      })) : undefined,
    }));
    navigate("/in-programma");
  };

  const handleSave = async (ignoraDuplicato = false) => {
    if (waypoints.length === 0) {
      setDestinationError(true);
      toast.error("Aggiungi almeno una città all'itinerario");
      return;
    }
    if (isReturnBeforeDeparture(dateStart, dateEnd)) {
      toast.error("Il ritorno non può essere prima della partenza");
      return;
    }
    // Doppioni: stesso posto, date che si sovrappongono (è successo davvero:
    // due Zurigo identici da due risultati di ricerca diversi, zero avvisi).
    // Il controllo sta PRIMA delle fetch: l'avviso deve essere immediato.
    if (!ignoraDuplicato) {
      const doppione = trovaDuplicato(loadTrips(), waypoints[waypoints.length - 1].city, dateStart, dateEnd || null);
      if (doppione) { setDuplicato(doppione); return; }
    }
    setDuplicato(null);
    // Senza partenza il viaggio non produce nessuna tratta e sparirebbe da
    // globo, poster dell'anno e mappa della vita. Normalmente c'è già (la
    // città è obbligatoria all'avvio), ma qui la si può anche togliere.
    if (!home) {
      toast.error("Indica da dove parti: tocca la casa nell'itinerario");
      return;
    }
    setSaving(true);
    try {
    const dest = waypoints[waypoints.length - 1];
    const settHome = s.homeCity;
    // La casa dell'ITINERARIO vince su quella delle Impostazioni: è quella che
    // viene salvata (home_latitude) e da cui partono le rotte, quindi distanze
    // e origine del percorso devono usare la stessa. (Prima `settHome ?? home`
    // ignorava una casa cambiata nel form.)
    const distHome = home ?? settHome;
    // Sum all segments: home → waypoint1 → waypoint2 → ... → destination
    let dist: number | null = null;
    if (distHome) {
      const points: { lat: number; lon: number }[] = [
        { lat: distHome.lat, lon: distHome.lon },
        ...waypoints.slice(0, -1).filter(w => hasCoords(w.lat, w.lon)).map(w => ({ lat: w.lat, lon: w.lon })),
        { lat: dest.lat, lon: dest.lon },
      ];
      dist = 0;
      for (let i = 1; i < points.length; i++) {
        dist += distanceKm(points[i-1].lat, points[i-1].lon, points[i].lat, points[i].lon);
      }
    }
    // Max distance from home reached at any point in the trip
    let maxDist: number | null = null;
    let maxDistCity: string | null = null;
    if (distHome) {
      const allStops = [
        ...waypoints.slice(0, -1).filter(w => hasCoords(w.lat, w.lon)).map(w => ({ lat: w.lat, lon: w.lon, city: w.city })),
        { lat: dest.lat, lon: dest.lon, city: dest.city },
      ];
      const distances = allStops.map(p => ({ city: p.city, d: distanceKm(distHome.lat, distHome.lon, p.lat, p.lon) }));
      const max = distances.reduce((a, b) => b.d > a.d ? b : a);
      maxDist = max.d;
      maxDistCity = max.city;
    }
    const allStopsWithCoords = [
      ...waypoints.slice(0, -1).filter(w => hasCoords(w.lat, w.lon)).map(w => ({ city: w.city, lat: w.lat, lon: w.lon })),
      { city: dest.city, lat: dest.lat, lon: dest.lon },
    ];
    // Percorso stradale reale per ogni tratta in auto (home→tappa1→...→destinazione),
    // invece della linea retta. waypoints[i] rappresenta "come sono arrivato qui",
    // quindi il percorso va da prevPt (la tappa precedente, o casa per la prima) a
    // waypoints[i]. Ricade su null (linea retta) se manca casa o la chiamata fallisce.
    // distHome (itinerario ?? Impostazioni), come ModificaViaggio: con `home`
    // nudo, se la casa arrivava solo dai settings le distanze c'erano ma le
    // route stradali no — record incoerente tra i due form gemelli.
    let prevPt: { lat: number; lon: number } | null = distHome ? { lat: distHome.lat, lon: distHome.lon } : null;
    const routePromises = waypoints.map((wp) => {
      const p = prevPt;
      prevPt = hasCoords(wp.lat, wp.lon) ? { lat: wp.lat, lon: wp.lon } : prevPt;
      // Bici, moto e pullman seguono la strada reale esattamente come l'auto
      // (richiesta esplicita: stesso "stile di viaggio" della macchina).
      if (followsRoad(wp.transport_mode) && p && hasCoords(wp.lat, wp.lon)) {
        return fetchDrivingRoute(p.lat, p.lon, wp.lat, wp.lon);
      }
      return Promise.resolve(null);
    });
    const routeGeometriesPromise = Promise.all(routePromises);
    // fetchRegion interroga Nominatim, che nella sua usage policy chiede non
    // più di 1 richiesta/secondo: le tappe vanno sequenziate (sequentialMap),
    // non sparate in Promise.all, altrimenti un viaggio con molte tappe
    // rischia un rate-limit silenzioso con alcune tappe senza regione.
    // fetchTemperature/fetchElevation (Open-Meteo, nessun limite simile)
    // restano invece in parallelo tra loro e rispetto alle chiamate a Nominatim.
    const [stopRegions, stopTemps, stopAlts] = await Promise.all([
      sequentialMap(allStopsWithCoords, s => fetchRegion(s.lat, s.lon)),
      Promise.all(allStopsWithCoords.map(s => fetchTemperature(s.lat, s.lon, dateStart, dateEnd || null))),
      Promise.all(allStopsWithCoords.map(s => fetchElevation(s.lat, s.lon))),
    ]);
    const routeGeometries = await routeGeometriesPromise;
    // Un viaggio multi-tappa può attraversare più regioni: raccogliamo quelle di
    // ogni tappa (deduplicate per codice ISO, non solo quella della destinazione).
    const regionDetails = mergeRegions(stopRegions);
    const region = regionDetails.length > 0 ? regionDetails.map(r => r.name).join(", ") : null;
    const alt = stopAlts[stopAlts.length - 1] ?? null; // altitudine della destinazione (per-trip badge)
    const temp = stopTemps[stopTemps.length - 1] ?? null;
    const tempsWithCity = allStopsWithCoords.map((s, i) => ({ city: s.city, temp: stopTemps[i] as number | null })).filter(x => x.temp != null);
    const hottestStop = tempsWithCity.length ? tempsWithCity.reduce((a, b) => (b.temp! > a.temp! ? b : a)) : null;
    const coldestStop = tempsWithCity.length ? tempsWithCity.reduce((a, b) => (b.temp! < a.temp! ? b : a)) : null;
    const altsWithCity = allStopsWithCoords.map((s, i) => ({ city: s.city, alt: stopAlts[i] as number | null })).filter(x => x.alt != null);
    const highestStop = altsWithCity.length ? altsWithCity.reduce((a, b) => (b.alt! > a.alt! ? b : a)) : null;
    addTrip({
      title: title.trim() || dest.city,
      // (id passato sotto, non qui: vedi il commento su draftId)
      country: dest.country, city: dest.city,
      trip_date: dateStart, date_end: dateEnd || null,
      notes: notes.trim() || null,
      transport_mode: dest.transport_mode,
      waypoints: waypoints.slice(0, -1).map((w, i) => ({ id: w.id, city: w.city, country: w.country, country_code: w.country_code, transport_mode: w.transport_mode, lat: w.lat, lon: w.lon, route_geometry: routeGeometries[i] ?? null })),
      latitude: dest.lat, longitude: dest.lon,
      route_geometry: routeGeometries[routeGeometries.length - 1] ?? null,
      home_latitude: home?.lat ?? null, home_longitude: home?.lon ?? null, home_label: home?.label ?? null,
      distance_from_home_km: dist, max_distance_from_home_km: maxDist, max_distance_city: maxDistCity, altitude_m: alt, max_altitude_m: highestStop?.alt ?? null, max_altitude_city: highestStop?.city ?? null, temperature_c: temp, hottest_temp_c: hottestStop?.temp ?? null, hottest_city: hottestStop?.city ?? null, coldest_temp_c: coldestStop?.temp ?? null, coldest_city: coldestStop?.city ?? null, region: region ?? null, region_details: regionDetails.length > 0 ? regionDetails : null,
      country_code: dest.country_code, rating: rating || null,
      purpose: purpose || undefined, companions: companions.length ? companions : undefined,
    }, draftId);
    toast.success("Viaggio salvato!");
    navigate("/");
    } finally {
      // try/finally invece di un setSaving(false) a fine funzione: se una
      // delle chiamate sopra dovesse lanciare per un motivo imprevisto (le
      // fetch verso le API esterne catturano già tutto internamente, ma
      // meglio non fidarsi ciecamente), il form non deve restare bloccato
      // per sempre sullo spinner.
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#060e1e", display:"flex", flexDirection:"column" }}>
      {/* Header */}
      <AppHeader/>

      {/* Main layout: itinerario hero sinistra, form destra (impilati su mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-stretch"
        style={{ maxWidth:1200, margin:"0 auto", width:"100%", padding:"32px 24px 8px" }}>

        {/* LEFT — Itinerario hero */}
        <ItineraryPanel
          waypoints={waypoints} home={home}
          onEditHome={() => { setEditingHome(v => !v); setHomeQuery(home?.label ?? ""); }}
          editingHome={editingHome}
          homeQuery={homeQuery} setHomeQuery={setHomeQuery}
          homeResults={homeResults}
          onSelectHome={r => {
            setHome({ lat:r.latitude, lon:r.longitude, label:`${r.name}, ${r.country}` });
            setHomeQuery(`${r.name}, ${r.country}`);
            clearHomeResults(); setEditingHome(false);
          }}
          onRemoveWaypoint={removeWaypoint}
          onChangeTransport={changeTransport}
          onMoveWaypoint={moveWaypoint}
          wpTransport={wpTransport} setWpTransport={setWpTransport}
          wpOpen={wpOpen} setWpOpen={setWpOpen}
          wpQuery={wpQuery} setWpQuery={setWpQuery}
          wpResults={wpResults} wpLoading={wpLoading}
          onAddWaypoint={addWaypoint}
          destinationError={destinationError}
        />

        {/* RIGHT — Form compatto */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <TripFormFields
            title={title} setTitle={setTitle}
            dateStart={dateStart} setDateStart={setDateStart}
            dateEnd={dateEnd} setDateEnd={setDateEnd}
            rating={rating} setRating={setRating}
          />

          {/* Avviso "data futura" → In programma (vedi goToPlanner). */}
          {dateStart > todayLocalISO() && (
            <button type="button" onClick={goToPlanner}
              style={{
                display:"flex", alignItems:"center", gap:8, width:"100%", textAlign:"left",
                background:"rgba(251,191,36,0.10)", border:"0.5px solid rgba(251,191,36,0.35)",
                borderRadius:10, padding:"9px 12px", cursor:"pointer", color:"#f0f4ff", fontSize:12,
              }}>
              <CalendarClock style={{width:15,height:15,color:"#fbbf24",flexShrink:0}}/>
              <span style={{flex:1,minWidth:0}}>Data futura: è un viaggio in programma?</span>
              <span style={{flexShrink:0,display:"inline-flex",alignItems:"center",gap:4,color:"#93c5fd",fontWeight:600}}>
                Programmalo <ArrowRight style={{width:12,height:12}}/>
              </span>
            </button>
          )}

          <TripPurposeCompanions purpose={purpose} setPurpose={setPurpose} companions={companions} setCompanions={setCompanions}/>

          <TripFormActions saving={saving} confirmDiscard={confirmDiscard} onSave={() => handleSave()}/>
        </div>
      </div>

      {/* Avviso doppione — in createPortal sul body: un position:fixed dentro
          un antenato con transform si ancora all'antenato, non allo schermo
          (lezione della card Home). */}
      {duplicato && createPortal(
        <div role="alertdialog" aria-label="Esiste già un viaggio simile"
          style={{ position:"fixed", left:12, right:12, bottom:16, zIndex:130, background:"#0b1524",
            border:"0.5px solid #b45309", borderRadius:16, padding:16, boxShadow:"0 12px 40px rgba(0,0,0,0.5)",
            maxWidth:560, margin:"0 auto" }}>
          <div style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:12 }}>
            <span aria-hidden style={{ fontSize:17 }}>⚠️</span>
            <span>
              <span style={{ display:"block", fontSize:14, fontWeight:700, color:"#f0f4ff", marginBottom:3 }}>
                Esiste già un viaggio a {duplicato.city}
              </span>
              <span style={{ display:"block", fontSize:12, color:"rgba(255,255,255,0.55)", lineHeight:1.45 }}>
                {formatTripDate(duplicato.trip_date)}{duplicato.date_end ? ` → ${formatTripDate(duplicato.date_end)}` : ""}.
                Vuoi aprirlo invece di crearne un altro?
              </span>
            </span>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button type="button" onClick={() => { setDuplicato(null); handleSave(true); }}
              style={{ flex:1, padding:11, borderRadius:10, background:"transparent",
                border:"0.5px solid #1a2d4a", color:"rgba(255,255,255,0.65)", fontSize:13, fontWeight:600, cursor:"pointer" }}>
              Salva lo stesso
            </button>
            <button type="button" onClick={() => navigate(`/modifica-viaggio/${duplicato.id}`)}
              style={{ flex:1, padding:11, borderRadius:10, background:"#60a5fa", border:"none",
                color:"#0a1628", fontSize:13, fontWeight:700, cursor:"pointer" }}>
              Apri quello
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default NuovoViaggio;
