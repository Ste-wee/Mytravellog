// [FROZEN] — Non modificare senza esplicita richiesta
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { TripCardTicket } from "@/components/TripCardTicket";
import { TripFlyover } from "@/components/TripFlyover";
import { PlanCard } from "@/components/PlanCard";
import { TripPlanner } from "@/components/TripPlanner";
import { loadTrips, loadPlans, deleteTrip, parseLocalDate, Trip } from "@/lib/storage";
import { deletePhotosForTrip } from "@/lib/photoStorage";
import { Search, X, Video, Plane, Plus, Sparkles, Globe2, CalendarClock, ArrowRight } from "lucide-react";

const DELETE_ANIM_MS = 200;
// Finestra di tempo in cui "Annulla" nel toast può ancora recuperare il
// viaggio: l'eliminazione vera e propria (storage + foto) resta sospesa
// fino ad allora, così una cancellazione per errore non è mai definitiva.
const UNDO_GRACE_MS = 5000;

export default function MieiViaggi() {
  const [trips, setTrips] = useState<Trip[]>([]);
  // Viaggi "in programma": vivono in un bucket separato (fuori da statistiche,
  // globo e recap) ma si vedono e si aprono QUI, in cima ai ricordi.
  const [plans, setPlans] = useState<Trip[]>([]);
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<string | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [flyoverYear, setFlyoverYear] = useState<string | null>(null);
  const [showLifeMap, setShowLifeMap] = useState(false);
  // Nome del compagno di cui mostrare la costellazione condivisa (null = chiusa).
  const [companionMap, setCompanionMap] = useState<string | null>(null);
  const pendingDeletesRef = useRef<Map<string, {
    animTimer: ReturnType<typeof setTimeout>;
    commitTimer: ReturnType<typeof setTimeout>;
    toastId: string | number;
    trip: Trip;
  }>>(new Map());

  useEffect(() => { setTrips(loadTrips()); setPlans(loadPlans()); }, []);
  useEffect(() => {
    // Le cancellazioni "in sospeso" (in attesa che scada la finestra per
    // l'Annulla) vanno eseguite subito quando la pagina se ne va, in ENTRAMBI
    // i modi possibili: navigazione SPA (cleanup di smontaggio) E chiusura
    // tab / refresh (pagehide — React NON esegue i cleanup su unload, quindi
    // senza questo listener un viaggio "eliminato" con conferma risorgeva al
    // prossimo avvio se si chiudeva il tab entro i 5 secondi).
    const flushPending = () => {
      pendingDeletesRef.current.forEach(({ animTimer, commitTimer, toastId, trip }) => {
        clearTimeout(animTimer);
        clearTimeout(commitTimer);
        toast.dismiss(toastId);
        deleteTrip(trip.id);
        deletePhotosForTrip(trip);
      });
      pendingDeletesRef.current.clear();
    };
    window.addEventListener("pagehide", flushPending);
    return () => {
      window.removeEventListener("pagehide", flushPending);
      flushPending();
    };
  }, []);

  const commitDelete = (trip: Trip) => {
    deleteTrip(trip.id);
    deletePhotosForTrip(trip);
    pendingDeletesRef.current.delete(trip.id);
  };

  const undoDelete = (trip: Trip) => {
    const pending = pendingDeletesRef.current.get(trip.id);
    if (!pending) return; // la finestra per l'Annulla è già scaduta: niente da recuperare
    // Anche il timer dell'animazione: un Annulla immediato (entro i 200ms)
    // non deve comunque far sparire la card dalla lista.
    clearTimeout(pending.animTimer);
    clearTimeout(pending.commitTimer);
    pendingDeletesRef.current.delete(trip.id);
    setLeavingId(prev => (prev === trip.id ? null : prev));
    // Re-inserito nell'ordine giusto (stesso criterio di loadTrips: data decrescente).
    setTrips(prev => prev.some(t => t.id === trip.id)
      ? prev
      : [...prev, trip].sort((a, b) => b.trip_date.localeCompare(a.trip_date)));
  };

  // Mostra prima la card che sta uscendo (opacity+scale via CSS), poi la
  // rimuove dalla lista visibile — senza cancellarla ancora da storage,
  // per lasciare tempo all'eventuale "Annulla" nel toast.
  const handleDeleteRequested = (trip: Trip) => {
    // La card resta cliccabile durante l'animazione di uscita: una seconda
    // conferma non deve creare un secondo timer orfano.
    if (pendingDeletesRef.current.has(trip.id)) return;

    setLeavingId(trip.id);
    const animTimer = setTimeout(() => {
      setTrips(prev => prev.filter(t => t.id !== trip.id));
      setLeavingId(prev => (prev === trip.id ? null : prev));
    }, DELETE_ANIM_MS);

    const commitTimer = setTimeout(() => commitDelete(trip), UNDO_GRACE_MS);

    const toastId = toast(`"${trip.title || trip.city}" eliminato`, {
      duration: UNDO_GRACE_MS,
      action: { label: "Annulla", onClick: () => undoDelete(trip) },
    });
    pendingDeletesRef.current.set(trip.id, { animTimer, commitTimer, toastId, trip });
  };

  // parseLocalDate, non new Date(iso): la stringa date-only è parsata in UTC e
  // nei fusi negativi (Americhe) un viaggio del 1° gennaio finiva nell'anno prima.
  const tripYear = (t: Trip) => {
    if (!t.trip_date) return "—";
    const y = parseLocalDate(t.trip_date).getFullYear();
    // Data malformata → getFullYear() NaN → chip filtro e intestazione "NaN".
    return Number.isFinite(y) ? y.toString() : "—";
  };

  // Anni disponibili calcolati su tutti i viaggi (non sui filtrati): i chip
  // restano stabili mentre si scrive nella ricerca, invece di sparire.
  const allYears = Array.from(new Set(trips.map(tripYear))).sort((a, b) => b.localeCompare(a));

  // Anche le tappe intermedie e le note: prima "Firenze" non trovava un
  // viaggio in cui Firenze era solo una tappa (e non la destinazione), pur
  // essendo l'app pensata per i multi-tappa.
  const matchesSearch = (t: Trip, q: string) => {
    const needle = q.toLowerCase();
    const fields = [
      t.title, t.city, t.country, t.notes,
      ...(t.waypoints ?? []).flatMap(w => [w.city, w.country]),
      t.purpose, ...(t.companions ?? []),
    ];
    return fields.some(s => s?.toLowerCase().includes(needle));
  };

  const filtered = trips.filter(t =>
    (!search || matchesSearch(t, search)) && (!yearFilter || tripYear(t) === yearFilter)
  );

  const byYear = filtered.reduce((acc, t) => {
    const year = tripYear(t);
    if (!acc[year]) acc[year] = [];
    acc[year].push(t);
    return acc;
  }, {} as Record<string, Trip[]>);

  const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));

  return (
    <main className="min-h-screen flex flex-col" style={{backgroundColor:"#060e1e"}}>
      <AppHeader />
      <div className="container mx-auto px-6 py-8 flex-1">

        {/* Header — con l'ingresso icona-sola alla "Mappa della vita" (tutti i
            viaggi in un'unica costellazione), a destra del titolo. */}
        <div className="mb-6" style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
          <div>
            <h2 className="text-2xl font-bold">I miei viaggi</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {trips.length} {trips.length === 1 ? "viaggio" : "viaggi"}
              {plans.length > 0 && ` · ${plans.length} in programma`}
            </p>
          </div>
          {trips.length > 0 && (
            <button type="button" onClick={() => setShowLifeMap(true)}
              aria-label="La mappa della mia vita" title="La mappa della mia vita"
              style={{
                width:38, height:38, borderRadius:11, flexShrink:0,
                display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer",
                background:"rgba(168,85,247,0.16)", border:"0.5px solid rgba(168,85,247,0.5)", color:"#c084fc",
              }}>
              <Globe2 style={{width:19, height:19}}/>
            </button>
          )}
        </div>

        {/* Striscia-ponte verso "In programma": i piani vivono in un bucket
            separato (non compaiono qui sotto né nelle statistiche), ma questo è
            l'hub dell'utente — senza questo richiamo la sezione non si scopre.
            Mostra il piano più imminente (o "sei tornato?" se già concluso). */}
        {plans.length > 0 && (
          <div style={{marginBottom:24}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <CalendarClock style={{width:15,height:15,color:"#93c5fd",flexShrink:0}}/>
              <span style={{fontSize:11,letterSpacing:"1.5px",color:"#93c5fd",fontWeight:600}}>IN PROGRAMMA</span>
              <div style={{flex:1,height:1,background:"rgba(147,197,253,0.25)"}}/>
              <Link to="/in-programma" style={{flexShrink:0,fontSize:11,fontWeight:600,color:"#93c5fd",textDecoration:"none",display:"inline-flex",alignItems:"center",gap:4}}>
                Programma <ArrowRight style={{width:12,height:12}}/>
              </Link>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {plans.map(p => <PlanCard key={p.id} plan={p} onOpen={() => setOpenPlanId(p.id)} />)}
            </div>
          </div>
        )}

        {/* Search — sticky sotto l'AppHeader (sticky top:0, alto 65px) mentre si
            scorre l'elenco, con sfondo pieno per non far intravedere il
            contenuto che scorre sotto. top:65 è accoppiato all'altezza reale
            di AppHeader.tsx (FROZEN): se quella cambia, va rimisurato. */}
        <div className="mb-6" style={{position:"sticky",top:65,zIndex:10,background:"#060e1e",paddingTop:8,paddingBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"8px 14px",maxWidth:400}}>
            <Search className="w-4 h-4" style={{color:"rgba(255,255,255,0.6)",flexShrink:0}}/>
            <input
              style={{background:"transparent",border:"none",outline:"none",color:"#f0f4ff",fontSize:13,flex:1}}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca città, paese, titolo…"
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Cancella la ricerca" style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.6)"}}>
                <X className="w-3.5 h-3.5"/>
              </button>
            )}
          </div>

          {allYears.length > 1 && (
            <div style={{display:"flex",gap:6,marginTop:10,overflowX:"auto",paddingBottom:2}}>
              <button
                type="button"
                onClick={() => setYearFilter(null)}
                style={{
                  flexShrink:0, fontSize:12, fontWeight:600, padding:"5px 12px", borderRadius:999,
                  border: yearFilter === null ? "1px solid #60a5fa" : "1px solid #1a2d4a",
                  background: yearFilter === null ? "rgba(96,165,250,0.15)" : "transparent",
                  color: yearFilter === null ? "#60a5fa" : "rgba(255,255,255,0.5)",
                  cursor:"pointer",
                }}
              >
                Tutti
              </button>
              {allYears.map(year => (
                <button
                  key={year}
                  type="button"
                  onClick={() => setYearFilter(yearFilter === year ? null : year)}
                  aria-pressed={yearFilter === year}
                  style={{
                    flexShrink:0, fontSize:12, fontWeight:600, padding:"5px 12px", borderRadius:999,
                    border: yearFilter === year ? "1px solid #60a5fa" : "1px solid #1a2d4a",
                    background: yearFilter === year ? "rgba(96,165,250,0.15)" : "transparent",
                    color: yearFilter === year ? "#60a5fa" : "rgba(255,255,255,0.5)",
                    cursor:"pointer",
                  }}
                >
                  {year}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Trips */}
        {filtered.length === 0 ? (
          search || yearFilter ? (
            // Filtro/ricerca attivi: nessun risultato per i criteri correnti.
            <p className="text-sm text-muted-foreground text-center py-16">Nessun risultato.</p>
          ) : (
            // Nessun viaggio ancora: invito ricco, coerente con Home e Statistiche
            // (prima qui c'era solo una frase nuda, unico dei tre a rompere lo schema).
            <div style={{paddingTop:64, paddingBottom:64, display:"flex", justifyContent:"center"}}>
              <div style={{maxWidth:320, textAlign:"center"}}>
                <div style={{width:48, height:48, borderRadius:"50%", background:"rgba(96,165,250,0.12)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px"}}>
                  <Plane style={{width:22, height:22, color:"#60a5fa"}}/>
                </div>
                <div className="font-display" style={{fontSize:15, fontWeight:700, color:"#f0f4ff"}}>Nessun viaggio ancora</div>
                <p style={{fontSize:12, color:"rgba(255,255,255,0.6)", lineHeight:1.5, margin:"6px 0 16px"}}>
                  Aggiungi il tuo primo viaggio: comparirà qui, sul globo e nelle statistiche.
                </p>
                <Link to="/nuovo-viaggio"
                  style={{display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6, fontSize:13, fontWeight:600, padding:"10px 22px", borderRadius:999, background:"#60a5fa", color:"#0a1628", textDecoration:"none"}}>
                  <Plus style={{width:14, height:14}}/> Aggiungi il primo viaggio
                </Link>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-8">
            {years.map(year => (
              <div key={year}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                  <span style={{fontSize:11,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"rgba(255,255,255,0.6)"}}>{year}</span>
                  <div style={{flex:1,height:"0.5px",background:"#1a2d4a"}}/>
                  <span style={{fontSize:11,color:"rgba(255,255,255,0.6)"}}>{byYear[year].length}</span>
                  {byYear[year].length > 1 && (
                    <button type="button" onClick={() => setFlyoverYear(year)} aria-label={`Rivivi il ${year} in 3D`}
                      style={{width:22,height:22,background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.6)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <Video style={{width:13,height:13}}/>
                    </button>
                  )}
                  {/* Recap dell'anno (deep-link) — icona sola, stesso ingombro del
                      bottone 3D: su mobile il testo veniva tagliato/coperto dal
                      "foglio" del poster che spunta dal primo biglietto. */}
                  <Link to={`/recap?anno=${year}`} aria-label={`Recap del ${year}`} title={`Recap del ${year}`}
                    style={{width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(96,165,250,0.85)",textDecoration:"none",flexShrink:0}}>
                    <Sparkles style={{width:14,height:14}}/>
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {byYear[year].map((t, i) => (
                    // Wrapper esterno per la comparsa scaglionata (fade-up): il
                    // transform dell'animazione di eliminazione (scale) vive sul
                    // div interno, così i due transform non si sovrascrivono.
                    <div key={t.id} className="animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                      <div style={{
                        transition: `opacity ${DELETE_ANIM_MS}ms ease, transform ${DELETE_ANIM_MS}ms ease`,
                        opacity: leavingId === t.id ? 0 : 1,
                        transform: leavingId === t.id ? "scale(0.95)" : "none",
                      }}>
                        <TripCardTicket trip={t} onDeleteRequested={handleDeleteRequested}
                          onSelectCompanion={setCompanionMap}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {flyoverYear && (
        <TripFlyover trips={byYear[flyoverYear] ?? []} onClose={() => setFlyoverYear(null)} />
      )}
      {showLifeMap && (
        <TripFlyover trips={trips} lifeMap onClose={() => setShowLifeMap(false)} />
      )}
      {/* La costellazione dei viaggi fatti con una persona: stessa resa nuda
          della mappa della vita (niente titolo né statistiche), solo i vostri.
          Il confronto è senza maiuscole: "giulia" e "Giulia" sono la stessa. */}
      {companionMap && (
        <TripFlyover lifeMap onClose={() => setCompanionMap(null)}
          trips={trips.filter(t => (t.companions ?? []).some(c => c.toLowerCase() === companionMap.toLowerCase()))} />
      )}
      {/* Cose da organizzare del viaggio in programma, senza cambiare
          pagina. onChanged ricarica ANCHE i viaggi: "Segna come fatto" sposta
          il piano nel diario, e la lista qui sotto deve accorgersene. */}
      {openPlanId && plans.some(p => p.id === openPlanId) && (
        <TripPlanner
          plan={plans.find(p => p.id === openPlanId)!}
          onClose={() => setOpenPlanId(null)}
          onChanged={() => { setPlans(loadPlans()); setTrips(loadTrips()); }}
        />
      )}
    </main>
  );
}
