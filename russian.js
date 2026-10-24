"use strict";

// Phonetic Russian input shared by the diagnostic browser and Node.
// Longest match wins; | separates letters without adding output (s|h → сх).
(function expose(root) {
  const LATIN = {
    shch: "щ", sch: "щ", zh: "ж", kh: "х", ts: "ц", ch: "ч", sh: "ш",
    yo: "ё", jo: "ё", yu: "ю", ju: "ю", ya: "я", ja: "я", ye: "е",
    "e'": "э", eh: "э", "''": "ъ",
    a: "а", b: "б", v: "в", g: "г", d: "д", e: "е", z: "з",
    i: "и", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п",
    r: "р", s: "с", t: "т", u: "у", f: "ф", c: "ц", h: "х",
    y: "ы", j: "й", x: "х", w: "щ", "'": "ь", "#": "ъ", "|": ""
  };
  const keys = Object.keys(LATIN).sort((a, b) => b.length - a.length);

  function transliterate(value) {
    const input = String(value ?? "");
    let out = "";
    for (let i = 0; i < input.length;) {
      const key = keys.find((k) => input.slice(i, i + k.length).toLowerCase() === k);
      if (key === undefined) { out += input[i++]; continue; }
      // Capitalise a token when its first letter is capitalised.
      const upper = /[A-Z]/.test(input[i]);
      out += upper ? LATIN[key].toUpperCase() : LATIN[key];
      i += key.length;
    }
    return out;
  }

  function normalise(value) {
    // Remove only stress marks, then recompose to retain й and fold ё.
    return String(value ?? "").normalize("NFD").toLowerCase()
      .replace(/[\u0301\u0300]/gu, "").normalize("NFC").replace(/ё/gu, "е")
      .replace(/\s+/gu, " ").trim().replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, "");
  }

  const api = { transliterate, normalise, LATIN };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RussianInput = api;
}(typeof window !== "undefined" ? window : globalThis));
