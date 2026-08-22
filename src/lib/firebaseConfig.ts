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
 * Se i campi tornassero ai segnaposto "DA-CONFIGURARE" (es. un fork del
 * progetto), l'app funzionerebbe comunque, da OSPITE: la sezione del cloud
 * direbbe che non è configurato senza provare a collegarsi (`cloudConfigurato`).
 */
export const firebaseConfig = {
  apiKey: "AIzaSyCxF8WsmdmPS5ShiePqKoh5QAWDOgIWCq8",
  authDomain: "mytravellog-a0f79.firebaseapp.com",
  projectId: "mytravellog-a0f79",
  storageBucket: "mytravellog-a0f79.firebasestorage.app",
  messagingSenderId: "70997002053",
  appId: "1:70997002053:web:183f16a48df10570b4e02c",
  // measurementId omesso di proposito: serve solo a Google Analytics, che
  // quest'app non usa (nessun tracciamento oltre al backup).
};

/** La raccolta Firestore: un documento per utente, chiamato col suo uid. */
export const RACCOLTA = "viaggi";

/** Vero solo quando i valori veri sono stati incollati sopra. */
export const cloudConfigurato = (): boolean =>
  !Object.values(firebaseConfig).some(v => String(v).includes("DA-CONFIGURARE"));
