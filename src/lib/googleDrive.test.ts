import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mergeTrips, requestAccessToken } from "./googleDrive";
import { addPlan, promotePlanToTrip, loadTrips, loadTombstones, type Trip } from "./storage";

const t = (id: string, title: string, updated_at?: string): Trip =>
  ({ id, title, ...(updated_at ? { updated_at } : {}) } as unknown as Trip);
const legacy = (id: string, title: string, created_at: string): Trip =>
  ({ id, title, created_at } as unknown as Trip);

describe("mergeTrips — unione senza perdita di dati", () => {
  it("nuovo dispositivo (locale vuoto): scarica tutti i remoti", () => {
    const out = mergeTrips([], 0, [t("a", "A"), t("b", "B")], 1000);
    expect(out.map(x => x.id).sort()).toEqual(["a", "b"]);
  });

  it("viaggio aggiunto offline (solo locale): non si perde", () => {
    const out = mergeTrips([t("a", "A"), t("c", "C")], 2000, [t("a", "A"), t("b", "B")], 1000);
    expect(out.map(x => x.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("stesso id modificato: vince il lato più recente", () => {
    const local = [t("a", "Locale nuovo")];
    const remote = [t("a", "Remoto vecchio")];
    // remoto più vecchio → vince locale
    expect(mergeTrips(local, 5000, remote, 1000)[0].title).toBe("Locale nuovo");
    // remoto più recente → vince remoto
    expect(mergeTrips(local, 1000, remote, 5000)[0].title).toBe("Remoto vecchio");
  });

  it("unione completa mantenendo gli id unici", () => {
    const out = mergeTrips([t("a", "A"), t("b", "B")], 3000, [t("b", "B2"), t("c", "C")], 1000);
    expect(out.map(x => x.id).sort()).toEqual(["a", "b", "c"]);
    // b è in entrambi, locale più recente → resta "B"
    expect(out.find(x => x.id === "b")?.title).toBe("B");
  });
});

describe("mergeTrips — confronto PER VIAGGIO (updated_at)", () => {
  it("due dispositivi che modificano viaggi diversi: nessuna modifica va persa", () => {
    // Il bug: si eleggeva un lato "autoritativo" col solo timestamp di
    // collezione, quindi il lato più vecchio perdeva le sue modifiche anche sui
    // viaggi che l'altro non aveva mai toccato.
    const local = [ // collezione VECCHIA, ma ha modificato "a" di recente
      t("a", "A modificato qui", "2024-03-01T10:00:00Z"),
      t("b", "B vecchio", "2024-01-01T00:00:00Z"),
    ];
    const remote = [ // collezione NUOVA, ha modificato "b"
      t("a", "A vecchio", "2024-01-01T00:00:00Z"),
      t("b", "B modificato altrove", "2024-03-02T10:00:00Z"),
    ];
    const out = mergeTrips(local, 1_000, remote, 9_999);
    expect(out.find(x => x.id === "a")?.title).toBe("A modificato qui");
    expect(out.find(x => x.id === "b")?.title).toBe("B modificato altrove");
  });

  it("viaggi vecchi senza updated_at: ricade sul timestamp di collezione", () => {
    const out = mergeTrips([t("a", "Locale")], 5_000, [t("a", "Remoto")], 1_000);
    expect(out[0].title).toBe("Locale");
  });

  it("updated_at illeggibile: ricade sul timestamp di collezione invece di sparire", () => {
    const out = mergeTrips([t("a", "Locale", "non-una-data")], 5_000, [t("a", "Remoto")], 1_000);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Locale");
  });
});

describe("mergeTrips — legacy senza updated_at: fallback su created_at", () => {
  it("il tombstone vince sui legacy anche se il timestamp di collezione avanza", () => {
    // Il bug: il fallback era il ts di COLLEZIONE, che avanza ad ogni push →
    // `at >= ts` non era mai vero e il viaggio cancellato resuscitava per sempre.
    const trip = legacy("x", "Vecchio", "2024-01-01T00:00:00Z");
    const cancellatoIl = Date.parse("2024-06-01T00:00:00Z");
    const collezioneAvanzata = Date.parse("2024-12-01T00:00:00Z"); // > tombstone
    const out = mergeTrips([], collezioneAvanzata, [trip], collezioneAvanzata, [{ id: "x", at: cancellatoIl }]);
    expect(out).toHaveLength(0); // created_at (gen) < cancellazione (giu): muore
  });

  it("LWW sui legacy usa created_at stabile, non il ts di collezione", () => {
    // Locale legacy mai toccato (created gen) con collezione "fresca"; remoto
    // MODIFICATO a giugno: deve vincere il remoto, non il ts di collezione alto.
    const localeLegacy = legacy("y", "Mai toccato", "2024-01-01T00:00:00Z");
    const remotoModificato = t("y", "Modificato altrove", "2024-06-01T00:00:00Z");
    const out = mergeTrips([localeLegacy], Date.parse("2024-12-01T00:00:00Z"), [remotoModificato], 1000);
    expect(out[0].title).toBe("Modificato altrove");
  });
});

describe("mergeTrips — le cancellazioni si propagano (tombstone)", () => {
  it("un viaggio cancellato altrove non resuscita", () => {
    const local = [t("a", "A")];                 // qui "b" è stato eliminato
    const remote = [t("a", "A"), t("b", "B")];   // l'altro dispositivo lo ha ancora
    const out = mergeTrips(local, 2_000, remote, 1_000, [{ id: "b", at: 3_000 }]);
    expect(out.map(x => x.id)).toEqual(["a"]);
  });

  it("ma una modifica SUCCESSIVA alla cancellazione vince", () => {
    const out = mergeTrips(
      [t("a", "A")], 1_000,
      [t("a", "A ripreso", "2024-05-01T00:00:00Z")], 1_000,
      [{ id: "a", at: Date.parse("2024-04-01T00:00:00Z") }],
    );
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("A ripreso");
  });

  it("tombstone malformati vengono ignorati senza far cadere il merge", () => {
    const out = mergeTrips([t("a", "A")], 1, [], 0, [
      null as any, { id: "a", at: NaN } as any, { at: 5 } as any,
    ]);
    expect(out.map(x => x.id)).toEqual(["a"]);
  });
});

describe("promozione di un piano: tombstone per BUCKET", () => {
  beforeEach(() => localStorage.clear());

  it("il piano promosso sparisce dai piani ma il viaggio creato sopravvive al merge", () => {
    const plan = addPlan({ title: "Futuro", city: "Oslo" } as any);
    const done = promotePlanToTrip(plan.id)!;
    expect(loadTombstones("plans").map(d => d.id)).toContain(plan.id);
    // Il tombstone NON deve finire nel bucket viaggi: il viaggio promosso ha lo
    // STESSO id, e verrebbe cancellato appena si sincronizza.
    expect(loadTombstones("trips").map(d => d.id)).not.toContain(plan.id);
    const merged = mergeTrips(loadTrips(), Date.now(), [], 0, loadTombstones("trips"));
    expect(merged.map(x => x.id)).toContain(done.id);
  });
});

describe("loadGis — il fallimento non resta in cache", () => {
  afterEach(() => vi.restoreAllMocks());

  // Bug reale: dopo un avvio senza rete la Promise rigettata di loadGis
  // restava in cache per sempre e "Connetti" falliva all'istante anche a
  // connessione tornata, fino a un reload. Il secondo tentativo deve
  // riprovare a caricare lo script (= un secondo <script> appeso).
  it("dopo un errore di rete, il tentativo successivo riappende lo script", async () => {
    const scripts: HTMLScriptElement[] = [];
    vi.spyOn(document.head, "appendChild").mockImplementation(((n: Node) => {
      const s = n as HTMLScriptElement;
      scripts.push(s);
      setTimeout(() => s.onerror?.(new Event("error")));
      return n;
    }) as typeof document.head.appendChild);

    await expect(requestAccessToken(true)).rejects.toThrow(/Google/);
    await expect(requestAccessToken(true)).rejects.toThrow(/Google/);
    expect(scripts.length).toBe(2); // prima del fix: 1 (fallimento cacheato)
  });
});
