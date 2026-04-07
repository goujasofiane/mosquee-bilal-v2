const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".html"));

// Mojibake UTF-8 lu comme Latin-1 / séquences cassées (émoji, tire long, cœur)
const EM_DASH_MOJIBAKE = "\u00e2\u20ac\u201d";
const MOSQUE_EMOJI_MOJIBAKE = String.fromCharCode(240, 376, 8226, 338);
const HEART_MOJIBAKE = String.fromCharCode(226, 157, 164, 239, 184, 143);

const pairs = [
  ["MosquÃ©e", "Mosquée"],
  ["RÃ‰SEAUX", "RÉSEAUX"],
  ["Ã‰ducation", "Éducation"],
  ["spiritualitÃ©", "spiritualité"],
  ["communautÃ©", "communauté"],
  ["CommunautÃ©", "Communauté"],
  ["FraternitÃ©", "Fraternité"],
  ["fraternitÃ©", "fraternité"],
  ["PriÃ¨res", "Prières"],
  ["PriÃ¨re", "Prière"],
  ["priÃ¨re", "prière"],
  ["PRIÃˆRE", "PRIÈRE"],
  ["COMPLÃˆTE", "COMPLÈTE"],
  ["HORAIRES DE PRIÃˆRE", "HORAIRES DE PRIÈRE"],
  ["Ã©cran", "écran"],
  [EM_DASH_MOJIBAKE, "—"],
  ["Â©", "©"],
  [MOSQUE_EMOJI_MOJIBAKE, "🕌"],
  [HEART_MOJIBAKE, "❤️"],
  ["Ã ", "à"],
  ['Å"uvrons', "œuvrons"],
];

for (const f of files) {
  const p = path.join(dir, f);
  let s = fs.readFileSync(p, "utf8");
  const orig = s;
  for (const [a, b] of pairs) {
    s = s.split(a).join(b);
  }
  if (s !== orig) {
    fs.writeFileSync(p, s, "utf8");
    console.log("fixed:", f);
  }
}
