export const OT_BOOKS = [
  ["genesis", "Génesis", "Gen", "Gen.xml"],
  ["exodo", "Éxodo", "Exod", "Exod.xml"],
  ["levitico", "Levítico", "Lev", "Lev.xml"],
  ["numeros", "Números", "Num", "Num.xml"],
  ["deuteronomio", "Deuteronomio", "Deut", "Deut.xml"],
  ["josue", "Josué", "Josh", "Josh.xml"],
  ["jueces", "Jueces", "Judg", "Judg.xml"],
  ["rut", "Rut", "Ruth", "Ruth.xml"],
  ["1samuel", "1 Samuel", "1Sam", "1Sam.xml"],
  ["2samuel", "2 Samuel", "2Sam", "2Sam.xml"],
  ["1reyes", "1 Reyes", "1Kgs", "1Kgs.xml"],
  ["2reyes", "2 Reyes", "2Kgs", "2Kgs.xml"],
  ["1cronicas", "1 Crónicas", "1Chr", "1Chr.xml"],
  ["2cronicas", "2 Crónicas", "2Chr", "2Chr.xml"],
  ["esdras", "Esdras", "Ezra", "Ezra.xml"],
  ["nehemias", "Nehemías", "Neh", "Neh.xml"],
  ["ester", "Ester", "Esth", "Esth.xml"],
  ["job", "Job", "Job", "Job.xml"],
  ["salmos", "Salmos", "Ps", "Ps.xml"],
  ["proverbios", "Proverbios", "Prov", "Prov.xml"],
  ["eclesiastes", "Eclesiastés", "Eccl", "Eccl.xml"],
  ["cantares", "Cantares", "Song", "Song.xml"],
  ["isaias", "Isaías", "Isa", "Isa.xml"],
  ["jeremias", "Jeremías", "Jer", "Jer.xml"],
  ["lamentaciones", "Lamentaciones", "Lam", "Lam.xml"],
  ["ezequiel", "Ezequiel", "Ezek", "Ezek.xml"],
  ["daniel", "Daniel", "Dan", "Dan.xml"],
  ["oseas", "Oseas", "Hos", "Hos.xml"],
  ["joel", "Joel", "Joel", "Joel.xml"],
  ["amos", "Amós", "Amos", "Amos.xml"],
  ["abdias", "Abdías", "Obad", "Obad.xml"],
  ["jonas", "Jonás", "Jonah", "Jonah.xml"],
  ["miqueas", "Miqueas", "Mic", "Mic.xml"],
  ["nahum", "Nahúm", "Nah", "Nah.xml"],
  ["habacuc", "Habacuc", "Hab", "Hab.xml"],
  ["sofonias", "Sofonías", "Zeph", "Zeph.xml"],
  ["hageo", "Hageo", "Hag", "Hag.xml"],
  ["zacarias", "Zacarías", "Zech", "Zech.xml"],
  ["malaquias", "Malaquías", "Mal", "Mal.xml"]
].map(([slug, title, sourceCode, sourceFile], index) => ({
  slug,
  title,
  sourceCode,
  sourceFile,
  testament: "ot",
  number: index + 1,
  textualBasis: "OSHB / WLC"
}));

const ntRows = [
  ["mateo", "Mateo", "MAT", "MT.UTR"],
  ["marcos", "Marcos", "MRK", "MR.UTR"],
  ["lucas", "Lucas", "LUK", "LU.UTR"],
  ["juan", "Juan", "JHN", "JOH.UTR"],
  ["hechos", "Hechos", "ACT", "AC.UTR"],
  ["romanos", "Romanos", "ROM", "RO.UTR"],
  ["1corintios", "1 Corintios", "1CO", "1CO.UTR"],
  ["2corintios", "2 Corintios", "2CO", "2CO.UTR"],
  ["galatas", "Gálatas", "GAL", "GA.UTR"],
  ["efesios", "Efesios", "EPH", "EPH.UTR"],
  ["filipenses", "Filipenses", "PHP", "PHP.UTR"],
  ["colosenses", "Colosenses", "COL", "COL.UTR"],
  ["1tesalonicenses", "1 Tesalonicenses", "1TH", "1TH.UTR"],
  ["2tesalonicenses", "2 Tesalonicenses", "2TH", "2TH.UTR"],
  ["1timoteo", "1 Timoteo", "1TI", "1TI.UTR"],
  ["2timoteo", "2 Timoteo", "2TI", "2TI.UTR"],
  ["titus", "Tito", "TIT", "TIT.UTR"],
  ["filemon", "Filemón", "PHM", "PHM.UTR"],
  ["hebreos", "Hebreos", "HEB", "HEB.UTR"],
  ["santiago", "Santiago", "JAS", "JAS.UTR"],
  ["1pedro", "1 Pedro", "1PE", "1PE.UTR"],
  ["2pedro", "2 Pedro", "2PE", "2PE.UTR"],
  ["1juan", "1 Juan", "1JN", "1JO.UTR"],
  ["2juan", "2 Juan", "2JN", "2JO.UTR"],
  ["3juan", "3 Juan", "3JN", "3JO.UTR"],
  ["judas", "Judas", "JUD", "JUDE.UTR"],
  ["apocalipsis", "Apocalipsis", "REV", "RE.UTR"]
];

export const NT_BOOKS = ntRows.map(([slug, title, sourceCode, morphFile], index) => ({
  slug,
  title,
  sourceCode,
  morphFile,
  testament: "nt",
  number: index + 40,
  textualBasis: "Textus Receptus de Scrivener 1894"
}));

export const BOOKS = [...OT_BOOKS, ...NT_BOOKS];

export function findBook(slug) {
  return BOOKS.find(book => book.slug === String(slug || "").trim().toLowerCase()) || null;
}
