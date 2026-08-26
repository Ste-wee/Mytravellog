// [FROZEN] — Non modificare senza esplicita richiesta
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { contaViaggiEGite, separaGite } from "@/lib/gite";
import { TripCardTicket } from "@/components/TripCardTicket";
import { TripFlyover } from "@/components/TripFlyover";
import { loadTrips, loadPlans, deleteTrip, parseLocalDate, Trip } from "@/lib/storage";
import { deletePhotosForTrip } from "@/lib/photoStorage";
import { Search, X, Video, Plane, Plus, Sparkles, Globe2, List, LayoutGrid, Sun } from "lucide-react";
import { transportColor } from "@/lib/transport";
import { useT, tr } from "@/lib/settings";

/**
 * Card compatta della vista a griglia: SOLO overview (bandiera, titolo,
 * città · anno, pallino del mezzo). Niente azioni: il tocco riporta alla
 * lista, scrollata sul biglietto — le azioni vivono in un posto solo.
 * A livello di modulo, non dentro il render (un componente inline rimonta
 * a ogni re-render e fa ripartire i fade-up: lezione già pagata in Home).
 */
function SchedaCompatta({ trip, anno, onApri }: { trip: Trip; anno: string; onApri: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onApri(trip.id)}
      aria-label={tr("Apri il biglietto di {viaggio}", { viaggio: trip.title || trip.city })}
      style={{ textAlign: "left", background: "rgba(255,255,255,0.03)", border: "0.5px solid #1a2d4a",
        borderRadius: 14, padding: 12, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8,
        // min-width 0: gli item di una grid hanno min-width AUTO, e il titolo
        // nowrap gonfiava la colonna fino a sbordare sotto la card vicina
        // (visto su desktop col titolo dei castelli della Loira).
        minWidth: 0, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <img src={`https://flagcdn.com/w40/${(trip.country_code || "").toLowerCase()}.png`} width={26}
          alt="" style={{ borderRadius: 4, display: "block" }}
          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}/>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: transportColor(trip.transport_mode) }}/>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f4ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {trip.title || trip.city}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{trip.city} · {anno}</div>
      </div>
    </button>
  );
}

const DELETE_ANIM_MS = 200;
// Finestra di tempo in cui "Annulla" nel toast può ancora recuperare il
// viaggio: l'eliminazione vera e propria (storage + foto) resta sospesa
// fino ad allora, così una cancellazione per errore non è mai definitiva.
const UNDO_GRACE_MS = 5000;

