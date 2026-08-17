// [FROZEN] — Non modificare senza esplicita richiesta
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trip, formatTripDate, parseLocalDate, isValidDateISO } from "@/lib/storage";
import { fmtDistance, fmtTemp, useSettings } from "@/lib/settings";
import { Plane, Pencil, Trash2, Video, X, MoreVertical } from "lucide-react";
import { TRANSPORT, isTransportMode, transportBg } from "@/lib/transport";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { TripFlyover } from "@/components/TripFlyover";
import { TripDiary, DiaryEntry } from "@/components/TripDiary";
import { getReliefImage } from "@/lib/photoStorage";
import { tripTotalKm } from "@/lib/flyover";

// Colori/icone/etichette vengono da @/lib/transport (fonte unica). Qui resta
// solo il ripiego per un viaggio senza mezzo indicato, che è specifico del
// biglietto: "Viaggio" con l'icona dell'aereo.
const DEFAULT_TRANSPORT = { color: "#60a5fa", bg: "rgba(96,165,250,0.12)", label: "Viaggio", Icon: Plane };
const styleOf = (mode: string | null | undefined) => {
  if (!isTransportMode(mode)) return DEFAULT_TRANSPORT;
  const t = TRANSPORT[mode];
  return { color: t.color, bg: transportBg(mode), label: t.label, Icon: t.Icon };
};

// Colore stagionale della data (emisfero nord): inverno freddo, estate caldo,
// mezze stagioni nei toni intermedi. Indice = mese (0=gennaio … 11=dicembre).
const SEASON_COLOR_BY_MONTH = [
  "#60a5fa", "#60a5fa", "#4ade80", "#4ade80", "#4ade80", "#fb923c",
  "#fb923c", "#fb923c", "#c2410c", "#c2410c", "#c2410c", "#60a5fa",
];
export function seasonColor(tripDateISO: string): string {
  // Data malformata → getMonth() NaN → indice undefined → color:undefined
  // sulla riga della data: si ricade sul blu di tema.
  return SEASON_COLOR_BY_MONTH[parseLocalDate(tripDateISO).getMonth()] ?? "#60a5fa";
}

function abbr(city: string) {
  return city.slice(0, 3).toUpperCase();
}

// Etichetta compatta per una voce di diario: "MAR 10 GIU".
function diaryDayChip(iso: string): string {
  const d = parseLocalDate(iso);
  const wd = d.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "");
  const mon = d.toLocaleDateString("it-IT", { month: "short" }).replace(".", "");
  return `${wd} ${d.getDate()} ${mon}`.toUpperCase();
}

const DIARY_PREVIEW_MAX = 2; // voci mostrate sul biglietto prima di "＋ altri N"

interface Props {
  trip: Trip;
  /** Chiamato alla conferma (secondo tap): il viaggio NON è ancora stato
   * eliminato — chi lo gestisce (MieiViaggi) decide quando eliminarlo
   * davvero, per poter offrire un "Annulla". */
  onDeleteRequested?: (trip: Trip) => void;
  /** Tocco su un compagno di viaggio: apre la costellazione dei viaggi fatti
   * insieme a quella persona. Se non passata, i nomi restano semplici chip. */
  onSelectCompanion?: (name: string) => void;
}

// Oltre questa lunghezza le note vengono mostrate troncate (2 righe) con
// espansione al tap: sotto, stanno comunque in 2 righe e il toggle sarebbe inutile.
const NOTES_CLAMP_THRESHOLD = 120;

