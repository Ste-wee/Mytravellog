import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { requestAccessToken, revokeAccessToken, fetchUserEmail } from "./googleDrive";

// La macchina del token GIS, con un window.google FINTO ma dal contratto
// identico: initTokenClient → tokenClient con callback riassegnata
// per-richiesta e requestAccessToken che la fa scattare. loadGis vede
// window.google già presente e non appende nessuno script.

type Callback = (r: { access_token?: string; expires_in?: number; error?: string }) => void;
type ErrCallback = (e: { type?: string }) => void;

let tokenClient: { callback: Callback; error_callback: ErrCallback; requestAccessToken: (o: { prompt: string }) => void };
let scattiRichiesta = 0;
let rispostaAutomatica: (() => void) | null = null;
const revoke = vi.fn();

beforeEach(() => {
  scattiRichiesta = 0;
  rispostaAutomatica = null;
  revoke.mockClear();
  (window as unknown as { google: unknown }).google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg: { callback: Callback }) => {
          tokenClient = {
            callback: cfg.callback,
            error_callback: () => {},
            requestAccessToken: () => { scattiRichiesta++; rispostaAutomatica?.(); },
          };
          return tokenClient;
        },
        revoke,
      },
    },
  };
});

afterEach(() => { delete (window as unknown as { google?: unknown }).google; });

describe("requestAccessToken", () => {
  it("token concesso → {token, expiresIn}", async () => {
    rispostaAutomatica = () => tokenClient.callback({ access_token: "tok-1", expires_in: 1200 });
    await expect(requestAccessToken(false)).resolves.toEqual({ token: "tok-1", expiresIn: 1200 });
  });

  it("risposta senza token (consenso negato) → rigetta con l'errore di GIS", async () => {
    rispostaAutomatica = () => tokenClient.callback({ error: "access_denied" });
    await expect(requestAccessToken(false)).rejects.toThrow("access_denied");
  });

  it("error_callback (popup bloccato) → rigetta col tipo", async () => {
    rispostaAutomatica = () => tokenClient.error_callback({ type: "popup_failed_to_open" });
    await expect(requestAccessToken(true)).rejects.toThrow("popup_failed_to_open");
  });

  it("expires_in mancante → fallback a 3600 secondi", async () => {
    rispostaAutomatica = () => tokenClient.callback({ access_token: "tok-2" });
    await expect(requestAccessToken(false)).resolves.toEqual({ token: "tok-2", expiresIn: 3600 });
  });

  it("due richieste in volo insieme condividono la stessa promessa (un solo giro GIS)", async () => {
    let rilascia: (() => void) | null = null;
    rispostaAutomatica = () => { rilascia = () => tokenClient.callback({ access_token: "tok-3", expires_in: 60 }); };
    const a = requestAccessToken(false);
    const b = requestAccessToken(false);
    await new Promise(r => setTimeout(r, 0)); // il giro GIS parte su microtask (loadGis è async)
    rilascia!();
    expect(await a).toEqual(await b);
    expect(scattiRichiesta).toBe(1); // niente secondo popup/giro silenzioso
  });
});

describe("revokeAccessToken", () => {
  it("passa il token a oauth2.revoke", () => {
    revokeAccessToken("tok-x");
    expect(revoke).toHaveBeenCalledWith("tok-x", expect.any(Function));
  });

  it("senza window.google non crasha (best effort)", () => {
    delete (window as unknown as { google?: unknown }).google;
    expect(() => revokeAccessToken("tok-y")).not.toThrow();
  });
});

describe("fetchUserEmail", () => {
  afterEach(() => vi.restoreAllMocks());

  it("risposta ok → email", async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ email: "ste@example.com" }) })) as unknown as typeof fetch;
    expect(await fetchUserEmail("tok")).toBe("ste@example.com");
  });

  it("401 → null (il chiamante deciderà di riconnettere)", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 401 })) as unknown as typeof fetch;
    expect(await fetchUserEmail("tok")).toBeNull();
  });

  it("offline → null, non un crash", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    expect(await fetchUserEmail("tok")).toBeNull();
  });
});