export default function MieiViaggi() {
  const t = useT();
  const [trips, setTrips] = useState<Trip[]>([]);
  // Viaggi e gite in giornata, contati a parte come in Home.
  const conteggi = contaViaggiEGite(trips);
  // Viaggi "in programma": vivono in un bucket separato (fuori da statistiche,
  // globo e recap) e si guardano nella loro pagina. Qui servono SOLO per il
  // conteggio nell'intestazione: la striscia che li mostrava è stata rimossa
  // perché lo stesso piano si apriva e si organizzava da due schermate.
  const [plans, setPlans] = useState<Trip[]>([]);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<string | null>(null);
  /**
   * Quale dei due mucchi si sta guardando.
   *
   * ⚠️ Non si ricorda fra una visita e l'altra, di proposito: «I miei viaggi»
   * deve aprirsi sui viaggi. Tornare e trovarsi nelle gite perché tre giorni
   * prima le avevi aperte è il tipo di memoria che disorienta invece di aiutare
   * (la vista lista/griglia si ricorda perché è una PREFERENZA, non un luogo).
   */
  const [schedaScelta, setScheda] = useState<"viaggi" | "gite">("viaggi");
  // Cambiando mucchio l'anno selezionato si azzera: i chip dei due mucchi non
  // coincidono, e restare su un 2017 che nelle gite non esiste darebbe una
  // schermata vuota che sembra un difetto.
  const cambiaScheda = (v: "viaggi" | "gite") => { setScheda(v); setYearFilter(null); };
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [flyoverYear, setFlyoverYear] = useState<string | null>(null);
  const [showLifeMap, setShowLifeMap] = useState(false);
  // Vista della lista: biglietti (default) o griglia compatta. La scelta si
  // ricorda: è una preferenza di consultazione, non un filtro momentaneo.
  const [vista, setVistaState] = useState<"lista" | "griglia">(
    () => (localStorage.getItem("navta.viaggi.vista.v1") === "griglia" ? "griglia" : "lista"));
  const setVista = (v: "lista" | "griglia") => {
    setVistaState(v);
    localStorage.setItem("navta.viaggi.vista.v1", v);
  };
  // Il biglietto su cui atterrare (evidenziato) tornando dalla griglia.
  const [evidenziaId, setEvidenziaId] = useState<string | null>(null);
  // Nome del compagno di cui mostrare la costellazione condivisa (null = chiusa).
  const [companionMap, setCompanionMap] = useState<string | null>(null);
  const pendingDeletesRef = useRef<Map<string, {
    animTimer: ReturnType<typeof setTimeout>;
    commitTimer: ReturnType<typeof setTimeout>;
    toastId: string | number;
    trip: Trip;
  }>>(new Map());

  useEffect(() => { setTrips(loadTrips()); setPlans(loadPlans()); }, []);

  // Tocco su una card della griglia → lista scrollata su quel biglietto,
  // evidenziato per un momento così l'occhio sa dove è atterrato.
  useEffect(() => {
    if (vista !== "lista" || !evidenziaId) return;
    document.getElementById(`viaggio-${evidenziaId}`)?.scrollIntoView({ block: "center" });
    const t = setTimeout(() => setEvidenziaId(null), 1600);
    return () => clearTimeout(t);
  }, [vista, evidenziaId]);

  const apriDallaGriglia = (id: string) => { setEvidenziaId(id); setVista("lista"); };
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

  // I due mucchi interi (non filtrati): servono ai conteggi delle schede e
  // agli anni disponibili.
  const { viaggi: tuttiViaggi, gite: tutteGite } = separaGite(trips);
  /**
   * ⚠️ La scheda VERA, non quella scelta: senza gite in archivio le schede non
   * si disegnano, e restare su "gite" sarebbe un vicolo cieco — cancellando
   * l'ultima gita dalla sua scheda ci si trovava davanti a «Nessuna gita, per
   * ora» **senza più i bottoni per tornare ai viaggi**. Si ricade sui viaggi da
   * sé, senza effetti né sfarfallii.
   */
  const scheda = tutteGite.length === 0 ? "viaggi" : schedaScelta;
  // Anni disponibili calcolati su tutti i viaggi (non sui filtrati): i chip
  // restano stabili mentre si scrive nella ricerca, invece di sparire.
  // ⚠️ Sono gli anni della SCHEDA ATTIVA, non di tutto l'archivio: prima erano
  // tutti gli anni «perché il filtro serve a trovare le cose, non a
  // nasconderle», ma con due mucchi separati un chip che non ha niente da
  // mostrare non trova niente — mostra il vuoto.
  const allYears = Array.from(new Set((scheda === "gite" ? tutteGite : tuttiViaggi).map(tripYear)))
    .sort((a, b) => b.localeCompare(a));

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

  // Le gite in giornata hanno una casa loro (scelta di Stefano, 2026-08-24):
  // stanno sotto il diario, in una sezione dichiarata, invece di mescolarsi
  // agli anni. Restano cercabili e filtrabili come tutto il resto — il filtro
  // è già applicato qui sopra, questa è solo la divisione dei due mucchi.
  const { viaggi: soloViaggi, gite: soloGite } = separaGite(filtered);
  // Quello che si sta guardando adesso: da qui in giù la pagina disegna questo.
  const inVista = scheda === "gite" ? soloGite : soloViaggi;

  const byYear = soloViaggi.reduce((acc, t) => {
    const year = tripYear(t);
    if (!acc[year]) acc[year] = [];
    acc[year].push(t);
    return acc;
  }, {} as Record<string, Trip[]>);

  const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));

  return (
    <main className="flex flex-col" style={{backgroundColor:"#060e1e"}}>
      <AppHeader />
      <div className="container mx-auto px-6 pt-8 pb-2 flex-1">

        {/* Header — con l'ingresso icona-sola alla "Mappa della vita" (tutti i
            viaggi in un'unica costellazione), a destra del titolo. */}
        <div className="mb-6" style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
          <div>
            <h2 className="text-2xl font-bold">{t("I miei viaggi")}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {/* Stessa distinzione della Home: le gite in giornata hanno il
                  loro numero. Due conteggi diversi per la stessa cosa in due
                  schermate è il pasticcio già fatto oggi con la promessa sulla
                  privacy, corretta in un posto solo su due. */}
              {t(conteggi.viaggi === 1 ? "{quanti} viaggio" : "{quanti} viaggi", { quanti: conteggi.viaggi })}
              {conteggi.gite > 0 && " · " + t(conteggi.gite === 1 ? "{quante} gita in giornata" : "{quante} gite in giornata", { quante: conteggi.gite })}
              {plans.length > 0 && " · " + t("{quanti} in programma", { quanti: plans.length })}
            </p>
          </div>
          {trips.length > 0 && (
            <button type="button" onClick={() => setShowLifeMap(true)}
              aria-label={t("La mappa della mia vita")} title={t("La mappa della mia vita")}
              style={{
                width:38, height:38, borderRadius:11, flexShrink:0,
                display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer",
                background:"rgba(168,85,247,0.16)", border:"0.5px solid rgba(168,85,247,0.5)", color:"#c084fc",
              }}>
              <Globe2 style={{width:19, height:19}}/>
            </button>
          )}
        </div>

        {/* Le DUE SCHEDE: viaggi e gite sono due cose diverse, e questo è il
            posto dove si scegli quale guardare. Compaiono solo se ci sono gite:
            una scheda «Gite 0» accanto ai viaggi sarebbe rumore per tutti quelli
            che non ne hanno.
            ⚠️ SOPRA la ricerca, non sotto: la scheda scegli l'insieme, ricerca e
            filtri lo restringono — e un comando non sta sotto la cosa che
            comanda. */}
        {tutteGite.length > 0 && (
          <div role="tablist" aria-label={t("Cosa vuoi vedere")}
            style={{display:"flex",gap:6,marginBottom:14,background:"rgba(255,255,255,0.04)",
              border:"0.5px solid #1a2d4a",borderRadius:10,padding:3}}>
            {([["viaggi", t("Viaggi"), tuttiViaggi.length, "#60a5fa"],
               ["gite", t("Gite"), tutteGite.length, "#fbbf24"]] as const).map(([id, etichetta, quanti, tinta]) => {
              const attiva = scheda === id;
              return (
                <button key={id} type="button" role="tab" aria-selected={attiva}
                  onClick={() => cambiaScheda(id)}
                  style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:7,
                    padding:"8px 10px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit",
                    fontSize:12.5,fontWeight:attiva ? 700 : 500,
                    background: attiva ? `${tinta}26` : "transparent",
                    color: attiva ? tinta : "rgba(255,255,255,0.5)"}}>
                  {id === "gite" ? <Sun style={{width:13,height:13}}/> : <Plane style={{width:13,height:13}}/>}
                  {etichetta}
                  <span className="font-mono" style={{fontSize:11,opacity:0.75}}>{quanti}</span>
                </button>
              );
            })}
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
              placeholder={t("Cerca città, paese, titolo…")}
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label={t("Cancella la ricerca")} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.6)"}}>
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
                {t("Tutti")}
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

          {/* Vista: biglietti o griglia compatta (overview). Fuori dal
              condizionale dei chip-anno: un'espressione JSX ammette un solo
              elemento radice, e il toggle serve anche con un anno solo. */}
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:10}}>
              <div style={{display:"inline-flex",border:"0.5px solid #1a2d4a",borderRadius:9,overflow:"hidden"}}>
                <button type="button" onClick={() => setVista("lista")} aria-pressed={vista === "lista"}
                  style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",fontSize:11,border:"none",cursor:"pointer",
                    background: vista === "lista" ? "rgba(96,165,250,0.15)" : "transparent",
                    color: vista === "lista" ? "#60a5fa" : "rgba(255,255,255,0.4)",
                    fontWeight: vista === "lista" ? 600 : 400}}>
                  <List style={{width:12,height:12}}/> {t("Lista")}
                </button>
                <button type="button" onClick={() => setVista("griglia")} aria-pressed={vista === "griglia"}
                  style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",fontSize:11,border:"none",cursor:"pointer",
                    background: vista === "griglia" ? "rgba(96,165,250,0.15)" : "transparent",
                    color: vista === "griglia" ? "#60a5fa" : "rgba(255,255,255,0.4)",
                    fontWeight: vista === "griglia" ? 600 : 400}}>
                  <LayoutGrid style={{width:12,height:12}}/> {t("Griglia")}
                </button>
              </div>
            </div>
        </div>

        {/* La riga che spiega cosa sono, UNA volta, dentro la loro scheda.
            Prima era una sezione dentro l'elenco dei viaggi: Stefano non era
            convinto («non credo vadano trattati come veri e propri viaggi»), e
            aveva ragione — la sezione li separava a metà, la scheda li separa
            del tutto. Le card poi le disegna il ramo comune qui sotto. */}
        {scheda === "gite" && tutteGite.length > 0 && (
          <p style={{fontSize:11.5,color:"rgba(255,255,255,0.45)",margin:"0 0 14px",lineHeight:1.5}}>
            {t("Parti e torni lo stesso giorno. Contate a parte: fuori da statistiche, record e recap, ma sul globo ci sono.")}
          </p>
        )}

        {/* Trips */}
        {inVista.length === 0 ? (
          search || yearFilter ? (
            // Filtro/ricerca attivi: nessun risultato per i criteri correnti.
            <p className="text-sm text-muted-foreground text-center py-16">{t("Nessun risultato.")}</p>
          ) : scheda === "gite" ? (
            // Scheda delle gite, archivio senza gite: una riga, non l'invito
            // ricco dei viaggi. Una gita non è una cosa da spingere a fare.
            <p className="text-sm text-muted-foreground text-center py-16">{t("Nessuna gita in giornata, per ora.")}</p>
          ) : (
            // Nessun viaggio ancora: invito ricco, coerente con Home e Statistiche
            // (prima qui c'era solo una frase nuda, unico dei tre a rompere lo schema).
            <div style={{paddingTop:64, paddingBottom:64, display:"flex", justifyContent:"center"}}>
              <div style={{maxWidth:320, textAlign:"center"}}>
                <div style={{width:48, height:48, borderRadius:"50%", background:"rgba(96,165,250,0.12)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px"}}>
                  <Plane style={{width:22, height:22, color:"#60a5fa"}}/>
                </div>
                <div className="font-display" style={{fontSize:15, fontWeight:700, color:"#f0f4ff"}}>{t("Nessun viaggio ancora")}</div>
                <p style={{fontSize:12, color:"rgba(255,255,255,0.6)", lineHeight:1.5, margin:"6px 0 16px"}}>
                  {t("Aggiungi il tuo primo viaggio: comparirà qui, sul globo e nelle statistiche.")}
                </p>
                <Link to="/nuovo-viaggio"
                  style={{display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6, fontSize:13, fontWeight:600, padding:"10px 22px", borderRadius:999, background:"#60a5fa", color:"#0a1628", textDecoration:"none"}}>
                  <Plus style={{width:14, height:14}}/> {t("Aggiungi il primo viaggio")}
                </Link>
              </div>
            </div>
          )
        ) : scheda === "gite" ? (
          vista === "griglia" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {soloGite.map((g, i) => (
                <div key={g.id} className="animate-fade-up" style={{ animationDelay: `${i * 40}ms`, display: "grid", minWidth: 0 }}>
                  <SchedaCompatta trip={g} anno={tripYear(g)} onApri={apriDallaGriglia}/>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {soloGite.map((g, i) => (
                <div key={g.id} id={`viaggio-${g.id}`} className="animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <div style={{
                    transition: `opacity ${DELETE_ANIM_MS}ms ease, transform ${DELETE_ANIM_MS}ms ease, box-shadow 300ms ease`,
                    opacity: leavingId === g.id ? 0 : 1,
                    transform: leavingId === g.id ? "scale(0.95)" : "none",
                    boxShadow: evidenziaId === g.id ? "0 0 0 2px #60a5fa, 0 0 24px rgba(96,165,250,0.35)" : "none",
                    borderRadius: 16,
                  }}>
                    <TripCardTicket trip={g} onDeleteRequested={handleDeleteRequested}
                      onSelectCompanion={setCompanionMap}/>
                  </div>
                </div>
              ))}
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
                    <button type="button" onClick={() => setFlyoverYear(year)} aria-label={t("Rivivi il {anno} in 3D", { anno: year })}
                      style={{width:22,height:22,background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.6)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <Video style={{width:13,height:13}}/>
                    </button>
                  )}
                  {/* Recap dell'anno (deep-link) — icona sola, stesso ingombro del
                      bottone 3D: su mobile il testo veniva tagliato/coperto dal
                      "foglio" del poster che spunta dal primo biglietto. */}
                  <Link to={`/recap?anno=${year}`} aria-label={t("Recap del {anno}", { anno: year })} title={t("Recap del {anno}", { anno: year })}
                    style={{width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(96,165,250,0.85)",textDecoration:"none",flexShrink:0}}>
                    <Sparkles style={{width:14,height:14}}/>
                  </Link>
                </div>
                {vista === "griglia" ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                    {byYear[year].map((t, i) => (
                      <div key={t.id} className="animate-fade-up" style={{ animationDelay: `${i * 40}ms`, display: "grid", minWidth: 0 }}>
                        <SchedaCompatta trip={t} anno={year} onApri={apriDallaGriglia}/>
                      </div>
                    ))}
                  </div>
                ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {byYear[year].map((t, i) => (
                    // Wrapper esterno per la comparsa scaglionata (fade-up): il
                    // transform dell'animazione di eliminazione (scale) vive sul
                    // div interno, così i due transform non si sovrascrivono.
                    <div key={t.id} id={`viaggio-${t.id}`} className="animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                      <div style={{
                        transition: `opacity ${DELETE_ANIM_MS}ms ease, transform ${DELETE_ANIM_MS}ms ease, box-shadow 300ms ease`,
                        opacity: leavingId === t.id ? 0 : 1,
                        transform: leavingId === t.id ? "scale(0.95)" : "none",
                        // Anello di atterraggio: si arriva qui dalla griglia e
                        // l'occhio deve trovare subito il biglietto giusto.
                        boxShadow: evidenziaId === t.id ? "0 0 0 2px #60a5fa, 0 0 24px rgba(96,165,250,0.35)" : "none",
                        borderRadius: 16,
                      }}>
                        <TripCardTicket trip={t} onDeleteRequested={handleDeleteRequested}
                          onSelectCompanion={setCompanionMap}/>
                      </div>
                    </div>
                  ))}
                </div>
                )}
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
    </main>
  );
}
