// Genera src/lib/isoPaesi.ts: la corrispondenza fra i codici ISO 3166-1 e,
// per ogni paese, il continente. Rigenerare con `npm run iso`.
//
// Perché un file generato e committato invece di una fetch a runtime: è un
// dato statico che non cambia mai (uno standard), e l'app non deve dipendere
// dalla rete per sapere che l'Italia è "380" ed è in Europa.
import fs from "node:fs";

const FONTE = "https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/all/all.json";
const j = await fetch(FONTE).then(r => r.json());

const coppie = j
  .filter(p => p["country-code"] && p["alpha-2"])
  .map(p => [String(p["country-code"]).padStart(3, "0"), p["alpha-2"]])
  .sort((a, b) => a[0].localeCompare(b[0]));

/** ISO region/intermediate-region → i sette continenti che usa l'app. */
const continenteDi = (p) => {
  const r = p.region, inter = p["intermediate-region"], sub = p["sub-region"];
  if (r === "Africa") return "Africa";
  if (r === "Europe") return "Europa";
  if (r === "Asia") return "Asia";
  if (r === "Oceania") return "Oceania";
  if (r === "Antarctica" || sub === "Antarctica") return "Antartide";
  if (r === "Americas") {
    // I Caraibi e il Centro America stanno nel Nord America; la ISO li tiene
    // separati solo nella "intermediate-region".
    return inter === "South America" ? "Sud America" : "Nord America";
  }
  return null;   // territori senza regione (rari): li lasciamo fuori
};

const continenti = j
  .filter(p => p["alpha-2"] && continenteDi(p))
  .map(p => [p["alpha-2"], continenteDi(p)])
  .sort((a, b) => a[0].localeCompare(b[0]));

const inRighe = (voci, perRiga) => {
  const out = [];
  for (let i = 0; i < voci.length; i += perRiga) {
    out.push("  " + voci.slice(i, i + perRiga).map(([k, v]) => `"${k}": "${v}",`).join(" "));
  }
  return out.join("\n");
};

const testo = `// [GENERATO] Non modificare a mano: rigenerare con \`npm run iso\`.
//
// Due tabelle ISO 3166, entrambe usate per NON dedurre dalla geometria ciò che
// il geocoder ci ha già detto quando hai salvato il viaggio.
//
// 1. numerico → alpha2: il world-atlas identifica i suoi confini col codice
//    numerico, i nostri viaggi con quello a due lettere. Serve a cercare il
//    confine di un paese PER CODICE invece che per posizione — prima si
//    guardava dove cadeva il punto, e ogni imprecisione del disegno diventava
//    un errore di dato (la Russia "visitata" dalla Lapponia, il Vaticano
//    scambiato per Italia, Monaco sparito).
//
// 2. alpha2 → continente: prima il continente si indovinava da rettangoli di
//    latitudine e longitudine, e sbagliava — Panama finiva in Sud America, le
//    Canarie in Africa. Il continente di un paese è un dato, non una stima.
//
// Fonte: ${FONTE}
// ${coppie.length} paesi con codice numerico, ${continenti.length} con continente.
export const ISO_NUMERICO_A2: Record<string, string> = {
${inRighe(coppie, 6)}
};

/** L'inverso: dal codice a due lettere all'id numerico del world-atlas. */
export const ISO_A2_NUMERICO: Record<string, string> = Object.fromEntries(
  Object.entries(ISO_NUMERICO_A2).map(([num, a2]) => [a2, num]));

/** In che continente sta un paese, secondo la ISO (regioni e sotto-regioni). */
export const ISO_A2_CONTINENTE: Record<string, string> = {
${inRighe(continenti, 5)}
};
`;

fs.writeFileSync("src/lib/isoPaesi.ts", testo);
console.log(`generato src/lib/isoPaesi.ts — ${coppie.length} codici, ${continenti.length} continenti`);
