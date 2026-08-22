import { firebaseConfig, RACCOLTA, cloudConfigurato } from "@/lib/firebaseConfig";
import type { ArchivioCloud } from "@/lib/backup";

/**
 * Trasporto dell'archivio verso il cloud: accesso con Google e un documento
 * Firestore per utente (`viaggi/{uid}`).
 *
 * Sostituisce l'integrazione Google Drive (2026-08-22). Il motivo del cambio è
 * uno solo e concreto: il token di Drive scade, e ogni tanto l'app chiedeva di
 * ricollegarsi. La sessione di Firebase Auth invece persiste da sola.
 *
 * Quello che NON cambia è la fusione dei dati (`mergeTrips` in backup.ts):
 * viaggio per viaggio, con le lapidi nei due sensi. Il modello alternativo —
 * un documento intero e una domanda «quale dispositivo vince?» — sarebbe stato
 * più semplice da scrivere e capace di buttare via le modifiche di un
 * dispositivo intero.
 */

/** Firestore rifiuta i documenti oltre 1 MiB. Ci fermiamo prima, con un
 *  messaggio chiaro: un limite che si scopre il giorno che scatta è il peggior
 *  tipo di limite. (Archivio tipico oggi: 40-50 KB.) */
const TETTO_BYTE = 900 * 1024;

type SDK = {
  auth: import("firebase/auth").Auth;
  firestore: import("firebase/firestore/lite").Firestore;
  mod: {
    auth: typeof import("firebase/auth");
    store: typeof import("firebase/firestore/lite");
  };
};

let sdkPromise: Promise<SDK> | null = null;

/**
 * Carica l'SDK alla prima occorrenza, con qualche tentativo a distanza
 * crescente.
 *
 * Il caricamento è dinamico perché il peso resti fuori dal bundle principale:
 * chi non usa il cloud non lo scarica mai. I tentativi servono all'avvio senza
 * rete — e il fallimento NON si cristallizza (lezione già pagata due volte in
 * questo progetto, con le mappe e con IndexedDB): se va male si dimentica
 * tutto, così al prossimo tentativo si riparte pulito invece di restare
 * condannati per tutta la sessione.
 */
function caricaSdk(): Promise<SDK> {
  if (!sdkPromise) {
    sdkPromise = (async () => {
      const attese = [0, 800, 2500];
      let ultimo: unknown = null;
      for (const attesa of attese) {
        if (attesa) await new Promise(r => setTimeout(r, attesa));
        try {
          const [app, authMod, storeMod] = await Promise.all([
            import("firebase/app"),
            import("firebase/auth"),
            import("firebase/firestore/lite"),
          ]);
          const istanza = app.getApps().length ? app.getApp() : app.initializeApp(firebaseConfig);
          const auth = authMod.getAuth(istanza);
          // La sessione dev'essere quella che sopravvive alla chiusura: è
          // esattamente il motivo per cui siamo venuti via da Drive.
          await authMod.setPersistence(auth, authMod.browserLocalPersistence);
          return { auth, firestore: storeMod.getFirestore(istanza), mod: { auth: authMod, store: storeMod } };
        } catch (e) {
          ultimo = e;
        }
      }
      sdkPromise = null;
      throw ultimo instanceof Error ? ultimo : new Error("sdk_non_caricato");
    })();
  }
  return sdkPromise;
}

export type UtenteCloud = { uid: string; email: string | null };

/**
 * Chiama `quando` a ogni cambio di stato dell'accesso (all'avvio con l'utente
 * ripescato dalla sessione, oppure con null). Ritorna la funzione per smettere
 * di ascoltare.
 *
 * Se l'SDK non si carica — tipicamente primo avvio offline — non è un errore
 * da mostrare: si resta ospiti e si riproverà.
 */
