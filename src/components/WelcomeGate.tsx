import { useEffect, useState } from "react";
import { loadTrips } from "@/lib/storage";
import { useCloud } from "@/lib/cloudContext";
import { GoogleG } from "@/components/GoogleG";
import { Loader2, AlertTriangle } from "lucide-react";

const DISMISS_KEY = "navta.welcome.dismissed";
/** Scritto dopo la PRIMA sincronizzazione riuscita: dice che questo
 *  dispositivo il cloud l'ha già visto. Prima si guardava un flag posato al
 *  collegamento; con la sessione di Firebase quel flag non esiste più, e
 *  questo dice la stessa cosa in modo più onesto (non "ha premuto il bottone"
 *  ma "i dati sono davvero passati di qui"). */
const SYNCED_KEY = "navta.cloud.localTs";

/**
 * La welcome compare SOLO su un dispositivo "vergine": mai sincronizzato,
 * zero viaggi, mai saltata. Un tap su una delle due strade la archivia per
 * sempre (da ospite ci si può sempre collegare dalle Impostazioni).
 */
export function shouldShowWelcome(): boolean {
  try {
    if (localStorage.getItem(DISMISS_KEY) === "1") return false;
    if (localStorage.getItem(SYNCED_KEY)) return false;
    return loadTrips().length === 0;
  } catch {
    return false; // storage inaccessibile: mai bloccare l'ingresso
  }
}

/** Logo dell'app (stesso disegno dell'AppHeader, in grande) + wordmark. */
function AppLogo() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <div style={{
        width: 76, height: 76, borderRadius: 22, background: "#60a5fa",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 12px 40px rgba(96,165,250,0.35)",
      }}>
        <svg width="50" height="50" viewBox="0 0 30 30" fill="none" aria-hidden="true">
          <circle cx="15" cy="15" r="11" stroke="#020d1a" strokeWidth="1.6" />
          <ellipse cx="15" cy="15" rx="11" ry="4.8" stroke="#020d1a" strokeWidth="1.2" />
          <ellipse cx="15" cy="15" rx="6.5" ry="11" stroke="#020d1a" strokeWidth="1.2" />
          <polygon points="15,5.5 13.5,13 15,11.5 16.5,13" fill="#ffffff" />
          <polygon points="15,24.5 13.5,17 15,18.5 16.5,17" fill="#ffffff" opacity="0.35" />
          <polygon points="24.5,15 17,13.5 18.5,15 17,16.5" fill="#fbbf24" />
          <polygon points="5.5,15 13,13.5 11.5,15 13,16.5" fill="#fbbf24" opacity="0.35" />
        </svg>
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "0.22em", margin: 0, lineHeight: 1 }}>
        <span style={{ color: "#60a5fa" }}>NAV</span>
        <span style={{ color: "#fbbf24" }}>·</span>
        <span style={{ color: "#f0f4ff" }}>TA</span>
      </h1>
    </div>
  );
}

