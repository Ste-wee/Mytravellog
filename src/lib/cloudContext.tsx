import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { loadTrips, saveTrips, loadPlans, savePlans, loadTombstones, saveTombstones, mergeTombstones, Trip } from "@/lib/storage";
import { deletePhotosForTrip } from "@/lib/photoStorage";
import { BACKUP_VERSION, mergeTrips } from "@/lib/backup";
import { onAuth, accedi, esci, leggiArchivio, scriviArchivio, UtenteCloud } from "@/lib/firebaseSync";
import { cloudConfigurato } from "@/lib/firebaseConfig";
import { tr } from "@/lib/settings";

/**
 * `corrotto` è uno stato a sé, non un errore qualunque: il documento nel cloud
 * c'è ma non si capisce. Da lì NON si scrive più niente, altrimenti il backup
 * (magari recuperabile a mano) verrebbe coperto dai dati di questo dispositivo.
 */
export type CloudStatus = "guest" | "connecting" | "connected" | "syncing" | "error" | "corrotto";

// Impronta locale per il rilevamento delle modifiche: include SIA i viaggi SIA
// i piani, così anche una modifica ai piani in programma fa scattare un push.
const localSnapshot = () => JSON.stringify({ t: loadTrips(), p: loadPlans() });

// La STESSA impronta, ma calcolata dai dati appena sincronizzati invece che
// rileggendo localStorage: una modifica fatta DURANTE l'upload entrava
// nell'hash post-write e il watcher la considerava già sincronizzata (non la
// pushava mai più). Replica l'ordinamento di loadTrips (desc) / loadPlans (asc).
const snapshotOf = (trips: Trip[], plans: Trip[]) => JSON.stringify({
  t: [...trips].sort((a, b) => (b.trip_date || "").localeCompare(a.trip_date || "")),
  p: [...plans].sort((a, b) => (a.trip_date || "").localeCompare(b.trip_date || "")),
});

interface CloudContextValue {
  status: CloudStatus;
  email: string | null;
  lastSyncAt: number | null;
  errorMsg: string | null;
  configurato: boolean;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
}

const CloudContext = createContext<CloudContextValue | null>(null);

const LS_TS = "navta.cloud.localTs";        // ms dell'ultima modifica locale nota
/**
 * "1" quando l'utente ha scelto di scollegarsi.
 *
 * Serve perché un `signOut` chiesto SENZA rete non parte, ma la sessione di
 * Firebase resta in locale: al riavvio l'app si ritroverebbe collegata da sola,
 * contro la volontà dell'utente. Con questo flag, se all'avvio arriva ancora un
 * utente si completa l'uscita invece di ricollegarsi.
 */
export const LS_SCOLLEGATO = "navta.cloud.scollegato";
/** Chiave del cancello d'ingresso: scollegandosi la si toglie, così la
 *  schermata di accesso torna. Vive in WelcomeGate.tsx, ma la stessa stringa
 *  in due file è già stata una fonte di guai (la promessa sulla privacy
 *  corretta in un posto solo): qui si importa da là, non si riscrive. */
const LS_WELCOME = "navta.welcome.dismissed";
/** Avvisa il cancello d'ingresso che l'utente è uscito di sua volontà. */
export const EVENTO_SCOLLEGATO = "navta:cloud-scollegato";

/**
 * Provider del backup automatico nel cloud. Monta il motore di sync a livello
 * app (così cattura le modifiche fatte in ogni pagina): all'accesso
 * scarica+unisce+ricarica; poi un watcher leggero (ogni 4s, solo a scheda
 * visibile) ricarica quando i viaggi cambiano; ripush anche quando la scheda
 * passa in background. La sessione si ripesca da sola al riavvio.
 *
 * Dal 2026-08-22 il trasporto è Firebase (Auth + Firestore) invece di Google
 * Drive: la sessione non scade più, e con lei è sparito lo stato "expired" e
 * tutto il ballo dei token. La FUSIONE dei dati è rimasta identica —
 * `mergeTrips` viaggio per viaggio, lapidi unite nei due sensi — perché è lì
 * che vivevano i bug peggiori del progetto.
 */
