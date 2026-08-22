import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Il trasporto Firestore, senza Firestore: si finge l'SDK (moduli firebase/*)
 * e si provano le due guardie che NON sono ovvie — il documento illeggibile
 * che deve fermare tutto, e il tetto di peso che deve fermare la scrittura.
 */
const getDocMock = vi.fn();
const setDocMock = vi.fn();
const onAuthMock = vi.fn();

vi.mock("firebase/app", () => ({
  getApps: () => [],
  getApp: vi.fn(),
  initializeApp: vi.fn(() => ({})),
}));
vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({})),
  setPersistence: vi.fn(async () => { /* ok */ }),
  browserLocalPersistence: {},
  onAuthStateChanged: onAuthMock,
  GoogleAuthProvider: class { /* provider finto */ },
  signInWithPopup: vi.fn(async () => ({ user: { uid: "u1", email: "s@x.it" } })),
  signOut: vi.fn(async () => { /* ok */ }),
}));
vi.mock("firebase/firestore/lite", () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn((_db, raccolta, uid) => ({ raccolta, uid })),
  getDoc: getDocMock,
  setDoc: setDocMock,
}));
vi.mock("./firebaseConfig", async (orig) => ({
  ...(await orig() as object),
  cloudConfigurato: () => true,
}));

import { leggiArchivio, scriviArchivio, accedi, __resetSdk } from "./firebaseSync";
import { BACKUP_VERSION, ArchivioCloud } from "./backup";

const documento = (dati: unknown) => ({ exists: () => true, data: () => dati });
const archivio = (extra: Partial<ArchivioCloud> = {}): ArchivioCloud =>
  ({ version: BACKUP_VERSION, updatedAt: 1, trips: [], plans: [], ...extra });

describe("firebaseSync — le guardie del trasporto", () => {
  beforeEach(() => { __resetSdk(); getDocMock.mockReset(); setDocMock.mockReset(); });

  it("legge un archivio sano", async () => {
    getDocMock.mockResolvedValue(documento({ archivio: JSON.stringify(archivio()), aggiornato: 1 }));
    const a = await leggiArchivio("u1");
    expect(a?.version).toBe(BACKUP_VERSION);
  });

  it("nessun documento = nessun archivio, non un errore", async () => {
    getDocMock.mockResolvedValue({ exists: () => false, data: () => undefined });
    expect(await leggiArchivio("u1")).toBeNull();
  });

  // La famiglia dei documenti che ci sono ma non si capiscono: ognuno deve
  // fermare la sincronizzazione, MAI passare per "vuoto" (verrebbe sovrascritto).
  for (const [nome, dati] of [
    ["campo archivio mancante", { aggiornato: 1 }],
    ["archivio non-stringa", { archivio: 42 }],
    ["JSON rotto", { archivio: "{viaggi:" }],
    ["JSON valido ma forma sbagliata", { archivio: JSON.stringify({ qualcosa: true }) }],
    ["trips non-array", { archivio: JSON.stringify({ version: 1, updatedAt: 1, trips: "no" }) }],
  ] as const) {
    it(`documento illeggibile (${nome}) → archivio_corrotto`, async () => {
      getDocMock.mockResolvedValue(documento(dati));
      await expect(leggiArchivio("u1")).rejects.toThrow("archivio_corrotto");
    });
  }

  it("scrive nel posto giusto: raccolta viaggi, documento = uid", async () => {
    await scriviArchivio("u1", archivio());
    const [ref, corpo] = setDocMock.mock.calls[0];
    expect(ref).toEqual({ raccolta: "viaggi", uid: "u1" });
    expect(typeof corpo.archivio).toBe("string");
    expect(corpo.aggiornato).toBe(1);
  });

  it("oltre il tetto non si scrive: archivio_troppo_grande", async () => {
    // un archivio gonfiato oltre i 900 KB
    const grosso = archivio({ trips: [{ id: "x", notes: "x".repeat(950 * 1024) } as never] });
    await expect(scriviArchivio("u1", grosso)).rejects.toThrow("archivio_troppo_grande");
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it("l'accesso restituisce uid ed email", async () => {
    expect(await accedi()).toEqual({ uid: "u1", email: "s@x.it" });
  });
});
