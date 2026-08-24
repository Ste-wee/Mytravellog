import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { shouldShowWelcome } from "@/components/WelcomeGate";
import {
  Compass, Hand, Cloud, Plane, BookOpen, Globe2, CalendarClock, ListChecks,
  PieChart, Shapes, Share2, Route, Tent, X, ArrowRight,
} from "lucide-react";

interface Step { Icon: React.ElementType; title: string; body: string }
interface Section { key: string; version: number; label: string; steps: Step[] }

// Un "mini tutorial" per sezione: schede esplicative alla PRIMA visita. Scelta
// deliberata rispetto allo spotlight sugli elementi reali: nessun bersaglio che
// si muove → niente timer di sincronizzazione, niente scrollIntoView, niente
// dropdown da aprire, niente selettori nei file congelati. Impossibile da
// desincronizzare per costruzione.
//
// Le versioni: alzarne una fa ricomparire quella sezione UNA volta a chi
// l'aveva già vista — si alza solo quando il contenuto cambia davvero.
// ⚠️ I seed di e2e/collaudo.mjs e e2e/verify-home.mjs spengono il tour con
// queste stesse chiavi: un bump qui va replicato lì, o i due script si
// ritrovano la scheda sopra i click (già successo col gate della città).
const SECTIONS: Record<string, Section> = {
  home: {
    key: "home", version: 2,   // v2: aggiunta la scheda del cloud
    label: "La tua Home",
    steps: [
      { Icon: Compass, title: "Benvenuto in NAV·TA", body: "Il tuo atlante di viaggio: segna dove sei stato e guardalo prendere forma sul globo." },
      { Icon: Hand, title: "Ruota il mondo", body: "Trascina il globo per girarlo. I tuoi viaggi appaiono come archi luminosi tra le città." },
      { Icon: Cloud, title: "I viaggi ti seguono", body: "Accedi con Google dalle Impostazioni: i viaggi si salvano nel cloud e li ritrovi su ogni dispositivo." },
    ],
  },
  trips: {
    key: "trips", version: 1,
    label: "I tuoi viaggi",
    steps: [
      { Icon: Plane, title: "I tuoi viaggi", body: "Ogni viaggio è un biglietto. Aggiungine uno con tappe, mezzi e date dal pulsante «Nuovo viaggio» nel menu." },
      { Icon: BookOpen, title: "Diario e ricordi", body: "Apri un biglietto per scrivere il diario giorno per giorno e rivedere il rilievo 3D del percorso." },
      { Icon: Globe2, title: "La mappa della vita", body: "Con l'icona del globo in alto trasformi tutti i viaggi in un'unica costellazione, pronta da stampare." },
    ],
  },
  plans: {
    key: "plans", version: 1,
    label: "In programma",
    steps: [
      { Icon: CalendarClock, title: "In programma", body: "I viaggi che devi ancora fare. Programma destinazione, tappe e date del tuo prossimo itinerario." },
      { Icon: ListChecks, title: "Cose da fare", body: "Segna cosa resta da organizzare e se hai già prenotato. Al ritorno tocca «Segna come fatto» e il viaggio entra nel diario." },
    ],
  },
  stats: {
    key: "stats", version: 2,   // v2: aggiunta la scheda delle forme di viaggio
    label: "Statistiche",
    steps: [
      { Icon: PieChart, title: "Le tue statistiche", body: "Km percorsi, paesi e città visitati e i tuoi record di viaggio, in un colpo d'occhio." },
      { Icon: Shapes, title: "Come e quando viaggi", body: "Le tue forme di viaggio — in giornata, tappa fissa, itineranti — e i mesi in cui parti di più, anno per anno." },
      { Icon: Share2, title: "Il recap dell'anno", body: "Genera «Il tuo anno di viaggi» e condividilo come immagine o come stories." },
    ],
  },
  // Il capitolo del form esiste per un motivo preciso: la tenda è nata quando
  // Stefano ha scoperto di avere «tappa fissa: 0» con dieci viaggi a base —
  // una funzione che non si scopre non esiste. Due schede e basta: qui
  // l'utente sta per FARE una cosa, non per leggere un manuale.
  form: {
    key: "form", version: 1,
    label: "Nuovo viaggio",
    steps: [
      { Icon: Route, title: "L'itinerario prende forma", body: "Aggiungi le tappe col loro mezzo: il percorso si disegna da solo, coi km veri strada per strada. Trascina una tappa per riordinarla." },
      { Icon: Tent, title: "Dormi sempre nello stesso posto?", body: "Tocca la tenda su una tappa per segnarla come base: le tappe dopo diventano gite che tornano lì, e il disegno mostra le notti." },
    ],
  },
};

