"use strict";

// Ancient Greek input helpers shared by the browser (window.GreekInput) and Node tests
// (require("./greek.js")). No DOM access here. Used by the placement diagnostic
// (tools/grc-diagnostic/) and meant for reuse by Pensa and the Anki cloze export.
(function expose(root) {
  // ------------------------------------------------------------ transliteration

  // Beta-code-like single letters (docs/greek-diagnostic-spec.md §2): h = eta, w = omega,
  // q = theta, c = xi, y = psi, f = phi, x = chi. Letters without an entry (j, v) pass through.
  const LATIN = {
    a: "α", b: "β", g: "γ", d: "δ", e: "ε", z: "ζ", h: "η", q: "θ", i: "ι", k: "κ",
    l: "λ", m: "μ", n: "ν", c: "ξ", o: "ο", p: "π", r: "ρ", s: "σ", t: "τ", u: "υ",
    f: "φ", x: "χ", y: "ψ", w: "ω"
  };

  // Optional diacritics typed after the letter, as in beta code: ( rough, ) smooth,
  // / acute, \ grave, = circumflex, | iota subscript, + diaeresis.
  const MARKS = {
    "(": "̔", ")": "̓", "/": "́", "\\": "̀", "=": "͂", "|": "ͅ", "+": "̈"
  };
  const VOWELS = new Set([..."αεηιουωΑΕΗΙΟΥΩ"]);
  const ALLOWED = {
    "̔": (b) => VOWELS.has(b) || b === "ρ" || b === "Ρ",
    "̓": (b) => VOWELS.has(b) || b === "ρ",
    "́": (b) => VOWELS.has(b),
    "̀": (b) => VOWELS.has(b),
    "͂": (b) => "αηιυωΑΗΙΥΩ".includes(b),
    "ͅ": (b) => "αηωΑΗΩ".includes(b),
    "̈": (b) => "ιυΙΥ".includes(b)
  };
  // Breathing and diaeresis before the accent, iota subscript last: the order NFC needs
  // to compose the precomposed polytonic letters.
  const MARK_ORDER = ["̈", "̓", "̔", "́", "̀", "͂", "ͅ"];

  const isLetter = (ch) => /\p{L}/u.test(ch ?? "");

  function baseOf(ch) {
    return String(ch ?? "").normalize("NFD")[0] ?? "";
  }

  // Latin → Greek. Greek input is left as it is; mixed input converts only the Latin.
  // A σ produced from Latin `s` becomes ς at the end of a word.
  function transliterate(value) {
    const input = String(value ?? "").normalize("NFC");
    const out = []; // { ch, marks: [], fromS }
    for (const ch of input) {
      const prev = out[out.length - 1];
      const mark = MARKS[ch];
      if (mark && prev && isLetter(prev.ch)) {
        const base = baseOf(prev.ch);
        if (ALLOWED[mark](base) && !prev.marks.includes(mark)) { prev.marks.push(mark); continue; }
      }
      const lower = ch.toLowerCase();
      if (LATIN[lower] && /[a-z]/i.test(ch)) {
        const greek = ch === lower ? LATIN[lower] : LATIN[lower].toUpperCase();
        out.push({ ch: greek, marks: [], fromS: lower === "s" });
      } else {
        out.push({ ch, marks: [], fromS: false });
      }
    }
    return out.map((cell, i) => {
      let ch = cell.ch;
      if (cell.fromS && ch === "σ" && !isLetter(out[i + 1]?.ch)) ch = "ς";
      if (!cell.marks.length) return ch;
      const marks = [...cell.marks].sort((a, b) => MARK_ORDER.indexOf(a) - MARK_ORDER.indexOf(b));
      return (ch + marks.join("")).normalize("NFC");
    }).join("").normalize("NFC");
  }

  // ----------------------------------------------------------------- normalise

  const VARIANT_LETTERS = { "ϐ": "β", "ϑ": "θ", "ϕ": "φ", "ϰ": "κ", "ϱ": "ρ", "ϲ": "σ", "ς": "σ" };
  const VARIANT_RE = /[ϐϑϕϰϱϲς]/g;
  // Punctuation and spacing symbols (incl. koronis/psili ᾽ ᾿, tonos ΄, ano teleia ·) and
  // the modifier-letter apostrophes used for elision.
  const PUNCT_RE = /[\p{P}\p{S}ʼʽ]/gu;

  // Greek full case folding needs expansion: ᾔ uppercases to ἬΙ, whereas lowercasing
  // alone leaves the subscript attached. NFD keeps the other diacritics intact.
  const caseFold = (value) => String(value ?? "").normalize("NFD").toUpperCase().toLowerCase();

  // NFD, strip combining marks, lower-case, final sigma → σ, strip punctuation,
  // collapse whitespace. Applied to both sides of every comparison.
  function normalise(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(VARIANT_RE, (ch) => VARIANT_LETTERS[ch])
      .replace(PUNCT_RE, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Like normalise() but keeps breathings, accents, diaeresis and iota (subscript and
  // adscript compare equally; grave folds into acute), distinguishing accented homographs.
  function accentKey(value) {
    return caseFold(value)
      .replace(/̀/g, "́")
      .replace(/̀/g, "́")
      .replace(/̓/g, "̓")
      .replace(VARIANT_RE, (ch) => VARIANT_LETTERS[ch])
      .replace(PUNCT_RE, " ")
      .replace(/\s+/g, " ")
      .trim()
      .normalize("NFC");
  }

  const isNormalised = (value) => typeof value === "string" && normalise(value) === value && value !== "";

  // -------------------------------------------------------------------- cloze

  // content/grc/diagnostic/FORMAT.md, `cloze`:
  //   empty                         → "empty" (an omission, not an error)
  //   fully accented accepted form  → "correct"
  //   matches `collapsed`           → "not_assessable" (diacritic-free response is ambiguous)
  //   normalised accepted form      → "correct"
  //   matches an error pattern      → "wrong" with the pattern's label
  //   otherwise                     → "wrong" (specified) or "review" (meaning)
  function scoreCloze(item, raw) {
    const greek = transliterate(raw);
    const normalised = normalise(greek);
    const base = { raw: String(raw ?? ""), greek, normalised, label: null };
    if (!normalised) return { ...base, status: "empty" };
    const accepted = item?.accepted ?? [];
    const key = accentKey(greek);
    if (accepted.some((form) => accentKey(form) === key)) return { ...base, status: "correct", matched: "accented" };
    // Retain the legacy normalised keys stored by item banks (subscript stripped),
    // with a second comparison for case-expanded iota. Expansion must not bypass a
    // collapsed homograph's requirement for correct accents and breathings.
    const folded = normalise(caseFold(greek));
    const expandedMatches = accepted.filter((form) => normalise(caseFold(form)) === folded);
    const collapsed = item?.collapsed ?? [];
    if (collapsed.includes(normalised) || expandedMatches.some((form) => collapsed.includes(normalise(form)))) return { ...base, status: "not_assessable" };
    if (expandedMatches.length || accepted.some((form) => normalise(form) === normalised)) return { ...base, status: "correct", matched: "unaccented" };
    for (const pattern of item?.error_patterns ?? []) {
      if ((pattern.match ?? []).includes(normalised)) return { ...base, status: "wrong", label: pattern.label ?? null };
    }
    return { ...base, status: item?.subtype === "meaning" ? "review" : "wrong" };
  }

  const api = { transliterate, normalise, accentKey, isNormalised, scoreCloze, LATIN, MARKS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GreekInput = api;
}(typeof window !== "undefined" ? window : globalThis));
