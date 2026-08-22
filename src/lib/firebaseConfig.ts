/**
 * Configurazione del progetto Firebase.
 *
 * ⚠️ Questi valori sono PUBBLICI per disegno: finiscono nel bundle e chiunque
 * apra il sito può leggerli. Non sono credenziali — identificano il progetto,
 * non autorizzano nulla. La sicurezza sta tutta nelle regole di Firestore, che
 * lasciano leggere e scrivere `viaggi/{uid}` solo a chi è autenticato con
 * QUELL'uid:
 *
 *   rules_version = '2';
 *   service cloud.firestore {
 *     match /databases/{database}/documents {
 *       match /viaggi/{uid} {
 *         allow read, write: if request.auth != null && request.auth.uid == uid;
 *       }
 *     }
 *   }
 *
 * Finché i campi restano quelli finti qui sotto, l'app funziona normalmente ma
 * come OSPITE: la sezione del cloud dice che non è configurato e non prova
 * nemmeno a collegarsi (vedi `cloudConfigurato`).
 */
export const firebaseConfig = {
  apiKey: "DA-CONFIGURARE",
  authDomain: "DA-CONFIGURARE.firebaseapp.com",
  projectId: "DA-CONFIGURARE",
  storageBucket: "DA-CONFIGURARE.firebasestorage.app",
  messagingSenderId: "DA-CONFIGURARE",
  appId: "DA-CONFIGURARE",
};

/** La raccolta Firestore: un documento per utente, chiamato col suo uid. */
export const RACCOLTA = "viaggi";

/** Vero solo quando i valori veri sono stati incollati sopra. */
export const cloudConfigurato = (): boolean =>
  !Object.values(firebaseConfig).some(v => String(v).includes("DA-CONFIGURARE"));
