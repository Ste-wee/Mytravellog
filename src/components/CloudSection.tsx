import { useCloud } from "@/lib/cloudContext";
import { useT } from "@/lib/settings";
import { localeAttivo } from "@/lib/settings";
import { GoogleG } from "@/components/GoogleG";
import { Loader2, Check, AlertTriangle, LogOut } from "lucide-react";

function relativeTime(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 10) return "pochi secondi fa";
  if (s < 60) return `${s} secondi fa`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} ${m === 1 ? "minuto" : "minuti"} fa`;
  return new Date(ms).toLocaleString(localeAttivo(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function CloudSection() {
  const t = useT();
  const { status, email, lastSyncAt, errorMsg, configurato, connect, disconnect } = useCloud();

  if (!configurato) {
    return (
      <p className="text-xs text-muted-foreground">
        Il salvataggio nel cloud non è ancora configurato in questa versione dell'app.
        I viaggi restano su questo dispositivo.
      </p>
    );
  }

  const connected = status === "connected" || status === "syncing";

  if (connected) {
    return (
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm text-foreground">
            <GoogleG size={16} /> {email ?? "Account Google"}
          </span>
          <button
            onClick={() => disconnect()}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive hover:opacity-80 transition-opacity"
          >
            <LogOut className="w-3.5 h-3.5" /> Disconnetti
          </button>
        </div>

        <div className="mt-3 pt-3 border-t border-border">
          {status === "syncing" ? (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sincronizzazione…
            </p>
          ) : (
            <p className="text-xs flex items-center gap-2" style={{ color: "#34d399" }}>
              <Check className="w-3.5 h-3.5" />
              {lastSyncAt ? `Sincronizzato · ${relativeTime(lastSyncAt)}` : "Connesso"}
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            I viaggi si salvano nel cloud a ogni modifica, e tornano su ogni dispositivo
            dove entri con lo stesso account. Le foto restano sul dispositivo.
          </p>
        </div>
      </div>
    );
  }

  if (status === "connecting") {
    return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  }

  // Il backup c'è ma non si capisce: non si scrive più niente da qui, o si
  // coprirebbe qualcosa che forse si può ancora recuperare a mano.
  if (status === "corrotto") {
    return (
      <p role="alert" className="text-xs text-destructive flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-none" />
        <span>{errorMsg}</span>
      </p>
    );
  }

  // guest | error
  return (
    <div className="space-y-3">
      {/* Si mostra QUANDO C'È, non solo in stato "error": un accesso
          annullato torna a guest col suo messaggio, e legarlo allo stato lo
          rendeva invisibile (trovato dal vivo chiudendo il popup). */}
      {errorMsg && (
        <p role="alert" className="text-xs text-destructive flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> {errorMsg}
        </p>
      )}

      <button
        onClick={() => connect()}
        className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl text-sm font-semibold bg-white text-[#1f1f1f] hover:bg-white/90 transition-colors"
      >
        <GoogleG size={16} /> Accedi con Google
      </button>

      {/* Prima qui c'era scritto "i dati restano nel tuo account Google": era
          vero quando il file viveva nella Drive dell'utente. Ora vivono nel
          database dell'app, e la frase dev'essere quella giusta. */}
      <p className="text-xs text-muted-foreground">
        {t("🔒 Solo tu puoi leggerli: nel database ogni archivio è legato al suo account, e nessun altro account può aprirlo.")}
      </p>
    </div>
  );
}
