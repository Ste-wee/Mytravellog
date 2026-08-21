// [GENERATO] Non modificare a mano: rigenerare con `npm run iso`.
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
// Fonte: https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/all/all.json
// 249 paesi con codice numerico, 247 con continente.
export const ISO_NUMERICO_A2: Record<string, string> = {
  "004": "AF", "008": "AL", "010": "AQ", "012": "DZ", "016": "AS", "020": "AD",
  "024": "AO", "028": "AG", "031": "AZ", "032": "AR", "036": "AU", "040": "AT",
  "044": "BS", "048": "BH", "050": "BD", "051": "AM", "052": "BB", "056": "BE",
  "060": "BM", "064": "BT", "068": "BO", "070": "BA", "072": "BW", "074": "BV",
  "076": "BR", "084": "BZ", "086": "IO", "090": "SB", "092": "VG", "096": "BN",
  "100": "BG", "104": "MM", "108": "BI", "112": "BY", "116": "KH", "120": "CM",
  "124": "CA", "132": "CV", "136": "KY", "140": "CF", "144": "LK", "148": "TD",
  "152": "CL", "156": "CN", "158": "TW", "162": "CX", "166": "CC", "170": "CO",
  "174": "KM", "175": "YT", "178": "CG", "180": "CD", "184": "CK", "188": "CR",
  "191": "HR", "192": "CU", "196": "CY", "203": "CZ", "204": "BJ", "208": "DK",
  "212": "DM", "214": "DO", "218": "EC", "222": "SV", "226": "GQ", "231": "ET",
  "232": "ER", "233": "EE", "234": "FO", "238": "FK", "239": "GS", "242": "FJ",
  "246": "FI", "248": "AX", "250": "FR", "254": "GF", "258": "PF", "260": "TF",
  "262": "DJ", "266": "GA", "268": "GE", "270": "GM", "275": "PS", "276": "DE",
  "288": "GH", "292": "GI", "296": "KI", "300": "GR", "304": "GL", "308": "GD",
  "312": "GP", "316": "GU", "320": "GT", "324": "GN", "328": "GY", "332": "HT",
  "334": "HM", "336": "VA", "340": "HN", "344": "HK", "348": "HU", "352": "IS",
  "356": "IN", "360": "ID", "364": "IR", "368": "IQ", "372": "IE", "376": "IL",
  "380": "IT", "384": "CI", "388": "JM", "392": "JP", "398": "KZ", "400": "JO",
  "404": "KE", "408": "KP", "410": "KR", "414": "KW", "417": "KG", "418": "LA",
  "422": "LB", "426": "LS", "428": "LV", "430": "LR", "434": "LY", "438": "LI",
  "440": "LT", "442": "LU", "446": "MO", "450": "MG", "454": "MW", "458": "MY",
  "462": "MV", "466": "ML", "470": "MT", "474": "MQ", "478": "MR", "480": "MU",
  "484": "MX", "492": "MC", "496": "MN", "498": "MD", "499": "ME", "500": "MS",
  "504": "MA", "508": "MZ", "512": "OM", "516": "NA", "520": "NR", "524": "NP",
  "528": "NL", "531": "CW", "533": "AW", "534": "SX", "535": "BQ", "540": "NC",
  "548": "VU", "554": "NZ", "558": "NI", "562": "NE", "566": "NG", "570": "NU",
  "574": "NF", "578": "NO", "580": "MP", "581": "UM", "583": "FM", "584": "MH",
  "585": "PW", "586": "PK", "591": "PA", "598": "PG", "600": "PY", "604": "PE",
  "608": "PH", "612": "PN", "616": "PL", "620": "PT", "624": "GW", "626": "TL",
  "630": "PR", "634": "QA", "638": "RE", "642": "RO", "643": "RU", "646": "RW",
  "652": "BL", "654": "SH", "659": "KN", "660": "AI", "662": "LC", "663": "MF",
  "666": "PM", "670": "VC", "674": "SM", "678": "ST", "682": "SA", "686": "SN",
  "688": "RS", "690": "SC", "694": "SL", "702": "SG", "703": "SK", "704": "VN",
  "705": "SI", "706": "SO", "710": "ZA", "716": "ZW", "724": "ES", "728": "SS",
  "729": "SD", "732": "EH", "740": "SR", "744": "SJ", "748": "SZ", "752": "SE",
  "756": "CH", "760": "SY", "762": "TJ", "764": "TH", "768": "TG", "772": "TK",
  "776": "TO", "780": "TT", "784": "AE", "788": "TN", "792": "TR", "795": "TM",
  "796": "TC", "798": "TV", "800": "UG", "804": "UA", "807": "MK", "818": "EG",
  "826": "GB", "831": "GG", "832": "JE", "833": "IM", "834": "TZ", "840": "US",
  "850": "VI", "854": "BF", "858": "UY", "860": "UZ", "862": "VE", "876": "WF",
  "882": "WS", "887": "YE", "894": "ZM",
};

/** L'inverso: dal codice a due lettere all'id numerico del world-atlas. */
export const ISO_A2_NUMERICO: Record<string, string> = Object.fromEntries(
  Object.entries(ISO_NUMERICO_A2).map(([num, a2]) => [a2, num]));

