import { useEffect, useRef, useState } from "react";
import { useT, useSettings } from "@/lib/settings";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Trip, updatePlan, deletePlan, promotePlanToTrip } from "@/lib/storage";
import { moveItem } from "@/lib/utils";
import { inserisciRientri } from "@/lib/base";
import { GeoResult } from "@/lib/geo";
import { usePlaceSearch } from "@/lib/usePlaceSearch";
import { ItineraryPanel, Waypoint, TransportMode } from "@/components/TripFormParts";
import { X, Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { useModalFocus } from "@/lib/useModalFocus";

export interface ChecklistRow { text: string; done: boolean }

interface Props {
  plan: Trip;
  onClose: () => void;
  /** Richiama il ricarico dei piani nella pagina (dopo salva / promuovi / elimina). */
  onChanged: () => void;
}

const DEFAULT_CHECKLIST: ChecklistRow[] = [
  { text: "Prenota volo", done: false },
  { text: "Prenota alloggio", done: false },
  { text: "Documenti / passaporto", done: false },
];

/**
 * Pannello di pianificazione di un viaggio "in programma": itinerario con i
 * mezzi + checklist "da organizzare". Niente soldi: l'app non tiene conti.
 * Portal a schermo intero, si salva alla chiusura. "Segna come fatto" sposta
 * il viaggio nel diario (promotePlanToTrip). Scroll pagina bloccato (iOS-proof).
 */
export function TripPlanner({ plan, onClose, onChanged }: Props) {
  // Il pannello dichiara aria-modal: focus dentro finché è aperto, e ritorno
  // al pulsante che l'ha aperto alla chiusura.
  const modalRef = useModalFocus<HTMLDivElement>();
  const navigate = useNavigate();
  const s = useSettings();
  const t = useT();
  // "dirty": l'utente ha toccato qualcosa. Senza questo flag, aprire e chiudere
  // il pannello salvava le categorie/voci di default precompilate (dati mai
  // inseriti dall'utente) e la card mostrava "0/3 fatte" dal nulla.
  const dirtyRef = useRef(false);

  // ——— Itinerario: stesso ItineraryPanel di Nuovo viaggio (riusato, non copiato).
  // Le tappe del piano = plan.waypoints (intermedie) + la meta finale ricostruita
  // dai campi destinazione del Trip; alla chiusura si ri-scompone allo stesso modo.
  // A differenza di Nuovo viaggio, QUI non si calcola nulla (percorsi/meteo/km):
  // il piano è intenzione, le misure arrivano alla promozione in Modifica.
  // ⚠️ `?? NaN` e non `?? 0`: una tappa senza coordinate resta senza. Con lo
  // zero diventava (0,0) — l'isola nulla nel Golfo di Guinea — e siccome qui
  // sotto (`persist`) l'itinerario si RISCRIVE nel piano, bastava aprire questo
  // pannello, toccare qualcosa (una voce della checklist) e chiuderlo per
  // stampare quel punto nei dati. Da lì nascono
  // basi inventate (due tappe ignote sembrano lo stesso posto, vedi
  // `postoNoto` in lib/base.ts) e puntine in mezzo all'oceano. `NaN`
  // attraversa i controlli `hasCoords` come il nulla che è, e il salvataggio
  // lo scrive `null`, che è il dato onesto.
  const [waypoints, setWaypoints] = useState<Waypoint[]>(() => {
    const mid: Waypoint[] = (plan.waypoints ?? []).map(w => ({
      id: w.id ?? crypto.randomUUID(), city: w.city, country: w.country,
      country_code: w.country_code ?? "", lat: w.lat ?? NaN, lon: w.lon ?? NaN,
      transport_mode: w.transport_mode,
    }));
    if (!plan.city) return mid;
    return [...mid, {
      id: "dest-" + plan.id, city: plan.city, country: plan.country,
      country_code: plan.country_code ?? "", lat: plan.latitude ?? NaN, lon: plan.longitude ?? NaN,
      transport_mode: (plan.transport_mode ?? "plane") as TransportMode,
    }];
  });
  const [home, setHome] = useState<{ lat: number; lon: number; label: string } | null>(() =>
    plan.home_latitude != null && plan.home_longitude != null && plan.home_label
      ? { lat: plan.home_latitude, lon: plan.home_longitude, label: plan.home_label }
      : (s.homeCity ? { lat: s.homeCity.lat, lon: s.homeCity.lon, label: s.homeCity.label } : null),
  );
  const [editingHome, setEditingHome] = useState(false);
  const [homeQuery, setHomeQuery] = useState("");
  const [wpQuery, setWpQuery] = useState("");
  const [wpOpen, setWpOpen] = useState(false);
  const [wpTransport, setWpTransport] = useState<TransportMode>("plane");

  // Le due ricerche (residenza e mete) vivono in usePlaceSearch: debounce,
  // guardia anti-race e scelta della fonte sono scritti UNA volta sola.
  // ignora: aprendo ✎ la query parte già uguale all'etichetta corrente e
  // senza guardia si cercava subito "Milano, Italia" aprendo una lista inutile
  // (stessa semantica di Impostazioni).
  const { results: homeResults, clear: clearHomeResults } = usePlaceSearch(homeQuery, { ignora: home?.label ?? null });
  const { results: wpResults, loading: wpLoading, clear: clearWpResults } = usePlaceSearch(wpQuery, { luoghi: true, limite: 5 });

  const addWaypoint = (r: GeoResult) => {
    dirtyRef.current = true;
    setWaypoints(prev => [...prev, {
      id: crypto.randomUUID(),
      city: r.name, country: r.country, country_code: r.country_code ?? "",
      lat: r.latitude, lon: r.longitude, transport_mode: wpTransport,
    }]);
    setWpQuery(""); clearWpResults(); setWpOpen(false);
  };
  const removeWaypoint = (i: number) => { dirtyRef.current = true; setWaypoints(prev => prev.filter((_, idx) => idx !== i)); };
  // dirtyRef va segnato anche qui: prima ci pensava l'hack onRemoveWaypoint(-99)
  // che il selettore del mezzo usava per forzare il re-render.
  const moveWaypoint = (from: number, to: number) =>
    setWaypoints(prev => moveItem(prev, from, to));
  /**
   * Segna la tappa come base: scrive nell'itinerario un rientro dopo ogni
   * tappa successiva. Non è finzione — quei chilometri li hai percorsi, e
   * l'app riconosce la base proprio dai rientri (nessun campo nuovo).
   */
  const segnaBase = (i: number) => {
    dirtyRef.current = true;
    setWaypoints(prev => inserisciRientri(prev, i, base => ({ ...base, id: crypto.randomUUID() })));
  };
  const changeTransport = (i: number, mode: TransportMode) => {
    dirtyRef.current = true;
    setWaypoints(prev => prev.map((w, idx) => idx === i ? { ...w, transport_mode: mode } : w));
  };

  const [checklist, setChecklist] = useState<ChecklistRow[]>(() =>
    plan.checklist && plan.checklist.length ? plan.checklist.map(r => ({ ...r })) : DEFAULT_CHECKLIST.map(r => ({ ...r })),
  );

  const doneCount = checklist.filter(c => c.done).length;

  // Blocco scroll pagina sotto (iOS-proof): body fixed + posizione ripristinata.
  useEffect(() => {
    const html = document.documentElement, body = document.body;
    const scrollY = window.scrollY;
    const prev = { htmlO: html.style.overflow, pos: body.style.position, top: body.style.top, w: body.style.width };
    html.style.overflow = "hidden";
    body.style.position = "fixed"; body.style.top = `-${scrollY}px`; body.style.left = "0"; body.style.right = "0"; body.style.width = "100%";
    return () => {
      html.style.overflow = prev.htmlO;
      body.style.position = prev.pos; body.style.top = prev.top; body.style.left = ""; body.style.right = ""; body.style.width = prev.w;
      window.scrollTo(0, scrollY);
    };
  }, []);

  const persist = () => {
    if (!dirtyRef.current) return; // aperto e chiuso senza modifiche: non scrivere nulla
    const c = checklist.filter(r => r.text.trim()).map(r => ({ text: r.text.trim(), done: r.done }));
    const patch: Parameters<typeof updatePlan>[1] = {
      checklist: c.length ? c : undefined,
    };
    // Itinerario: ultima tappa = destinazione del Trip, le precedenti = waypoints.
    // Con zero tappe (tutte rimosse) i campi destinazione precedenti restano:
    // un Trip senza città non è rappresentabile.
    if (waypoints.length > 0) {
      const dest = waypoints[waypoints.length - 1];
      patch.waypoints = waypoints.slice(0, -1).map(w => ({
        id: w.id, city: w.city, country: w.country, country_code: w.country_code,
        transport_mode: w.transport_mode, lat: w.lat, lon: w.lon, route_geometry: null,
      }));
      patch.city = dest.city; patch.country = dest.country; patch.country_code = dest.country_code;
      patch.latitude = dest.lat; patch.longitude = dest.lon; patch.transport_mode = dest.transport_mode;
    } else {
      // Tutte le tappe rimosse: la destinazione resta (un Trip senza città non
      // è rappresentabile), ma le INTERMEDIE vanno svuotate — senza questo
      // ramo alla riapertura risorgevano tutte.
      patch.waypoints = [];
    }
    patch.home_latitude = home?.lat ?? null;
    patch.home_longitude = home?.lon ?? null;
    patch.home_label = home?.label ?? null;
    updatePlan(plan.id, patch);
    dirtyRef.current = false; // già scritto: il persist di smontaggio non riscrive
    onChanged();
  };

  const close = () => { persist(); onClose(); };

  // Ref sempre aggiornate per i listener/cleanup qui sotto (evitano closure stantie).
  const persistRef = useRef(persist); persistRef.current = persist;
  const closeRef = useRef(close); closeRef.current = close;

  // Esc chiude (salvando) + persist allo SMONTAGGIO: il back di Android/lo
  // swipe indietro cambiano rotta e smontano il pannello senza passare dalla
  // X — senza questo cleanup itinerario e checklist modificati andavano persi.
  // Dopo la promozione/eliminazione updatePlan non trova più l'id: no-op.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); persistRef.current(); };
  }, []);

  // Wrapper degli update di stato che marcano il pannello come "toccato".
  const mutChecklist = (fn: (rows: ChecklistRow[]) => ChecklistRow[]) => { dirtyRef.current = true; setChecklist(fn); };

  const promote = () => {
    if (!window.confirm(t("Segnare «{viaggio}» come fatto? Verrà spostato nei tuoi viaggi.", { viaggio: plan.title || plan.city }))) return;
    persist();
    promotePlanToTrip(plan.id);
    toast.success(t("Spostato nei tuoi viaggi ✓ Completa itinerario e dettagli."));
    // Dritto in Modifica: il piano promosso è uno scheletro (niente itinerario,
    // km, casa) e questo è il momento giusto per completarlo.
    navigate(`/modifica-viaggio/${plan.id}`);
  };

  const remove = () => {
    if (!window.confirm(t("Eliminare il viaggio in programma «{viaggio}»?", { viaggio: plan.title || plan.city }))) return;
    deletePlan(plan.id);
    toast.success(t("Piano eliminato"));
    onChanged();
    onClose();
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", margin: "0 0 10px",
  };

  return createPortal(
    <div ref={modalRef} role="dialog" aria-modal="true" aria-label={`Pianifica — ${plan.title || plan.city}`}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "#060e1e", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "0.5px solid rgba(255,255,255,0.1)", background: "rgba(6,14,30,0.95)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#f0f4ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            🧭 Pianifica — {plan.title || plan.city}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
            {t("Cose da organizzare · si salva da solo")}
          </div>
        </div>
        <button type="button" onClick={close} aria-label={t("Chiudi la pianificazione")}
          style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "0.5px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.8)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X style={{ width: 18, height: 18 }} />
        </button>
      </div>

      {/* Corpo scrollabile */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", padding: 16 }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>

          {/* ITINERARIO — lo stesso pannello di Nuovo viaggio, con i mezzi per
              tratta: per chi pianifica nel dettaglio il "come" conta quanto il "dove". */}
          <div style={{ marginBottom: 28 }}>
            <ItineraryPanel
              waypoints={waypoints} home={home}
              onEditHome={() => { setEditingHome(v => !v); setHomeQuery(home?.label ?? ""); }}
              editingHome={editingHome}
              homeQuery={homeQuery} setHomeQuery={setHomeQuery}
              homeResults={homeResults}
              onSelectHome={r => {
                dirtyRef.current = true;
                setHome({ lat: r.latitude, lon: r.longitude, label: `${r.name}, ${r.country}` });
                setHomeQuery(`${r.name}, ${r.country}`);
                clearHomeResults(); setEditingHome(false);
              }}
              onRemoveWaypoint={removeWaypoint}
              onChangeTransport={changeTransport}
          onMoveWaypoint={moveWaypoint}
          onSegnaBase={segnaBase}
              wpTransport={wpTransport} setWpTransport={setWpTransport}
              wpOpen={wpOpen} setWpOpen={setWpOpen}
              wpQuery={wpQuery} setWpQuery={setWpQuery}
              wpResults={wpResults} wpLoading={wpLoading}
              onAddWaypoint={addWaypoint}
            />
          </div>

          {/* CHECKLIST */}
          <div style={{ ...sectionTitle, marginTop: 28 }}>
            {t("Da organizzare")} {checklist.length > 0 && <span style={{ color: "#60a5fa" }}>· {doneCount}/{checklist.length}</span>}
          </div>
          {checklist.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <button type="button" onClick={() => mutChecklist(rows => rows.map((r, idx) => idx === i ? { ...r, done: !r.done } : r))}
                aria-label={c.done ? "Segna da fare" : "Segna fatto"} role="checkbox" aria-checked={c.done}
                style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, border: "1.5px solid " + (c.done ? "#34d399" : "#2a3f5f"), background: c.done ? "rgba(52,211,153,0.18)" : "transparent", color: "#34d399", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                {c.done && <Check style={{ width: 14, height: 14 }} />}
              </button>
              <input value={c.text} onChange={e => mutChecklist(rows => rows.map((r, idx) => idx === i ? { ...r, text: e.target.value } : r))}
                placeholder={t("Cosa c'è da fare?")} aria-label={t("Voce da organizzare")}
                style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", borderBottom: "0.5px solid #1a2d4a", padding: "5px 2px", fontSize: 13, color: c.done ? "rgba(255,255,255,0.4)" : "#f0f4ff", textDecoration: c.done ? "line-through" : "none", outline: "none", fontFamily: "inherit" }} />
              <button type="button" onClick={() => mutChecklist(rows => rows.filter((_, idx) => idx !== i))} aria-label={t("Rimuovi voce")}
                style={{ flexShrink: 0, background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", padding: 4 }}>
                <Trash2 style={{ width: 15, height: 15 }} />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => mutChecklist(rows => [...rows, { text: "", done: false }])}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: "none", color: "#60a5fa", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "2px 0", marginTop: 2 }}>
            <Plus style={{ width: 14, height: 14 }} /> {t("aggiungi cosa da fare")}
          </button>

          {/* Azioni */}
          <div style={{ display: "flex", gap: 10, marginTop: 32, paddingTop: 18, borderTop: "0.5px solid rgba(255,255,255,0.08)" }}>
            <button type="button" onClick={promote}
              style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, background: "#34d399", border: "none", borderRadius: 10, padding: "11px 14px", fontSize: 14, fontWeight: 700, color: "#052e22", cursor: "pointer" }}>
              <Check style={{ width: 17, height: 17 }} /> Segna come fatto
            </button>
            <button type="button" onClick={remove} aria-label={t("Elimina piano")}
              style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "0.5px solid rgba(248,113,113,0.4)", borderRadius: 10, padding: "11px 14px", color: "#f87171", cursor: "pointer" }}>
              <Trash2 style={{ width: 17, height: 17 }} />
            </button>
          </div>

        </div>
      </div>
    </div>,
    document.body,
  );
}
