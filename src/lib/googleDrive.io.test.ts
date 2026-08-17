import { describe, it, expect, vi, beforeEach } from "vitest";
import { readBackup, writeBackup, clearDriveCache, BACKUP_VERSION, DriveBackup } from "./googleDrive";

// I percorsi di I/O col Drive (list → read/patch/create), coi fallimenti VERI
// che l'API può restituire: 401 (token scaduto), 404 (id in cache stantio),
// 5xx. Mock di fetch PER INDIRIZZO, mai per ordine.

const backup = (): DriveBackup => ({
  version: BACKUP_VERSION, updatedAt: 123, trips: [], plans: [], deletedTrips: [], deletedPlans: [],
});

type Chiamata = { url: string; method: string };
let chiamate: Chiamata[] = [];

function mockDrive(risposte: {
  list?: () => Partial<Response>;
  read?: () => Partial<Response>;
  patch?: () => Partial<Response>;
  create?: () => Partial<Response>;
}) {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    chiamate.push({ url, method });
    if (url.includes("/drive/v3/files?spaces=appDataFolder")) return (risposte.list?.() ?? { ok: true, status: 200, json: async () => ({ files: [] }) }) as Response;
    if (url.includes("alt=media")) return (risposte.read?.() ?? { ok: true, status: 200, json: async () => backup() }) as Response;
    if (method === "PATCH") return (risposte.patch?.() ?? { ok: true, status: 200 }) as Response;
    if (url.includes("uploadType=multipart")) return (risposte.create?.() ?? { ok: true, status: 200, json: async () => ({ id: "nuovo" }) }) as Response;
    throw new Error("URL inatteso: " + url);
  }) as unknown as typeof fetch;
}

beforeEach(() => { clearDriveCache(); chiamate = []; });

describe("readBackup", () => {
  it("nessun file su Drive → null (primo avvio)", async () => {
    mockDrive({});
    expect(await readBackup("tok")).toBeNull();
  });

  it("file trovato → restituisce il backup", async () => {
    mockDrive({ list: () => ({ ok: true, status: 200, json: async () => ({ files: [{ id: "f1", name: "navta-backup.json" }] }) }) });
    const b = await readBackup("tok");
    expect(b?.version).toBe(BACKUP_VERSION);
  });

  it("id in cache stantio (404 sul contenuto) → null e cache svuotata, come 'nessun backup'", async () => {
    mockDrive({
      list: () => ({ ok: true, status: 200, json: async () => ({ files: [{ id: "vecchio", name: "navta-backup.json" }] }) }),
      read: () => ({ ok: false, status: 404 }),
    });
    expect(await readBackup("tok")).toBeNull();
  });

  it("401 → 'unauthorized' (il chiamante manda lo stato in 'expired')", async () => {
    mockDrive({ list: () => ({ ok: false, status: 401 }) });
    await expect(readBackup("tok")).rejects.toThrow("unauthorized");
  });

  it("errore server sulla list → 'drive_list_failed', non un null silenzioso", async () => {
    mockDrive({ list: () => ({ ok: false, status: 500 }) });
    await expect(readBackup("tok")).rejects.toThrow("drive_list_failed");
  });

  it("due backup in gara (creati da due dispositivi): si sceglie sempre lo stesso, il primo della lista ordinata", async () => {
    mockDrive({ list: () => ({ ok: true, status: 200, json: async () => ({ files: [{ id: "a-piu-vecchio", name: "navta-backup.json" }, { id: "b", name: "navta-backup.json" }] }) }) });
    await readBackup("tok");
    expect(chiamate.some(c => c.url.includes("/files/a-piu-vecchio?"))).toBe(true);
  });
});

describe("writeBackup", () => {
  it("senza file esistente → CREA (multipart)", async () => {
    mockDrive({});
    await writeBackup("tok", backup());
    expect(chiamate.some(c => c.url.includes("uploadType=multipart"))).toBe(true);
  });

  it("con file esistente → PATCH sullo stesso id", async () => {
    mockDrive({ list: () => ({ ok: true, status: 200, json: async () => ({ files: [{ id: "f1", name: "navta-backup.json" }] }) }) });
    await writeBackup("tok", backup());
    expect(chiamate.some(c => c.method === "PATCH" && c.url.includes("/files/f1?"))).toBe(true);
  });

  it("PATCH su id stantio (404) → ricerca fresca e nuovo tentativo", async () => {
    let listata = 0;
    let patchate = 0;
    mockDrive({
      list: () => ({ ok: true, status: 200, json: async () => ({ files: [{ id: ++listata === 1 ? "stantio" : "fresco", name: "navta-backup.json" }] }) }),
      patch: () => (++patchate === 1 ? { ok: false, status: 404 } : { ok: true, status: 200 }),
    });
    await writeBackup("tok", backup());
    expect(patchate).toBe(2);
    expect(chiamate.filter(c => c.method === "PATCH").map(c => c.url)).toEqual([
      expect.stringContaining("/files/stantio?"), expect.stringContaining("/files/fresco?"),
    ]);
  });

  it("PATCH 401 → 'unauthorized'", async () => {
    mockDrive({
      list: () => ({ ok: true, status: 200, json: async () => ({ files: [{ id: "f1", name: "navta-backup.json" }] }) }),
      patch: () => ({ ok: false, status: 401 }),
    });
    await expect(writeBackup("tok", backup())).rejects.toThrow("unauthorized");
  });

  it("creazione fallita (5xx) → 'drive_create_failed'", async () => {
    mockDrive({ create: () => ({ ok: false, status: 503 }) });
    await expect(writeBackup("tok", backup())).rejects.toThrow("drive_create_failed");
  });
});