export function CloudProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<CloudStatus>("guest");
  const [email, setEmail] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const utenteRef = useRef<UtenteCloud | null>(null);
  const syncedHashRef = useRef<string>("");
  const busyRef = useRef(false);
  const intervalRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  /** Un accesso già in corso: il secondo tocco sul bottone aprirebbe un
   *  secondo popup che annulla il primo, e con lui la prima fusione. */
  const accessoInCorsoRef = useRef(false);
  /** La prima sincronizzazione è fallita: si riprova quando si tornerà
   *  sull'app, invece di restare in errore fino al prossimo riavvio. */
  const daRiprovareRef = useRef(false);
  /** Il backup nel cloud è illeggibile: DA QUI NON SI RIPROVA più niente in
   *  automatico, né watcher né flush — ogni giro rifarebbe la stessa lettura,
   *  farebbe sfarfallare la UI fra "syncing" e l'avviso, e non caverebbe un
   *  ragno dal buco. Si riparte solo riaprendo l'app, dopo aver sistemato il
   *  documento a mano. */
  const corrottoRef = useRef(false);
  /**
   * Ogni accesso e ogni uscita aprono una "generazione". Una sincronizzazione
   * partita in una generazione precedente non deve più toccare lo stato.
   *
   * Serve perché una sincronizzazione dura secondi (lettura + scrittura su
   * rete) e nel frattempo l'utente può scollegarsi: il finale di `doSync` era
   * protetto solo dal montaggio, quindi atterrava e rimetteva "connected".
   * Segnalato da Stefano premendo Disconnetti durante "Sincronizzazione…":
   * tornava collegato da solo.
   */
  const generazioneRef = useRef(0);

  const getLocalTs = () => Number(localStorage.getItem(LS_TS) || 0);
  const setLocalTs = (v: number) => { try { localStorage.setItem(LS_TS, String(v)); } catch { /* quota */ } };

  /**
   * Legge il remoto, lo FONDE col locale (mai una sovrascrittura secca) e
   * ricarica il risultato. Chi chiama tiene il lock per tutta la durata.
   */
  const doSync = async (uid: string) => {
    const mia = generazioneRef.current;
    /** Questa sincronizzazione conta ancora? (montati, e nessun cambio di
     *  account o uscita avvenuti mentre eravamo sulla rete) */
    const attuale = () => mountedRef.current && generazioneRef.current === mia;
    const remote = await leggiArchivio(uid);   // può lanciare "archivio_corrotto"
    // Scollegati mentre leggevamo: si lascia tutto com'è, né in locale né nel
    // cloud. Chi è appena uscito non deve vedersi tornare i dati addosso.
    if (!attuale()) return;
    const local = loadTrips();
    const localPlans = loadPlans();
    const now = Date.now();
    // Cancellazioni: unione dei due lati (per ogni id vince la più recente),
    // così valgono in entrambe le direzioni e nessun viaggio resuscita.
    const delTrips = mergeTombstones(loadTombstones("trips"), remote?.deletedTrips ?? []);
    const delPlans = mergeTombstones(loadTombstones("plans"), remote?.deletedPlans ?? []);
    const merged = remote && Array.isArray(remote.trips)
      ? mergeTrips(local, getLocalTs(), remote.trips, remote.updatedAt || 0, delTrips)
      : local;
    const mergedPlans = remote && Array.isArray(remote.plans)
      ? mergeTrips(localPlans, getLocalTs(), remote.plans, remote.updatedAt || 0, delPlans)
      : localPlans;
    const okTrips = saveTrips(merged);
    const okPlans = savePlans(mergedPlans);
    saveTombstones("trips", delTrips);
    saveTombstones("plans", delPlans);
    // Foto/rilievi dei viaggi uccisi dal merge (cancellati altrove): senza
    // questa pulizia i blob restavano orfani in IndexedDB per sempre.
    const mergedIds = new Set(merged.map(t => t.id));
    // NB: si passa il VIAGGIO, non il suo id.
    for (const t of local) if (!mergedIds.has(t.id)) deletePhotosForTrip(t).catch(() => { /* best effort */ });
    // Il backup remoto si scrive COMUNQUE (protegge i dati anche se il locale
    // è pieno); ma se il salvataggio locale è fallito per quota, non si dichiara
    // "sincronizzato": LS_TS e hash non avanzano e lo stato diventa errore.
    await scriviArchivio(uid, {
      version: BACKUP_VERSION, updatedAt: now, trips: merged, plans: mergedPlans,
      deletedTrips: delTrips, deletedPlans: delPlans,
    });
    if (!okTrips || !okPlans) {
      if (attuale()) { setStatus("error"); setErrorMsg("Spazio del browser esaurito: i dati sul dispositivo non sono aggiornati (il backup nel cloud sì)."); }
      return;
    }
    if (!attuale()) return;   // uscita arrivata durante la scrittura nel cloud
    setLocalTs(now);
    // Hash dai dati appena scritti, NON da localStorage: una modifica arrivata
    // durante l'upload deve risultare "da pushare", non già sincronizzata.
    syncedHashRef.current = snapshotOf(merged, mergedPlans);
    setLastSyncAt(now); setStatus("connected"); setErrorMsg(null);
    daRiprovareRef.current = false;
    corrottoRef.current = false;   // il documento è tornato leggibile (o è nuovo)
  };

  /** Traduce un guasto in uno stato leggibile. */
  const inGuaio = (e: unknown) => {
    const causa = e instanceof Error ? e.message : String(e);
    if (!mountedRef.current) return;
    if (causa === "archivio_corrotto") {
      corrottoRef.current = true;   // spegne watcher e flush: vedi la nota sul ref
      setStatus("corrotto");
      setErrorMsg("Il backup nel cloud è illeggibile. Non lo tocchiamo: i tuoi dati su questo dispositivo restano al sicuro.");
      return;   // niente ritentativi: si scriverebbe sopra un backup recuperabile
    }
    setStatus("error");
    setErrorMsg(causa === "archivio_troppo_grande"
      ? tr("L'archivio ha superato il tetto di un documento nel cloud. I dati sul dispositivo sono al sicuro.")
      : tr("Sincronizzazione non riuscita: si riprova da sola."));
    daRiprovareRef.current = true;
  };

  const pushLocal = async () => {
    const u = utenteRef.current;
    if (!u) return;
    const mia = generazioneRef.current;
    try { await doSync(u.uid); }
    // Un guasto di una sincronizzazione già superata non è un errore da
    // mostrare: chi si è scollegato non deve leggere "sincronizzazione non
    // riuscita" sotto il bottone di accesso.
    catch (e) { if (generazioneRef.current === mia) inGuaio(e); }
  };

  const stopWatcher = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };
  const startWatcher = () => {
    stopWatcher();
    intervalRef.current = window.setInterval(() => {
      if (document.hidden || busyRef.current || !utenteRef.current || corrottoRef.current) return;
      if (localSnapshot() === syncedHashRef.current) return; // niente di nuovo
      busyRef.current = true;
      if (mountedRef.current) setStatus("syncing");
      pushLocal().finally(() => { busyRef.current = false; });
    }, 4000);
  };

  /** Prima sincronizzazione dopo l'accesso: lock per tutto il read-modify-write. */
  const primaSync = async (uid: string) => {
    const mia = generazioneRef.current;
    busyRef.current = true;
    if (mountedRef.current) setStatus("syncing");
    try { await doSync(uid); }
    catch (e) { if (generazioneRef.current === mia) throw e; }   // uscito: guasto ormai irrilevante
    finally { busyRef.current = false; }
  };

  const connect = async (): Promise<boolean> => {
    if (accessoInCorsoRef.current) return false;   // doppio tocco: il secondo popup uccide il primo
    accessoInCorsoRef.current = true;
    setErrorMsg(null);
    setStatus("connecting");
    try {
      localStorage.removeItem(LS_SCOLLEGATO);
      await accedi();
      // Il seguito lo fa l'ascoltatore di onAuth: è l'unico punto in cui si
      // entra in sincronizzazione, così non ci sono due strade da tenere
      // allineate (una per l'accesso, una per il riavvio).
      return true;
    } catch (e) {
      const causa = e instanceof Error ? e.message : String(e);
      if (mountedRef.current) {
        setStatus("guest");
        setErrorMsg(causa.includes("popup-closed") || causa.includes("cancelled")
          ? tr("Accesso annullato.") : tr("Accesso non riuscito."));
      }
      return false;
    } finally {
      accessoInCorsoRef.current = false;
    }
  };

  const disconnect = async () => {
    stopWatcher();
    generazioneRef.current++;   // quello che è in volo non conta più
    // Il flag PRIMA dell'uscita vera: se `esci()` fallisce (offline) la scelta
    // dell'utente resta scritta, e al riavvio si completa invece di ritrovarsi
    // collegati da soli.
    try { localStorage.setItem(LS_SCOLLEGATO, "1"); } catch { /* quota */ }
    // Scollegarsi riporta alla schermata di ingresso: il cancello si archivia
    // "per sempre" al primo avvio, ma un'uscita voluta è proprio il momento in
    // cui va riaperto (richiesta di Stefano: "cliccando disconnetti deve
    // riportarmi alla homepage di login"). L'evento la fa comparire SUBITO,
    // senza aspettare un ricaricamento.
    try { localStorage.removeItem(LS_WELCOME); } catch { /* quota */ }
    window.dispatchEvent(new Event(EVENTO_SCOLLEGATO));
    utenteRef.current = null;
    syncedHashRef.current = "";
    if (mountedRef.current) { setEmail(null); setLastSyncAt(null); setErrorMsg(null); setStatus("guest"); }
    try { await esci(); } catch { /* offline: ci penserà il riavvio */ }
  };

  useEffect(() => {
    mountedRef.current = true;

    const stopAuth = onAuth(u => {
      // Uscita chiesta e mai andata a buon fine (offline): si completa adesso.
      if (u && localStorage.getItem(LS_SCOLLEGATO) === "1") {
        esci().catch(() => { /* ancora offline: si riprova al prossimo avvio */ });
        return;
      }
      // Cambio di stato dell'accesso: da qui in poi è un'altra storia, e le
      // sincronizzazioni della precedente non devono più scrivere niente.
      if (utenteRef.current?.uid !== u?.uid) generazioneRef.current++;
      utenteRef.current = u;
      if (!u) {
        stopWatcher();
        syncedHashRef.current = "";
        if (mountedRef.current) { setEmail(null); setStatus("guest"); }
        return;
      }
      if (mountedRef.current) setEmail(u.email);
      const mia = generazioneRef.current;
      const seAncoraLui = () => { if (generazioneRef.current === mia) startWatcher(); };
      primaSync(u.uid).then(seAncoraLui).catch(e => {
        if (generazioneRef.current !== mia) return;   // scollegato nel frattempo
        inGuaio(e); seAncoraLui();
      });
    });

    const onVisibility = () => {
      if (!utenteRef.current || busyRef.current || corrottoRef.current) return;
      // Tornati sull'app dopo un guasto: si riprova, invece di restare in
      // errore fino al prossimo riavvio.
      if (!document.hidden) {
        if (!daRiprovareRef.current) return;
        busyRef.current = true;
        pushLocal().finally(() => { busyRef.current = false; });
        return;
      }
      // Si sta uscendo: salvataggio dell'ultimo momento. Mai pushare PRIMA che
      // la prima sincronizzazione sia riuscita (hash ancora vuoto): c'è una
      // finestra di secondi in cui busyRef è già false e un cambio scheda
      // scriverebbe il locale non-fuso (magari vuoto, su un dispositivo nuovo)
      // sopra il backup.
      if (syncedHashRef.current === "") return;
      if (localSnapshot() === syncedHashRef.current) return;
      busyRef.current = true;
      pushLocal().finally(() => { busyRef.current = false; });
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      mountedRef.current = false;
      stopAuth();
      stopWatcher();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CloudContext.Provider value={{ status, email, lastSyncAt, errorMsg, configurato: cloudConfigurato(), connect, disconnect }}>
      {children}
    </CloudContext.Provider>
  );
}

export function useCloud(): CloudContextValue {
  const ctx = useContext(CloudContext);
  if (!ctx) throw new Error("useCloud deve stare dentro <CloudProvider>");
  return ctx;
}