export function onAuth(quando: (u: UtenteCloud | null) => void): () => void {
  if (!cloudConfigurato()) { quando(null); return () => { /* niente da fermare */ }; }
  let vivo = true;
  let spegni: (() => void) | null = null;
  const aggancia = () => caricaSdk().then(({ auth, mod }) => {
    if (!vivo) return;
    window.removeEventListener("online", aggancia);
    spegni = mod.auth.onAuthStateChanged(auth, u =>
      quando(u ? { uid: u.uid, email: u.email } : null));
  }).catch(() => {
    if (!vivo) return;
    quando(null);
    // L'SDK non si è caricato (primo avvio offline, senza service worker):
    // NON ci si arrende per sempre — senza questo, al ritorno della rete un
    // login riusciva ma nessuno lo ascoltava più, e la rotella girava fino al
    // reload. Al prossimo segnale di rete si riprova ad agganciarsi.
    window.addEventListener("online", aggancia, { once: true });
  });
  aggancia();
  return () => { vivo = false; window.removeEventListener("online", aggancia); spegni?.(); };
}

/** Apre il popup di Google. Rilancia l'errore se l'utente annulla o va storto. */
export async function accedi(): Promise<UtenteCloud> {
  const { auth, mod } = await caricaSdk();
  const provider = new mod.auth.GoogleAuthProvider();
  const cred = await mod.auth.signInWithPopup(auth, provider);
  return { uid: cred.user.uid, email: cred.user.email };
}

/** Esce dall'account. */
export async function esci(): Promise<void> {
  const { auth, mod } = await caricaSdk();
  await mod.auth.signOut(auth);
}

/**
 * L'archivio salvato nel cloud, o null se non c'è ancora.
 *
 * Un documento ILLEGGIBILE (c'è ma non ha la forma che ci aspettiamo) lancia
 * `archivio_corrotto` invece di far finta di niente: chi chiama deve fermarsi e
 * dirlo, MAI sovrascriverlo in automatico. È il modo in cui si perde un backup
 * per sempre.
 */
export async function leggiArchivio(uid: string): Promise<ArchivioCloud | null> {
  const { firestore, mod } = await caricaSdk();
  const snap = await mod.store.getDoc(mod.store.doc(firestore, RACCOLTA, uid));
  if (!snap.exists()) return null;
  const dati = snap.data() as { archivio?: string; aggiornato?: number } | undefined;
  if (!dati || typeof dati.archivio !== "string") throw new Error("archivio_corrotto");
  let letto: unknown;
  try { letto = JSON.parse(dati.archivio); } catch { throw new Error("archivio_corrotto"); }
  const a = letto as ArchivioCloud;
  if (!a || typeof a !== "object" || !Array.isArray(a.trips)) throw new Error("archivio_corrotto");
  return a;
}

/**
 * Scrive l'archivio nel cloud.
 *
 * Va in un unico campo di testo (JSON serializzato) invece che in campi
 * Firestore separati: i viaggi sono annidati e pieni di array di coordinate,
 * che Firestore non sa annidare oltre un livello. Un campo di testo attraversa
 * tutto senza tradurre niente — e la fusione è già stata fatta prima, qui.
 */
export async function scriviArchivio(uid: string, dati: ArchivioCloud): Promise<void> {
  const { firestore, mod } = await caricaSdk();
  const archivio = JSON.stringify(dati);
  const byte = new Blob([archivio]).size;
  if (byte > TETTO_BYTE) throw new Error("archivio_troppo_grande");
  await mod.store.setDoc(mod.store.doc(firestore, RACCOLTA, uid), {
    archivio,
    aggiornato: dati.updatedAt,
  });
}

/** Quanto pesa l'archivio, e quanto manca al tetto. Per i messaggi all'utente. */
export function pesoArchivio(dati: ArchivioCloud): { byte: number; tetto: number } {
  return { byte: new Blob([JSON.stringify(dati)]).size, tetto: TETTO_BYTE };
}

/** Test-only: dimentica l'SDK già caricato. */
export function __resetSdk(): void { sdkPromise = null; }
