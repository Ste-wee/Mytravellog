import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { GeoResult, placeSubtitle } from "@/lib/geo";
import { usePlaceSearch } from "@/lib/usePlaceSearch";
import { Trip, loadPlans, addPlan } from "@/lib/storage";
import { TripPlanner } from "@/components/TripPlanner";
import { PlanCard } from "@/components/PlanCard";
import { isReturnBeforeDeparture } from "@/components/TripFormParts";
import { CalendarClock, Plus, MapPin, X } from "lucide-react";
import { toast } from "sonner";

type PlanWaypoint = Trip["waypoints"][number];

function buildPlan(
  dest: GeoResult, title: string, dateStart: string, dateEnd: string,
  intermediates: PlanWaypoint[] = [], destMode: Trip["transport_mode"] = "plane",
): Omit<Trip, "id" | "created_at" | "status"> {
  return {
    title: title.trim() || dest.name,
    country: dest.country, city: dest.name, country_code: dest.country_code ?? "",
    trip_date: dateStart, date_end: dateEnd || null,
    rating: null, notes: null, transport_mode: destMode ?? "plane", waypoints: intermediates,
    latitude: dest.latitude, longitude: dest.longitude,
    home_latitude: null, home_longitude: null, home_label: null, route_geometry: null,
    temperature_c: null, altitude_m: null, max_altitude_m: null, max_altitude_city: null,
    distance_from_home_km: null, max_distance_from_home_km: null, max_distance_city: null,
    hottest_temp_c: null, hottest_city: null, coldest_temp_c: null, coldest_city: null,
    region: null, region_details: null,
  };
}