/** L'ordine dei capitoli nel «Rivedi il tutorial» dal menu. */
const ORDINE = ["home", "trips", "plans", "stats", "form"] as const;

const PATH_TO_SECTION: Record<string, string> = {
  "/": "home",
  "/miei-viaggi": "trips",
  "/in-programma": "plans",
  "/statistiche": "stats",
  "/nuovo-viaggio": "form",
};

const flagKey = (s: Section) => `navta.tour.${s.key}.v${s.version}`;

export function AppTour() {
  const location = useLocation();
  const [active, setActive] = useState<Section | null>(null);
  const [i, setI] = useState(0);
  // Replay dal menu («Rivedi il tutorial»): tutti i capitoli in fila. Vale
  // anche come interruttore grafico: la riga «capitolo · N di M» compare solo
  // qui — alla prima visita la scheda resta pulita come sempre.
  const [replay, setReplay] = useState(false);

  // Il tour aspetta solo che la welcome NON sia visibile ORA. Il vecchio gate
  // (`navta.welcome.dismissed === "1"`) era rotto in entrambe le direzioni:
  // il flag viene scritto SOLO se la welcome è apparsa, quindi chi aveva già
  // viaggi o Drive collegato non avrebbe mai visto NESSUN tour; e l'utente
  // nuovo che la archiviava non vedeva il tour della Home nella prima
  // sessione (l'effect era già girato e non ri-scattava).
  const [welcomeGone, setWelcomeGone] = useState(() => !shouldShowWelcome());
  useEffect(() => {
    const onDismiss = () => setWelcomeGone(true);
    window.addEventListener("navta:welcome-dismissed", onDismiss);
    return () => window.removeEventListener("navta:welcome-dismissed", onDismiss);
  }, []);

  // Quale sezione mostrare, in base alla rotta (e appena la welcome se ne va).
  useEffect(() => {
    if (!welcomeGone) return;
    const key = PATH_TO_SECTION[location.pathname];
    const section = key ? SECTIONS[key] : undefined;
    if (!section) return;
    if (localStorage.getItem(flagKey(section)) === "1") return;
    setReplay(false);
    setActive(section);
    setI(0);
  }, [location.pathname, welcomeGone]);

  // «Rivedi il tutorial» dal menu: un evento window, così AppHeader (FROZEN)
  // aggiunge una voce e nient'altro — nessun context da infilare, stesso
  // pattern di navta:welcome-dismissed. Parte dal primo capitolo e ignora i
  // flag: chi lo chiede vuole rivederlo.
  useEffect(() => {
    const onReplay = () => { setReplay(true); setActive(SECTIONS[ORDINE[0]]); setI(0); };
    window.addEventListener("navta:tour-replay", onReplay);
    return () => window.removeEventListener("navta:tour-replay", onReplay);
  }, []);

  // Scroll-lock iOS-proof mentre la scheda è aperta (stesso pattern di diario/
  // pianifica): body fixed + posizione ripristinata alla chiusura.
  useEffect(() => {
    if (!active) return;
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
  }, [active]);

  // Esc = salta questa sezione (la marca come vista: non riappare). Il listener
  // va su window, NON come onKeyDown sul div del portale: quel div non ha mai il
  // focus, quindi la pressione reale (target = body) non lo raggiungerebbe mai —
  // stesso pattern di TripDiary/TripPlanner.
  // Il flag si scrive con la guardia: con lo storage PIENO setItem lancia, e
  // senza try/catch il tap su "Ho capito"/Esc moriva PRIMA di setActive(null)
  // — il tutorial diventava inchiudibile. Se il flag non si salva pazienza:
  // il tour si chiude comunque (al massimo ricompare al prossimo avvio).
  const segnaVisto = (s: Section) => {
    try { localStorage.setItem(flagKey(s), "1"); } catch { /* storage pieno */ }
  };

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { segnaVisto(active); setActive(null); setReplay(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const reduce = useMemo(
    () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  if (!active) return null;
  const step = active.steps[i];
  const last = i === active.steps.length - 1;
  const capitoloDopo = replay ? SECTIONS[ORDINE[ORDINE.indexOf(active.key as typeof ORDINE[number]) + 1]] : undefined;
  // Nell'ultima scheda di un capitolo del replay il bottone dice cosa viene
  // dopo, non "Ho capito": il tour continua.
  const ultimaDelTour = last && !capitoloDopo;

  // Due uscite con semantiche diverse: la X/Esc ABBANDONA (chiude tutto, anche
  // il replay — chi preme X vuole uscire, non passare al capitolo dopo);
  // finire le schede COMPLETA (nel replay si passa al capitolo successivo).
  // Entrambe marcano visto il capitolo corrente: il flag esiste per non
  // riproporre da solo ciò che è già passato davanti agli occhi.
  const abbandona = () => { segnaVisto(active); setActive(null); setReplay(false); };
  const fineSezione = () => {
    segnaVisto(active);
    if (capitoloDopo) { setActive(capitoloDopo); setI(0); return; }
    setActive(null); setReplay(false);
  };
  const next = () => { if (last) fineSezione(); else setI(n => n + 1); };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Tutorial — ${step.title}`}
      style={{
        position: "fixed", inset: 0, zIndex: 250, background: "rgba(2,8,20,0.74)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        animation: reduce ? undefined : "navtaTourIn 160ms ease-out",
      }}>
      <style>{"@keyframes navtaTourIn{from{opacity:0}to{opacity:1}}"}</style>
      <div style={{
        position: "relative", width: "100%", maxWidth: 320, background: "#0b1a33",
        border: "0.5px solid #2a3f5f", borderRadius: 16, padding: "22px 20px 16px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)", color: "#f0f4ff",
      }}>
        <button type="button" onClick={abbandona} aria-label="Salta il tutorial"
          style={{ position: "absolute", top: 12, right: 12, width: 28, height: 28, borderRadius: 8, background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X style={{ width: 16, height: 16 }} />
        </button>

        {/* La riga del capitolo esiste solo nel replay: percorrendo tutti i
            capitoli in fila serve sapere di QUALE pagina parla la scheda. */}
        {replay && (
          <div style={{ fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>
            {active.label} · {i + 1} di {active.steps.length}
          </div>
        )}

        <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(96,165,250,0.14)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
          <step.Icon style={{ width: 23, height: 23, color: "#60a5fa" }} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 7 }}>{step.title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: "rgba(255,255,255,0.62)" }}>{step.body}</div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {active.steps.map((_, idx) => (
              <span key={idx} style={{ width: 6, height: 6, borderRadius: 999, background: idx === i ? "#60a5fa" : "rgba(255,255,255,0.22)" }} />
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* "Salta" = fine sezione: alla prima visita chiude (com'era),
                nel replay salta al capitolo dopo — X ed Esc restano l'uscita. */}
            {!last && (
              <button type="button" onClick={fineSezione} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 12, cursor: "pointer" }}>Salta</button>
            )}
            <button type="button" onClick={next} autoFocus
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#60a5fa", border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 700, color: "#04203f", cursor: "pointer" }}>
              {ultimaDelTour ? "Ho capito" : "Avanti"}{!ultimaDelTour && <ArrowRight style={{ width: 14, height: 14 }} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