export function WelcomeGate() {
  const [visible, setVisible] = useState(shouldShowWelcome);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { connect } = useCloud();

  // BLOCCA lo scroll della pagina sotto finché la welcome è aperta: senza,
  // su mobile il dito scorreva il contenuto dietro al velo (si vedevano le
  // Impostazioni "sotto" il login) e su iOS l'overscroll fa "ballare" anche
  // gli elementi fixed. Pattern a prova di iOS: body position:fixed (il solo
  // overflow:hidden su iOS Safari non ferma il touch-scroll), con la posizione
  // di scroll congelata e ripristinata alla chiusura.
  useEffect(() => {
    if (!visible) return;
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const prev = {
      htmlOverflow: html.style.overflow,
      position: body.style.position, top: body.style.top,
      left: body.style.left, right: body.style.right, width: body.style.width,
    };
    html.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0"; body.style.right = "0"; body.style.width = "100%";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.position = prev.position; body.style.top = prev.top;
      body.style.left = prev.left; body.style.right = prev.right; body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, [visible]);

  if (!visible) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* pazienza */ }
    setVisible(false);
    // Avvisa chi aspetta la fine della welcome (AppTour): il suo effect è già
    // girato al mount e senza questo segnale il tour della prima sessione non
    // comparirebbe mai (ricontrollava solo al cambio rotta).
    window.dispatchEvent(new Event("navta:welcome-dismissed"));
  };

  const handleGoogle = async () => {
    setBusy(true);
    setError(null);
    // connect() dice se l'accesso è andato a buon fine: la sincronizzazione
    // vera parte dopo, in sottofondo, e non c'è motivo di trattenere qui chi
    // è appena entrato.
    if (await connect()) dismiss();
    else { setBusy(false); setError("Accesso non riuscito. Riprova, o entra come ospite."); }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100, background: "#060e1e",
      display: "flex", padding: 28,
      // scroll interno su schermi bassi, senza MAI incatenarsi alla pagina
      // sotto; il centraggio è margin:auto sul figlio (alignItems:center +
      // overflow taglierebbe la parte alta quando il contenuto non ci sta).
      overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch",
      // cielo stellato leggero, coerente con la Home
      backgroundImage: `radial-gradient(1px 1px at 12% 18%, rgba(255,255,255,0.5), transparent),
        radial-gradient(1px 1px at 78% 12%, rgba(255,255,255,0.35), transparent),
        radial-gradient(1.5px 1.5px at 38% 34%, rgba(255,255,255,0.4), transparent),
        radial-gradient(1px 1px at 88% 42%, rgba(255,255,255,0.3), transparent),
        radial-gradient(1px 1px at 22% 62%, rgba(255,255,255,0.35), transparent),
        radial-gradient(1.5px 1.5px at 64% 74%, rgba(255,255,255,0.45), transparent),
        radial-gradient(1px 1px at 10% 88%, rgba(255,255,255,0.3), transparent),
        radial-gradient(1px 1px at 92% 86%, rgba(255,255,255,0.35), transparent)`,
    }}>
      <div style={{ width: "100%", maxWidth: 340, textAlign: "center", margin: "auto" }}>
        <AppLogo />
        <p style={{ marginTop: 14, fontSize: 13.5, lineHeight: 1.6, color: "rgba(255,255,255,0.55)" }}>
          Il tuo atlante personale di viaggio.<br />Ogni meta, una stella.
        </p>

        <div style={{ marginTop: 36, display: "flex", flexDirection: "column", gap: 10 }}>
          <button type="button" onClick={handleGoogle} disabled={busy}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
              padding: "13px 16px", borderRadius: 14, border: "none", cursor: busy ? "default" : "pointer",
              background: "#ffffff", color: "#1f1f1f", fontSize: 14, fontWeight: 700, opacity: busy ? 0.7 : 1,
            }}>
            {busy ? <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> : <GoogleG size={16} />}
            Accedi con Google
          </button>
          <button type="button" onClick={dismiss} disabled={busy}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "13px 16px", borderRadius: 14, cursor: busy ? "default" : "pointer",
              background: "rgba(255,255,255,0.06)", border: "0.5px solid rgba(255,255,255,0.22)",
              color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: 600,
            }}>
            Entra come ospite
          </button>
        </div>

        {error && (
          <p role="alert" style={{ marginTop: 14, fontSize: 12, color: "#f87171", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <AlertTriangle style={{ width: 14, height: 14 }} /> {error}
          </p>
        )}

        {/* Con Drive i dati stavano davvero nell'account Google dell'utente;
            con Firestore stanno nel database dell'app, legati al suo account.
            La frase vecchia era diventata una promessa falsa (trovata da
            Stefano su questa schermata dopo che era già stata corretta nelle
            Impostazioni: la stessa frase viveva in DUE posti). */}
        <p style={{ marginTop: 18, fontSize: 11.5, lineHeight: 1.6, color: "rgba(255,255,255,0.5)" }}>
          🔒 I viaggi si salvano nel cloud, legati al tuo account: solo tu puoi vederli.
        </p>
        <p style={{ marginTop: 6, fontSize: 11, lineHeight: 1.6, color: "rgba(255,255,255,0.6)" }}>
          Da ospite puoi collegarti quando vuoi dalle Impostazioni.
        </p>
      </div>
    </div>
  );
}