const InProgramma = () => {
  const [plans, setPlans] = useState<Trip[]>(() => loadPlans());
  const [openId, setOpenId] = useState<string | null>(null);
  const reload = () => setPlans(loadPlans());

  // Mini-form di creazione
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [dest, setDest] = useState<GeoResult | null>(null);
  const [title, setTitle] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  // Tappe intermedie e mezzo della meta arrivati dal banner "data futura" di
  // Nuovo viaggio: la mini-form mostra solo la meta, ma il piano creato le
  // conserva tutte (poi si rifiniscono nel pannello, che apre l'itinerario pieno).
  const [prefillWps, setPrefillWps] = useState<PlanWaypoint[]>([]);
  const [destMode, setDestMode] = useState<Trip["transport_mode"]>("plane");

  // Prefill dal banner "data futura" di Nuovo viaggio: quanto l'utente aveva
  // già compilato di là (titolo, destinazione, date) atterra qui pronto,
  // con la mini-form già aperta — non deve ricominciare da capo.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("navta.prefill.plan");
      if (!raw) return;
      sessionStorage.removeItem("navta.prefill.plan");
      const p = JSON.parse(raw);
      setAdding(true);
      if (p.title) setTitle(p.title);
      if (p.dateStart) setDateStart(p.dateStart);
      if (p.dateEnd) setDateEnd(p.dateEnd);
      // Forma nuova: waypoints[] completi (l'ultimo è la meta, i precedenti
      // tappe intermedie, ciascuno col suo mezzo). Retro-compat: p.dest singolo.
      if (Array.isArray(p.waypoints) && p.waypoints.length > 0) {
        const last = p.waypoints[p.waypoints.length - 1];
        setDest({ name: last.city, country: last.country, country_code: last.country_code ?? "", latitude: last.lat ?? 0, longitude: last.lon ?? 0 } as GeoResult);
        setDestMode(last.transport_mode ?? "plane");
        setPrefillWps(p.waypoints.slice(0, -1).map((w: PlanWaypoint) => ({ ...w, route_geometry: null })));
      } else if (p.dest?.name) {
        setDest(p.dest as GeoResult);
      }
    } catch { /* prefill malformato: si riparte dalla mini-form vuota */ }
  }, []);

  // Ricerca unificata (usePlaceSearch): a destinazione scelta la query
  // passata è vuota, così la lista non riappare sotto la scelta.
  const { results, clear: clearResults } = usePlaceSearch(dest ? "" : query, { luoghi: true, limite: 5 });

  const resetForm = () => { setAdding(false); setQuery(""); clearResults(); setDest(null); setTitle(""); setDateStart(""); setDateEnd(""); setPrefillWps([]); setDestMode("plane"); };

  const canSave = dest && dateStart;
  const create = () => {
    if (!dest || !dateStart) return;
    if (isReturnBeforeDeparture(dateStart, dateEnd)) {
      toast.error("Il ritorno non può essere prima della partenza");
      return;
    }
    const p = addPlan(buildPlan(dest, title, dateStart, dateEnd, prefillWps, destMode));
    resetForm();
    reload();
    // Dritto nel pannello: itinerario completo e checklist si
    // rifiniscono lì — flusso continuo invece di card muta.
    setOpenId(p.id);
  };

  const openPlan = useMemo(() => plans.find(p => p.id === openId) ?? null, [plans, openId]);

  return (
    <div style={{ background: "#060e1e", display: "flex", flexDirection: "column" }}>
      <AppHeader />

      <div style={{ maxWidth: 760, margin: "0 auto", width: "100%", padding: "28px 20px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <CalendarClock style={{ width: 22, height: 22, color: "#60a5fa" }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#f0f4ff", margin: 0 }}>In programma</h1>
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "0 0 20px" }}>
          I viaggi che devi ancora fare: itinerario e cose da organizzare. Al ritorno diventano ricordi nel diario.
        </p>

        {/* Mini-form / bottone */}
        {!adding ? (
          <button type="button" onClick={() => setAdding(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#60a5fa", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 14, fontWeight: 700, color: "#04203f", cursor: "pointer", marginBottom: 24 }}>
            <Plus style={{ width: 17, height: 17 }} /> Programma un viaggio
          </button>
        ) : (
          <div style={{ background: "#0b1a33", border: "0.5px solid #1a2d4a", borderRadius: 12, padding: 16, marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f4ff" }}>Nuovo viaggio in programma</div>
              <button type="button" onClick={resetForm} aria-label="Annulla"
                style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 2 }}>
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {/* Destinazione */}
            {dest ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(96,165,250,0.12)", border: "0.5px solid rgba(96,165,250,0.35)", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
                <MapPin style={{ width: 15, height: 15, color: "#93c5fd" }} />
                <span style={{ fontSize: 13, color: "#f0f4ff", flex: 1 }}>{dest.name}, {dest.country}</span>
                <button type="button" onClick={() => { setDest(null); setQuery(""); }} aria-label="Cambia destinazione"
                  style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 2 }}>
                  <X style={{ width: 15, height: 15 }} />
                </button>
              </div>
            ) : (
              <div style={{ position: "relative", marginBottom: 10 }}>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Dove vuoi andare?" autoFocus
                  style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "0.5px solid #1a2d4a", borderRadius: 8, padding: "9px 11px", fontSize: 13, color: "#f0f4ff", outline: "none", fontFamily: "inherit" }} />
                {results.length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, marginTop: 4, background: "#0d1f3d", border: "0.5px solid #1a2d4a", borderRadius: 8, overflow: "hidden" }}>
                    {results.map((r, i) => (
                      <button key={i} type="button" onMouseDown={() => { setDest(r); clearResults(); if (!title) setTitle(r.name); }}
                        style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", borderTop: i ? "0.5px solid #16233d" : "none", padding: "9px 11px", fontSize: 13, color: "#f0f4ff", cursor: "pointer" }}>
                        {r.name}{placeSubtitle(r) && <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}> · {placeSubtitle(r)}</span>}{r.kind && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginLeft: 6 }}>({r.kind})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Date */}
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <label style={{ flex: 1, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Partenza
                <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
                  style={{ width: "100%", marginTop: 4, background: "rgba(255,255,255,0.04)", border: "0.5px solid #1a2d4a", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#f0f4ff", outline: "none", fontFamily: "inherit", colorScheme: "dark" }} />
              </label>
              <label style={{ flex: 1, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Ritorno
                <input type="date" value={dateEnd} min={dateStart || undefined} onChange={e => setDateEnd(e.target.value)}
                  style={{ width: "100%", marginTop: 4, background: "rgba(255,255,255,0.04)", border: "0.5px solid #1a2d4a", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#f0f4ff", outline: "none", fontFamily: "inherit", colorScheme: "dark" }} />
              </label>
            </div>

            {/* Titolo */}
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titolo (opzionale)"
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "0.5px solid #1a2d4a", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#f0f4ff", outline: "none", fontFamily: "inherit", marginBottom: 12 }} />

            <button type="button" onClick={create} disabled={!canSave}
              style={{ width: "100%", background: canSave ? "#34d399" : "rgba(255,255,255,0.08)", border: "none", borderRadius: 8, padding: "10px", fontSize: 14, fontWeight: 700, color: canSave ? "#052e22" : "rgba(255,255,255,0.35)", cursor: canSave ? "pointer" : "default" }}>
              Aggiungi al programma
            </button>
          </div>
        )}

        {/* Lista piani */}
        {plans.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 20px 12px", color: "rgba(255,255,255,0.6)" }}>
            <CalendarClock style={{ width: 40, height: 40, margin: "0 auto 12px", opacity: 0.4 }} />
            <div style={{ fontSize: 14 }}>Nessun viaggio in programma.</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Programma la tua prossima avventura e segna le cose da fare.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {plans.map(p => <PlanCard key={p.id} plan={p} onOpen={() => setOpenId(p.id)} />)}
          </div>
        )}
      </div>

      {openPlan && <TripPlanner plan={openPlan} onClose={() => setOpenId(null)} onChanged={reload} />}
    </div>
  );
};

export default InProgramma;
