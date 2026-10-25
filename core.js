"use strict";

// Pure helpers shared by the browser reader (window.IllustratedCore) and Node tests
// (require("./core.js") or `import { … } from "./core.js"`). No DOM access here.
(function expose(root) {
  // ---------------------------------------------------------------- answers

  const APOSTROPHES = /[’‘ʼ`´]/g;
  const STRIP = /[.,;:!?"“”„«»…¿¡()–—]/g;

  // Design §7.3: NFC, lower-case, unify apostrophes, strip punctuation, collapse
  // whitespace, expand the clitics 'n → yn and 'r / yr → y. Applied to both sides.
  function normalise(value) {
    return String(value ?? "")
      .normalize("NFC")
      .toLowerCase()
      .replace(APOSTROPHES, "'")
      .replace(STRIP, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/'n(?=\s|$)/g, " yn")
      .replace(/'r(?=\s|$)/g, " y")
      .replace(/(^|\s)yr(?=\s|$)/g, "$1y")
      .replace(/\s+/g, " ")
      .trim();
  }

  function foldAccents(value) {
    return String(value ?? "").normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
  }

  // Initial-consonant mutations: [mutated prefix, radical prefix]. Soft, nasal and
  // aspirate, plus g-loss and h-prothesis handled below. Default table is Welsh;
  // a course may override it with `course.unmutation` in the same shape.
  const WELSH_UNMUTATION = [
    ["ngh", "c"], ["mh", "p"], ["nh", "t"], ["ng", "g"],
    ["ch", "c"], ["ph", "p"], ["th", "t"],
    ["dd", "d"], ["b", "p"], ["d", "t"], ["g", "c"],
    ["f", "b"], ["f", "m"], ["l", "ll"], ["r", "rh"], ["m", "b"], ["n", "d"]
  ];
  const G_LOSS = /^[aeiouwyâêîôûŵŷáéíóúàèìòùäëïöüẁẃẅỳýÿlr]/;
  const H_PROTHESIS = /^h[aeiouwyâêîôûŵŷáéíóúàèìòùäëïöü]/;

  function unmutateCandidates(word, table = WELSH_UNMUTATION) {
    const token = String(word ?? "").toLowerCase();
    const out = new Set([token]);
    if (!token) return out;
    for (const [mutated, radical] of table) {
      if (token.startsWith(mutated)) out.add(radical + token.slice(mutated.length));
    }
    if (G_LOSS.test(token)) out.add(`g${token}`);
    if (H_PROTHESIS.test(token)) out.add(token.slice(1));
    return out;
  }

  function sameUnderMutation(a, b, table) {
    if (a === b) return true;
    const left = unmutateCandidates(a, table);
    for (const candidate of unmutateCandidates(b, table)) if (left.has(candidate)) return true;
    return false;
  }

  // Returns the index of the first token that differs only by mutation, or -1 when the
  // two normalised strings are not mutation-equivalent (or are identical).
  function mutationDifference(typed, expected, table) {
    const a = foldAccents(normalise(typed)).split(" ");
    const b = foldAccents(normalise(expected)).split(" ");
    if (a.length !== b.length) return -1;
    let first = -1;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === b[i]) continue;
      if (!sameUnderMutation(a[i], b[i], table)) return -1;
      if (first < 0) first = i;
    }
    return first;
  }

  function asList(value) {
    if (value === undefined || value === null || value === "") return [];
    return Array.isArray(value) ? value : [value];
  }

  function accepted(item) {
    return asList(item?.accepted_answers ?? item?.answers ?? item?.answer).map(normalise);
  }

  const BLANK = /_{3,}/;
  function promptParts(prompt) {
    return String(prompt ?? "").split(/_{3,}/);
  }
  function countBlanks(prompt) {
    return promptParts(prompt).length - 1;
  }

  const SELF_CHECK_TYPES = /^(bounded_|transfer|production|open)/;
  function answerMode(item) {
    if (item?.answer_mode) return item.answer_mode;
    if (item?.choices?.length) return "choice";
    const answers = asList(item?.accepted_answers ?? item?.answers ?? item?.answer);
    if (item?.blanks?.length) return "exact";
    if (!answers.length || (item?.rubric && SELF_CHECK_TYPES.test(item?.type || ""))) return "self_check";
    return "exact";
  }

  // One list of accepted strings per answer slot. A slot is a `___` blank in the prompt,
  // or the whole answer when the prompt has no blank.
  function slotAnswers(item) {
    const blanks = countBlanks(item?.prompt);
    if (Array.isArray(item?.blanks) && item.blanks.length) return item.blanks.map(asList);
    const answers = asList(item?.accepted_answers ?? item?.answers ?? item?.answer);
    if (blanks > 1) {
      const split = answers.map((answer) => String(answer).split(/\s*\|\s*/));
      return Array.from({ length: blanks }, (_, i) => [...new Set(split.map((parts) => parts[i]).filter(Boolean))]);
    }
    return [answers];
  }

  function checkSlot(value, answers, item, options) {
    const typed = normalise(value);
    if (!typed) return { status: "empty" };
    const expected = answers.map(normalise);
    if (expected.includes(typed)) return { status: "correct" };
    for (const wrong of asList(item?.common_wrong)) {
      const answer = typeof wrong === "string" ? wrong : wrong?.answer;
      if (answer && foldAccents(normalise(answer)) === foldAccents(typed)) return { status: "common_wrong", hint: wrong.hint || "" };
    }
    const folded = foldAccents(typed);
    if (expected.some((answer) => foldAccents(answer) === folded)) return { status: "accent" };
    if (options?.mutationHint) {
      for (const answer of expected) {
        const index = mutationDifference(typed, answer, options.unmutation);
        if (index >= 0) return { status: "mutation", tokenIndex: index, token: typed.split(" ")[index] };
      }
    }
    return { status: "wrong" };
  }

  // values: string or array of strings (one per slot). options.mutationHint enables the
  // "Treiglad?" rung of the feedback ladder (item.mutation_hint or group.mutation_hint).
  function checkResponse(item, values, options = {}) {
    const slots = slotAnswers(item);
    const given = asList(values);
    const mutationHint = Boolean(options.mutationHint ?? item?.mutation_hint);
    const results = slots.map((answers, i) => checkSlot(given[i] ?? "", answers, item, { ...options, mutationHint }));
    let status = "correct";
    if (results.every((result) => result.status === "empty")) status = "empty";
    else {
      const failing = results.find((result) => result.status !== "correct");
      if (failing) status = failing.status === "empty" ? "wrong" : failing.status;
    }
    const failing = results.find((result) => result.status === status) || {};
    return { status, slots: results, hint: failing.hint || "", token: failing.token || "" };
  }

  // Unique (by normalisation) display answers for reveal.
  function revealAnswers(item) {
    if (item?.model_answer) return [item.model_answer];
    if (Array.isArray(item?.model_answers) && item.model_answers.length) return item.model_answers;
    const slots = slotAnswers(item);
    if (slots.length > 1) return [slots.map((answers) => answers[0] ?? "").join(" … ")];
    const seen = new Set();
    return slots[0].filter((answer) => {
      const key = normalise(answer);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }

  // Lemma-level match for self-check key terms: true if any token in text is the lemma
  // or mutates to it.
  function containsLemma(text, lemma, table) {
    const target = foldAccents(normalise(lemma));
    if (!target) return false;
    const haystack = foldAccents(normalise(text));
    if (target.includes(" ")) return ` ${haystack} `.includes(` ${target} `);
    return haystack.split(" ").some((token) => sameUnderMutation(token, target, table));
  }


  // -------------------------------------------------------------- Russian
  // Russian design §8.3. Separate from the Welsh normaliser above, which stays unchanged.

  const RU_STRESS = /́/g;
  const RU_DASHES = /[‐‑‒–—―−]/g;
  const RU_STRIP = /[.,;:!?«»"“”„‟…()]/g;
  // Latin letters that look Cyrillic (a wrong keyboard layout for one key).
  const RU_LOOKALIKES = { a: "а", e: "е", o: "о", p: "р", c: "с", x: "х", y: "у", k: "к",
    A: "А", B: "В", E: "Е", K: "К", M: "М", H: "Н", O: "О", P: "Р", C: "С", T: "Т", X: "Х" };

  // NFC (й, ё stay single code points) → drop U+0301 only → lower → dashes → strip
  // punctuation (a free-standing dash is punctuation; a word-internal hyphen stays) → collapse.
  function ruNormalise(value) {
    return String(value ?? "")
      .normalize("NFC")
      .replace(RU_STRESS, "")
      .toLowerCase()
      .replace(RU_DASHES, "-")
      .replace(RU_STRIP, " ")
      .replace(/(^|\s)-+(?=\s|$)/g, "$1 ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function ruFoldYo(value) {
    return String(value ?? "").replace(/ё/g, "е").replace(/Ё/g, "Е");
  }

  function ruStripStress(value) {
    return String(value ?? "").normalize("NFC").replace(RU_STRESS, "");
  }

  // Replace Latin lookalikes inside words that contain Cyrillic, and one-letter words (the
  // prepositions and conjunctions а, о, с, у, к typed in Latin). Returns {text, found}.
  function ruFixLookalikes(value) {
    const found = [];
    const text = String(value ?? "").replace(/[\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*/gu, (word) => {
      const cyrillic = /\p{Script=Cyrillic}/u.test(word);
      const onlyLookalikes = [...word].length === 1 && word in RU_LOOKALIKES;
      if (!cyrillic && !onlyLookalikes) return word;
      return [...word].map((ch) => {
        if (!(ch in RU_LOOKALIKES)) return ch;
        found.push(ch);
        return RU_LOOKALIKES[ch];
      }).join("");
    });
    return { text, found };
  }

  const Russian = typeof module !== "undefined" && module.exports ? require("./russian.js") : root.RussianInput;
  // Mixed Cyrillic text retains keyboard-lookalike repair; Latin-only text is phonetic.
  function ruInput(value) {
    const fixed = /\p{Script=Cyrillic}/u.test(String(value ?? ""))
      ? ruFixLookalikes(value) : { text: String(value ?? ""), found: [] };
    return { text: Russian.transliterate(fixed.text), found: fixed.found };
  }

  // Forms-table entry for an expected token (answer_forms; keys normalised, ё kept).
  function ruFormsEntry(forms, token) {
    if (!forms) return null;
    return forms[token] ?? forms[ruFoldYo(token)] ?? null;
  }

  function ruFormList(entry) {
    return (entry?.forms || []).map((form) => ruFoldYo(ruNormalise(form)));
  }

  // One answer slot through the §8.3 ladder. options.forms: the lesson's answer_forms table.
  // Status: empty | correct | correct_yo | common_wrong | ending | aspect | wrong;
  // `lookalike` lists Latin letters that were replaced before checking (warn, never fail).
  function ruCheckSlot(value, answers, item, options = {}) {
    const fixed = ruInput(value);
    const lookalike = fixed.found;
    const typed = ruNormalise(fixed.text);
    if (!typed) return { status: "empty", lookalike };
    const expected = asList(answers).map(ruNormalise);
    if (expected.includes(typed)) return { status: "correct", lookalike };
    const foldedTyped = ruFoldYo(typed);
    const yo = expected.findIndex((answer) => ruFoldYo(answer) === foldedTyped);
    if (yo >= 0) return { status: "correct_yo", answer: asList(answers)[yo], lookalike };
    for (const wrong of asList(item?.common_wrong)) {
      const answer = typeof wrong === "string" ? wrong : wrong?.answer;
      if (answer && ruFoldYo(ruNormalise(answer)) === foldedTyped) return { status: "common_wrong", hint: wrong.hint || "", lookalike };
    }
    const typedTokens = foldedTyped.split(" ");
    for (const answer of expected) {
      const tokens = answer.split(" ");
      if (tokens.length !== typedTokens.length) continue;
      const diff = tokens.map((token, i) => (ruFoldYo(token) === typedTokens[i] ? -1 : i)).filter((i) => i >= 0);
      if (diff.length !== 1) continue;
      const index = diff[0];
      const entry = ruFormsEntry(options.forms, tokens[index]);
      if (!entry || Array.isArray(entry)) continue; // unknown or ambiguous: no hint
      const token = typedTokens[index];
      if (ruFormList(entry).includes(token)) return { status: "ending", tokenIndex: index, token, lookalike };
      if (entry.aspect_partner && ruFormList(entry.aspect_partner).includes(token)) return { status: "aspect", tokenIndex: index, token, lookalike };
    }
    return { status: "wrong", lookalike };
  }

  function ruCheckResponse(item, values, options = {}) {
    const slots = slotAnswers(item);
    const given = asList(values);
    const results = slots.map((answers, i) => ruCheckSlot(given[i] ?? "", answers, item, options));
    let status = "correct";
    if (results.every((result) => result.status === "empty")) status = "empty";
    else {
      const failing = results.find((result) => !["correct", "correct_yo"].includes(result.status));
      if (failing) status = failing.status === "empty" ? "wrong" : failing.status;
      else if (results.some((result) => result.status === "correct_yo")) status = "correct_yo";
    }
    const failing = results.find((result) => result.status === status) || {};
    return { status, slots: results, hint: failing.hint || "", token: failing.token || "",
      lookalike: [...new Set(results.flatMap((result) => result.lookalike || []))] };
  }

  const ru = {
    normalise: ruNormalise, foldYo: ruFoldYo, stripStress: ruStripStress, fixLookalikes: ruFixLookalikes,
    transliterate: value => ruInput(value).text, formsEntry: ruFormsEntry, checkSlot: ruCheckSlot, checkResponse: ruCheckResponse,
    get buildAnkiCards() { return buildRuAnkiCards; }, get isCourse() { return isRussianCourse; }
  };

  // Icelandic §8.3: accents and ö are phonemic, never folded for correctness.
  function isNormalise(value) {
    return String(value ?? "").normalize("NFC").toLowerCase()
      .replace(/\p{P}/gu, " ").replace(/\s+/g, " ").trim();
  }

  function isFixLookalikes(value) {
    const letters = { ø: "ö", đ: "ð", ä: "æ", Ø: "Ö", Đ: "Ð", Ä: "Æ" };
    const found = [];
    const text = String(value ?? "").replace(/[øđäØĐÄ]/g, (letter) => {
      found.push(letter); return letters[letter];
    });
    return { text, found };
  }

  // Match only a documented keyboard substitution in the direction typed → expected.
  // Do not merge d/ð or o/ö on both sides: an actual Icelandic word stays a wrong answer.
  function isKeyboardMatch(typed, expected) {
    const substitutions = { þ: ["th"], ð: ["dh", "d"], æ: ["ae"], ö: ["oe", "o"] };
    const pattern = [...expected].map((letter) => substitutions[letter]
      ? `(?:${[letter, ...substitutions[letter]].map(escapeRegExp).join("|")})` : escapeRegExp(letter)).join("");
    return new RegExp(`^${pattern}$`, "u").test(typed);
  }

  function isFoldAcute(value) {
    return String(value).normalize("NFD").replace(/\u0301/g, "").normalize("NFC");
  }

  function isCheckSlot(value, answers, item, options = {}) {
    const fixed = isFixLookalikes(value);
    const lookalike = fixed.found;
    const typed = isNormalise(fixed.text);
    if (!typed) return { status: "empty", lookalike };
    const originals = asList(answers);
    const expected = originals.map(isNormalise);
    if (expected.includes(typed)) return { status: "correct", lookalike };
    for (const wrong of asList(item?.common_wrong)) {
      const answer = typeof wrong === "string" ? wrong : wrong?.answer;
      if (answer && isNormalise(isFixLookalikes(answer).text) === typed) return { status: "common_wrong", hint: wrong.hint || "", lookalike };
    }
    const tokens = typed.split(" ");
    for (let i = 0; i < expected.length; i += 1) {
      if (!isKeyboardMatch(typed, expected[i])) continue;
      const target = expected[i].split(" ");
      const changed = tokens.filter((token, index) => token !== target[index]);
      // A missing dictionary result is unknown, not proof that a word is invalid.
      const invalid = changed.every((token) => options.validWords?.[token] === false);
      return { status: invalid ? "correct_letters" : "ambiguous_letters", answer: originals[i], lookalike };
    }
    if (expected.some((answer) => isFoldAcute(answer) === isFoldAcute(typed))) return { status: "accent", lookalike };
    for (const answer of expected) {
      const target = answer.split(" ");
      if (target.length !== tokens.length) continue;
      const different = target.map((token, i) => token === tokens[i] ? -1 : i).filter((i) => i >= 0);
      if (different.length !== 1) continue;
      const index = different[0];
      const entry = options.forms?.[target[index]];
      if (!entry || Array.isArray(entry)) continue;
      const forms = asList(entry.forms).map((form) => typeof form === "string" ? form : form.form);
      if (!forms.some((form) => isNormalise(form) === tokens[index])) continue;
      // Feature hints are safe only when each form has a single analysis.
      const expectedFeatures = entry.features_by_form?.[target[index]];
      const typedFeatures = entry.features_by_form?.[tokens[index]];
      let feature;
      if (expectedFeatures && typedFeatures && !Array.isArray(expectedFeatures) && !Array.isArray(typedFeatures)) {
        const differences = [...new Set([...Object.keys(expectedFeatures), ...Object.keys(typedFeatures)])]
          .filter((key) => expectedFeatures[key] !== typedFeatures[key]);
        if (differences.length === 1 && ["case", "number", "tense", "mood"].includes(differences[0])) feature = differences[0];
      }
      return { status: "ending", feature, tokenIndex: index, token: tokens[index], lookalike };
    }
    return { status: "wrong", lookalike };
  }

  function isCheckResponse(item, values, options = {}) {
    const given = asList(values);
    const slots = slotAnswers(item).map((answers, i) => isCheckSlot(given[i] ?? "", answers, item, options));
    const good = (slot) => ["correct", "correct_letters"].includes(slot.status);
    const failure = slots.find((slot) => !good(slot));
    const selected = failure || slots.find((slot) => slot.status === "correct_letters") || slots[0];
    const status = slots.every((slot) => slot.status === "empty") ? "empty" : selected.status === "empty" ? "wrong" : selected.status;
    return { ...selected, status, slots, hint: selected.hint || "", token: selected.token || "",
      lookalike: [...new Set(slots.flatMap((slot) => slot.lookalike || []))] };
  }

  const is = { normalise: isNormalise, fixLookalikes: isFixLookalikes, checkSlot: isCheckSlot, checkResponse: isCheckResponse };

  // Reuse the diagnostic's exact transliteration and ambiguity rules.
  const Greek = typeof module !== "undefined" && module.exports ? require("./greek.js") : root.GreekInput;
  function grcCheckSlot(value, answers, item = {}) {
    const forms = [...new Set([...asList(answers), ...asList(item.accepted)])];
    const result = Greek.scoreCloze({ accepted: forms, collapsed: (item.collapsed || []).map(Greek.normalise) }, value);
    return { ...result, status: result.status === "not_assessable" ? "accent" : result.status };
  }
  function grcCheckResponse(item, values) {
    const given = asList(values);
    const slots = slotAnswers(item).map((answers, i) => grcCheckSlot(given[i] ?? "", answers, item));
    const selected = slots.find((slot) => slot.status !== "correct") || slots[0];
    const status = slots.every((slot) => slot.status === "empty") ? "empty" : selected.status === "empty" ? "wrong" : selected.status;
    return { ...selected, status, slots, hint: "" };
  }
  const grc = {
    normalise: (value) => Greek.normalise(Greek.transliterate(value)),
    checkSlot: grcCheckSlot, checkResponse: grcCheckResponse, checkItem: grcCheckResponse
  };

  function answerChecker(course) {
    const lang = course?.answer_checker || course?.capabilities?.answer_checker || course?.lang || course?.language?.code || "cy";
    if (lang === "ru") return ru;
    if (lang === "is") return is;
    if (lang === "grc") return grc;
    if (lang === "cy") return { normalise, checkResponse };
    throw new Error(`Unsupported answer checker: ${lang}`);
  }

  function isInflectingCourse(course) {
    return course?.capabilities?.inflecting === true || course?.anki?.mode === "inflecting" || isRussianCourse(course);
  }

  // --------------------------------------------------------------- anchors

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Locate anchor_text as a whole word (case-insensitive, apostrophe-tolerant) in text.
  function findAnchor(text, anchor) {
    if (!text || !anchor) return null;
    const pattern = escapeRegExp(String(anchor).normalize("NFC")).replace(/['’]/g, "['’]");
    const re = new RegExp(`(?<![\\p{L}\\p{M}])${pattern}(?![\\p{L}\\p{M}])`, "iu");
    const match = re.exec(String(text).normalize("NFC"));
    return match ? { start: match.index, end: match.index + match[0].length } : null;
  }

  // ------------------------------------------------------------ completion

  function readCompleted(storage, key) {
    try {
      const values = JSON.parse(storage.getItem(key) || "[]");
      return new Set(Array.isArray(values) ? values : []);
    } catch { return new Set(); }
  }

  function setCompleted(storage, key, lessonId, done) {
    const completed = readCompleted(storage, key);
    if (done) completed.add(lessonId); else completed.delete(lessonId);
    try { storage.setItem(key, JSON.stringify([...completed])); } catch { /* storage unavailable */ }
    return completed;
  }

  function toggleCompleted(storage, key, lessonId) {
    return setCompleted(storage, key, lessonId, !readCompleted(storage, key).has(lessonId));
  }

  // ---------------------------------------------------------------- lesson

  function storySections(lesson) {
    const source = lesson?.story ?? lesson?.sections ?? [];
    return Array.isArray(source) ? source : source.sections || [];
  }

  function segmentIndex(lesson) {
    const index = new Map();
    for (const section of storySections(lesson)) {
      for (const segment of section.segments || []) if (segment.id) index.set(segment.id, segment);
    }
    return index;
  }

  function presentedAids(segment) {
    return (segment?.inference_aids || []).filter((aid) => aid?.presentation);
  }

  function lessonAidIndex(lesson) {
    const aids = new Map();
    const cover = lesson?.story?.cover;
    if (cover?.ref && cover?.src) aids.set(cover.ref, cover);
    for (const section of storySections(lesson)) {
      for (const segment of section.segments || []) {
        for (const aid of presentedAids(segment)) if (aid.ref && aid.src) aids.set(aid.ref, aid);
      }
    }
    return aids;
  }

  // ------------------------------------------------------------------ Anki

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  // A field is already HTML; make it safe for a tab-separated line.
  function ankiField(html) {
    return String(html ?? "").replace(/\r?\n/g, "<br>").replace(/\t/g, " ");
  }

  function tagSafe(tag) {
    return String(tag ?? "").trim().replace(/\s+/g, "_").replace(/\//g, "-");
  }

  // Head word of a card front: "cadair (b.), cadeiriau" → "cadair"; "dan (+ SM)" → "dan".
  function headWord(front) {
    return String(front ?? "").replace(/\([^)]*\)/g, " ").split(/[,·—–;/]/)[0].replace(/[…?!.]/g, " ").replace(/\s+/g, " ").trim();
  }

  // Escape a sentence and bold the first occurrence of the head word (mutation-aware).
  function boldExample(sentence, front, table) {
    const text = String(sentence ?? "");
    const head = headWord(front);
    let range = null;
    if (head.includes(" ")) range = findAnchor(text, head);
    else if (head) {
      const target = foldAccents(head.toLowerCase());
      for (const match of text.matchAll(/[\p{L}\p{M}]+/gu)) {
        if (sameUnderMutation(foldAccents(match[0].toLowerCase()), target, table)) {
          range = { start: match.index, end: match.index + match[0].length }; break;
        }
      }
    }
    if (!range) return escapeHtml(text);
    return `${escapeHtml(text.slice(0, range.start))}<b>${escapeHtml(text.slice(range.start, range.end))}</b>${escapeHtml(text.slice(range.end))}`;
  }

  function lexiconStages(lexicon) {
    const stages = [];
    for (const entry of lexicon?.entries || []) {
      for (const stage of entry.card_stages || []) stages.push({ ...stage, lexeme_id: stage.lexeme_id || entry.id, _entry: entry });
    }
    for (const stage of lexicon?.card_stages || []) stages.push({ ...stage });
    return stages;
  }

  function asLessonMap(lessons) {
    if (lessons instanceof Map) return lessons;
    const map = new Map();
    for (const lesson of asList(lessons)) if (lesson?.id) map.set(lesson.id, lesson);
    return map;
  }

  // Cards for the given lesson IDs, built from lexicon card_stages (design §8.3–8.4).
  // A lesson whose stages are not yet merged into the lexicon falls back to its own
  // lexicon_delta.card_stages. Lesson vocabulary lists are never exported.
  function buildAnkiCards({ course, lexicon, lessons, lessonIds, lessonLabels = {}, unmutation } = {}) {
    const courseId = course?.id || lexicon?.course_id || "course";
    const lessonMap = asLessonMap(lessons);
    const ids = asList(lessonIds);
    const all = lexiconStages(lexicon);
    const entries = new Map((lexicon?.entries || []).map((entry) => [entry.id, entry]));
    const cards = [];
    const seen = new Set();
    for (const lessonId of ids) {
      const lesson = lessonMap.get(lessonId);
      let stages = all.filter((stage) => stage.lesson === lessonId);
      if (!stages.length && lesson?.lexicon_delta?.card_stages) {
        stages = lesson.lexicon_delta.card_stages.filter((stage) => !stage.lesson || stage.lesson === lessonId);
      }
      const segments = lesson ? segmentIndex(lesson) : new Map();
      const vocab = new Map((lesson?.vocabulary || []).map((word) => [word.lexeme_id, word]));
      for (const stage of stages) {
        const lexemeId = stage.lexeme_id;
        const stageId = stage.id || stage.card_stage || "base";
        const guid = `${courseId}:${lexemeId}:${stageId}`;
        if (!lexemeId || seen.has(guid)) continue;
        seen.add(guid);
        const exampleIds = asList(stage.example_segment_ids?.length ? stage.example_segment_ids : stage.example_segment_id);
        const isPattern = String(stageId).startsWith("pattern");
        const examples = exampleIds.map((id) => segments.get(id)?.text).filter(Boolean)
          .map((text) => (isPattern ? escapeHtml(text) : boldExample(text, stage.front, unmutation)));
        if (!examples.length && stage.example) examples.push(escapeHtml(stage.example));
        const label = lessonLabels[lessonId] || "";
        let back = escapeHtml(stage.back);
        if (examples.length) back += `<br><br>${examples.join("<br>")}`;
        if (label) back += `<br><small>${escapeHtml(label)}</small>`;
        const entry = stage._entry || entries.get(lexemeId);
        const pos = isPattern ? "pattern" : entry?.part_of_speech || vocab.get(lexemeId)?.part_of_speech || "";
        const base = course?.anki?.tags_base?.length ? course.anki.tags_base : [courseId];
        const tags = [...base, ...asList(lesson?.anki_export?.tags), ...asList(stage.tags), pos]
          .map(tagSafe).filter(Boolean);
        cards.push({
          guid,
          front: escapeHtml(stage.front),
          back,
          tags: [...new Set(tags)].join(" "),
          source: lessonId
        });
      }
    }
    return cards;
  }

  function ankiDeckName(course) {
    if (course?.anki?.deck) return course.anki.deck;
    const header = asList(course?.anki?.file_headers).find((line) => String(line).startsWith("#deck:"));
    if (header) return header.slice("#deck:".length);
    const language = typeof course?.language === "object" ? course.language.name : course?.language;
    return [language, course?.title].filter(Boolean).join("::") || "Illustrated Input";
  }

  // Anki ≥ 2.1.55 text import with file headers; no header row is emitted as a note.
  // headers: a course's own anki.file_headers (used verbatim) or the defaults below.
  function buildAnkiTsv(cards, { deck, notetype, headers } = {}) {
    const lines = headers?.length ? [...headers] : [
      "#separator:tab",
      "#html:true",
      "#guid column:1",
      "#tags column:4",
      "#columns:guid\tfront\tback\ttags\tsource"
    ];
    const has = (prefix) => lines.some((line) => String(line).startsWith(prefix));
    const routed = cards.some(card => card.deck);
    if (routed) {
      for (let i = lines.length - 1; i >= 0; i--) if (/^#(?:columns:|deck column:)/.test(lines[i])) lines.splice(i, 1);
      lines.push("#deck column:6", "#columns:guid\tfront\tback\ttags\tsource\tdeck");
    }
    if (notetype && !has("#notetype:")) lines.push(`#notetype:${notetype}`);
    if (deck && !has("#deck:")) lines.push(`#deck:${deck}`);
    for (const card of cards) {
      const fields = [card.guid, card.front, card.back, card.tags, card.source];
      if (routed) fields.push(card.deck || deck || "");
      lines.push(fields.map(ankiField).join("\t"));
    }
    return `${lines.join("\n")}\n`;
  }

  // ------------------------------------------------------- Russian Anki (design §10.3)
  // Per stage: a recognition card (front as authored, always stressed) and, for stages with a
  // `cloze`, a production card (a chapter sentence with the form blanked, citation hint).
  // GUID course:lexeme:stage:kind. Lexemes the owner already knows (plan/baseline.json `known`
  // lemmas or lexeme IDs, passed as options.known) are skipped unless options.includeKnown.

  function isRussianCourse(course) {
    return course?.lang === "ru" || (!course?.lang && course?.language?.code === "ru");
  }

  const ruKey = (value) => ruFoldYo(ruNormalise(value));

  function ruBold(sentence, target, key = ruKey) {
    const text = String(sentence ?? "").normalize("NFC");
    const want = key(target);
    if (!want) return escapeHtml(text);
    for (const match of text.matchAll(/[\p{L}\u0300-\u036f]+(?:-[\p{L}\u0300-\u036f]+)*/gu)) {
      if (key(match[0]) !== want) continue;
      const end = match.index + match[0].length;
      return `${escapeHtml(text.slice(0, match.index))}<b>${escapeHtml(match[0])}</b>${escapeHtml(text.slice(end))}`;
    }
    return escapeHtml(text);
  }

  function ruPos(entry, stageId) {
    if (String(stageId).startsWith("pattern")) return "pattern";
    const pos = String(entry?.part_of_speech || "").toLowerCase().split(/[\s/,]/)[0];
    return { n: "noun", v: "verb", adjective: "adj", adverb: "adv", preposition: "prep", pronoun: "pron", conjunction: "conj", particle: "part" }[pos] || pos;
  }

  function buildRuAnkiCards({ course, lexicon, lessons, lessonIds, lessonLabels = {}, known = [], includeKnown = false } = {}) {
    const courseId = course?.id || lexicon?.course_id || "course";
    const lessonMap = asLessonMap(lessons);
    const legacyRussian = isRussianCourse(course);
    const checker = answerChecker(course);
    const key = legacyRussian ? ruKey : checker.normalise;
    const chapterTag = course?.anki?.chapter_tag || (legacyRussian ? "glava" : "chapter");
    const partTag = course?.anki?.part_tag || (legacyRussian ? "chast" : "part");
    const knownSet = new Set(includeKnown ? [] : asList(known).map((k) => (/^[a-z]{2,3}-/.test(k) ? k : key(k))));
    const isKnown = (entry) => entry && (knownSet.has(entry.id) || (entry.lemma && knownSet.has(key(entry.lemma))));
    const all = lexiconStages(lexicon);
    const base = course?.anki?.tags_base?.length ? course.anki.tags_base : [courseId];
    // anki.card_kinds limits which kinds are emitted; anki.skip_patterns drops grammar-pattern
    // stages; anki.strip_stress removes acute stress marks from both sides.
    const kinds = new Set(asList(course?.anki?.card_kinds).length ? asList(course.anki.card_kinds) : ["recognition", "production"]);
    const skipPatterns = course?.anki?.skip_patterns === true;
    const unstress = course?.anki?.strip_stress === true ? ruStripStress : (text) => text;
    const cards = [];
    const seen = new Set();
    const push = (card) => cards.push({ ...card, front: unstress(card.front), back: unstress(card.back) });
    for (const lessonId of asList(lessonIds)) {
      const lesson = lessonMap.get(lessonId);
      const segments = lesson ? segmentIndex(lesson) : new Map();
      const order = lesson?.order ?? Number((/-l(\d+)$/.exec(lessonId) || [])[1]);
      const part = lesson?.part ?? lesson?.rhan;
      const label = lessonLabels[lessonId] || "";
      const lessonTags = [`${chapterTag}-${String(order).padStart(2, "0")}`, ...(part ? [`${partTag}-${part}`] : []), ...asList(lesson?.anki_export?.tags)];
      for (const stage of all.filter((st) => st.lesson === lessonId)) {
        const entry = stage._entry;
        const stageId = stage.id || "base";
        const isPattern = String(stageId).startsWith("pattern");
        if (isPattern && skipPatterns) continue;
        if (!isPattern && isKnown(entry)) continue;
        const lexemeId = stage.lexeme_id;
        const pos = ruPos(entry, stageId);
        const tags = (kind) => [...new Set([...base, ...lessonTags, ...asList(stage.tags), pos, kind].map(tagSafe).filter(Boolean))].join(" ");
        const exampleIds = asList(stage.example_segment_ids?.length ? stage.example_segment_ids : stage.example_segment_id);
        const boldTarget = stage.cloze?.answer || headWord(stage.front);
        const examples = exampleIds.map((id) => segments.get(id)?.text).filter(Boolean)
          .map((text) => (isPattern ? escapeHtml(text) : ruBold(text, boldTarget, key)));
        if (!examples.length && stage.example) examples.push(escapeHtml(stage.example));
        let back = escapeHtml(stage.back);
        if (examples.length) back += `<br><br>${examples.join("<br>")}`;
        if (label) back += `<br><small>${escapeHtml(label)}</small>`;
        const recognition = `${courseId}:${lexemeId}:${stageId}${legacyRussian ? ":recognition" : ""}`;
        if (lexemeId && kinds.has("recognition") && !seen.has(recognition)) {
          seen.add(recognition);
          push({ guid: recognition, front: escapeHtml(stage.front), back, tags: tags("recognition"), source: lessonId });
        }
        const cloze = stage.cloze;
        if (!cloze || stage.production === false || !kinds.has("production")) continue;
        const sentence = String(segments.get(cloze.segment_id || exampleIds[0])?.text ?? "").normalize("NFC");
        const range = findAnchor(sentence, String(cloze.answer).normalize("NFC")); // whole word, never inside one
        const at = range ? range.start : -1;
        const answer = range ? sentence.slice(range.start, range.end) : "";
        const production = `${courseId}:${lexemeId}:${stageId}${legacyRussian ? ":production" : "-production"}`;
        if (at < 0 || seen.has(production)) continue;
        seen.add(production);
        const hint = cloze.hint || headWord(stage.front);
        const front = `${escapeHtml(sentence.slice(0, at))}___${escapeHtml(sentence.slice(at + answer.length))}${hint ? ` <i>(${escapeHtml(hint)})</i>` : ""}`;
        let prodBack = `<b>${escapeHtml(answer)}</b><br><br>${escapeHtml(sentence.slice(0, at))}<b>${escapeHtml(answer)}</b>${escapeHtml(sentence.slice(at + answer.length))}<br>${escapeHtml(stage.back)}`;
        if (label) prodBack += `<br><small>${escapeHtml(label)}</small>`;
        push({ guid: production, front, back: prodBack, tags: tags("production"), source: lessonId });
      }
    }
    return cards;
  }

  // Capability-independent export mode reusable by any scaffolded production course.
  // A stage repeated in later units updates its existing GUID; the newest unit wins.
  function buildScaffoldedAnkiCards({ course, lexicon, lessons, lessonIds, lessonLabels = {}, known = [], includeKnown = false } = {}) {
    const courseId = course?.id || lexicon?.course_id || "course";
    const lessonMap = asLessonMap(lessons);
    const entries = new Map((lexicon?.entries || []).map(entry => [entry.id, entry]));
    const all = lexiconStages(lexicon);
    const cards = new Map();
    const deck = ankiDeckName(course);
    const key = answerChecker(course).normalise;
    const knownSet = new Set(includeKnown ? [] : asList(known).map(value => /^[a-z]{2,3}-/.test(value) ? value : key(value)));
    const skipKinds = new Set(course?.anki?.skip_known_kinds ?? ["recognition", "production"]);
    const skipKnown = (entry, kind) => skipKinds.has(kind) && entry &&
      (knownSet.has(entry.id) || (entry.lemma && knownSet.has(key(entry.lemma))));
    const ids = [...asList(lessonIds)].sort((a, b) => (lessonMap.get(a)?.order || 0) - (lessonMap.get(b)?.order || 0));
    for (const lessonId of ids) {
      const lesson = lessonMap.get(lessonId);
      const segments = lesson ? segmentIndex(lesson) : new Map();
      const delta = lesson?.lexicon_delta;
      const deltaEntries = new Map((delta?.entries || []).map(entry => [entry.id, entry]));
      const stages = new Map();
      for (const stage of [...lexiconStages(delta), ...all].filter(stage => stage.lesson === lessonId || !stage.lesson)) {
        stages.set(`${stage.lexeme_id}:${stage.id || "base"}`, stage);
      }
      for (const stage of stages.values()) {
        const entry = stage._entry || entries.get(stage.lexeme_id) || deltaEntries.get(stage.lexeme_id);
        if (!stage.lexeme_id) continue;
        const guid = `${courseId}:${stage.lexeme_id}:${stage.id || "base"}`;
        const citation = stage.front || entry?.lemma || "";
        const pos = entry?.part_of_speech || "";
        const exampleIds = asList(stage.example_segment_ids?.length ? stage.example_segment_ids : stage.example_segment_id);
        const segment = segments.get(stage.cloze?.segment_id || exampleIds[0]);
        const sentence = String(segment?.text || stage.example || "").normalize("NFC");
        const target = stage.cloze?.answer || headWord(citation);
        const aids = [...(segment?.inference_aids || []), ...[...segments.values()].flatMap(seg => seg.inference_aids || [])];
        const gloss = aids.find(aid => aid.gloss && (aid.covers_lexeme_ids?.includes(stage.lexeme_id) || (aid.anchor_text && aid.anchor_text === target)))?.gloss || "";
        const label = lessonLabels[lessonId] || `${course?.ui_strings?.[course?.lang]?.lesson || "Unit"} ${lesson?.order || ""}`;
        const tags = kind => [...new Set([...(course?.anki?.tags_base || [courseId]), `${course?.anki?.chapter_tag || "chapter"}-${String(lesson?.order || 0).padStart(2, "0")}`, ...(lesson?.part ? [`${course?.anki?.part_tag || "part"}-${lesson.part}`] : []), ...asList(lesson?.anki_export?.tags), ...asList(stage.tags), pos, kind].map(tagSafe).filter(Boolean))].join(" ");
        const back = [escapeHtml(stage.back), escapeHtml(gloss), escapeHtml(sentence), `<small>${escapeHtml(label)}</small>`].filter(Boolean).join("<br><br>");
        cards.delete(guid);
        if (!skipKnown(entry, "recognition")) cards.set(guid, {guid, front: `${escapeHtml(citation)}${pos ? `<br><small>${escapeHtml(pos)}</small>` : ""}`, back, tags: tags("recognition"), source: lessonId, deck});
        // Only the lexeme's explicit production flag opts into this deck.
        cards.delete(`${guid}-production`);
        if (skipKnown(entry, "production") || entry?.production !== true || stage.production === false || !stage.cloze) continue;
        const range = findAnchor(sentence, String(stage.cloze.answer).normalize("NFC"));
        if (!range) continue;
        const answer = sentence.slice(range.start, range.end);
        const letters = (answer.match(/\p{L}\p{M}*/gu) || []).slice(0, 2).join("");
        const front = `${escapeHtml(sentence.slice(0, range.start))}${escapeHtml(letters)}___${escapeHtml(sentence.slice(range.end))}<br><i>${escapeHtml(stage.back)}</i>`;
        cards.set(`${guid}-production`, {guid: `${guid}-production`, front, back: `${escapeHtml(sentence)}<br><br>${escapeHtml(citation)}<br><small>${escapeHtml(label)}</small>`, tags: tags("production"), source: lessonId, deck: `${deck}::${course?.anki?.production_deck_suffix || "Production"}`});
      }
    }
    return [...cards.values()];
  }

  function ankiExport(options = {}) {
    if (options.course?.anki?.mode === "scaffolded") {
      const cards = buildScaffoldedAnkiCards(options);
      return { cards, text: buildAnkiTsv(cards, { deck: options.deck ?? ankiDeckName(options.course), notetype: options.notetype, headers: options.headers ?? options.course?.anki?.file_headers }) };
    }
    if (isInflectingCourse(options.course)) {
      const cards = buildRuAnkiCards(options);
      const headers = options.headers ?? options.course?.anki?.file_headers;
      return { cards, text: buildAnkiTsv(cards, { deck: options.deck ?? ankiDeckName(options.course), notetype: options.notetype, headers }) };
    }
    const cards = buildAnkiCards(options);
    const headers = options.headers ?? options.course?.anki?.file_headers;
    return { cards, text: buildAnkiTsv(cards, { deck: options.deck ?? ankiDeckName(options.course), notetype: options.notetype, headers }) };
  }

  // Legacy quoting helper retained for older callers.
  function tsvField(value) {
    const text = String(value ?? "").replace(/\r?\n/g, "<br>");
    return /[\t"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  const api = {
    normalise, foldAccents, unmutateCandidates, sameUnderMutation, mutationDifference,
    accepted, promptParts, countBlanks, answerMode, slotAnswers, checkResponse, revealAnswers,
    containsLemma, findAnchor, readCompleted, setCompleted, toggleCompleted,
    storySections, segmentIndex, presentedAids, lessonAidIndex,
    escapeHtml, ankiField, headWord, boldExample, buildAnkiCards, ankiDeckName, buildAnkiTsv,
    ankiExport, tsvField, WELSH_UNMUTATION, BLANK, ru, is, grc, answerChecker, isInflectingCourse, normaliseRu: ruNormalise, normaliseIs: isNormalise
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      normalise, foldAccents, unmutateCandidates, sameUnderMutation, mutationDifference,
      accepted, promptParts, countBlanks, answerMode, slotAnswers, checkResponse, revealAnswers,
      containsLemma, findAnchor, readCompleted, setCompleted, toggleCompleted,
      storySections, segmentIndex, presentedAids, lessonAidIndex,
      escapeHtml, ankiField, headWord, boldExample, buildAnkiCards, ankiDeckName, buildAnkiTsv,
      ankiExport, tsvField, WELSH_UNMUTATION, BLANK, ru, is, grc, answerChecker, isInflectingCourse, normaliseRu: ruNormalise, normaliseIs: isNormalise
    };
  }
  root.IllustratedCore = api;
}(typeof window !== "undefined" ? window : globalThis));