/** In che continente sta un paese, secondo la ISO (regioni e sotto-regioni). */
export const ISO_A2_CONTINENTE: Record<string, string> = {
  "AD": "Europa", "AE": "Asia", "AF": "Asia", "AG": "Nord America", "AI": "Nord America",
  "AL": "Europa", "AM": "Asia", "AO": "Africa", "AR": "Sud America", "AS": "Oceania",
  "AT": "Europa", "AU": "Oceania", "AW": "Nord America", "AX": "Europa", "AZ": "Asia",
  "BA": "Europa", "BB": "Nord America", "BD": "Asia", "BE": "Europa", "BF": "Africa",
  "BG": "Europa", "BH": "Asia", "BI": "Africa", "BJ": "Africa", "BL": "Nord America",
  "BM": "Nord America", "BN": "Asia", "BO": "Sud America", "BQ": "Nord America", "BR": "Sud America",
  "BS": "Nord America", "BT": "Asia", "BV": "Sud America", "BW": "Africa", "BY": "Europa",
  "BZ": "Nord America", "CA": "Nord America", "CC": "Oceania", "CD": "Africa", "CF": "Africa",
  "CG": "Africa", "CH": "Europa", "CI": "Africa", "CK": "Oceania", "CL": "Sud America",
  "CM": "Africa", "CN": "Asia", "CO": "Sud America", "CR": "Nord America", "CU": "Nord America",
  "CV": "Africa", "CW": "Nord America", "CX": "Oceania", "CY": "Asia", "CZ": "Europa",
  "DE": "Europa", "DJ": "Africa", "DK": "Europa", "DM": "Nord America", "DO": "Nord America",
  "DZ": "Africa", "EC": "Sud America", "EE": "Europa", "EG": "Africa", "EH": "Africa",
  "ER": "Africa", "ES": "Europa", "ET": "Africa", "FI": "Europa", "FJ": "Oceania",
  "FK": "Sud America", "FM": "Oceania", "FO": "Europa", "FR": "Europa", "GA": "Africa",
  "GB": "Europa", "GD": "Nord America", "GE": "Asia", "GF": "Sud America", "GG": "Europa",
  "GH": "Africa", "GI": "Europa", "GL": "Nord America", "GM": "Africa", "GN": "Africa",
  "GP": "Nord America", "GQ": "Africa", "GR": "Europa", "GS": "Sud America", "GT": "Nord America",
  "GU": "Oceania", "GW": "Africa", "GY": "Sud America", "HK": "Asia", "HM": "Oceania",
  "HN": "Nord America", "HR": "Europa", "HT": "Nord America", "HU": "Europa", "ID": "Asia",
  "IE": "Europa", "IL": "Asia", "IM": "Europa", "IN": "Asia", "IO": "Africa",
  "IQ": "Asia", "IR": "Asia", "IS": "Europa", "IT": "Europa", "JE": "Europa",
  "JM": "Nord America", "JO": "Asia", "JP": "Asia", "KE": "Africa", "KG": "Asia",
  "KH": "Asia", "KI": "Oceania", "KM": "Africa", "KN": "Nord America", "KP": "Asia",
  "KR": "Asia", "KW": "Asia", "KY": "Nord America", "KZ": "Asia", "LA": "Asia",
  "LB": "Asia", "LC": "Nord America", "LI": "Europa", "LK": "Asia", "LR": "Africa",
  "LS": "Africa", "LT": "Europa", "LU": "Europa", "LV": "Europa", "LY": "Africa",
  "MA": "Africa", "MC": "Europa", "MD": "Europa", "ME": "Europa", "MF": "Nord America",
  "MG": "Africa", "MH": "Oceania", "MK": "Europa", "ML": "Africa", "MM": "Asia",
  "MN": "Asia", "MO": "Asia", "MP": "Oceania", "MQ": "Nord America", "MR": "Africa",
  "MS": "Nord America", "MT": "Europa", "MU": "Africa", "MV": "Asia", "MW": "Africa",
  "MX": "Nord America", "MY": "Asia", "MZ": "Africa", "NA": "Africa", "NC": "Oceania",
  "NE": "Africa", "NF": "Oceania", "NG": "Africa", "NI": "Nord America", "NL": "Europa",
  "NO": "Europa", "NP": "Asia", "NR": "Oceania", "NU": "Oceania", "NZ": "Oceania",
  "OM": "Asia", "PA": "Nord America", "PE": "Sud America", "PF": "Oceania", "PG": "Oceania",
  "PH": "Asia", "PK": "Asia", "PL": "Europa", "PM": "Nord America", "PN": "Oceania",
  "PR": "Nord America", "PS": "Asia", "PT": "Europa", "PW": "Oceania", "PY": "Sud America",
  "QA": "Asia", "RE": "Africa", "RO": "Europa", "RS": "Europa", "RU": "Europa",
  "RW": "Africa", "SA": "Asia", "SB": "Oceania", "SC": "Africa", "SD": "Africa",
  "SE": "Europa", "SG": "Asia", "SH": "Africa", "SI": "Europa", "SJ": "Europa",
  "SK": "Europa", "SL": "Africa", "SM": "Europa", "SN": "Africa", "SO": "Africa",
  "SR": "Sud America", "SS": "Africa", "ST": "Africa", "SV": "Nord America", "SX": "Nord America",
  "SY": "Asia", "SZ": "Africa", "TC": "Nord America", "TD": "Africa", "TF": "Africa",
  "TG": "Africa", "TH": "Asia", "TJ": "Asia", "TK": "Oceania", "TL": "Asia",
  "TM": "Asia", "TN": "Africa", "TO": "Oceania", "TR": "Asia", "TT": "Nord America",
  "TV": "Oceania", "TZ": "Africa", "UA": "Europa", "UG": "Africa", "UM": "Oceania",
  "US": "Nord America", "UY": "Sud America", "UZ": "Asia", "VA": "Europa", "VC": "Nord America",
  "VE": "Sud America", "VG": "Nord America", "VI": "Nord America", "VN": "Asia", "VU": "Oceania",
  "WF": "Oceania", "WS": "Oceania", "YE": "Asia", "YT": "Africa", "ZA": "Africa",
  "ZM": "Africa", "ZW": "Africa",
};
