import { describe, it, expect } from "vitest";
import { risolviLingua, traduci, localeDi, LINGUE, type Chiave } from ".";
import { en } from "./en";

describe("risolviLingua — da 'sistema' alla lingua vera", () => {
  it("una lingua scelta a mano vince sempre sul browser", () => {
    expect(risolviLingua("it", ["en-US"])).toBe("it");
    expect(risolviLingua("en", ["it-IT"])).toBe("en");
  });

  it("'sistema' segue il browser: italiano solo se il browser è italiano", () => {
    expect(risolviLingua("sistema", ["it-IT"])).toBe("it");
    expect(risolviLingua("sistema", ["it"])).toBe("it");
    expect(risolviLingua("sistema", ["IT-ch"])).toBe("it");   // maiuscole e varianti
  });

  it("qualunque altra lingua del mondo va in inglese, non in italiano", () => {
    // È la scelta: l'inglese è il ripiego utile per chi non parla italiano.
    for (const l of ["en-GB", "de-DE", "ja-JP", "ar", "pt-BR", "zh-Hans"]) {
      expect(risolviLingua("sistema", [l])).toBe("en");
    }
  });

  it("senza informazioni dal browser resta l'italiano", () => {
    // L'app nasce italiana: nel dubbio non si cambia sotto i piedi a Stefano.
    expect(risolviLingua("sistema", [])).toBe("it");
  });
});

describe("traduci — l'italiano è la chiave", () => {
  it("in italiano ritorna la chiave stessa", () => {
    expect(traduci("it", "Nuovo viaggio")).toBe("Nuovo viaggio");
  });

  it("in inglese ritorna la traduzione", () => {
    expect(traduci("en", "Nuovo viaggio")).toBe("New trip");
  });

  it("riempie i segnaposto in entrambe le lingue", () => {
    expect(traduci("it", "Recap del {anno}", { anno: 2026 })).toBe("Recap del 2026");
    expect(traduci("en", "Recap del {anno}", { anno: 2026 })).toBe("2026 recap");
  });

  it("un segnaposto senza valore resta scritto, non diventa 'undefined'", () => {
    // Meglio un `{anno}` visibile — si nota e si corregge — di un "undefined".
    expect(traduci("it", "Recap del {anno}")).toBe("Recap del {anno}");
  });

  it("⚠️ una chiave senza inglese NON lascia il buco: resta l'italiano", () => {
    // Il typecheck lo impedisce, ma i dati e i cast esistono: se la traduzione
    // manca a runtime, l'utente legge italiano — mai una scritta vuota.
    const inventata = "Una scritta che non è nel dizionario" as Chiave;
    expect(traduci("en", inventata)).toBe("Una scritta che non è nel dizionario");
  });

  it("una traduzione vuota nel dizionario vale come mancante", () => {
    const dizionario = en as unknown as Record<string, string>;
    const chiave = "Nuovo viaggio";
    const vera = dizionario[chiave];
    try {
      dizionario[chiave] = "";
      expect(traduci("en", chiave)).toBe(chiave);
    } finally {
      dizionario[chiave] = vera;
    }
  });
});

describe("il dizionario", () => {
  it("non ha traduzioni vuote", () => {
    const vuote = Object.entries(en).filter(([, v]) => !v || !v.trim());
    expect(vuote).toEqual([]);
  });

  it("non ha chiavi rimaste in italiano per sbaglio", () => {
    // Una traduzione identica alla chiave è sospetta: va bene per i nomi propri
    // ("Celsius", "Menu", "Italiano"), non per una frase italiana.
    const uguali = Object.entries(en)
      .filter(([k, v]) => k === v && /\s/.test(k) && /(à|è|é|ì|ò|ù|\bil\b|\bla\b|\bdei\b|\bche\b)/i.test(k))
      .map(([k]) => k);
    expect(uguali).toEqual([]);
  });

  it("i segnaposto della chiave esistono anche nella traduzione", () => {
    // Se la chiave dice {anno} e l'inglese no, in inglese il numero sparisce.
    const rotte: string[] = [];
    for (const [k, v] of Object.entries(en)) {
      const dentro = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(",");
      if (dentro(k) !== dentro(v)) rotte.push(k);
    }
    expect(rotte).toEqual([]);
  });

  it("il selettore elenca solo lingue vere più 'sistema'", () => {
    expect(LINGUE.map(l => l.valore)).toEqual(["it", "en", "sistema"]);
  });
});

describe("localeDi — date e numeri seguono la lingua", () => {
  it("dà un locale valido per Intl", () => {
    expect(localeDi("it")).toBe("it-IT");
    expect(localeDi("en")).toBe("en-GB");
    // e non esplode dentro Intl
    expect(new Intl.NumberFormat(localeDi("en")).format(1234)).toBe("1,234");
    expect(new Intl.NumberFormat(localeDi("it")).format(1234)).toMatch(/1.?234/);
  });
});
