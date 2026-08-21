import fs from "node:fs";
const FONTE = "https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/all/all.json";
const j = await fetch(FONTE).then(r => r.json());
const coppie = j
  .filter(p => p["country-code"] && p["alpha-2"])
  .map(p => [String(p["country-code"]).padStart(3, "0"), p["alpha-2"]])
  .sort((a, b) => a[0].localeCompare(b[0]));
const righe = [];
for (let i = 0; i < coppie.length; i += 6) {
  righe.push("  " + coppie.slice(i, i + 6).map(([n, a]) => `"${n}": "${a}",`).join(" "));
}
const testo = `// [GENERATO] Non modificare a mano: rigenerare con \`npm run iso\`.
//
// Corrispondenza fra il codice ISO 3166-1 NUMERICO — quello che il world-atlas
// usa come id delle sue feature — e il codice a due lettere che il geocoder
// salva nei viaggi (\`country_code\`).
//
// Serve a cercare il confine di un paese PER CODICE invece che per posizione.
// Prima si faceva il contrario: si guardava dove cadeva il punto e si deduceva
// il paese, e ogni imprecisione della geometria diventava un errore di dato —
// la Russia "visitata" da un viaggio in Lapponia (antimeridiano), il Vaticano
// scambiato per Italia (poligono spostato di due chilometri), Monaco sparito
// (ritagliato dalla Francia e mai ridisegnato).
//
// Fonte: ${FONTE}
// ${coppie.length} paesi, standard ISO stabile.
export const ISO_NUMERICO_A2: Record<string, string> = {
${righe.join("\n")}
};

/** L'inverso: dal codice a due lettere all'id numerico del world-atlas. */
export const ISO_A2_NUMERICO: Record<string, string> = Object.fromEntries(
  Object.entries(ISO_NUMERICO_A2).map(([num, a2]) => [a2, num]));
`;
fs.writeFileSync("src/lib/isoPaesi.ts", testo);
console.log("generato src/lib/isoPaesi.ts con", coppie.length, "paesi");