export function TripCardTicket({ trip, onDeleteRequested, onSelectCompanion }: Props) {
  const navigate = useNavigate();
  const [showFlyover, setShowFlyover] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [showDiary, setShowDiary] = useState(false);
  const [diary, setDiary] = useState<DiaryEntry[]>(trip.diary ?? []);
  // Miniatura del "rilievo 3D" salvato a fine flyover (snapshot in IndexedDB):
  // appare come linguetta sul bordo destro della card; click → si ingrandisce.
  const [reliefUrl, setReliefUrl] = useState<string | null>(null);
  const [reliefOpen, setReliefOpen] = useState(false);
  const reliefUrlRef = useRef<string | null>(null);

  const refreshRelief = async () => {
    let blob: Blob | null = null;
    try {
      blob = await getReliefImage(trip.id);
    } catch {
      // IndexedDB non disponibile (es. modalità privata o ambiente di test):
      // nessuna miniatura, la card resta comunque pienamente funzionante.
      return;
    }
    if (reliefUrlRef.current) { URL.revokeObjectURL(reliefUrlRef.current); reliefUrlRef.current = null; }
    if (blob) { const u = URL.createObjectURL(blob); reliefUrlRef.current = u; setReliefUrl(u); }
    else setReliefUrl(null);
  };
  useEffect(() => {
    refreshRelief();
    return () => { if (reliefUrlRef.current) URL.revokeObjectURL(reliefUrlRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  // Esc chiude l'anteprima ingrandita del rilievo.
  useEffect(() => {
    if (!reliefOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setReliefOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reliefOpen]);
  const { distanceUnit, temperatureUnit } = useSettings();
  const ts = styleOf(trip.transport_mode);

  const notes = trip.notes?.trim() || null;
  const purpose = trip.purpose || null;
  const companions = trip.companions ?? [];
  // Lunghe per caratteri O per numero di righe: una lista di 8 righe corte
  // (whiteSpace:pre-wrap le rispetta) occuperebbe comunque troppa card.
  const notesAreLong = !!notes && (notes.length > NOTES_CLAMP_THRESHOLD || notes.split("\n").length > 2);

  // Inclusivo (1-5 giugno = 5 giorni), non per differenza di date: stessa
  // convenzione della heatmap in Statistiche, che prima contava 5 per questo
  // stesso viaggio mentre qui si leggeva "4g" — numeri diversi per lo stesso dato.
  // Entrambe le date devono essere valide: con una malformata il calcolo dava
  // NaN, e l'espressione {days && days > 0 && …} sotto renderizzava
  // letteralmente "NaN" sul biglietto (NaN è falsy ma React lo stampa).
  const days = trip.date_end && isValidDateISO(trip.date_end) && isValidDateISO(trip.trip_date)
    ? Math.round((parseLocalDate(trip.date_end).getTime() - parseLocalDate(trip.trip_date).getTime()) / 86400000) + 1
    : null;

  const displayTitle = trip.title && trip.title !== trip.city ? trip.title : trip.city;
  const hasWaypoints = trip.waypoints && trip.waypoints.length > 0;

  // Bandiere di TUTTI i paesi toccati (tappe + destinazione), dedup per nome
  // tenendo il codice — stessa logica del poster e dell'elenco Statistiche.
  // Prima l'header mostrava solo la bandiera della destinazione: incoerente
  // con un viaggio multi-paese (es. Milano→Austria→Slovenia→Trieste = 3 paesi).
  const flagCodes = useMemo(() => {
    const seen = new Set<string>();
    const codes: string[] = [];
    const add = (name?: string, code?: string) => {
      const key = (name || code || "").trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      if (code) codes.push(code.toLowerCase());
    };
    for (const w of trip.waypoints ?? []) add(w.country, w.country_code);
    add(trip.country, trip.country_code);
    return codes.slice(0, 5);
  }, [trip]);
  // Km percorsi: stradali reali dove disponibile (coerente con Home/Statistiche/poster).
  const tripKm = tripTotalKm(trip);
  const stops = hasWaypoints
    ? [trip.home_label?.split(",")[0] ?? "Casa", ...trip.waypoints!.map(w => w.city), trip.city]
    : null;

  // Eliminazione: l'apertura del menu ⋮ fa da gesto deliberato, quindi la voce
  // "Elimina" richiama direttamente onDeleteRequested (niente più arm a due tap).

  return (
    <>
    <div style={{position:"relative"}}>
    <div style={{position:"relative",zIndex:1,background:"#0a1628",border:"0.5px solid #1a2d4a",borderRadius:16,overflow:"hidden"}}>

      {/* Top */}
      <div style={{padding:"16px 20px 12px"}}>
        {/* Header row */}
        <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:10}}>
          {flagCodes.length > 0 ? (
            <div style={{display:"flex",alignItems:"center",flexShrink:0,alignSelf:"center"}}>
              {flagCodes.map((c, i) => (
                <img key={c+i} src={"https://flagcdn.com/w40/"+c+".png"} width="22" height="15" alt="" loading="lazy"
                  style={{
                    borderRadius:2, objectFit:"cover",
                    border:"1.5px solid rgba(255,255,255,0.85)", boxShadow:"0 1px 3px rgba(0,0,0,0.4)",
                    marginLeft: i===0 ? 0 : -8,
                    transform:`rotate(${(i-(flagCodes.length-1)/2)*6}deg)`,
                    transformOrigin:"bottom center", position:"relative", zIndex:i,
                  }}
                  onError={e => { (e.target as HTMLImageElement).style.display="none"; }}/>
              ))}
            </div>
          ) : (
            <div style={{width:28,height:28,borderRadius:"50%",overflow:"hidden",border:"1px solid rgba(255,255,255,0.1)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🌍</div>
          )}
          <div style={{flex:1,minWidth:0}}>
            {/* Titolo: max 2 righe con ellissi (prima un titolo lungo su mobile
                andava a 3+ righe stringendo tutto). Rimossa la riga "città, paese":
                ridondante con bandiere e percorso qui sotto. */}
            <div className="font-display" style={{fontSize:14,fontWeight:700,color:"#f0f4ff",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{displayTitle}</div>
          </div>
          {/* Le 5 stelle si distinguono solo per colore: senza aria-label uno
              screen reader leggerebbe cinque stelle identiche. role=img +
              label riassuntiva comunicano il voto (o la sua assenza). */}
          <div style={{display:"flex",gap:1,flexShrink:0}}
            role="img"
            aria-label={trip.rating ? `Valutazione: ${trip.rating} su 5` : "Nessuna valutazione"}>
            {[1,2,3,4,5].map(i => (
              <span key={i} aria-hidden="true" style={{fontSize:10,color:i <= (trip.rating ?? 0) ? "#fbbf24" : "rgba(255,255,255,0.15)"}}>★</span>
            ))}
          </div>
          {/* Azioni raccolte in un menu ⋮ (video/modifica/elimina): su mobile le
              3 icone affiancate strizzavano il titolo. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label="Azioni viaggio"
                style={{width:26,height:26,background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.6)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <MoreVertical style={{width:16,height:16}}/>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowFlyover(true)} className="flex items-center gap-2 cursor-pointer">
                <Video className="w-4 h-4"/> Rivivi in 3D
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/modifica-viaggio/"+trip.id)} className="flex items-center gap-2 cursor-pointer">
                <Pencil className="w-4 h-4"/> Modifica
              </DropdownMenuItem>
              <DropdownMenuSeparator/>
              <DropdownMenuItem onClick={() => onDeleteRequested?.(trip)} className="flex items-center gap-2 cursor-pointer" style={{color:"#f87171"}}>
                <Trash2 className="w-4 h-4"/> Elimina
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Route line */}
        {hasWaypoints && stops ? (
          <div>
            <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
              {stops.map((stop, i) => (
                <div key={i} style={{display:"flex",alignItems:"center",gap:4,flex:i < stops.length-1 ? 1 : 0}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                    <div style={{width:i===0?8:i===stops.length-1?8:6,height:i===0?8:i===stops.length-1?8:6,borderRadius:"50%",background:i===0?"#fbbf24":i===stops.length-1?ts.color:"#60a5fa"}}/>
                    <div style={{fontSize:9,color:"rgba(255,255,255,0.75)"}}>{abbr(stop)}</div>
                  </div>
                  {i < stops.length-1 && (
                    <div style={{flex:1,borderTop:"1.5px dashed rgba(96,165,250,0.3)",marginBottom:12}}/>
                  )}
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {stops.map((stop, i) => (
                <span key={i} style={{fontSize:10,color:"rgba(255,255,255,0.6)"}}>
                  {stop}{i < stops.length-1 && <span style={{color:"rgba(255,255,255,0.6)",margin:"0 2px"}}>→</span>}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:"#fbbf24"}}/>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.75)"}}>{abbr(trip.home_label?.split(",")[0] || "Casa")}</div>
            </div>
            <div style={{flex:1,display:"flex",alignItems:"center",gap:4}}>
              <div style={{flex:1,borderTop:"1.5px dashed "+ts.color+"60"}}/>
              <ts.Icon style={{width:14,height:14,color:ts.color}}/>
              <div style={{flex:1,borderTop:"1.5px dashed "+ts.color+"60"}}/>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:"#f472b6"}}/>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.75)"}}>{abbr(trip.city)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Ticket divider */}
      <div style={{display:"flex",alignItems:"center",margin:"0 0",position:"relative"}}>
        <div style={{position:"absolute",top:"50%",left:0,right:0,height:"0.5px",background:"#1a2d4a"}}/>
        <div style={{width:16,height:16,borderRadius:"50%",background:"#060e1e",border:"0.5px solid #1a2d4a",flexShrink:0,marginLeft:-8,zIndex:1}}/>
        <div style={{flex:1,borderTop:"1.5px dashed #1a2d4a",margin:"0 4px"}}/>
        <div style={{width:16,height:16,borderRadius:"50%",background:"#060e1e",border:"0.5px solid #1a2d4a",flexShrink:0,marginRight:-8,zIndex:1}}/>
      </div>

      {/* Bottom */}
      <div style={{padding:"10px 20px 14px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:4}}>
          <span style={{fontSize:13,fontWeight:600,color:seasonColor(trip.trip_date)}}>
            {formatTripDate(trip.trip_date)}
          </span>
          {trip.date_end && trip.date_end !== trip.trip_date && (
            <span style={{fontSize:11,color:"rgba(255,255,255,0.75)"}}> → {formatTripDate(trip.date_end)}</span>
          )}
          {days && days > 0 && (
            <span style={{fontSize:11,color:ts.color,fontWeight:600}}> · {days}g</span>
          )}
        </div>
        {trip.transport_mode && (
          <>
            <div style={{width:1,height:10,background:"#1a2d4a"}}/>
            <span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10,padding:"2px 8px",borderRadius:99,background:ts.bg,color:ts.color,fontWeight:500}}>
              <ts.Icon style={{width:10,height:10}}/> {ts.label}
            </span>
          </>
        )}
        {tripKm > 0 && (
          <>
            <div style={{width:1,height:10,background:"#1a2d4a"}}/>
            <span style={{fontSize:11,color:"rgba(255,255,255,0.75)"}}>{fmtDistance(tripKm, distanceUnit)}</span>
          </>
        )}
        {trip.temperature_c != null && (
          <>
            <div style={{width:1,height:10,background:"#1a2d4a"}}/>
            <span style={{fontSize:11,color:"rgba(255,255,255,0.75)"}}>{fmtTemp(trip.temperature_c, temperatureUnit)}</span>
          </>
        )}
      </div>

      {/* Note del viaggio: prima erano visibili solo riaprendo il form di
          modifica. Troncate a 2 righe se lunghe, tap per espandere. */}
      {notes && (
        <div style={{padding:"0 20px 14px"}}>
          <div
            onClick={notesAreLong ? () => setNotesExpanded(e => !e) : undefined}
            onKeyDown={notesAreLong ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setNotesExpanded(v => !v); } } : undefined}
            tabIndex={notesAreLong ? 0 : undefined}
            role={notesAreLong ? "button" : undefined}
            aria-expanded={notesAreLong ? notesExpanded : undefined}
            aria-label={notesAreLong ? (notesExpanded ? "Comprimi le note" : "Espandi le note") : undefined}
            style={{
              borderLeft:"2px solid #1a2d4a", paddingLeft:10,
              cursor: notesAreLong ? "pointer" : "default",
            }}>
            <div style={{
              fontSize:11, lineHeight:1.5, color:"rgba(255,255,255,0.6)", fontStyle:"italic",
              whiteSpace:"pre-wrap", wordBreak:"break-word",
              ...(notesAreLong && !notesExpanded ? {
                display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as const, overflow:"hidden",
              } : {}),
            }}>
              {notes}
            </div>
            {notesAreLong && (
              <div style={{fontSize:10,color:"#60a5fa",fontWeight:600,marginTop:3}}>
                {notesExpanded ? "Mostra meno" : "Mostra tutto"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Motivo + compagni (chip) + accesso al Diario giorno-per-giorno. */}
      <div style={{padding:"0 20px 14px",display:"flex",flexWrap:"wrap",alignItems:"center",gap:6}}>
        {purpose && (
          <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.05em",textTransform:"uppercase",padding:"3px 9px",borderRadius:999,background:"rgba(96,165,250,0.14)",color:"#93c5fd"}}>{purpose}</span>
        )}
        {/* Il nome è toccabile: apre la costellazione dei viaggi fatti con
            quella persona (stessa resa della mappa della vita, solo i vostri).
            Senza il gestore resta un chip semplice, com'era. */}
        {companions.map(c => {
          const chip: React.CSSProperties = {
            fontSize:10,fontWeight:600,padding:"3px 9px",borderRadius:999,
            background:"rgba(52,211,153,0.12)",color:"#6ee7b7",
          };
          return onSelectCompanion ? (
            <button key={"c"+c} type="button" onClick={() => onSelectCompanion(c)}
              aria-label={`Vedi la mappa dei viaggi con ${c}`}
              // Contorno con boxShadow e non border: il bordo occuperebbe
              // spazio e questo chip risulterebbe più alto (e disallineato di
              // un pixel) rispetto a quello del motivo, che gli sta accanto.
              style={{...chip, border:"none", boxShadow:"inset 0 0 0 0.5px rgba(52,211,153,0.45)", cursor:"pointer"}}>
              👤 {c}
            </button>
          ) : (
            <span key={"c"+c} style={chip}>👤 {c}</span>
          );
        })}
        <button type="button" onClick={() => setShowDiary(true)}
          aria-label={diary.length ? `Apri il diario (${diary.length} giorni scritti)` : "Apri il diario del viaggio"}
          style={{
            marginLeft: (purpose || companions.length > 0) ? "auto" : 0,
            display:"inline-flex",alignItems:"center",gap:5,fontSize:10,fontWeight:600,padding:"3px 10px",borderRadius:999,
            background: diary.length ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.04)",
            border:"0.5px solid " + (diary.length ? "rgba(96,165,250,0.35)" : "#1a2d4a"),
            color: diary.length ? "#93c5fd" : "rgba(255,255,255,0.55)", cursor:"pointer",
          }}>
          📖 {diary.length ? `Diario · ${diary.length} ${diary.length === 1 ? "giorno" : "giorni"}` : "Diario"}
        </button>
      </div>

      {/* Anteprima in lettura del racconto: prime voci (data + prima riga) con
          troncamento a una riga; un clic ovunque apre il pannello completo. */}
      {diary.length > 0 && (
        <div style={{padding:"0 20px 16px",display:"flex",flexDirection:"column",gap:8}}>
          {diary.slice(0, DIARY_PREVIEW_MAX).map(e => (
            <button key={e.date} type="button" onClick={() => setShowDiary(true)}
              aria-label={`Apri il diario — ${diaryDayChip(e.date)}`}
              style={{
                display:"block",textAlign:"left",width:"100%",background:"transparent",border:"none",
                borderLeft:"2px solid #1a2d4a",paddingLeft:10,cursor:"pointer",
              }}>
              <div style={{fontSize:9,fontWeight:600,letterSpacing:"0.06em",color:"#93c5fd"}}>{diaryDayChip(e.date)}</div>
              <div style={{fontSize:11,lineHeight:1.5,fontStyle:"italic",color:"rgba(255,255,255,0.6)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {e.text}
              </div>
            </button>
          ))}
          {diary.length > DIARY_PREVIEW_MAX && (
            <button type="button" onClick={() => setShowDiary(true)}
              style={{alignSelf:"flex-start",background:"transparent",border:"none",padding:0,cursor:"pointer",fontSize:10,fontWeight:600,color:"#93c5fd"}}>
              ＋ altri {diary.length - DIARY_PREVIEW_MAX} {diary.length - DIARY_PREVIEW_MAX === 1 ? "giorno" : "giorni"} →
            </button>
          )}
        </div>
      )}
    </div>

      {/* Rilievo 3D come "foglio nella busta": il biglietto fa da busta e il
          rilievo spunta come un foglio (dietro la card, zIndex 0) dal bordo
          superiore, leggermente ruotato. Appare solo se lo snapshot esiste
          (flyover già visto). Click sulla parte che sporge → anteprima ingrandita. */}
      {reliefUrl && (
        <button type="button" onClick={() => setReliefOpen(true)}
          aria-label="Vedi il rilievo 3D del viaggio" title="Rilievo 3D del viaggio"
          style={{
            position:"absolute", top:-30, right:26, zIndex:0,
            width:116, padding:"5px 5px 8px", background:"#fbfbf7",
            borderRadius:"4px 4px 7px 7px", boxShadow:"0 -3px 12px rgba(0,0,0,0.4)",
            transform:"rotate(-4deg)", transformOrigin:"bottom center",
            cursor:"pointer", border:"none",
          }}>
          <img src={reliefUrl} alt="" style={{width:"100%",height:74,objectFit:"cover",borderRadius:3,display:"block"}}/>
        </button>
      )}
    </div>

    {/* onClose ricarica il rilievo: se il flyover l'ha appena generato, la
        linguetta compare senza ricaricare la pagina. */}
    {showFlyover && <TripFlyover trips={[trip]} onClose={() => { setShowFlyover(false); refreshRelief(); }} />}

    {showDiary && (
      <TripDiary trip={trip} entries={diary} onClose={() => setShowDiary(false)} onSaved={setDiary} />
    )}

    {reliefOpen && reliefUrl && createPortal(
      <div onClick={() => setReliefOpen(false)}
        style={{
          position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,0.85)", backdropFilter:"blur(4px)",
          display:"flex", alignItems:"center", justifyContent:"center", padding:24,
        }}>
        <img src={reliefUrl} alt={`Rilievo 3D di ${displayTitle}`} onClick={e => e.stopPropagation()}
          style={{maxWidth:"92vw",maxHeight:"88vh",objectFit:"contain",borderRadius:12,boxShadow:"0 20px 60px rgba(0,0,0,0.6)"}}/>
        <button onClick={() => setReliefOpen(false)} aria-label="Chiudi anteprima rilievo"
          style={{
            position:"absolute", top:16, right:16, width:34, height:34, borderRadius:10,
            background:"rgba(10,22,40,0.8)", border:"0.5px solid #1a2d4a", cursor:"pointer",
            color:"rgba(255,255,255,0.7)", display:"flex", alignItems:"center", justifyContent:"center",
          }}>
          <X style={{width:16,height:16}}/>
        </button>
      </div>,
      document.body
    )}
    </>
  );
}
