"use strict";

// Illustrated Input reader. All course text comes from JSON under the course directory
// (default content/cy/, override with ?course=<path>). Strings below are the English
// fallback for interface chrome; a course supplies its own in course.ui_strings.

const Core = window.IllustratedCore;

const UI_DEFAULTS = {
  skip: "Skip to the text", nav_lessons: "Lessons", contents: "Contents", course_progress: "Course progress",
  continue: "Continue", start: "Start reading", how_to_read: "How to read this book",
  part: "Part", lesson: "Lesson", lessons_range: "Lessons {from}–{to}", planned: "coming soon",
  finished: "finished", hide_notes: "Hide notes", show_notes: "Show notes", notes: "Notes",
  play_sentence: "Play the sentence", play_paragraph: "Play the paragraph", listen: "Listen", stop: "Stop", pause: "Pause", resume: "Play", audio: "Audio", voice: "Voice", grammar: "Grammar", grammar_note_en: "Note (English)",
  in_story: "in the story", pensa: "Exercises", oral_mode: "Oral mode", check: "Check", reveal: "Show",
  retry: "Try again", reveal_all: "Show all", example: "Example", correct: "Correct!",
  correct_letters: "Correct, but use: {answer}", ambiguous_letters: "Did you mean {answer}?",
  case_hint: "Almost! Case?", number_hint: "Almost! Number?", tense_hint: "Almost! Tense?", mood_hint: "Almost! Mood?",
  accent_hint: "Almost: check the accents.", mutation_hint: "Almost: mutation?",
  wrong: "Not yet.", empty: "Type an answer first.", answer: "Answer", model_answer: "Answer",
  rubric: "Check", self_yes: "I had it", self_no: "Not yet", key_terms: "Key words", word_bank: "Word bank",
  item: "Question {n}", blank: "blank {n}", vocabulary: "Vocabulary", words_count: "{n} words",
  finish: "Finish lesson", finished_state: "Finished", english_toggle: "English", finished_announce: "{title}: finished.",
  unfinished_announce: "{title}: marked unfinished.", anki_lesson: "Anki: this lesson",
  anki_cumulative: "Anki: lessons 1–{n}", anki_done: "Anki: {n} cards", anki_empty: "No Anki cards for this lesson yet.",
  next: "Next", previous: "Previous", enlarge: "Enlarge picture", close: "Close", loading: "Opening the course…",
  status_draft: "draft", status_reviewed: "reviewed", status_published: "published",
  gender_m: "m.", gender_f: "f.", load_error: "The course could not be opened.",
  serve_hint: "Run this site through a local web server (python -m http.server) rather than opening index.html directly.",
  gender_n: "n.", course_select: "Course", stress_marks: "Stress marks", workbook: "Workbook", obrazec: "Example",
  skip_exercise: "Skip", skipped: "Skipped", unskip: "Undo", correct_yo: "Correct! (ё)", ending_hint: "Almost! The ending?",
  aspect_hint: "Almost! Aspect?", lookalike_warning: "Latin letters ({chars}) were replaced by Cyrillic ones.",
  latin_warning: "Latin letters: {chars}. Switch the keyboard layout?", pronunciation: "Pronunciation",
  stepper: "Steps", step_listen: "Listen {n}", step_read: "Read {n}", step_exercises: "Workbook {n}", step_grammar: "Grammar",
  step_pensa: "Exercises", step_write: "Write", step_reread: "Re-read", step_anki: "Anki", step_done: "Done",
  step_mark: "Step done", step_marked: "Done", step_next: "Next: {step}", continue_step: "{lesson} · {step}",
  export_timing: "Export timing (JSON)", words_with_history: "Words with a history", note_en: "Note (English)",
  afterword: "Afterword", whats_next: "What next", napishi: "Write", napishi_draft: "Your text",
  napishi_rewrite: "Corrected version", napishi_mark: "Mark one or two of your own errors and rewrite those sentences below.",
  napishi_typical: "Typical errors", my_error: "I did this", model_answers: "Model answers",
  copy_feedback: "Copy for feedback", copied: "Copied.", copy_failed: "Could not copy. Select the text below and copy it yourself.",
  feedback_task: "Task", feedback_text: "Learner's text", feedback_rewrite: "Learner's corrected version",
  feedback_prompt: "You are an experienced language teacher. Correct the learner's text below: rewrite it correctly with as few changes as possible, list each error as wrong → right with a short explanation of the rule, say what is good, and give one short exercise on the most important error.",
  words_typed: "{n} words", ex_type_okonchaniya: "Endings", ex_type_preobrazovanie: "Transform",
  ex_type_podstanovka: "Substitute", ex_type_otvet: "Answer", ex_type_soedini: "Join", ex_type_rasstav: "Word order", ex_type_diktant: "Dictation",
  ex_type_napishi: "Write", timing_summary: "Time per chapter", timing_total: "Total:", minutes: "{n} min",
  anki_include_known: "Include words I already know",
  custom: "custom", families: "Word families",
  family_non_compositional: "The meaning cannot be predicted from the parts.", reveal_english: "English meaning",
  vocabulary_knew: "Knew it", vocabulary_context: "Got it from context", vocabulary_no: "No",
  vocabulary_export: "Export self-check (JSON)", chapters: "Chapters", back_to_chapter: "Back to the chapter",
  back_to_exercise: "Back to the exercise", no_exercises: "This chapter has no workbook exercises.",
  open_workbook: "Workbook for this chapter",
  gloss_keys: "Use Left and Right arrow keys to move between words; Enter or Space opens a gloss; Escape closes it."
};
const PENSA_HINTS_EN = {
  A: "Change each sentence as in the example.",
  B: "Fill each gap with a word from the list. Watch the mutation.",
  C: "Answer from the story. Write, or say it aloud and then press Show."
};
const POS_EN = {
  noun: "n.", verb: "v.", adjective: "adj.", adverb: "adv.", preposition: "prep.", conjunction: "conj.",
  pronoun: "pron.", particle: "part.", phrase: "phr.", interjection: "interj.", numeral: "num.", article: "art.",
  name: "name", "proper noun": "name", "conditional verb": "v.", pattern: "patt."
};

const state = {
  baseUrl: null, course: null, lessons: new Map(), lexicon: undefined, current: null,
  english: false, notesHidden: false, oral: false, pensa: new Map(), activeField: null, view: null,
  index: null, indexEntry: null, rereadView: null, book: "chapter", navBook: null, known: undefined
};
const $ = (selector, root = document) => root.querySelector(selector);

// ------------------------------------------------------------------ helpers

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

const pendingStorage = new Map();
function store(key, value, cacheFailure = true) {
  const full = `illustrated-input:${key}`;
  if (value === undefined && pendingStorage.has(full)) return pendingStorage.get(full);
  try {
    if (value === undefined) return localStorage.getItem(full);
    if (value === null) localStorage.removeItem(full); else localStorage.setItem(full, value);
    pendingStorage.delete(full);
  } catch {
    // Cache scalar preferences only; record snapshots must not hide newer storage.
    if (cacheFailure && value !== undefined) pendingStorage.set(full, value === null ? null : String(value));
  }
  return null;
}

// Per-course storage: illustrated-input:<course-id>:<name>. A setting falls back to its
// old global key, so preferences made before courses were separated carry over.
function courseKey(name) { return `${state.course?.id || "course"}:${name}`; }
function setting(name, legacy) {
  const own = store(courseKey(name));
  return own !== null ? own : (legacy ? store(legacy) : null);
}
const pendingProgress = new Map();
function readJSONStore(name, fallback = {}) {
  let data;
  try { data = JSON.parse(store(courseKey(name)) || "null") ?? fallback; } catch { data = fallback; }
  for (const { path, value } of pendingProgress.get(courseKey(name))?.values() || []) {
    if (name === "workbook") {
      const record = data[path[0]] ||= { skipped: {}, items: {} };
      record.skipped ||= {}; record.items ||= {};
      // Defaults are not pending edits: preserve another tab's actual attempt count.
      if (path[1] === "items" && value !== undefined) record.items[path[2]] ||= { tries: 0 };
    }
    let node = data;
    for (const key of path.slice(0, -1)) node = node[key] ||= {};
    if (value === undefined) delete node[path.at(-1)]; else node[path.at(-1)] = value;
  }
  return data;
}
function writeJSONStore(name, value) { store(courseKey(name), JSON.stringify(value), false); }

// Progress and draft writes retain only local edits, including deletion tombstones.
// Overlay them on fresh storage so other tabs' unrelated additions/removals survive.
function writeProgress(name, changes) {
  const key = courseKey(name);
  if (!pendingProgress.has(key)) pendingProgress.set(key, new Map());
  const pending = pendingProgress.get(key);
  for (const [path, value] of changes) pending.set(JSON.stringify(path), { path, value });
  const all = readJSONStore(name);
  try {
    localStorage.setItem(`illustrated-input:${key}`, JSON.stringify(all));
    pendingProgress.delete(key);
  } catch { /* field changes remain pending for this page session */ }
}

function targetLang() { return state.course?.language?.code || state.course?.language_code || "cy"; }
function uiLangOfCourse() { return state.course?.ui_lang || targetLang(); }

// course.ui_strings is either flat (target language) or keyed by language
// ({cy: {...}, en: {...}}). Our key names first, then the course's names for them.
const UI_ALIASES = {
  contents: ["course_contents"], lesson: ["chapter"], pensa: ["exercises"], grammar_note_en: ["nodyn"],
  retry: ["try_again"], accent_hint: ["almost_circumflex"], self_yes: ["self_check_yes"], self_no: ["self_check_no"],
  finished_state: ["finished"], listen: ["audio_play"], voice: ["audio_source"], anki_lesson: ["anki"],
  english_toggle: [], nav_lessons: ["course_contents"]
};
function courseStrings(lang) {
  const table = state.course?.ui_strings;
  if (!table) return null;
  if (table[lang] && typeof table[lang] === "object") return table[lang];
  const nested = Object.values(table).some((value) => value && typeof value === "object");
  return lang === uiLangOfCourse() && !nested ? table : null;
}
function lookup(table, key) {
  if (!table) return undefined;
  for (const name of [key, ...(UI_ALIASES[key] || [])]) if (typeof table[name] === "string") return table[name];
  return undefined;
}
function format(text, vars) {
  let out = String(text).replace(/\{(\w+)\}/g, (_, key) => (vars?.[key] ?? `{${key}}`));
  if (vars?.n !== undefined) out = out.replace(/(\d\s*[–-]\s*)N\b/, `$1${vars.n}`);
  return out;
}
// Interface string: the course's target-language string unless English is toggled,
// then the course's English string, then the built-in English default.
function tl(key, vars) {
  const target = state.english ? undefined : lookup(courseStrings(uiLangOfCourse()), key);
  if (target !== undefined) return [format(target, vars), uiLangOfCourse()];
  const english = lookup(courseStrings("en"), key);
  return [format(english ?? UI_DEFAULTS[key] ?? key, vars), "en"];
}
function t(key, vars) { return tl(key, vars)[0]; }
function bare(text) { return String(text).replace(/^\s*✓\s*/, ""); }
function ui(tag, key, props = {}, vars) {
  const [text, lang] = tl(key, vars);
  return h(tag, { ...props, lang }, text);
}
// Course-language label regardless of the English toggle (for Anki card text).
function courseString(key, vars) {
  return format(lookup(courseStrings(uiLangOfCourse()), key) ?? UI_DEFAULTS[key] ?? key, vars);
}

// ------------------------------------------------------------------ course features

function capability(name) { return state.course?.capabilities?.[name] === true; }
let vocabularyStorage = null;
let vocabularyStorageCourse = null;
function vocabularyStore() {
  if (!vocabularyStorage || vocabularyStorageCourse !== state.course.id) {
    vocabularyStorage = Core.createVocabularyStore(safeStorage(), state.course.id);
    vocabularyStorageCourse = state.course.id;
  }
  return vocabularyStorage;
}

// Keep the typed text intact; show the exact transliteration used by the checker.
function typingPreview(field) {
  const checker = courseChecker();
  const transliterate = checker === Core.ru && window.RussianInput ? Core.ru.transliterate
    : checker === Core.grc && window.GreekInput ? window.GreekInput.transliterate : null;
  if (!transliterate) return null;
  const preview = h("span", { class: "greek-preview", lang: targetLang(), "aria-live": "polite" });
  // Only useful while the learner types Latin letters.
  const update = () => {
    const latin = /[A-Za-z]/.test(field.value);
    preview.hidden = !latin;
    preview.textContent = latin ? transliterate(field.value) : "";
  };
  field.addEventListener("input", update);
  update();
  return preview;
}
// Compose й/ё first so only remaining combining marks are skipped when counting.
function firstLetters(answer, count) {
  return Array.from(answer.normalize("NFC").replace(/\p{M}/gu, "")).slice(0, count || 0).join("");
}

function inputWithPreview(field) {
  const preview = typingPreview(field);
  return preview ? h("span", { class: "input-preview" }, field, preview) : field;
}

function inflectingCourse() { return Core.isInflectingCourse(state.course); }
function courseChecker() { return Core.answerChecker(state.course); }
function cyrillicCourse() {
  const script = state.course?.language?.script || state.course?.script;
  return script ? /^cyrl/i.test(script) : ["ru", "uk", "be", "bg", "sr", "mk"].includes(targetLang());
}

// Stress (design §7.4): stored stressed, shown through a toggle remembered per Часть so the
// default fade (on through `default_on_through_part`, then off) still happens.
const STRESS_TOGGLED = ["story", "exercises", "pensa", "words_with_history"];
function stressConfig() { return state.course?.stress || null; }
function lessonPart(lesson) {
  const own = lesson?.part ?? lesson?.chast ?? lesson?.rhan ?? lesson?._entry?.part ?? lesson?._entry?.chast ?? lesson?._entry?.rhan;
  if (own !== undefined) return Number(own);
  const part = partOf(lesson);
  return part && part.number !== "" ? Number(part.number) : 1;
}
function stressDefault(lesson) {
  const through = stressConfig()?.default_on_through_part;
  return through === undefined || through === null ? true : lessonPart(lesson) <= Number(through);
}
function stressOn(lesson = state.current) {
  if (!stressConfig()) return true;
  if (lesson && state.rereadView === lesson.id) return false; // Перечитать: off for this view only
  const saved = store(courseKey(`stress:part-${lessonPart(lesson)}`));
  return saved === null ? stressDefault(lesson) : saved === "1";
}
// `stress.strip_everywhere`: with the toggle off, no rendered text anywhere (titles, grammar
// tables, glosses, vocabulary, feedback) shows an acute. A MutationObserver strips U+0301 from
// text as it is added; the stored data and the audio keep their stress. Turning the toggle on
// re-renders, and the observer then leaves the new text alone.
const ACUTE_RE = /\u0301/g;
function stressHiddenEverywhere() {
  const config = stressConfig();
  return Boolean(config?.strip_everywhere) && !stressOn(state.current || null);
}
function stripStressNodes(root) {
  // A target-language display preference must not alter a known-language reference.
  if ((root.nodeType === Node.TEXT_NODE ? root.parentElement : root)?.closest?.(".bridge-language")) return;
  if (root.nodeType === Node.TEXT_NODE) { if (root.nodeValue.includes(ACUTE)) root.nodeValue = root.nodeValue.replace(ACUTE_RE, ""); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) if (!node.parentElement?.closest(".bridge-language") && node.nodeValue.includes(ACUTE)) node.nodeValue = node.nodeValue.replace(ACUTE_RE, "");
}
function installStressStripper() {
  if (typeof MutationObserver === "undefined") return;
  const observer = new MutationObserver((records) => {
    if (!stressHiddenEverywhere()) return;
    for (const record of records) {
      if (record.type === "characterData") stripStressNodes(record.target);
      else for (const node of record.addedNodes) stripStressNodes(node);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

// Text for a surface: stress stripped when the toggle is off and the surface is toggled.
function disp(text, area = "story") {
  if (text === undefined || text === null) return text;
  const config = stressConfig();
  if (!config || stressOn()) return text;
  const toggled = config.toggle_applies_to || STRESS_TOGGLED;
  return toggled.includes(area) ? stripStress(text).text : text;
}

function resolve(path) { return new URL(path, state.baseUrl).href; }

async function loadJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
  return response.json();
}

function courseDir(param) {
  return new URL(param.endsWith(".json") ? param.replace(/[^/]*$/, "") : param.replace(/\/?$/, "/"), location.href);
}

// The course index (content/courses.json): published and draft courses are offered in
// the selector; planned and hidden ones are not (an explicit ?course=<id> still opens them).
function visibleCourses(index = state.index) {
  return (index?.courses || []).filter((course) => course?.id && course.path && !["planned", "hidden"].includes(course.status));
}

// ?course=<id or path>, else the last course opened, else the index default, else content/cy/.
function pickCourse(index) {
  const param = new URLSearchParams(location.search).get("course");
  const all = index?.courses || [];
  if (param) {
    const byId = all.find((course) => course.id === param);
    if (byId) return { base: courseDir(byId.path), entry: byId };
    const candidate = courseDir(param);
    if (candidate.origin === location.origin) {
      return { base: candidate, entry: all.find((course) => courseDir(course.path).href === candidate.href) || null };
    }
  }
  const list = visibleCourses(index);
  const last = store("last-course");
  const entry = list.find((course) => course.id === last) || list.find((course) => course.id === index?.default) || list[0];
  if (entry) return { base: courseDir(entry.path), entry };
  return { base: new URL("content/cy/", location.href), entry: null };
}

async function loadIndex() {
  try { return await loadJSON(new URL("content/courses.json", location.href).href); }
  catch { return null; }
}

function courseHref(course) {
  const url = new URL(location.href);
  url.search = `?course=${encodeURIComponent(course.id)}`;
  url.hash = "";
  return url.href;
}

// The sidebar is the one place to change course: every visible course, the current marked.
function renderCourseSwitch() {
  const box = $("#course-switch");
  if (!box) return;
  const list = visibleCourses();
  const current = state.course?.id;
  const tagged = (course) => (course.id === current ? Boolean(state.course?.custom || course.custom) && capability("custom_tag") : course.custom && course.capabilities?.custom_tag === true);
  const listed = list.some((course) => course.id === current) ? list : [{ id: current, title: state.course?.title, language: targetLang() }, ...list];
  if (listed.length < 2 && !tagged(listed[0] || {})) { box.hidden = true; box.replaceChildren(); return; }
  box.replaceChildren(ui("p", "course_select", { class: "course-switch-label", id: "course-switch-label" }),
    h("ul", { class: "course-options", id: "course-select" }, listed.map((course) => h("li", null,
      h("a", { class: "course-option", href: courseHref(course), "aria-current": course.id === current ? "page" : null },
        h("span", { class: "course-option-title", lang: course.language || null }, course.title || course.id),
        course.language_name ? h("small", { lang: course.language || null }, course.language_name) : null,
        // The current course's tag follows its capability; others' tags are plain text.
        tagged(course) ? (course.id === current ? ui("span", "custom", { class: "custom-tag" }) : h("small", null, t("custom"))) : null)))));
  box.hidden = false;
}

function toast(message, lang) {
  const el = $("#toast");
  el.textContent = message;
  el.lang = lang || document.documentElement.lang;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2800);
}

// ------------------------------------------------------------------ Russian text helpers
// DOM-free; exported for tests as globalThis.IllustratedReader. Answer checking itself is
// core.js's Core.ru; stripStress (with its offset map), the stepper and the timing export
// are candidates for core.js (docs/reader-ru-notes.md §4).

const ACUTE = "\u0301";

// Display text without stress marks, plus map[i] = source index of display character i
// (map[display.length] = source.length), so anchors found in either text resolve in both.
function stripStress(source) {
  const text = String(source ?? "");
  if (!text.includes(ACUTE)) {
    const map = Array.from({ length: text.length + 1 }, (_, i) => i);
    return { text, map };
  }
  let out = "";
  const map = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === ACUTE) continue;
    map.push(i);
    out += text[i];
  }
  map.push(text.length);
  return { text: out, map };
}

function latinLetters(value) { return [...new Set(String(value ?? "").match(/[A-Za-z]/g) || [])]; }

// Answer checking for Russian is core.js's (Core.ru: normalise, foldYo, fixLookalikes,
// checkResponse = the §8.3 ladder). The reader adds only what core does not hold:
// the forms table with normalised keys, and lexeme → forms for key-term ticks.
function formsTable(lesson, ru) {
  const table = {};
  for (const [token, value] of Object.entries(lesson?.answer_forms || {})) table[ru.normalise(token)] = value;
  return table;
}

function lexemeFormsIndex(lesson, lexicon, ru) {
  const key = (value) => ru.foldYo ? ru.foldYo(ru.normalise(value)) : ru.normalise(value);
  const byLexeme = new Map();
  const add = (id, forms) => {
    if (!id) return;
    if (!byLexeme.has(id)) byLexeme.set(id, new Set());
    for (const form of forms || []) if (form) byLexeme.get(id).add(key(String(form).replace(/\([^)]*\)/g, " ").split(/[,/]/)[0]));
  };
  for (const value of Object.values(lesson?.answer_forms || {})) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      add(entry?.lexeme_id, [entry?.lemma, ...(entry?.forms || [])]);
      if (entry?.aspect_partner) add(entry.aspect_partner.lexeme_id, [entry.aspect_partner.lemma, ...(entry.aspect_partner.forms || [])]);
    }
  }
  for (const [id, forms] of Object.entries(lesson?.lexeme_forms || {})) add(id, forms);
  for (const entry of lexicon?.entries || []) {
    add(entry.id, [entry.lemma, entry.stressed, ...(entry.forms || []).flatMap((form) => (typeof form === "string" ? [form] : [form.form, form.stressed]))]);
  }
  return { byLexeme, key };
}

// Key term found when any token of the text is a known form of the lexeme (or its lemma).
function containsLexeme(text, index, lexemeId, lemma) {
  const typed = index.key(text);
  const tokens = new Set(typed.split(" ").filter(Boolean));
  if (!tokens.size) return false;
  const known = new Set(index.byLexeme.get(lexemeId) || []);
  if (lemma) known.add(index.key(lemma));
  for (const form of known) {
    if (form.includes(" ") ? ` ${typed} `.includes(` ${form} `) : tokens.has(form)) return true;
  }
  return false;
}

function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

// Lexemes the owner already knows (design §10.3): plan/baseline.json `known` (lemmas or IDs)
// plus plan rows marked "baseline": "known", exactly as scripts/anki-export.mjs knownFromPlan.
function knownList(baseline, plan) {
  const rows = (plan?.chapters ?? []).flatMap((chapter) => [...(chapter.new_lexemes ?? []), ...(chapter.open_slot_words ?? [])]);
  return [...new Set([...(baseline?.known ?? []), ...rows.filter((row) => row.baseline === "known").map((row) => row.id)])];
}

// ------------------------------------------------------------------ chapter steps (design §9)

const STEP_KINDS = ["listen", "read", "exercises", "grammar", "pensa", "write", "workbook", "reread", "anki", "done"];

// The workbook is a separate book (as LLPSI's Exercitia): a chapter is its story, grammar
// and Pensa, and the section exercises live on #<lesson>/workbook, reached from the
// course bar. Stepper courses get it unless exercise_book: false; others opt in with
// exercise_book: true. A chapter without section exercises has no workbook.
function exerciseBook(course) {
  return Boolean(course) && (course.exercise_book ?? course.stepper === true);
}
function hasWorkbook(lesson, course, core = globalThis.IllustratedCore) {
  return core.storySections(lesson).some((section, i) => sectionExercises(lesson, section, i).length);
}
function isWorkbookStep(stepId) { return stepId === "workbook" || /^ex-\d+$/.test(String(stepId || "")); }

function isWorkbookExercise(exercise) { return Boolean(exercise && (exercise.section_id || exercise.type || exercise.obrazec)); }
function isNapishi(exercise) { return /^(napishi|writing)$/i.test(String(exercise?.type || "")); }

// Workbook exercises for a section (section.exercises, or lesson.exercises[] with section_id).
function sectionExercises(lesson, section, index) {
  const own = Array.isArray(section?.exercises) ? section.exercises : [];
  const shared = Array.isArray(lesson?.exercises) && lesson.exercises.some(isWorkbookExercise)
    ? lesson.exercises.filter((exercise) => exercise.section_id && (exercise.section_id === section?.id || exercise.section_id === index + 1))
    : [];
  return [...own, ...shared].filter((exercise) => !isNapishi(exercise));
}

function napishiOf(lesson, sections) {
  if (lesson?.napishi) return lesson.napishi;
  if (lesson?.writing) return lesson.writing;
  const pool = [...(sections || []).flatMap((section) => section.exercises || []), ...(Array.isArray(lesson?.exercises) ? lesson.exercises : [])];
  return pool.filter(isNapishi).at(-1) || null;
}

function buildSteps(lesson, { core = globalThis.IllustratedCore, course = null, roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"] } = {}) {
  const sections = core.storySections(lesson);
  const book = exerciseBook(course);
  const steps = [];
  sections.forEach((section, i) => {
    const n = roman[i] || String(i + 1);
    // Audio-first parts get a Listen step, unless the lesson is known to have no audio (_audio null).
    if (course?.capabilities?.audio_first_through_part >= Number(lesson.part ?? lesson._entry?.part ?? 1) && lesson._audio !== null) {
      steps.push({ id: `listen-${i + 1}`, kind: "listen", n });
    }
    steps.push({ id: `read-${i + 1}`, kind: "read", n });
    if (!book && sectionExercises(lesson, section, i).length) steps.push({ id: `ex-${i + 1}`, kind: "exercises", n });
  });
  const pensa = lesson?.pensa || (Array.isArray(lesson?.exercises) && !lesson.exercises.some(isWorkbookExercise) ? lesson.exercises : null);
  if (lesson?.grammar || lesson?.grammar_observation || lesson?.words_with_history) steps.push({ id: "grammar", kind: "grammar" });
  const hasPensaItems = pensa && Object.values(pensa).some((group) => Array.isArray(group) ? group.length : pensumItemCount(group));
  if (pensa && Object.keys(pensa).length && hasPensaItems) steps.push({ id: "pensa", kind: "pensa" });
  if (napishiOf(lesson, sections)) steps.push({ id: "write", kind: "write" });
  if (book && hasWorkbook(lesson, course, core)) steps.push({ id: "workbook", kind: "workbook" });
  steps.push({ id: "reread", kind: "reread" }, { id: "anki", kind: "anki" }, { id: "done", kind: "done" });
  return steps;
}

// The first step not ticked (the "done" step counts as ticked when the lesson is complete).
function nextStep(steps, ticks = {}, complete = false) {
  return steps.find((step) => !(ticks[step.id] || (step.id === "done" && complete))) || null;
}

// Per-step time in milliseconds, keyed by lesson then step; "_other" collects time on
// the lesson outside any step region (header, stepper, toolbar).
function addTime(timing, lessonId, stepId, ms, now = new Date().toISOString()) {
  const lesson = timing[lessonId] ||= { steps: {}, first: now, last: now };
  lesson.steps[stepId] = (lesson.steps[stepId] || 0) + ms;
  lesson.last = now;
  return timing;
}

function timingExport({ course, entries = [], timing = {}, steps = {}, workbook = {}, completed = new Set(), labels = {}, now = new Date().toISOString(), idleMinutes = 10 }) {
  const ids = [...new Set([...entries.map((entry) => entry.id), ...Object.keys(timing), ...Object.keys(steps)])];
  const lessons = ids.filter((id) => timing[id] || steps[id] || workbook[id]).map((id) => {
    const entry = entries.find((item) => item.id === id) || {};
    const record = timing[id] || { steps: {} };
    const stepIds = [...new Set([...(labels[id] || []).map((step) => step.id), ...Object.keys(record.steps || {}), ...Object.keys(steps[id] || {})])];
    const total = Object.values(record.steps || {}).reduce((sum, ms) => sum + ms, 0);
    return {
      id, order: entry.order ?? null, title: entry.title ?? null, completed: completed.has(id),
      first_active: record.first ?? null, last_active: record.last ?? null,
      total_ms: total, total_minutes: Math.round(total / 600) / 100,
      steps: stepIds.map((stepId) => ({
        id: stepId, ms: record.steps?.[stepId] || 0, minutes: Math.round((record.steps?.[stepId] || 0) / 600) / 100,
        ticked_at: steps[id]?.[stepId] || null
      })),
      workbook: workbook[id] || null
    };
  });
  return { course_id: course?.id ?? null, course_title: course?.title ?? null, exported_at: now, idle_cutoff_minutes: idleMinutes, lessons };
}

// ------------------------------------------------------------------ course

function entries() { return state.course?.lessons || state.course?.lesson_index || []; }
function entryOrder(entry, index) { return entry.order ?? index + 1; }
function available(entry) { return Boolean(entry.path || entry.file) && entry.status !== "planned"; }
function entryPath(entry) { return entry.path || entry.file || `lessons/${entry.id}.json`; }
function completedKey() { return `illustrated-input:${state.course?.id || "course"}:completed`; }
const sessionCompleted = new Map();
function completed() {
  const key = completedKey();
  const done = Core.readCompleted(safeStorage(), key);
  for (const [lessonId, on] of sessionCompleted.get(key) || []) {
    if (on) done.add(lessonId); else done.delete(lessonId);
  }
  return done;
}
function setCompletion(lessonId, on) {
  const key = completedKey();
  if (!sessionCompleted.has(key)) sessionCompleted.set(key, new Map());
  sessionCompleted.get(key).set(lessonId, on);
  const done = completed();
  // Overlay only unsaved lesson changes on fresh storage, preserving other tabs'
  // additions and removals while writes fail and when persistence recovers.
  try {
    window.localStorage.setItem(key, JSON.stringify([...done]));
    sessionCompleted.delete(key);
  } catch { /* pending changes remain usable for this session */ }
}
function safeStorage() {
  try { return window.localStorage; } catch { return { getItem: () => null, setItem: () => {} }; }
}
function pad(n) { return String(n).padStart(2, "0"); }

function parts() {
  const list = entries().map((entry, index) => ({ entry, order: entryOrder(entry, index) }));
  const defined = state.course?.parts || [];
  if (defined.length) {
    return defined.map((part, i) => {
      const number = part.rhan ?? part.number ?? part.id ?? i + 1;
      const from = part.from ?? part.lessons_from ?? part.first;
      const to = part.to ?? part.lessons_to ?? part.last;
      const members = list.filter(({ entry, order }) => {
        const own = entry.rhan ?? entry.part ?? entry.chast;
        if (Array.isArray(part.lessons)) return part.lessons.includes(entry.id);
        return own !== undefined ? Number(own) === Number(number) : order >= from && order <= to;
      });
      return { number, title: part.title_cy || part.title || "", from, to, members, source: part };
    });
  }
  const groups = new Map();
  for (const item of list) {
    const key = item.entry.rhan ?? item.entry.part ?? item.entry.chast ?? "";
    if (!groups.has(key)) groups.set(key, { number: key, title: "", members: [] });
    groups.get(key).members.push(item);
  }
  return [...groups.values()].map((group) => ({
    ...group, from: group.members[0]?.order, to: group.members.at(-1)?.order
  }));
}

function partOf(lessonOrEntry) {
  const id = lessonOrEntry?.id;
  return parts().find((part) => part.members.some(({ entry }) => entry.id === id));
}

function applyChrome() {
  const course = state.course;
  const hasStrings = Boolean(course.ui_strings);
  document.documentElement.lang = hasStrings && !state.english ? uiLangOfCourse() : "en";
  $("#english-toggle").hidden = !hasStrings;
  const toggleLabel = lookup(courseStrings(state.english ? "en" : uiLangOfCourse()), "english_toggle");
  $("#english-toggle").textContent = toggleLabel || "English";
  $("#english-toggle").lang = toggleLabel && state.english ? uiLangOfCourse() : "en";
  $("#english-toggle").setAttribute("aria-pressed", String(state.english));
  for (const el of document.querySelectorAll("[data-ui]")) {
    const [text, lang] = tl(el.dataset.ui);
    el.textContent = text; el.lang = lang;
  }
  for (const el of document.querySelectorAll("[data-ui-label]")) {
    const [text] = tl(el.dataset.uiLabel);
    el.setAttribute("aria-label", text); el.title = text;
  }
  const language = typeof course.language === "object" ? course.language : {};
  $("#course-language").textContent = language.name || course.language || "";
  $("#course-language").lang = targetLang();
  $("#course-title").textContent = course.title || "";
  $("#course-title").lang = targetLang();
  $("#course-description").textContent = course.subtitle || course.description || "";
  $("#course-description").lang = targetLang();
  $("#brand-title").textContent = course.title || "Illustrated Input";
  $("#brand-title").lang = targetLang();
  $("#intro-link").hidden = !introText();
  if ($("#next-link")) $("#next-link").hidden = !whatsNext();
  renderCourseSwitch();
  renderNav();
}

function progressNumbers() {
  const done = completed();
  const all = entries();
  const count = all.filter((entry) => done.has(entry.id)).length;
  return { count, total: all.length, pct: all.length ? Math.round((count / all.length) * 100) : 0 };
}

function lessonLabel(order) { return `${t("lesson")} ${order}`; }

function renderNav() {
  const done = completed();
  const { count, total, pct } = progressNumbers();
  $("#progress-count").textContent = `${count} / ${total}`;
  $(".progress-fill").style.width = `${pct}%`;
  $(".progress-track").setAttribute("aria-valuenow", String(pct));
  $(".progress-track").setAttribute("aria-valuetext", `${count} / ${total}`);
  const nav = $("#lesson-nav");
  nav.setAttribute("aria-label", t("nav_lessons"));
  // Two books in the course bar: chapters and their workbook. The list follows the open
  // book until a tab is chosen; the tabs only switch the list, they do not navigate.
  const books = exerciseBook(state.course);
  const navBook = books ? state.navBook || (state.view === "lesson" ? state.book : "chapter") : "chapter";
  const switcher = $("#book-switch");
  const focusedBook = switcher.contains(document.activeElement) ? document.activeElement.dataset.book : null;
  switcher.hidden = !books;
  if (books) {
    switcher.replaceChildren(...[["chapter", "chapters"], ["workbook", "workbook"]].map(([book, key]) =>
      ui("button", key, { type: "button", class: "book-tab", "data-book": book, "aria-pressed": String(navBook === book),
        onclick: () => { state.navBook = book; renderNav(); } })));
    if (focusedBook) switcher.querySelector(`[data-book="${focusedBook}"]`)?.focus({ preventScroll: true });
  }
  const suffix = navBook === "workbook" ? "/workbook" : "";
  nav.replaceChildren(...parts().map((part) => h("section", { class: "nav-part" },
    part.number !== "" ? h("h2", { class: "nav-part-title" },
      h("span", { lang: tl("part")[1] }, `${t("part")} ${part.number}`),
      part.title ? h("span", { lang: targetLang() }, ` · ${part.title}`) : null) : null,
    h("ol", { class: "lesson-list" }, part.members.map(({ entry, order }) => {
      const isCurrent = state.current?.id === entry.id && state.view === "lesson" && (!books || state.book === navBook);
      const finished = done.has(entry.id);
      const inner = [
        h("span", { class: "lesson-number", "aria-hidden": "true" }, pad(order)),
        h("span", { class: "lesson-name", lang: targetLang() }, entry.title || entry.id),
        finished ? h("span", { class: "lesson-check" }, h("span", { "aria-hidden": "true" }, "✓"), h("span", { class: "visually-hidden", lang: tl("finished_state")[1] }, bare(t("finished_state")))) : null
      ];
      if (!available(entry)) {
        return h("li", null, h("span", { class: "lesson-link planned" }, inner, ui("span", "planned", { class: "visually-hidden" })));
      }
      return h("li", null, h("a", { class: "lesson-link", href: `#${encodeURIComponent(entry.id)}${suffix}`, "aria-current": isCurrent ? "page" : null }, inner));
    })))));
}

// ------------------------------------------------------------------ routing

function introText() { return state.course?.intro_en; }
function introSeenKey() { return `${state.course.id}:intro-seen`; }
function whatsNext() { return state.course?.whats_next || (state.course?.whats_next_path ? { path: state.course.whats_next_path } : null); }

const VIEWS = ["intro", "overview", "lesson", "whats-next"];
function showView(name) {
  closeGloss();
  if (state.view === "lesson" && name !== "lesson") stopStepTimer();
  state.view = name;
  for (const id of VIEWS) if ($(`#${id}`)) $(`#${id}`).hidden = id !== name;
  $("#loading").hidden = true; $("#error").hidden = true;
  closeNav(false);
}

let firstRoute = true;
let routeSeq = 0;
async function route() {
  const seq = ++routeSeq;
  const hash = decodeURIComponent(location.hash.slice(1));
  const focus = !firstRoute;
  firstRoute = false;
  if (hash === "intro" && introText()) return showIntro(focus);
  if (hash === "whats-next" && whatsNext()) return showWhatsNext(focus);
  if (!hash && introText() && !store(introSeenKey())) return showIntro(false);
  const [lessonHash, stepHash] = hash.split("/");
  const entry = entries().find((item) => item.id === lessonHash);
  if (entry && available(entry)) return openLesson(entry, focus, stepHash, seq);
  return showOverview(focus && hash !== "");
}

function focusHeading(selector) {
  const el = $(selector);
  if (!el) return;
  el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

// ------------------------------------------------------------------ intro

function courseCredits() {
  const credits = state.course?.credits || [];
  if (!credits.length) return null;
  return h("div", { class: "course-credits" }, credits.map((credit) =>
    h("p", { lang: credit.lang || "en" }, credit.text, " ",
      credit.url ? h("a", { href: credit.url, rel: "noopener" }, credit.link_text || new URL(credit.url).hostname) : null,
      credit.license ? ` · ${credit.license}` : null)));
}

function showIntro(focus) {
  const text = introText();
  const paragraphs = Array.isArray(text) ? text : String(text).split(/\n\s*\n/);
  const body = paragraphs.map((block) => {
    const lines = block.split("\n");
    if (lines.every((line) => /^\s*[-•]\s+/.test(line))) {
      return h("ul", null, lines.map((line) => h("li", null, line.replace(/^\s*[-•]\s+/, ""))));
    }
    return h("p", null, block);
  });
  const done = () => {
    store(introSeenKey(), "1");
    if (location.hash === "#contents") route(); else location.hash = "contents";
  };
  $("#intro").replaceChildren(
    h("div", { class: "intro-card", lang: "en" },
      h("p", { class: "eyebrow", lang: targetLang() }, state.course.title || ""),
      h("h1", { id: "intro-title" }, state.course.intro_title_en || "How to read this book"),
      body, courseCredits(),
      h("div", { class: "intro-actions" }, ui("button", "start", { class: "button primary", type: "button", onclick: done })))
  );
  showView("intro");
  document.title = `${state.course.intro_title_en || "How to read this book"} · ${state.course.title}`;
  window.scrollTo(0, 0);
  if (focus) focusHeading("#intro-title");
}

// ------------------------------------------------------------------ what next (design §13)

function paragraphsOf(text, lang) {
  const blocks = Array.isArray(text) ? text : String(text ?? "").split(/\n\s*\n/);
  return blocks.filter((block) => String(block).trim()).map((block) => {
    const lines = String(block).split("\n");
    if (lines.every((line) => /^\s*[-•]\s+/.test(line))) {
      return h("ul", { lang }, lines.map((line) => h("li", null, line.replace(/^\s*[-•]\s+/, ""))));
    }
    return h("p", { lang }, block);
  });
}

async function showWhatsNext(focus) {
  let page = whatsNext();
  if (page.path && !page.body && !page.title) {
    try { page = await loadJSON(resolve(page.path)); } catch (error) { showError(error); return; }
  }
  let list = page.lemma_list || null;
  if (page.lemma_list_path) {
    try { list = await loadJSON(resolve(page.lemma_list_path)); } catch { list = null; }
  }
  const lang = page.lang || targetLang();
  const [fallbackTitle, fallbackLang] = tl("whats_next");
  const items = list?.items || (Array.isArray(list) ? list : []);
  $("#whats-next").replaceChildren(
    h("div", { class: "intro-card next-card" },
      h("p", { class: "eyebrow", lang: targetLang() }, state.course.title || ""),
      h("h1", { id: "whats-next-title", lang: page.title ? lang : fallbackLang }, page.title || fallbackTitle),
      paragraphsOf(page.body, lang),
      items.length ? h("section", { class: "lemma-list" },
        list.title ? h("h2", { lang }, list.title) : null,
        h("ol", null, items.map((item) => h("li", null,
          h("span", { class: "lemma", lang: targetLang() }, item.lemma || item.word || ""),
          item.sense_en ? h("span", { class: "sense", lang: "en" }, ` — ${item.sense_en}`) : null)))) : null,
      h("div", { class: "intro-actions" }, ui("a", "contents", { class: "button secondary", href: "#contents" })))
  );
  showView("whats-next");
  document.title = `${page.title || fallbackTitle} · ${state.course.title}`;
  window.scrollTo(0, 0);
  if (focus) focusHeading("#whats-next-title");
}

// Per-Часть afterword (English, optional, collapsed; design §2.4).
function renderAfterword(part) {
  const source = part?.source;
  if (!source?.afterword_en) return null;
  return h("details", { class: "afterword", lang: "en" },
    h("summary", null, ui("span", "afterword"), source.afterword_title_en ? h("span", { lang: "en" }, ` · ${source.afterword_title_en}`) : null),
    paragraphsOf(source.afterword_en, "en"),
    source.afterword_sources?.length ? h("ul", { class: "afterword-sources" }, source.afterword_sources.map((item) => h("li", null, item))) : null);
}

// ------------------------------------------------------------------ overview

function continueTarget() {
  const done = completed();
  const list = entries().filter(available);
  const last = store(`${state.course.id}:last-lesson`);
  const lastIndex = list.findIndex((entry) => entry.id === last);
  if (lastIndex >= 0 && !done.has(list[lastIndex].id)) return list[lastIndex];
  const after = list.slice(Math.max(lastIndex, 0)).find((entry) => !done.has(entry.id));
  return after || list.find((entry) => !done.has(entry.id)) || list[0];
}

function showOverview(focus) {
  stopStepTimer(); // save the time so far before the summary reads it
  const course = state.course;
  const done = completed();
  const { count, total, pct } = progressNumbers();
  const target = continueTarget();
  const targetOrder = target ? entryOrder(target, entries().indexOf(target)) : null;
  $("#overview").replaceChildren(...[
    h("header", { class: "overview-header" },
      h("p", { class: "eyebrow", lang: targetLang() }, course.language?.name || ""),
      h("h1", { id: "overview-title", lang: targetLang() }, course.title || ""),
      course.subtitle ? h("p", { class: "overview-subtitle", lang: targetLang() }, course.subtitle) : null),
    h("div", { class: "overview-actions" },
      target ? h("a", { class: "button primary", id: "continue-link", href: `#${encodeURIComponent(target.id)}` },
        h("span", { lang: tl(done.size ? "continue" : "start")[1] }, t(done.size ? "continue" : "start")),
        h("span", { lang: tl("lesson")[1] }, ` · ${lessonLabel(targetOrder)}`)) : null,
      introText() ? ui("a", "how_to_read", { class: "button secondary", href: "#intro" }) : null,
      whatsNext() ? ui("a", "whats_next", { class: "button secondary", href: "#whats-next" }) : null,
      stepperCourse() ? ui("button", "export_timing", { type: "button", class: "button secondary", onclick: exportTiming }) : null),
    courseCredits(),
    stepperCourse() ? timingSummary() : null,
    h("div", { class: "overview-progress" },
      h("div", { class: "progress-copy" }, ui("span", "course_progress", { id: "overview-progress-label" }), h("strong", null, `${count} / ${total}`)),
      h("div", { class: "progress-track", role: "progressbar", "aria-labelledby": "overview-progress-label", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct), "aria-valuetext": `${count} / ${total}` },
        h("span", { class: "progress-fill", style: `width:${pct}%` }))),
    h("div", { class: "parts" }, parts().map((part) => h("section", { class: "part" },
      h("h2", { class: "part-title" },
        part.number !== "" ? h("span", { class: "part-number", lang: tl("part")[1] }, `${t("part")} ${part.number}`) : null,
        part.title ? h("span", { class: "part-name", lang: targetLang() }, part.title) : null,
        part.from !== undefined ? h("small", { lang: tl("lessons_range")[1] }, t("lessons_range", { from: part.from, to: part.to })) : null),
      h("ol", { class: "chapter-list" }, part.members.map(({ entry, order }) => {
        const finished = done.has(entry.id);
        const content = [
          h("span", { class: "chapter-number", "aria-hidden": "true" }, pad(order)),
          h("span", { class: "chapter-title", lang: targetLang() }, entry.title || entry.id),
          finished ? h("span", { class: "chapter-state done" }, h("span", { "aria-hidden": "true" }, "✓ "), h("span", { lang: tl("finished_state")[1] }, bare(t("finished_state")))) : null,
          !available(entry) ? ui("span", "planned", { class: "chapter-state" }) : null
        ];
        return h("li", { class: available(entry) ? "" : "is-planned" }, available(entry)
          ? h("a", { href: `#${encodeURIComponent(entry.id)}` }, content)
          : h("span", null, content));
      })),
      renderAfterword(part))))
  ].filter(Boolean));
  if (target && stepperCourse()) updateContinueStep(target, targetOrder);
  showView("overview");
  document.title = course.title || "Illustrated Input";
  renderNav();
  window.scrollTo(0, 0);
  if (focus) focusHeading("#overview-title");
}

// ------------------------------------------------------------------ lesson

async function fetchLesson(entry) {
  if (state.lessons.has(entry.id)) return state.lessons.get(entry.id);
  const lesson = await loadJSON(resolve(entryPath(entry)));
  lesson._entry = entry;
  lesson._audio = await loadAudioSources(lesson);
  if (inflectingCourse()) await loadAnswerForms(lesson, entry);
  state.lessons.set(entry.id, lesson);
  return lesson;
}

// The forms table (design §10.5): inline answer_forms, else answer_forms_path, else the
// analyser's default sidecar analysis/<lesson file>.forms.json. Missing is fine.
async function loadAnswerForms(lesson, entry) {
  if (!lesson.answer_forms && (courseChecker() !== Core.grc || lesson.answer_forms_path)) {
    const file = entryPath(entry).split("/").pop().replace(/\.json$/, "");
    const path = lesson.answer_forms_path || `analysis/${file}.forms.json`;
    try {
      const data = await loadJSON(resolve(path));
      const table = data.answer_forms || data.forms || data;
      lesson.answer_forms = Object.fromEntries(Object.entries(table).filter(([token]) => !token.startsWith("_") && token !== "valid_words"));
      if (data.lexeme_forms && !lesson.lexeme_forms) lesson.lexeme_forms = data.lexeme_forms;
      if (data.valid_words && !lesson.answer_valid_words) lesson.answer_valid_words = data.valid_words;
    } catch { /* no table: the ladder skips the ending and aspect rungs */ }
  }
  const lexicon = await loadLexicon();
  lesson._formsTable = formsTable(lesson, courseChecker());
  lesson._lexemeForms = lexemeFormsIndex(lesson, lexicon, courseChecker());
}

async function openLesson(entry, focus = true, stepId = null, seq = routeSeq) {
  const hash = location.hash;
  if (state.view !== "lesson") { $("#loading").hidden = false; }
  try {
    const lesson = await fetchLesson(entry);
    if (seq !== routeSeq || hash !== location.hash) return;
    stopAudio();
    state.current = lesson;
    state.rereadView = null;
    state.book = exerciseBook(state.course) && isWorkbookStep(stepId) ? "workbook" : "chapter";
    state.navBook = null;
    store(`${state.course.id}:last-lesson`, lesson.id);
    renderLesson(lesson);
    showView("lesson");
    renderNav();
    window.scrollTo(0, 0);
    setLessonTitle(lesson);
    if (stepId && enterStep(lesson, stepId)) { /* scrolled */ } else if (focus) focusHeading("#lesson-title");
    startStepTimer(lesson);
  } catch (error) { if (seq === routeSeq && hash === location.hash) showError(error); }
}

function setLessonTitle(lesson) {
  const book = state.book === "workbook" ? `${t("workbook")} · ` : "";
  document.title = `${book}${lesson.title} · ${state.course.title || "Illustrated Input"}`;
}

function renderLesson(lesson) {
  closeGloss();
  const article = $("#lesson");
  const order = lesson.order ?? lesson._entry?.order;
  const part = partOf(lesson);
  article.classList.toggle("notes-hidden", state.notesHidden);
  const inWorkbook = state.book === "workbook" && exerciseBook(state.course);
  article.classList.toggle("is-workbook", inWorkbook);
  if (inWorkbook) {
    article.replaceChildren(...renderWorkbookBook(lesson, order, part).filter(Boolean));
    markStepRegions(article, lesson);
    return;
  }
  const lastOfPart = part && part.members.at(-1)?.entry.id === lesson.id;
  article.replaceChildren(...[
    renderLessonHeader(lesson, order, part),
    renderToolbar(lesson),
    renderStepper(lesson),
    renderCover(lesson),
    renderStory(lesson),
    renderWordsWithHistory(lesson),
    renderGrammar(lesson),
    renderFamilies(lesson),
    renderPensa(lesson),
    renderNapishi(lesson),
    renderWorkbookLink(lesson),
    renderVocabulary(lesson),
    renderFinish(lesson, order),
    lastOfPart ? renderAfterword(part) : null,
    renderPagination(lesson)
  ].filter(Boolean));
  markStepRegions(article, lesson);
  bindStoryObservers(article);
  rebindAudio();
  scheduleAlign();
}

function renderLessonHeader(lesson, order, part) {
  const statusKey = `status_${lesson.status || "draft"}`;
  return h("header", { class: "lesson-header" },
    h("p", { class: "eyebrow" },
      part && part.number !== "" ? h("span", { lang: tl("part")[1] }, `${t("part")} ${part.number} · `) : null,
      h("span", { lang: tl("lesson")[1] }, lessonLabel(order))),
    h("h1", { id: "lesson-title", lang: targetLang(), tabindex: "-1" }, lesson.title || ""),
    lesson.status && lesson.status !== "published" ? ui("span", statusKey, { class: "status-badge" }) : null);
}

function renderToolbar(lesson) {
  const notesButton = h("button", { type: "button", class: "pill", id: "notes-toggle", "aria-pressed": String(state.notesHidden) });
  const setLabel = () => {
    const [text, lang] = tl(state.notesHidden ? "show_notes" : "hide_notes");
    notesButton.textContent = text; notesButton.lang = lang;
    notesButton.setAttribute("aria-pressed", String(state.notesHidden));
  };
  setLabel();
  notesButton.addEventListener("click", () => {
    state.notesHidden = !state.notesHidden;
    store(courseKey("notes-hidden"), state.notesHidden ? "1" : "0");
    $("#lesson").classList.toggle("notes-hidden", state.notesHidden);
    for (const marker of document.querySelectorAll("#lesson .note-marker")) marker.tabIndex = state.notesHidden ? -1 : 0;
    unlightNotes();
    setLabel();
    scheduleAlign();
  });
  return h("div", { class: "lesson-toolbar" }, notesButton, renderStressToggle(lesson), renderAudioControls(lesson));
}

function renderStressToggle(lesson) {
  if (!stressConfig()) return null;
  const on = stressOn(lesson);
  const button = h("button", { type: "button", class: "pill", id: "stress-toggle", "aria-pressed": String(on) },
    h("span", { "aria-hidden": "true" }, "´ "), ui("span", "stress_marks"));
  button.addEventListener("click", () => {
    store(courseKey(`stress:part-${lessonPart(lesson)}`), stressOn(lesson) ? "0" : "1");
    state.rereadView = null;
    const scroll = window.scrollY;
    renderLesson(lesson);
    window.scrollTo(0, scroll);
    $("#stress-toggle")?.focus();
  });
  return button;
}

function mediaImage(aid, kind) {
  const sizes = { scene: [1600, 1067], cover: [1600, 1067], vignette: [400, 400], diagram: [480, 320] };
  const [w, hgt] = sizes[kind] || [400, 300];
  const img = h("img", {
    src: resolve(aid.src), alt: aid.alt || "", lang: aid.alt ? (aid.alt_lang || state.course.alt_lang || "en") : null,
    width: aid.width || w, height: aid.height || (aid.aspect_ratio ? Math.round((aid.width || w) / aid.aspect_ratio) : hgt),
    loading: kind === "cover" ? "eager" : "lazy", decoding: "async"
  });
  img.addEventListener("load", scheduleAlign);
  return img;
}

function renderScene(aid, kind = "scene") {
  if (!aid?.src) return null;
  const img = mediaImage(aid, kind);
  const button = h("button", { type: "button", class: "enlarge", "aria-label": `${t("enlarge")}${aid.alt ? `: ${aid.alt}` : ""}`, onclick: () => openLightbox(aid) }, img);
  const figure = h("figure", { class: `scene ${kind}`, "data-ref": aid.ref }, button);
  img.addEventListener("error", () => { figure.hidden = true; scheduleAlign(); });
  return figure;
}

function renderCover(lesson) {
  return renderScene(lesson.story?.cover, "cover");
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

// One pronunciation rule per chapter (lesson.pronunciation_note), above the first section's prose.
function renderPronunciationNote(note) {
  const words = (note.words || []).filter(Boolean);
  return h("p", { class: "pronunciation-note", role: "note" },
    ui("span", "pronunciation", { class: "note-label" }), " ",
    h("span", { lang: note.rule_lang || "en" }, disp(note.rule, "glosses")),
    words.length ? h("span", { class: "pronunciation-words", lang: targetLang() }, ": ", words.map((word) => disp(word, "glosses")).join(", ")) : null,
    note.note ? h("span", { class: "pronunciation-extra", lang: note.rule_lang || "en" }, " ", disp(note.note, "glosses")) : null);
}

function renderStory(lesson) {
  const sections = Core.storySections(lesson);
  const manifest = lesson._audio?.selected?.data;
  const story = h("div", { class: "story", id: "story" }, sections.map((section, sectionIndex) => {
    const prose = h("div", { class: "prose-col", lang: targetLang() });
    const margin = h("div", { class: "margin-col", role: "complementary", "aria-label": t("notes") });
    const seenGlosses = new Set();
    // A paragraph opens at paragraph_start or at a change of speaker.
    const paragraphs = [];
    for (const segment of section.segments || []) {
      const last = paragraphs.at(-1);
      if (!last || segment.paragraph_start || (segment.speaker && segment.speaker !== last.speaker)) paragraphs.push({ speaker: segment.speaker || null, segments: [segment] });
      else last.segments.push(segment);
    }
    for (const { speaker, segments } of paragraphs) {
      const paragraph = h("p", { class: `story-para${speaker ? " turn" : ""}` });
      const voiced = segments.map((segment) => segment.id).filter((id) => manifest?.segments?.[id]);
      if (voiced.length) paragraph.append(paragraphPlayButton(voiced, lesson), " ");
      const floats = [];
      const scenes = [];
      const strip = [];
      segments.forEach((segment, i) => {
        const rendered = renderSegment(segment, manifest, lesson, seenGlosses);
        if (i) paragraph.append(" ");
        paragraph.append(rendered.sentence);
        margin.append(...rendered.notes);
        strip.push(...rendered.strip);
        floats.push(...rendered.floats);
        scenes.push(...rendered.scenes);
      });
      prose.append(...floats, paragraph);
      // Narrow screens hide the margin column; its text notes run under the paragraph instead.
      if (strip.length) prose.append(h("p", { class: "para-notes" }, strip.flatMap((note, i) => (i ? [" ", note] : [note]))));
      prose.append(...scenes);
    }
    const heading = section.title
      ? h("h2", { class: "section-title", id: `${section.id || `section-${sectionIndex}`}-title`, lang: targetLang() },
        h("span", { class: "section-number", "aria-hidden": "true" }, `${ROMAN[sectionIndex] || sectionIndex + 1}.`), ` ${disp(section.title)}`)
      : null;
    return h("section", { class: "story-section", id: section.id || `section-${sectionIndex + 1}`, "aria-labelledby": heading ? heading.id : null, "data-section": String(sectionIndex + 1) },
      heading, stepEnd(lesson, `listen-${sectionIndex + 1}`),
      sectionIndex === 0 && lesson.pronunciation_note ? renderPronunciationNote(lesson.pronunciation_note) : null,
      h("div", { class: "section-body" }, prose, margin),
      stepEnd(lesson, `read-${sectionIndex + 1}`),
      exerciseBook(state.course) ? null : renderWorkbook(lesson, section, sectionIndex));
  }));
  wireStoryWords(story, lesson);
  return story;
}

const MARGIN = new Set(["margin_gloss", "margin_vignette", "margin_diagram"]);

// Anchor lookup for a segment. Courses with a stress block match on the stress-free text
// (anchors may be written with or without marks) and map back through the offset map when
// stress is shown; other courses use the plain lookup unchanged. `map[i]` is the source
// offset of display character i, so tapped words resolve in the stored (stressed) text.
function anchorLocator(source) {
  const same = Array.from({ length: source.length + 1 }, (_, i) => i);
  if (!stressConfig()) return { text: source, map: same, find: (anchor) => Core.findAnchor(source, anchor, state.course) };
  const stripped = stripStress(source);
  const shown = disp(source, "story") !== source || !source.includes(ACUTE) ? "plain" : "stressed";
  return {
    text: shown === "plain" ? stripped.text : source,
    map: shown === "plain" ? stripped.map : same,
    find: (anchor) => {
      const found = Core.findAnchor(stripped.text, stripStress(anchor).text, state.course);
      if (!found || shown === "plain") return found;
      return { start: stripped.map[found.start], end: stripped.map[found.end] };
    }
  };
}

// Several sentences of one subsection may carry the same margin gloss for the same word
// (e.g. "δεκάτη = τὸ δέκατον μέρος" three times). Only the first is shown in a subsection.
function marginGlossKey(aid) {
  if (aid.presentation !== "margin_gloss" || !(aid.gloss || aid.text)) return null;
  const target = aid.covers_lexeme_ids?.length ? [...aid.covers_lexeme_ids].sort().join(",") : String(aid.anchor_text || "").normalize("NFC").toLocaleLowerCase();
  return `${String(aid.gloss || aid.text).normalize("NFC").trim()}\u0000${target}\u0000${aid.lang || ""}`;
}

// Display text [from, to) as word spans (docs/reader-glosses.md tokens) and the text between
// them. data-at is the word's source offset, which the dictionary popup looks up.
function wordNodes(text, from, to, words, map) {
  const nodes = [];
  let cursor = from;
  for (const word of words) {
    if (word.end <= from || word.start >= to) continue;
    const start = Math.max(word.start, from);
    const end = Math.min(word.end, to);
    if (start > cursor) nodes.push(text.slice(cursor, start));
    nodes.push(h("span", { class: "w", role: "button", tabindex: "-1", "aria-haspopup": "dialog",
      "aria-describedby": "gloss-keys", "data-at": String(map[word.start]) }, text.slice(start, end)));
    cursor = end;
  }
  if (cursor < to) nodes.push(text.slice(cursor, to));
  return nodes;
}

function renderSegment(segment, manifest, lesson, seenGlosses = null) {
  const locator = anchorLocator(segment.text || "");
  const text = locator.text;
  const words = Core.glossTokens(text, state.course);
  const aids = Core.presentedAids(segment);
  const spans = [];
  const loose = [];
  aids.forEach((aid, index) => {
    if (!MARGIN.has(aid.presentation)) return;
    const key = seenGlosses ? marginGlossKey(aid) : null;
    if (key && seenGlosses.has(key)) return;
    if (key) seenGlosses.add(key);
    const found = aid.anchor_text ? locator.find(aid.anchor_text) : null;
    const item = { aid, index };
    if (!found) { loose.push(item); return; }
    spans.push({ ...found, items: [item] });
  });
  const ranges = Core.mergeAnchorRanges(spans);

  const sentence = h("span", { class: "seg", id: segment.id, "data-segment": segment.id });
  const notes = [];
  // Text notes again, for the strip under the paragraph on narrow screens (pictures float).
  const strip = [];
  const stripNotes = (items, anchorId) => {
    for (const { aid, index } of items) {
      if (aid.presentation !== "margin_gloss" && aid.src) continue;
      strip.push(buildNote(aid, `${segment.id}-n${index}`, anchorId, true, "span"));
    }
  };
  if (capability("segment_annotations")) {
    if (segment.receptive) sentence.classList.add("receptive");
    if (segment.preview) notes.push(h("a", { class: "note preview-marker", href: "#grammar", "data-anchor": segment.id,
      onclick: (event) => { event.preventDefault(); document.getElementById("grammar")?.scrollIntoView({ behavior: "smooth" }); } }, "→ ", ui("span", "grammar")));
  }
  let cursor = 0;
  ranges.forEach((range, k) => {
    if (range.start > cursor) sentence.append(...wordNodes(text, cursor, range.start, words, locator.map));
    const anchorId = `${segment.id}-a${k}`;
    const noteEls = range.items.map(({ aid, index }) => buildNote(aid, `${segment.id}-n${index}`, anchorId));
    notes.push(...noteEls);
    stripNotes(range.items, anchorId);
    // Not a button: its words are the tap targets; tapping one opens the dictionary and
    // lights its note (wireStoryWords). The words carry the note as their description.
    const anchor = h("span", { class: "anchor", id: anchorId }, wordNodes(text, range.start, range.end, words, locator.map));
    for (const word of anchor.querySelectorAll(".w")) word.setAttribute("aria-describedby", ["gloss-keys", ...noteEls.map((note) => note.id)].join(" "));
    wireAnchor(anchor, noteEls);
    sentence.append(anchor);
    cursor = range.end;
  });
  if (cursor < text.length) sentence.append(...wordNodes(text, cursor, text.length, words, locator.map));
  if (loose.length) {
    const markerId = `${segment.id}-m`;
    const noteEls = loose.map(({ aid, index }) => buildNote(aid, `${segment.id}-n${index}`, segment.id));
    notes.push(...noteEls);
    stripNotes(loose, segment.id);
    const marker = h("button", { type: "button", class: "note-marker", id: markerId, tabindex: state.notesHidden ? "-1" : "0", "aria-label": t("notes"), "aria-describedby": noteEls.map((note) => note.id).join(" ") }, "*");
    wireAnchor(marker, noteEls);
    marker.addEventListener("click", (event) => { event.stopPropagation(); unlightNotes(); lightNotes(segment.id, sentence, marker); });
    sentence.append(marker);
  }
  const scenes = aids.filter((aid) => aid.presentation === "inline_scene").map((aid) => renderScene(aid)).filter(Boolean);
  // Narrow screens hide the margin column; its pictures float small beside the paragraph instead.
  const floats = [...ranges.flatMap((range, k) => range.items.map((item) => ({ ...item, anchorId: `${segment.id}-a${k}` }))),
    ...loose.map((item) => ({ ...item, anchorId: segment.id }))]
    .filter(({ aid }) => aid.presentation !== "margin_gloss" && aid.src)
    .map(({ aid, index, anchorId }) => {
      const figure = buildNote(aid, `${segment.id}-n${index}`, anchorId, true);
      figure.classList.add("note-float");
      figure.querySelector("figcaption")?.remove(); // the label stays on the button and in the lightbox
      return figure;
    });

  // Audio is per paragraph (paragraphPlayButton); a tap on a word opens the dictionary.
  if (manifest?.segments?.[segment.id]) sentence.classList.add("has-audio");
  return { sentence, notes, strip, scenes, floats };
}

function glossContent(text) {
  return String(text ?? "").split(/(←|↔|→|=)/).map((part) => (/^(←|↔|→|=)$/.test(part) ? h("span", { class: "gloss-op" }, part) : part));
}

function buildNote(aid, id, anchorId, inline = false, tag = "div") {
  const lang = targetLang();
  if (aid.presentation === "margin_gloss") {
    const bridge = Core.isBridgeReference(state.course, aid.lang, aid.gloss);
    return h(tag, { class: `note note-gloss gloss-${aid.gloss_kind || "note"}${bridge ? " bridge-language" : ""}`, id: inline ? null : id, "data-anchor": anchorId, lang: bridge ? aid.lang : lang }, glossContent(bridge ? aid.gloss : disp(aid.gloss || aid.text, "glosses")), capability("gloss_reveal") && aid.reveal_en ? revealEnglish(aid.reveal_en) : null);
  }
  const kind = aid.presentation === "margin_vignette" ? "vignette" : "diagram";
  const label = disp(aid.label || "", "glosses");
  if (tag === "span") return h("span", { class: "note note-gloss", "data-anchor": anchorId, lang }, label || aid.alt || "");
  const caption = label ? h("figcaption", { lang }, label) : null;
  const figure = h("figure", { class: `note note-${kind}`, id: inline ? null : id, "data-anchor": anchorId });
  if (!aid.src) { figure.classList.add("missing"); figure.append(caption || ""); return figure; }
  const img = mediaImage(aid, kind);
  const button = h("button", { type: "button", class: "enlarge", "aria-label": `${t("enlarge")}${label || aid.alt ? `: ${label || aid.alt}` : ""}`, onclick: () => openLightbox(aid) }, img);
  img.addEventListener("error", () => {
    figure.classList.add("missing");
    button.remove();
    if (!figure.querySelector("figcaption")) figure.hidden = true;
    scheduleAlign();
  });
  figure.append(button, caption || "");
  return figure;
}

function sectionBodyOf(el) { return el.closest(".section-body"); }
function isNarrow(el) {
  const col = sectionBodyOf(el)?.querySelector(".margin-col");
  return !col || getComputedStyle(col).display === "none";
}

// Hovering or focusing an anchor pairs it with its notes (margin or strip), and back.
function wireAnchor(anchor, noteEls) {
  const pair = (on) => {
    anchor.classList.toggle("paired", on);
    for (const note of noteEls) note.classList.toggle("paired", on);
  };
  anchor.addEventListener("mouseenter", () => pair(true));
  anchor.addEventListener("mouseleave", () => { if (!anchor.classList.contains("lit")) pair(false); });
  for (const note of noteEls) {
    note.addEventListener("mouseenter", () => pair(true));
    note.addEventListener("mouseleave", () => pair(false));
  }
}

// Light an anchor's notes where they are visible: the margin column on wide screens, the
// strip under the paragraph and any floated picture on narrow ones. The anchor stays lit
// until the dictionary popup closes (unlightNotes).
function lightNotes(anchorId, sentence, lit = document.getElementById(anchorId)) {
  if (state.notesHidden) return;
  const body = sectionBodyOf(sentence);
  if (!body) return;
  const where = isNarrow(sentence) ? ".para-notes .note, .note-float" : ".margin-col .note";
  const notes = [...body.querySelectorAll(where)].filter((note) => note.dataset.anchor === anchorId);
  lit?.classList.add("paired", "lit");
  for (const note of notes) { note.classList.add("paired"); note.classList.remove("flash"); void note.offsetWidth; note.classList.add("flash"); }
}
function unlightNotes() {
  for (const el of document.querySelectorAll("#lesson .lit, #lesson .note.paired")) el.classList.remove("paired", "lit");
}

// ------------------------------------------------------------------ tap-to-gloss (docs/reader-glosses.md)
// Words of the chapter's story open a small dictionary popup. The glosses load on the first
// touch of the story (forms.json once per course, the lesson layer once per lesson); a
// missing file means no popups. Keyboard: one word of the story is in the tab order, the
// arrow keys move between words, Enter or Space opens the popup and Escape closes it.
// A word inside a margin-gloss anchor also lights that note.

const glossFiles = new Map();
function glossFile(path) {
  const url = resolve(path);
  if (!glossFiles.has(url)) glossFiles.set(url, loadJSON(url).catch(() => null));
  return glossFiles.get(url);
}
function lessonGlosses(lesson) {
  if (!lesson._entry) return Promise.resolve(null);
  const file = entryPath(lesson._entry).split("/").pop();
  return Promise.all([glossFile("glosses/forms.json"), glossFile(`glosses/${file}`)]).then(([forms, layer]) =>
    (forms?.forms || layer?.segments ? { forms: forms?.forms || {}, segments: layer?.segments || {} } : null));
}

function wireStoryWords(story, lesson) {
  story.prepend(ui("p", "gloss_keys", { id: "gloss-keys", class: "visually-hidden" }));
  const first = story.querySelector(".w");
  if (first) first.setAttribute("tabindex", "0");
  const warm = () => lessonGlosses(lesson).then((data) => story.classList.toggle("has-glosses", Boolean(data)));
  story.addEventListener("pointerdown", warm, { once: true });
  story.addEventListener("focusin", warm, { once: true });
  story.addEventListener("click", (event) => {
    const word = event.target.closest?.(".w");
    if (word) openWord(word, lesson);
  });
  story.addEventListener("keydown", (event) => {
    const word = event.target.closest?.(".w");
    if (!word) return;
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openWord(word, lesson); return; }
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const all = [...story.querySelectorAll(".w")];
    const next = all[all.indexOf(word) + (event.key === "ArrowRight" ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    const open = Boolean(glossPop);
    rove(next);
    next.focus();
    if (open) openWord(next, lesson);
  });
}

function rove(word) {
  const story = word.closest(".story");
  for (const old of story?.querySelectorAll('.w[tabindex="0"]') || []) if (old !== word) old.setAttribute("tabindex", "-1");
  word.setAttribute("tabindex", "0");
}

let glossPop = null;
let glossSeq = 0;
async function openWord(word, lesson) {
  closeGloss();
  rove(word);
  const sentence = word.closest(".seg");
  const anchor = word.closest(".anchor");
  if (anchor) lightNotes(anchor.id, sentence);
  const seq = glossSeq;
  const data = await lessonGlosses(lesson);
  if (seq !== glossSeq || !data || !word.isConnected) return;
  word.closest(".story")?.classList.add("has-glosses");
  const segment = (lesson._segmentIndex ||= Core.segmentIndex(lesson)).get(sentence.dataset.segment);
  const found = segment ? Core.glossAt(segment.text || "", Number(word.dataset.at), data.forms, data.segments[segment.id], state.course) : null;
  if (found) showGloss(word, sentence, found);
}

function glossEntry(analysis, surface, extra = "") {
  const lang = targetLang();
  const lemma = analysis.lemma && Core.glossKey(analysis.lemma, state.course) !== Core.glossKey(surface, state.course) ? analysis.lemma : null;
  const grammar = [analysis.pos, analysis.form].filter(Boolean).join(" ");
  return h("div", { class: `gloss-entry${extra}` },
    h("p", { class: "gloss-head" },
      h("span", { class: "gloss-word", lang }, disp(surface)),
      lemma ? [" ", h("span", { class: "gloss-lemma", lang }, disp(lemma, "glosses"))] : null,
      grammar ? [" ", h("span", { class: "gloss-pos", lang: "en" }, grammar)] : null),
    analysis.en ? h("p", { class: "gloss-en", lang: "en" }, analysis.en) : null,
    analysis.note ? h("p", { class: "gloss-note", lang: "en" }, analysis.note) : null);
}

function showGloss(word, sentence, found) {
  const lang = targetLang();
  const from = found.phrase?.start ?? found.start;
  const to = found.phrase?.end ?? found.end;
  const active = [...sentence.querySelectorAll(".w")].filter((w) => Number(w.dataset.at) >= from && Number(w.dataset.at) < to);
  for (const w of active) w.classList.add("w-active");
  const pop = h("div", { class: "gloss-pop", id: "gloss-pop", role: "dialog", "aria-label": disp(found.phrase?.text || found.word) },
    found.phrase ? glossEntry(found.phrase, found.phrase.text, " gloss-phrase") : null,
    found.main ? glossEntry(found.main, found.word) : null,
    found.alternatives.length ? h("ul", { class: "gloss-alts" }, found.alternatives.map((alt) => h("li", null,
      h("span", { class: "gloss-lemma", lang }, disp(alt.lemma || "", "glosses")), " ",
      h("span", { class: "gloss-pos", lang: "en" }, [alt.pos, alt.form].filter(Boolean).join(" ")), " ",
      h("span", { lang: "en" }, alt.en || "")))) : null);
  document.body.append(pop);
  const described = word.getAttribute("aria-describedby");
  word.setAttribute("aria-describedby", [described, "gloss-pop"].filter(Boolean).join(" "));
  glossPop = { pop, word, active, described };
  placeGloss();
}

// Below the word, or above it when that side has more room; inside the visible area (the
// visual viewport on iOS, less the sticky header and the audio dock). When neither side
// fits, the popup is capped and scrolls, overlapping the word only if it must.
function placeGloss() {
  if (!glossPop) return;
  const { pop, word } = glossPop;
  const rect = word.getClientRects()[0] || word.getBoundingClientRect();
  const view = window.visualViewport;
  const viewTop = view ? view.offsetTop : 0;
  const viewLeft = view ? view.offsetLeft : 0;
  const viewWidth = view ? view.width : document.documentElement.clientWidth;
  const viewHeight = view ? view.height : window.innerHeight;
  // Pinch zoom shrinks the visual viewport without changing CSS vw units.
  pop.style.maxWidth = `min(19rem, ${Math.max(0, viewWidth - 16)}px)`;
  const ceiling = Math.max(viewTop, $(".site-header")?.getBoundingClientRect().bottom || 0) + 6;
  const dock = $("#audio-dock");
  const floor = viewTop + viewHeight - (dock && !dock.hidden ? dock.offsetHeight + 16 : 8);
  pop.style.maxHeight = "";
  const natural = pop.offsetHeight;
  const below = floor - rect.bottom - 6;
  const above = rect.top - 6 - ceiling;
  const up = natural > below && above > below;
  const room = up ? above : below;
  const height = natural <= room ? natural : room >= 72 ? room : Math.min(natural, floor - ceiling);
  if (height < natural) pop.style.maxHeight = `${Math.max(Math.floor(height), 40)}px`;
  const tall = pop.offsetHeight;
  const top = Math.min(Math.max(up ? rect.top - 6 - tall : rect.bottom + 6, ceiling), Math.max(ceiling, floor - tall));
  const left = Math.max(viewLeft + 8, Math.min(rect.left + rect.width / 2 - pop.offsetWidth / 2, viewLeft + viewWidth - pop.offsetWidth - 8));
  pop.style.left = `${Math.round(left + window.scrollX)}px`;
  pop.style.top = `${Math.round(top + window.scrollY)}px`;
  pop.classList.toggle("above", top < rect.top);
}

function closeGloss() {
  glossSeq += 1;
  unlightNotes();
  if (!glossPop) return;
  const { pop, word, active, described } = glossPop;
  glossPop = null;
  pop.remove();
  for (const w of active) w.classList.remove("w-active");
  if (described) word.setAttribute("aria-describedby", described); else word.removeAttribute("aria-describedby");
}

// ------------------------------------------------------------------ paragraph audio

// One play/pause button per story paragraph with audio. It plays the paragraph's sentences
// in turn; while anything plays inside its paragraph (also continuous playback) it pauses
// and resumes instead.
function paragraphPlayButton(ids, lesson) {
  const button = h("button", { type: "button", class: "para-play", "aria-label": t("play_paragraph"), title: t("play_paragraph") }, "▶");
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (audioState.on && audioState.active?.closest(".story-para") === button.parentNode) toggleAudioPause();
    else playSegments(ids, lesson);
  });
  return button;
}

function syncParaButtons() {
  const para = audioState.on ? audioState.active?.closest?.(".story-para") : null;
  for (const button of document.querySelectorAll("#lesson .para-play")) {
    const mine = Boolean(para) && button.parentNode === para;
    const playing = mine && !audioState.paused;
    const label = t(playing ? "pause" : mine ? "resume" : "play_paragraph");
    button.textContent = playing ? "❚❚" : "▶";
    button.classList.toggle("is-active", mine);
    button.setAttribute("aria-label", label);
    button.title = label;
  }
}

// Margin alignment: each note sits level with its anchor's line; later notes are pushed
// down rather than overlapping, and the margin column grows if it must.
let alignFrame = 0;
function scheduleAlign() {
  if (alignFrame) return;
  // rAF is paused in background tabs; the timeout keeps alignment from stalling.
  const run = () => { if (!alignFrame) return; cancelAnimationFrame(alignFrame); clearTimeout(alignTimer); alignFrame = 0; alignMargins(); };
  alignFrame = requestAnimationFrame(run);
  alignTimer = setTimeout(run, 150);
}
let alignTimer = 0;
function alignMargins() {
  for (const body of document.querySelectorAll("#lesson .section-body")) {
    const col = body.querySelector(".margin-col");
    if (!col || getComputedStyle(col).display === "none") continue;
    const colTop = col.getBoundingClientRect().top;
    const anchorTop = (note) => {
      const anchor = document.getElementById(note.dataset.anchor);
      const rect = anchor ? (anchor.getClientRects()[0] || anchor.getBoundingClientRect()) : null;
      return rect ? { y: rect.top - colTop, x: rect.left } : { y: 0, x: 0 };
    };
    const notes = [...col.children].filter((note) => !note.hidden);
    for (const note of notes) note.style.marginTop = "0px";
    const ordered = notes.map((note) => ({ note, ...anchorTop(note) })).sort((a, b) => a.y - b.y || a.x - b.x);
    if (ordered.some(({ note }, i) => notes[i] !== note)) col.append(...ordered.map(({ note }) => note));
    // Greedy flow: each note is pushed down to its anchor's line, never up. Vignettes
    // float right, so text glosses can sit beside them instead of below.
    for (const { note, y } of ordered) {
      const natural = note.offsetTop;
      const want = Math.round(y + (note.classList.contains("note-gloss") ? 3 : 0));
      if (want > natural) note.style.marginTop = `${want - natural}px`;
    }
  }
}

let storyObserver = null;
function bindStoryObservers(article) {
  storyObserver?.disconnect();
  if (!("ResizeObserver" in window)) return;
  storyObserver = new ResizeObserver(scheduleAlign);
  for (const el of article.querySelectorAll(".prose-col")) storyObserver.observe(el);
}

// ------------------------------------------------------------------ chapter stepper (design §9)

function stepperCourse() { return state.course?.stepper === true; }
function stepperFor(lesson) {
  if (!lesson || state.course?.stepper === false) return false;
  return stepperCourse() || buildSteps(lesson, { core: Core, course: state.course, roman: ROMAN }).some((step) => step.kind === "exercises" || step.kind === "workbook");
}
function lessonSteps(lesson) { return lesson._steps ||= buildSteps(lesson, { core: Core, course: state.course, roman: ROMAN }); }
function stepTicks(lessonId) { return readJSONStore("steps")[lessonId] || {}; }
function stepLabel(step) {
  const key = { listen: "step_listen", read: "step_read", exercises: "step_exercises", grammar: "step_grammar", pensa: "step_pensa", write: "step_write", workbook: "workbook", reread: "step_reread", anki: "step_anki", done: "step_done" }[step.kind];
  return tl(key, { n: step.n ?? "" }).map((value, i) => (i === 0 ? String(value).trim() : value));
}
function stepDone(lesson, step, ticks = stepTicks(lesson.id)) {
  return Boolean(ticks[step.id]) || (step.id === "done" && completed().has(lesson.id));
}
function lessonNextStep(lesson) { return nextStep(lessonSteps(lesson), stepTicks(lesson.id), completed().has(lesson.id)); }
// The first unticked step after stepId: "Step done" only ever moves forward, never back to
// an earlier step the learner left unticked.
function nextStepAfter(lesson, stepId) {
  const steps = lessonSteps(lesson);
  const after = steps.slice(steps.findIndex((step) => step.id === stepId) + 1);
  return nextStep(after, stepTicks(lesson.id), completed().has(lesson.id));
}

function setTick(lesson, stepId, on) {
  if (stepId === "done") {
    setCompletion(lesson.id, on);
    state.refreshFinish?.(on);
    renderNav();
  }
  writeProgress("steps", [[[lesson.id, stepId], on ? new Date().toISOString() : undefined]]);
  refreshStepper(lesson);
}

function stepTarget(stepId) {
  const [kind, n] = stepId.split("-");
  if (kind === "read" || kind === "listen") return document.querySelector(`#lesson [data-section="${n}"]`);
  if (kind === "ex") return document.getElementById(`wb-${n}`);
  if (kind === "workbook") return document.getElementById("workbook-book");
  if (kind === "grammar") return document.getElementById("words-history") || document.getElementById("grammar");
  if (kind === "pensa") return document.getElementById("pensa");
  if (kind === "write") return document.getElementById("napishi");
  if (kind === "reread") return document.getElementById("story");
  if (kind === "anki" || kind === "done") return document.getElementById("lesson-finish");
  return null;
}

// Opening a step from the stepper. Перечитать (design §9: whole chapter, continuous audio,
// stress off) shows the chapter without stress for this view only (the saved toggle is
// unchanged) and starts continuous audio when the chapter has a manifest.
function enterStep(lesson, stepId, { restoreY = null } = {}) {
  const reread = stepId === "reread";
  const wanted = reread && stressConfig() ? lesson.id : null;
  const book = exerciseBook(state.course) && isWorkbookStep(stepId) ? "workbook" : "chapter";
  closeNav(false);
  if ((state.rereadView || null) !== wanted || state.book !== book) {
    const switching = state.book !== book;
    state.rereadView = wanted;
    state.book = book;
    state.navBook = null;
    renderLesson(lesson);
    if (switching) { setLessonTitle(lesson); renderNav(); window.scrollTo(0, 0); }
  }
  if (typeof restoreY === "number") { window.scrollTo(0, restoreY); return true; }
  const scrolled = scrollToStep(stepId);
  if (stepId.startsWith("listen-") && lesson._audio) {
    const section = Core.storySections(lesson)[Number(stepId.split("-")[1]) - 1];
    if (section) playSegments((section.segments || []).map((segment) => segment.id).filter((id) => lesson._audio.selected?.data?.segments?.[id]), lesson, true);
  }
  if (reread && lesson._audio && (lesson._audio.selected?.data?.lesson || Object.keys(lesson._audio.selected?.data?.segments || {}).length)) playLesson(lesson);
  return scrolled;
}

// A step link scrolls in place and records #<lesson>/<step> as a history entry, so the URL
// can be shared and Back returns to the previous step (see the hashchange handler).
function goToStep(event, lesson, stepId) {
  if (navigateStep(lesson, stepId)) event.preventDefault();
}
function navigateStep(lesson, stepId) {
  if (!enterStep(lesson, stepId)) return false;
  const hash = `#${encodeURIComponent(lesson.id)}/${stepId}`;
  if (location.hash !== hash) history.pushState(null, "", hash);
  return true;
}

function scrollToStep(stepId) {
  const target = stepTarget(stepId);
  if (!target) return false;
  target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  const heading = target.querySelector("h2, h3, h4") || target;
  if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
  return true;
}

function renderStepper(lesson) {
  if (!stepperFor(lesson)) return null;
  const nav = h("nav", { class: "stepper", id: "stepper", "aria-labelledby": "stepper-title" });
  nav._lesson = lesson;
  paintStepper(nav, lesson);
  return nav;
}

function paintStepper(nav, lesson) {
  const focusedTick = nav.contains(document.activeElement) ? document.activeElement.dataset.step : null;
  const ticks = stepTicks(lesson.id);
  const next = lessonNextStep(lesson);
  const [title, titleLang] = tl("stepper");
  const [doneText, doneLang] = tl("step_marked");
  nav.replaceChildren(
    h("h2", { class: "stepper-title", id: "stepper-title", lang: titleLang }, title),
    h("ol", { class: "steps" }, lessonSteps(lesson).map((step) => {
      const done = stepDone(lesson, step, ticks);
      const [label, lang] = stepLabel(step);
      const isNext = next?.id === step.id;
      const tick = h("button", { type: "button", class: "step-tick", "data-step": step.id, "aria-pressed": String(done), "aria-label": `${label}: ${doneText}`, lang },
        h("span", { "aria-hidden": "true" }, done ? "✓" : ""));
      tick.addEventListener("click", () => setTick(lesson, step.id, !stepDone(lesson, step)));
      const link = h("a", { class: "step-link", href: `#${encodeURIComponent(lesson.id)}/${step.id}`, lang, "aria-current": isNext ? "step" : null,
        onclick: (event) => goToStep(event, lesson, step.id) },
        isNext ? h("span", { "aria-hidden": "true" }, "→ ") : null, label,
        done ? h("span", { class: "visually-hidden", lang: doneLang }, ` (${doneText})`) : null);
      return h("li", { class: `step${done ? " is-done" : ""}${isNext ? " is-next" : ""}` }, tick, link);
    })));
  if (focusedTick) [...nav.querySelectorAll(".step-tick")].find(tick => tick.dataset.step === focusedTick)?.focus({ preventScroll: true });
}

// "Step done" at the end of a step's block: ticks it and moves on to the next unticked step.
function stepEnd(lesson, stepId) {
  if (!stepperFor(lesson)) return null;
  const step = lessonSteps(lesson).find((item) => item.id === stepId);
  if (!step) return null;
  const box = h("div", { class: "step-end", "data-step": stepId });
  box._paint = () => {
    const done = stepDone(lesson, step);
    const next = nextStepAfter(lesson, stepId);
    const button = h("button", { type: "button", class: "small-button step-done", "aria-pressed": String(done) },
      h("span", { "aria-hidden": "true" }, done ? "✓ " : "○ "), ui("span", done ? "step_marked" : "step_mark"),
      h("span", { class: "visually-hidden", lang: stepLabel(step)[1] }, ` · ${stepLabel(step)[0]}`));
    button.addEventListener("click", () => {
      const now = !stepDone(lesson, step);
      setTick(lesson, stepId, now);
      if (now) { const after = nextStepAfter(lesson, stepId); if (after) navigateStep(lesson, after.id); }
    });
    const nextLink = done && next ? h("a", { class: "step-next", href: `#${encodeURIComponent(lesson.id)}/${next.id}`, lang: stepLabel(next)[1],
      onclick: (event) => goToStep(event, lesson, next.id) }, t("step_next", { step: stepLabel(next)[0] }), h("span", { "aria-hidden": "true" }, " ↓")) : null;
    box.replaceChildren(...[button, nextLink].filter(Boolean));
  };
  box._paint();
  return box;
}

function refreshStepper(lesson) {
  const nav = document.getElementById("stepper");
  if (nav && nav._lesson === lesson) paintStepper(nav, lesson);
  for (const box of document.querySelectorAll("#lesson .step-end")) box._paint?.();
}

// Regions for timing: which steps a part of the page belongs to.
function markStepRegions(article, lesson) {
  if (!stepperFor(lesson)) return;
  const steps = new Set(lessonSteps(lesson).map((step) => step.id));
  const mark = (el, ids) => { const list = ids.filter((id) => steps.has(id)); if (el && list.length) el.dataset.steps = list.join(" "); };
  mark(article.querySelector(".scene.cover"), ["read-1", "reread"]);
  for (const section of article.querySelectorAll(".story-section[data-section]")) mark(section, [`listen-${section.dataset.section}`, `read-${section.dataset.section}`, "reread"]);
  for (const block of article.querySelectorAll(".workbook")) mark(block, [`ex-${block.id.replace("wb-", "")}`]);
  for (const block of article.querySelectorAll(".workbook")) mark(block, ["workbook"]);
  mark(article.querySelector("#words-history"), ["grammar"]);
  mark(article.querySelector("#grammar"), ["grammar"]);
  mark(article.querySelector("#pensa"), ["pensa"]);
  mark(article.querySelector("#napishi"), ["write"]);
  mark(article.querySelector("#lesson-finish"), ["anki", "done"]);
}

// Timing (pilot workload, design §9): time is credited to the step whose region is at the
// reading line, only while the page is visible and the learner has acted in the last ten
// minutes (or audio plays). A region shared by two steps (reading and re-reading) goes to
// the first of them not yet ticked.
const IDLE_MS = 10 * 60 * 1000;
const TIMER_MS = 5000;
const timer = { lesson: null, interval: 0, last: 0, activity: 0, pending: {} };

function activeStep(lesson) {
  const y = window.innerHeight * 0.4;
  let best = null;
  for (const el of document.querySelectorAll("#lesson [data-steps]")) {
    const rect = el.getBoundingClientRect();
    if (rect.top <= y && rect.bottom >= y && (!best || rect.height < best.height)) best = { el, height: rect.height };
  }
  if (!best) return "_other";
  const ids = best.el.dataset.steps.split(" ");
  const ticks = stepTicks(lesson.id);
  return ids.find((id) => !ticks[id]) || ids.at(-1);
}

function timerTick() {
  const now = Date.now();
  const elapsed = Math.min(now - timer.last, TIMER_MS * 3);
  timer.last = now;
  const lesson = timer.lesson;
  if (!lesson || state.view !== "lesson" || state.current !== lesson || document.visibilityState !== "visible") return;
  const listening = typeof player !== "undefined" && player && !player.paused;
  if (now - timer.activity > IDLE_MS && !listening) return;
  const step = activeStep(lesson);
  timer.pending[step] = (timer.pending[step] || 0) + elapsed;
}

function flushTiming() {
  const lesson = timer.lesson;
  if (!lesson || !Object.keys(timer.pending).length) return;
  const all = readJSONStore("timing");
  for (const [step, ms] of Object.entries(timer.pending)) addTime(all, lesson.id, step, ms);
  timer.pending = {};
  writeJSONStore("timing", all);
}

function startStepTimer(lesson) {
  stopStepTimer();
  if (!stepperFor(lesson)) return;
  timer.lesson = lesson;
  timer.last = Date.now();
  timer.activity = Date.now();
  timer.interval = setInterval(() => { timerTick(); if (Object.values(timer.pending).reduce((a, b) => a + b, 0) >= 30000) flushTiming(); }, TIMER_MS);
}

function stopStepTimer() {
  if (!timer.lesson) return;
  timerTick();
  flushTiming();
  clearInterval(timer.interval);
  timer.lesson = null;
}

function noteActivity() { timer.activity = Date.now(); }

async function exportTiming() {
  const lessons = [...state.lessons.values()];
  const labels = Object.fromEntries(lessons.filter((lesson) => stepperFor(lesson)).map((lesson) => [lesson.id, lessonSteps(lesson)]));
  flushTiming();
  const data = timingExport({
    course: state.course, entries: entries(), timing: readJSONStore("timing"), steps: readJSONStore("steps"),
    workbook: readJSONStore("workbook"), completed: completed(), labels, idleMinutes: IDLE_MS / 60000
  });
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = h("a", { href: url, download: `${state.course.id}-timing-${data.exported_at.slice(0, 10)}.json` });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Minutes per chapter from the stored timing, shown on the course page beside the export.
function timingSummary() {
  const timing = readJSONStore("timing");
  const rows = entries().map((entry, i) => {
    const ms = Object.values(timing[entry.id]?.steps || {}).reduce((sum, value) => sum + value, 0);
    return { entry, order: entryOrder(entry, i), ms };
  }).filter((row) => row.ms > 0);
  if (!rows.length) return null;
  const minutes = (ms) => t("minutes", { n: Math.max(1, Math.round(ms / 60000)) });
  const total = rows.reduce((sum, row) => sum + row.ms, 0);
  return h("section", { class: "timing-summary", "aria-labelledby": "timing-summary-title" },
    ui("h2", "timing_summary", { id: "timing-summary-title" }),
    h("ul", null, rows.map((row) => h("li", null,
      h("span", { lang: tl("lesson")[1] }, lessonLabel(row.order)), " · ",
      h("span", { lang: targetLang() }, row.entry.title || row.entry.id), " — ",
      h("strong", { lang: tl("minutes")[1] }, minutes(row.ms))))),
    rows.length > 1 ? h("p", { class: "timing-total" }, ui("span", "timing_total"), " ", h("strong", { lang: tl("minutes")[1] }, minutes(total))) : null);
}

// The course page's "continue" button opens the next unticked step of the next lesson.
async function updateContinueStep(target, order) {
  try {
    const lesson = await fetchLesson(target);
    if (!stepperFor(lesson) || state.view !== "overview") return;
    const step = lessonNextStep(lesson);
    const link = document.getElementById("continue-link");
    if (!step || !link) return;
    link.href = `#${encodeURIComponent(lesson.id)}/${step.id}`;
    const [label, lang] = stepLabel(step);
    const [verb, verbLang] = tl(completed().size || Object.keys(readJSONStore("steps")).length ? "continue" : "start");
    link.replaceChildren(h("span", { lang: verbLang }, verb), h("span", { lang }, ` · ${t("continue_step", { lesson: lessonLabel(order), step: label })}`));
  } catch { /* keep the plain lesson link */ }
}

// ------------------------------------------------------------------ lightbox

function openLightbox(aid) {
  const dialog = $("#lightbox");
  const img = $("#lightbox-image");
  img.src = resolve(aid.src);
  img.alt = aid.alt || aid.label || "";
  img.lang = aid.alt ? (aid.alt_lang || state.course.alt_lang || "en") : targetLang();
  const caption = $("#lightbox-caption");
  caption.textContent = aid.label || "";
  caption.lang = targetLang();
  caption.hidden = !aid.label;
  if (aid.label?.trim()) {
    dialog.setAttribute("aria-labelledby", "lightbox-caption");
    dialog.removeAttribute("aria-label");
  } else {
    dialog.removeAttribute("aria-labelledby");
    dialog.setAttribute("aria-label", t("enlarge"));
  }
  if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  $("#lightbox-close").focus();
}

// ------------------------------------------------------------------ grammar

function scrollToSegment(id) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  target.classList.remove("flash"); void target.offsetWidth; target.classList.add("flash");
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

// Grammar prose may cite reading sentences by their short id ("s031", "(s016–s017)",
// "in s010 and s009"). Learners never see the id: a citation becomes a small ↑ link and an
// id used as a noun becomes the sentence's opening words; both scroll to and flash the
// sentence (the first of a range). Unknown ids are left as written. Blank lines in the
// source are paragraph breaks.
const SEG_REF = String.raw`\bs\d{3}(?:\s*[–-]\s*s\d{3})?\b`;
const SEG_REF_RE = new RegExp(String.raw`\s?\((${SEG_REF}(?:\s*,\s*${SEG_REF})*)\)|(${SEG_REF})`, "g");
function openingWords(text, count = 3) {
  const words = String(text || "").replace(/^[\s«“"'‘(]+/, "").split(/\s+/).filter(Boolean);
  return words.length > count ? `${words.slice(0, count).join(" ").replace(/[,.;:·»”]+$/, "")} …` : words.join(" ");
}
function segmentRefs(lesson) {
  const refs = new Map();
  if (!lesson) return refs;
  for (const [id, segment] of Core.segmentIndex(lesson)) {
    const short = id.startsWith(`${lesson.id}-`) ? id.slice(lesson.id.length + 1) : null;
    if (short) refs.set(short, segment);
  }
  return refs;
}
function segmentRefLink(segment, inline) {
  const words = openingWords(segment.text, inline ? 3 : 6);
  return h("a", { class: `seg-ref${inline ? " seg-ref-words" : ""}`, href: `#${segment.id}`, title: words,
    "aria-label": inline ? null : `${t("in_story")}: ${words}`,
    onclick: (event) => { event.preventDefault(); scrollToSegment(segment.id); } },
  inline ? h("span", { lang: targetLang() }, `«${words}»`) : h("span", { "aria-hidden": "true" }, "↑"));
}
function linkSegmentRefs(text, refs) {
  const out = [];
  let cursor = 0;
  const firstOf = (ref) => refs.get(ref.match(/s\d{3}/)[0]);
  for (const match of String(text).matchAll(SEG_REF_RE)) {
    const list = match[1] ? match[1].match(new RegExp(SEG_REF, "g")) : [match[2]];
    const segments = list.map(firstOf);
    if (segments.some((segment) => !segment)) continue;
    let before = text.slice(cursor, match.index);
    if (match[1]) {
      out.push(before, " ", ...segments.flatMap((segment, i) => [i ? " " : "", segmentRefLink(segment, false)]));
    } else {
      // An id after a word ("in s010") is part of the sentence; after "(" or "," it is a citation.
      const inline = /\p{L}$/u.test(before.trimEnd());
      if (!inline && /\)/.test(text.slice(match.index + match[0].length, match.index + match[0].length + 1))) before = before.replace(/,\s*$/, " ");
      out.push(before, segmentRefLink(segments[0], inline));
    }
    cursor = match.index + match[0].length;
  }
  out.push(text.slice(cursor));
  return out.filter((part) => part !== "");
}
function richParagraphs(text, lesson, attrs = {}) {
  const refs = segmentRefs(lesson);
  return String(text ?? "").split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean)
    .map((block) => h("p", attrs, linkSegmentRefs(block.replace(/\s*\n\s*/g, " "), refs)));
}
function richText(text, lesson) { return linkSegmentRefs(String(text ?? ""), segmentRefs(lesson)); }

function storyLink(segmentId) {
  return h("a", { class: "story-link", href: `#${segmentId}`, lang: tl("in_story")[1], onclick: (event) => {
    event.preventDefault();
    if (state.book === "workbook" && state.current) jumpToStory(state.current, segmentId); else scrollToSegment(segmentId);
  } },
    h("span", { "aria-hidden": "true" }, "↑ "), t("in_story"));
}

function renderGrammarTable(table, { caption = true } = {}) {
  const header = table.header || [];
  return h("div", { class: "table-wrap", tabindex: "0", role: "region", "aria-label": table.caption || t("grammar") },
    h("table", { lang: targetLang(), "data-table": table.id },
      caption && table.caption ? h("caption", null, table.caption) : null,
      header.some((cell) => String(cell).trim()) ? h("thead", null, h("tr", null, header.map((cell) => h("th", { scope: "col" }, cell)))) : null,
      h("tbody", null, (table.rows || []).map((row, r) => h("tr", null,
        row.map((cell, c) => h("td", { "data-row": r, "data-col": c }, cell)))))));
}
function revealEnglish(text) {
  return h("details", { class: "english-reveal", ontoggle: scheduleAlign }, ui("summary", "reveal_english"), h("span", { lang: "en" }, text));
}
function renderFamilies(lesson) {
  if (!capability("families") || !lesson.families?.length) return null;
  const segments = Core.segmentIndex(lesson);
  return h("section", { class: "families", id: "families", "aria-labelledby": "families-title" },
    ui("h2", "families", { id: "families-title" }), lesson.families.map((family) => {
      const diagram = typeof family.diagram === "string" ? { src: family.diagram, alt: family.root } : family.diagram;
      return h("article", { class: "family" }, h("h3", { lang: targetLang() }, family.root),
        h("div", { class: "family-pair" }, family.pair.map((member) => h("div", { class: "family-member" },
          h("h4", { lang: targetLang() }, member.lemma), h("p", { lang: targetLang() }, member.sense_grc),
          member.sense_en ? revealEnglish(member.sense_en) : null,
          segments.has(member.example_segment) ? h("p", { class: "family-example", lang: targetLang() },
            segments.get(member.example_segment).text, " ", storyLink(member.example_segment)) : null))),
        family.spelling_note ? h("p", { class: "spelling-note" }, richText(family.spelling_note, lesson)) : null,
        family.non_compositional ? h("p", { class: "non-compositional" },
          typeof family.non_compositional === "string" ? richText(family.non_compositional, lesson) : ui("span", "family_non_compositional")) : null,
        diagram?.src ? h("figure", { class: "family-diagram" }, mediaImage(diagram, "diagram")) : null);
    }));
}
function renderGrammar(lesson) {
  let grammar = lesson.grammar || lesson.grammar_observation;
  if (!grammar) return null;
  if (typeof grammar === "string") grammar = { rule_cy: grammar };
  const rule = grammar.rule_cy || grammar.rule || grammar.target_language;
  const nodyn = grammar.nodyn_en || grammar.note_en || grammar.bridge_language;
  const title = grammar.title_cy || grammar.title;
  const segments = Core.segmentIndex(lesson);
  const lang = targetLang();
  const explanationFirst = lang === "ru" && capability("grammar_note_open");
  const englishNote = nodyn ? h("details", { class: "nodyn", open: capability("grammar_note_open") },
    explanationFirst ? h("summary", { lang: "en" }, "Grammar explained in English") : ui("summary", "grammar_note_en"),
    richParagraphs(nodyn, lesson, { lang: "en" })) : null;
  return h("section", { class: "grammar", id: "grammar", "aria-labelledby": "grammar-title" },
    h("h2", { id: "grammar-title" }, ui("span", "grammar"), title ? h("span", { lang }, ` · ${title}`) : null),
    rule ? h("p", { class: "grammar-rule", lang }, rule) : null,
    (grammar.bridge_notes || []).filter(note => Core.isBridgeReference(state.course, note.lang, note.text))
      .map(note => h("p", { class: "grammar-bridge-note" },
        h("span", { class: "bridge-language", lang: note.lang }, note.text),
        note.target_text ? [" → ", h("span", { class: "grammar-bridge-target", lang }, note.target_text)] : null)),
    explanationFirst ? englishNote : null,
    (grammar.tables || []).map(renderGrammarTable),
    grammar.examples?.length ? h("ul", { class: "grammar-examples" }, grammar.examples.map((example) => {
      const segment = segments.get(example.segment_id);
      const text = example.text || segment?.text;
      if (!text) return null;
      return h("li", null, h("span", { lang }, text), segment ? [" ", storyLink(example.segment_id)] : null);
    })) : null,
    explanationFirst ? null : englishNote,
    grammar.parergon ? h("aside", { class: "parergon" },
      h("h3", { lang }, grammar.parergon.title || ""),
      richParagraphs(grammar.parergon.body_en || "", lesson, { lang: "en" }),
      grammar.parergon.table ? renderGrammarTable(grammar.parergon.table) : null) : null,
    stepEnd(lesson, "grammar"));
}

// ------------------------------------------------------------------ pensa

function pensaGroups(pensa) {
  if (!pensa) return [];
  if (Array.isArray(pensa)) return pensa.map((group, i) => ({ key: group.label || "ABC"[i], ...group }));
  return ["A", "B", "C"].map((key) => {
    const value = pensa[key] || pensa[key.toLowerCase()];
    if (!value) return null;
    return { key, ...(Array.isArray(value) ? { items: value } : value) };
  }).filter(Boolean);
}

function pensumItemCount(group) {
  if (Array.isArray(group)) return group.length;
  return (group?.items || group?.questions || []).length + (group?.blocks || []).reduce((n, block) => n + (block.items || []).length, 0);
}

function pensaStore(lesson) {
  if (!state.pensa.has(lesson.id)) {
    const drafts = readJSONStore("drafts")[lesson.id] || {};
    state.pensa.set(lesson.id, new Map(Object.entries(drafts).map(([key, values]) => [key, { values }])));
  }
  return state.pensa.get(lesson.id);
}

function saveDraft(lesson, key, values) {
  writeProgress("drafts", [[[lesson.id, key], [...values]]]);
}

function lessonPensa(lesson) {
  if (lesson.pensa) return lesson.pensa;
  return Array.isArray(lesson.exercises) && lesson.exercises.some(isWorkbookExercise) ? null : lesson.exercises;
}

// One "oral mode" for Pensa and workbook alike (persisted per course).
function oralToggle() {
  const button = h("button", { type: "button", class: "pill oral-toggle", "aria-pressed": String(state.oral) });
  const [text, lang] = tl("oral_mode");
  button.textContent = text; button.lang = lang;
  button.addEventListener("click", () => {
    state.oral = !state.oral;
    store(courseKey("oral"), state.oral ? "1" : "0");
    for (const el of document.querySelectorAll("#lesson .pensa, #lesson .workbook")) el.classList.toggle("oral", state.oral);
    for (const el of document.querySelectorAll("#lesson .oral-toggle")) el.setAttribute("aria-pressed", String(state.oral));
    if (state.oral) hideAccentBar();
  });
  return button;
}

const ANSWER_FIELDS = ".pensa input, .pensa textarea, .workbook input, .workbook textarea, .napishi textarea";
function bindAccentBar(section) {
  section.addEventListener("focusin", (event) => {
    if (event.target.matches(ANSWER_FIELDS)) showAccentBar(event.target);
  });
  // The bar stays put on blur: removing it would pull Check and Show up under the pointer
  // between mousedown and click, so the click lands on the wrong button or none.
}

function renderObrazec(example, area) {
  if (!example) return null;
  const prompt = typeof example === "string" ? example : example.prompt;
  const answer = typeof example === "string" ? "" : example.answer;
  const rule = typeof example === "string" ? "" : example.rule;
  return h("div", { class: "enghraifft" },
    ui("span", inflectingCourse() ? "obrazec" : "example", { class: "enghraifft-label" }),
    h("span", { lang: targetLang() }, rule ? [disp(rule, area), h("br")] : null,
      disp(prompt, area), answer ? [" ", h("strong", null, disp(answer, area))] : null));
}

function renderPensa(lesson) {
  // A Pensum may hold its items directly or in blocks (each with its own Образец); an
  // emptied Pensum is not shown.
  const groups = pensaGroups(lessonPensa(lesson)).filter((group) => pensumItemCount(group));
  if (!groups.length) return null;
  const memory = pensaStore(lesson);
  const aids = Core.lessonAidIndex(lesson);
  const section = h("section", { class: `pensa${state.oral ? " oral" : ""}`, id: "pensa", "aria-labelledby": "pensa-title" });
  section.append(
    h("header", { class: "pensa-head" }, ui("h2", "pensa", { id: "pensa-title" }), oralToggle()),
    ...groups.map((group) => {
      const titleId = `${group.id || `pensum-${group.key}`}-title`;
      const hint = state.course?.pensa_hints_en?.[group.key] ?? PENSA_HINTS_EN[group.key];
      let counter = 0;
      const groupEl = h("section", { class: "pensum", id: group.id || `pensum-${group.key}`, "aria-labelledby": titleId });
      const blocks = group.blocks?.length ? group.blocks : [{ items: group.items || group.questions || [] }];
      const revealAll = ui("button", "reveal_all", { type: "button", class: "small-button oral-only", onclick: () => {
        for (const item of groupEl.querySelectorAll(".item")) item._reveal?.();
      } });
      groupEl.append(h("header", { class: "pensum-head" },
        h("h3", { id: titleId, lang: targetLang() }, disp(group.title, "pensa") || `Pensum ${group.key}`),
        state.english && hint ? h("p", { class: "en-hint", lang: "en" }, hint) : null,
        revealAll));
      if (group.word_bank?.length) {
        groupEl.append(h("div", { class: "word-bank", role: "group", "aria-label": t("word_bank") },
          group.word_bank.map((word) => chip(disp(word, "pensa"), () => fillFromBank(groupEl, disp(word, "pensa"))))));
      }
      for (const block of blocks) {
        const example = renderObrazec(block.enghraifft || block.obrazec, "pensa");
        if (example) groupEl.append(example);
        const start = counter + 1;
        const list = h("ol", { class: "items", start: String(start) });
        for (const item of block.items || []) {
          counter += 1;
          list.append(renderItem(item, { ...group, mutation_hint: block.mutation_hint ?? group.mutation_hint }, counter, memory, aids, lesson, { area: "pensa" }));
        }
        groupEl.append(list);
      }
      return groupEl;
    }));
  const end = stepEnd(lesson, "pensa");
  if (end) section.append(end);
  bindAccentBar(section);
  return section;
}

function chip(word, onclick) {
  return h("button", { type: "button", class: "chip", lang: targetLang(), onclick }, word);
}

function fillFromBank(groupEl, word) {
  let field = state.activeField && groupEl.contains(state.activeField) ? state.activeField : null;
  if (!field) field = [...groupEl.querySelectorAll("input.answer-field")].find((input) => !input.value.trim());
  if (!field) return;
  field.value = word;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.focus();
}

// Dispatch to each course's normaliser and feedback ladder; Welsh remains unchanged.
function checkAnswer(item, values, group, lesson) {
  return courseChecker().checkResponse(item, values, {
    forms: lesson._formsTable || formsTable(lesson, courseChecker()), validWords: lesson.answer_valid_words,
    mutationHint: Boolean(item.mutation_hint ?? group.mutation_hint), unmutation: state.course?.unmutation
  });
}

// Typed token with the differing ending marked (design §8.3 "highlight the ending").
function markedEnding(item, slotIndex, result) {
  const lang = targetLang();
  const typed = result.token || "";
  const checker = courseChecker();
  const key = (value) => checker.foldYo ? checker.foldYo(checker.normalise(value)) : checker.normalise(value);
  const answers = Core.slotAnswers(item)[slotIndex] || [];
  let prefix = Math.max(typed.length - 1, 0);
  for (const answer of answers) {
    const tokens = key(answer).split(" ");
    const expected = tokens[result.tokenIndex];
    if (expected !== undefined) { prefix = Math.min(commonPrefix(key(typed), expected), Math.max(typed.length - 1, 0)); break; }
  }
  return h("span", { class: "typed", lang }, typed.slice(0, prefix), h("mark", null, typed.slice(prefix)));
}

// The ё the learner left out, shown in the expected answer.
function markedYo(answer, area) {
  const text = disp(answer, area);
  return h("span", { class: "typed", lang: targetLang() }, text.split(/(ё|Ё)/).map((part) => (/^[ёЁ]$/.test(part) ? h("mark", null, part) : part)));
}

function renderItem(item, group, number, memory, aids, lesson, opts = {}) {
  const area = opts.area || "pensa";
  const key = `${group.key}:${item.id || number}`;
  const saved = memory.get(key) || { values: [] };
  memory.set(key, saved);
  const mode = Core.answerMode(item);
  const lang = targetLang();
  const inflectingLadder = inflectingCourse();
  const prefix = String(group.key).startsWith(lesson.id) ? group.key : `${lesson.id}-${group.key}`;
  const baseId = `${prefix}-${item.id || number}`.replace(/[^\w-]/g, "-");
  const feedback = h("div", { class: "feedback", id: `${baseId}-fb`, "aria-live": "polite" });
  const promptTextId = `${baseId}-prompt`;
  const li = h("li", { class: `item mode-${mode}`, id: baseId, "data-mode": item.mode || null });
  const aid = item.aid_ref ? aids.get(item.aid_ref) : null;
  if (aid) li.append(renderScene(aid, "exercise"));
  const parts = Core.promptParts(item.prompt || item.question || "").map((part) => disp(part, area));
  const slots = Core.slotAnswers(item);
  const fields = [];
  const itemLabel = t("item", { n: `${group.labelPrefix ?? group.key}${number}` });
  const latin = h("p", { class: "latin-warning", hidden: true, role: "status" });
  const warnLatin = () => {
    if (!cyrillicCourse() || (courseChecker() === Core.ru && window.RussianInput)) return;
    const found = latinLetters(fields.map((field) => field.value).join(" ") + (textarea?.value || ""));
    latin.hidden = !found.length;
    if (found.length) { const [text, tlang] = tl("latin_warning", { chars: found.join(", ") }); latin.textContent = `⚠ ${text}`; latin.lang = tlang; }
  };

  const makeInput = (slotIndex, inline) => {
    const longest = Math.max(4, ...(slots[slotIndex] || []).map((answer) => String(answer).length));
    const input = h("input", {
      type: "text", class: `answer-field${inline ? " blank" : " line"}`, lang, autocomplete: "off", autocapitalize: "off",
      spellcheck: "false", "aria-label": parts.length > 2 ? `${itemLabel}, ${t("blank", { n: slotIndex + 1 })}` : itemLabel,
      "aria-describedby": `${promptTextId} ${feedback.id}`,
      style: inline ? `width:${Math.min(longest + 3, 22)}ch` : null
    });
    input.value = saved.values[slotIndex] || "";
    input.addEventListener("input", () => {
      saved.values[slotIndex] = input.value; clearState(); warnLatin();
      saveDraft(lesson, key, saved.values);
    });
    input.addEventListener("focus", () => { state.activeField = input; });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); check(true); }
    });
    fields.push(input);
    if (capability("scaffolded_answers")) {
      const answer = (slots[slotIndex] || [])[0] || "";
      const letters = firstLetters(answer, item.first_letters);
      if (letters || item.ending_shown) input.placeholder = `${letters}___${item.ending_shown || ""}`;
    }
    return inputWithPreview(input);
  };

  // Inline blanks sit inside the prompt; a hidden copy of the full prompt (with ___)
  // describes each field to assistive technology.
  const prompt = h("p", { class: "prompt", lang });
  const inlineBlanks = parts.length > 1 && mode !== "self_check";
  if (inlineBlanks) {
    prompt.append(h("span", { id: promptTextId, hidden: true }, parts.join("___")));
    parts.forEach((part, i) => {
      prompt.append(part);
      if (i < parts.length - 1) prompt.append(h("span", { class: "blank-wrap" }, makeInput(i, true), h("span", { class: "blank-oral", "aria-hidden": "true" }, "___")));
    });
  } else {
    prompt.append(h("span", { id: promptTextId }, parts.join("___")));
  }
  if (item.audio_segment_id && lesson._audio?.selected?.data?.segments?.[item.audio_segment_id]) {
    const play = h("button", { type: "button", class: "small-button item-audio", "aria-label": t("play_sentence") }, "▶");
    play.addEventListener("click", () => playSegments([item.audio_segment_id], lesson));
    li.append(play);
  }
  li.append(prompt);

  let textarea = null;
  if (mode === "self_check") {
    textarea = h("textarea", { class: "answer-field self", lang, rows: "2", "aria-label": itemLabel, "aria-describedby": `${promptTextId} ${feedback.id}`, spellcheck: "false" });
    textarea.value = saved.values[0] || "";
    textarea.addEventListener("input", () => {
      saved.values[0] = textarea.value;
      saveDraft(lesson, key, saved.values);
      li.querySelector(".key-terms")?._redraw?.();
      warnLatin();
    });
    textarea.addEventListener("focus", () => { state.activeField = textarea; });
    li.append(h("div", { class: "answer-line" }, inputWithPreview(textarea)));
  } else if (parts.length === 1) {
    li.append(h("div", { class: "answer-line" }, makeInput(0, false)));
  }
  // Owner, 2026-10-23: one-word answers are typed, never picked from a word bank.
  const choiceTexts = (item.choices || []).map((choice) => typeof choice === "string" ? choice : choice.text || "");
  const oneWordChoices = choiceTexts.every((text) => !/\s/.test(text.trim()));
  if (mode === "choice" && item.choices?.length && !oneWordChoices) {
    li.append(h("div", { class: "choices", role: "group", "aria-label": t("word_bank") }, item.choices.map((choice) => {
      const value = disp(typeof choice === "string" ? choice : choice.text, area);
      return chip(value, () => {
        const target = fields.find((field) => field === state.activeField) || fields.find((field) => !field.value.trim()) || fields[0];
        if (!target) return;
        target.value = value; target.dispatchEvent(new Event("input", { bubbles: true })); target.focus();
      });
    })));
  }
  li.append(latin, h("div", { class: "accent-slot" }));

  const reveal = h("div", { class: "reveal", hidden: true });
  const actions = h("div", { class: "item-actions" });
  lesson._segments ||= Core.segmentIndex(lesson);
  const sourceIds = (item.source_segment_ids || []).filter((id) => lesson._segments.has(id));
  const retry = inflectingLadder || opts.retry
    ? ui("button", "retry", { type: "button", class: "small-button retry-button", hidden: true, onclick: () => {
      fields.forEach((field, i) => { field.value = ""; saved.values[i] = ""; field.dispatchEvent(new Event("input", { bubbles: true })); });
      clearState(); warnLatin();
      fields[0]?.focus();
    } })
    : null;

  function clearState() {
    saved.checked = false;
    feedback.className = "feedback"; feedback.replaceChildren();
    for (const field of fields) field.classList.remove("is-correct", "is-wrong");
    if (retry) retry.hidden = true;
  }

  function showExplanation() {
    if (item.explanation && !reveal.querySelector(".explanation")) {
      reveal.append(h("p", { class: "explanation", lang }, disp(item.explanation, area)));
    }
    if (item.explanation) reveal.hidden = false;
  }

  function check(advance, record = true) {
    const values = fields.map((field) => field.value);
    const result = checkAnswer(item, values, group, lesson);
    saved.checked = true;
    const good = (status) => status === "correct" || status === "correct_yo" || status === "correct_letters";
    fields.forEach((field, i) => {
      const status = result.slots[i]?.status;
      field.classList.toggle("is-correct", good(status));
      field.classList.toggle("is-wrong", Boolean(status) && !good(status) && status !== "empty");
    });
    feedback.className = `feedback status-${result.status}`;
    const messages = { correct_letters: "correct_letters", ambiguous_letters: "ambiguous_letters", correct: "correct", correct_yo: "correct_yo", accent: "accent_hint", mutation: "mutation_hint", ending: "ending_hint", aspect: "aspect_hint", wrong: "wrong", empty: "empty" };
    if (result.status === "common_wrong") {
      feedback.replaceChildren(h("span", { lang }, disp(result.hint, area) || t("wrong")));
    } else {
      const content = [inflectingLadder ? h("span", { "aria-hidden": "true" }, good(result.status) ? "✓ " : result.status === "empty" ? "" : "• ") : null, ui("span", result.status === "ending" && result.feature ? `${result.feature}_hint` : messages[result.status] || "wrong", {}, { answer: result.answer || "" })].filter(Boolean);
      if (result.status === "mutation" && result.token) {
        content.push(" ", h("span", { class: "typed", lang }, h("mark", null, result.token.slice(0, 1)), result.token.slice(1)));
      }
      if (result.status === "ending" && result.token) {
        const slotIndex = result.slots.findIndex((slot) => slot.status === "ending");
        content.push(" ", markedEnding(item, slotIndex, result.slots[slotIndex] || result));
      }
      if (result.status === "correct_yo") {
        const slot = result.slots.find((entry) => entry.status === "correct_yo");
        if (slot?.answer) content.push(" ", markedYo(slot.answer, area));
      }
      feedback.replaceChildren(...content);
    }
    const replaced = result.lookalike || result.lookalikes || [];
    if (replaced.length) {
      const [text, wlang] = tl("lookalike_warning", { chars: [...new Set(replaced)].join(", ") });
      feedback.append(h("span", { class: "lookalike-note", lang: wlang }, ` ⚠ ${text}`));
    }
    if (retry) retry.hidden = good(result.status) || result.status === "empty";
    if (result.status !== "empty") showExplanation();
    if (record) opts.onOutcome?.(item, result.status);
    if (good(result.status) && advance) focusNextItem(li);
  }

  function doReveal(record = true) {
    saved.revealed = true;
    reveal.hidden = false;
    if (!reveal.querySelector(".answer")) {
      const answers = Core.revealAnswers(item).map((answer) => disp(answer, area));
      if (answers.length) {
        reveal.prepend(h("p", { class: "answer" }, ui("span", mode === "self_check" ? "model_answer" : "answer", { class: "answer-label" }), " ", h("span", { lang }, answers.join(" / "))));
      }
      if (mode === "self_check") {
        if (item.rubric) {
          const rubricLang = item.rubric_lang || ((lessonPart(lesson) ?? 1) <= 2 ? "en" : lang);
          reveal.append(h("p", { class: "rubric" }, ui("span", "rubric", { class: "answer-label" }), " ", h("span", { lang: rubricLang }, item.rubric)));
        }
        if (item.key_terms?.length) reveal.append(keyTermsLine(item.key_terms, () => textarea?.value || "", lesson));
        const yes = ui("button", "self_yes", { type: "button", class: "small-button", "aria-pressed": String(saved.self === "yes") });
        const no = ui("button", "self_no", { type: "button", class: "small-button", "aria-pressed": String(saved.self === "no") });
        const grade = (value) => {
          saved.self = value;
          yes.setAttribute("aria-pressed", String(value === "yes"));
          no.setAttribute("aria-pressed", String(value === "no"));
          opts.onOutcome?.(item, `self_${value}`);
        };
        yes.addEventListener("click", () => grade("yes"));
        no.addEventListener("click", () => grade("no"));
        reveal.append(h("div", { class: "self-grade" }, yes, no));
      }
    }
    showExplanation();
    if (record) opts.onOutcome?.(item, "revealed", true);
  }
  li._reveal = doReveal;

  if (mode !== "self_check") actions.append(ui("button", "check", { type: "button", class: "small-button check-button", onclick: () => check(false) }));
  if (retry) actions.append(retry);
  actions.append(ui("button", "reveal", { type: "button", class: "small-button", onclick: doReveal }));
  if (sourceIds.length) actions.append(storyLink(sourceIds[0]));
  li.append(actions, feedback, reveal);
  if (saved.revealed) doReveal(false);
  if (saved.checked && fields.some((field) => field.value.trim())) check(false, false);
  warnLatin();
  return li;
}

// Key terms (lexeme IDs) ticked when the learner's text contains the lemma; for Russian,
// any form of the lexeme from the forms table or lexicon (lemma match, design §8.3).
function keyTermsLine(ids, getText, lesson) {
  const lang = targetLang();
  const line = h("p", { class: "key-terms" });
  const draw = () => {
    const typed = getText();
    line.replaceChildren(ui("span", "key_terms", { class: "answer-label" }), " ", ...ids.map((id) => {
      const lemma = lemmaFor(id);
      const found = Boolean(typed.trim()) && (inflectingCourse()
        ? containsLexeme(typed, lesson._lexemeForms || lexemeFormsIndex(lesson, state.lexicon, courseChecker()), id, lemma)
        : Core.containsLemma(typed, lemma, state.course?.unmutation));
      return h("span", { class: `term${found ? " found" : ""}`, lang }, found ? "✓ " : "", lemma);
    }));
  };
  draw();
  line._redraw = draw;
  return line;
}

function focusNextItem(li) {
  const all = [...(li.closest(".pensa, .workbook")?.querySelectorAll(".item") || [])];
  const next = all[all.indexOf(li) + 1];
  const field = next?.querySelector(".answer-field");
  if (field && field.offsetParent) field.focus();
}

function lemmaFor(id) {
  const entry = state.lexicon?.entries?.find((item) => item.id === id);
  if (entry?.lemma) return entry.lemma;
  const vocab = state.current?.vocabulary?.find((word) => word.lexeme_id === id);
  if (vocab?.citation_form) return vocab.citation_form.replace(/\(.*?\)/g, "").split(",")[0].trim();
  const lesson = state.current;
  for (const value of Object.values(lesson?.answer_forms || {})) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item?.lexeme_id === id && item.lemma) return item.lemma;
      if (item?.aspect_partner?.lexeme_id === id && item.aspect_partner.lemma) return item.aspect_partner.lemma;
    }
  }
  if (lesson?.lexeme_forms?.[id]?.[0]) return lesson.lexeme_forms[id][0];
  return String(id).replace(/^[a-z]{2,3}-(ph-)?/, "").replace(/-/g, " ");
}

// Accent bar: one shared element, moved under the focused answer field. Its buttons are
// keyboard and pointer targets that insert at the caret of the last focused field.
let accentBar = null;
function accentCharacters() { return state.course?.special_characters || []; }
function showAccentBar(field) {
  const chars = accentCharacters();
  if (!chars.length || state.oral) return;
  state.activeField = field;
  if (!accentBar) {
    accentBar = h("div", { class: "accent-bar", role: "toolbar" });
    accentBar.addEventListener("mousedown", (event) => event.preventDefault());
  }
  accentBar.replaceChildren(...chars.map((char) => h("button", {
    type: "button", lang: targetLang(), onclick: (event) => insertChar(event.shiftKey ? char.toUpperCase() : char)
  }, char)));
  accentBar.setAttribute("aria-label", chars.join(" "));
  field.closest(".item, .napishi-field")?.querySelector(".accent-slot")?.append(accentBar);
}
function hideAccentBar() { accentBar?.remove(); }
function insertChar(char) {
  const field = state.activeField;
  if (!field) return;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  field.setRangeText(char, start, end, "end");
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.focus();
}

// ------------------------------------------------------------------ workbook (design §8.2)

function workbookRecord(lesson) {
  const all = readJSONStore("workbook");
  const record = all[lesson.id] ||= { skipped: {}, items: {} };
  record.skipped ||= {}; record.items ||= {};
  return { all, record };
}

function recordOutcome(lesson, exerciseId, item, status) {
  const { record } = workbookRecord(lesson);
  const key = `${exerciseId}:${item.id}`;
  const entry = record.items[key];
  const fields = {};
  if (status === "revealed") fields.revealed = new Date().toISOString();
  else if (status.startsWith("self_")) fields.self = status.slice(5);
  else if (status !== "empty") { fields.tries = (entry?.tries || 0) + 1; fields.status = status; }
  fields.at = new Date().toISOString();
  writeProgress("workbook", Object.entries(fields).map(([field, value]) => [[lesson.id, "items", key, field], value]));
}

function exerciseTitle(exercise) {
  const typeKey = `ex_type_${String(exercise.type || "").toLowerCase()}`;
  const typeLabel = lookup(courseStrings("en"), typeKey) ?? UI_DEFAULTS[typeKey];
  if (exercise.title && !(state.english && typeLabel)) return [disp(exercise.title, "exercises"), targetLang()];
  return tl(typeKey);
}

function renderWorkbook(lesson, section, sectionIndex, { book = false } = {}) {
  const exercises = sectionExercises(lesson, section, sectionIndex);
  if (!exercises.length) return null;
  const n = ROMAN[sectionIndex] || sectionIndex + 1;
  const id = `wb-${sectionIndex + 1}`;
  const memory = pensaStore(lesson);
  const aids = Core.lessonAidIndex(lesson);
  // In the workbook book each block is named after the story section it practises.
  const heading = book
    ? h("h2", { id: `${id}-title`, lang: targetLang() }, h("span", { class: "section-number" }, `${n}.`), section.title ? ` ${disp(section.title)}` : "")
    : h("h3", { id: `${id}-title` }, h("span", { lang: tl("workbook")[1] }, t("workbook")), ` ${n}`);
  const block = h("section", { class: `workbook${state.oral ? " oral" : ""}`, id, "aria-labelledby": `${id}-title` },
    h("header", { class: "workbook-head" }, heading, oralToggle()),
    exercises.map((exercise, i) => renderExercise(exercise, i + 1, lesson, memory, aids, sectionIndex)),
    stepEnd(lesson, `ex-${sectionIndex + 1}`));
  bindAccentBar(block);
  return block;
}

function renderExercise(exercise, number, lesson, memory, aids, sectionIndex) {
  const exId = exercise.id || `${lesson.id}-ex${sectionIndex + 1}-${number}`;
  const domId = exId.replace(/[^\w-]/g, "-");
  const [title, titleLang] = exerciseTitle(exercise);
  const group = { key: exId, labelPrefix: `${sectionIndex + 1}.${number}.` };
  const body = h("div", { class: "exercise-body", id: `${domId}-body` });
  const el = h("section", { class: "exercise", id: domId, "data-type": exercise.type || null, "aria-labelledby": `${domId}-title` });
  const isSkipped = () => Boolean(workbookRecord(lesson).record.skipped[exId]);
  const skip = h("button", { type: "button", class: "small-button skip-button", "aria-controls": body.id });
  const skippedNote = ui("span", "skipped", { class: "skipped-note" });
  const paint = () => {
    const skipped = isSkipped();
    el.classList.toggle("is-skipped", skipped);
    body.hidden = skipped;
    skippedNote.hidden = !skipped;
    const [label, lang] = tl(skipped ? "unskip" : "skip_exercise");
    skip.textContent = label; skip.lang = lang;
    skip.setAttribute("aria-expanded", String(!skipped));
  };
  skip.addEventListener("click", () => {
    const { record } = workbookRecord(lesson);
    writeProgress("workbook", [[[lesson.id, "skipped", exId], record.skipped[exId] ? undefined : new Date().toISOString()]]);
    paint();
  });
  const revealAll = ui("button", "reveal_all", { type: "button", class: "small-button oral-only", onclick: () => {
    for (const item of body.querySelectorAll(".item")) item._reveal?.();
  } });
  const hint = exercise.hint_en || exercise.hint;
  el.append(h("header", { class: "exercise-head" },
    h("h4", { id: `${domId}-title` }, h("span", { class: "exercise-number", "aria-hidden": "true" }, `${number}. `), h("span", { lang: titleLang }, title)),
    h("div", { class: "exercise-actions" }, skippedNote, revealAll, skip),
    state.english && hint ? h("p", { class: "en-hint", lang: "en" }, hint) : null));
  if (exercise.instruction) body.append(h("p", { class: "exercise-instruction", lang: targetLang() }, disp(exercise.instruction, "exercises")));
  const example = renderObrazec(exercise.obrazec || exercise.example || exercise.enghraifft, "exercises");
  if (example) body.append(example);
  if (exercise.word_bank?.length) {
    body.append(h("div", { class: "word-bank", role: "group", "aria-label": t("word_bank") },
      exercise.word_bank.map((word) => chip(disp(word, "exercises"), () => fillFromBank(body, disp(word, "exercises"))))));
  }
  const list = h("ol", { class: "items" });
  (exercise.items || []).forEach((item, i) => {
    list.append(renderItem(item, group, i + 1, memory, aids, lesson, {
      area: "exercises", retry: true, onOutcome: (it, status) => recordOutcome(lesson, exId, it, status)
    }));
  });
  body.append(list);
  el.append(body);
  paint();
  return el;
}

// ------------------------------------------------------------------ Слова с историей (§7.6)

function renderWordsWithHistory(lesson) {
  const words = lesson.words_with_history || lesson.slova_s_istoriey;
  if (!words) return null;
  const lang = targetLang();
  const word = words.word || words.title_word;
  return h("section", { class: "words-history", id: "words-history", "aria-labelledby": "words-history-title" },
    h("h2", { id: "words-history-title" }, words.title ? h("span", { lang }, disp(words.title, "words_with_history")) : ui("span", "words_with_history"),
      word ? h("span", { lang, class: "words-history-word" }, ` · ${disp(word, "words_with_history")}`) : null),
    paragraphsOf(Array.isArray(words.text) ? words.text.map((p) => disp(p, "words_with_history")) : disp(words.text || "", "words_with_history"), lang),
    words.proverb ? h("p", { class: "proverb", lang }, disp(words.proverb, "words_with_history")) : null,
    words.note_en ? h("details", { class: "nodyn" }, ui("summary", "note_en"), richParagraphs(words.note_en, lesson, { lang: "en" })) : null);
}

// ------------------------------------------------------------------ Напиши (§8.2 item 7)

function writingKey(lesson) { return `writing:${lesson.id}`; }

function renderNapishi(lesson) {
  const task = napishiOf(lesson, Core.storySections(lesson));
  if (!task) return null;
  const area = "exercises";
  const lang = targetLang();
  const saved = readJSONStore(writingKey(lesson), {});
  saved.marked ||= [];
  const save = () => { saved.updated = new Date().toISOString(); writeJSONStore(writingKey(lesson), saved); };
  const field = (name, labelKey, rows) => {
    const id = `napishi-${name}`;
    const box = h("textarea", { class: "answer-field self napishi-text", id, lang, rows: String(rows), spellcheck: "false" });
    box.value = saved[name] || "";
    const count = h("span", { class: "word-count", "aria-live": "off" });
    const latin = h("p", { class: "latin-warning", hidden: true, role: "status" });
    const update = () => {
      const words = box.value.trim() ? box.value.trim().split(/\s+/).length : 0;
      const [text, clang] = tl("words_typed", { n: words });
      count.textContent = text; count.lang = clang;
      const found = cyrillicCourse() && !(courseChecker() === Core.ru && window.RussianInput) ? latinLetters(box.value) : [];
      latin.hidden = !found.length;
      if (found.length) { const [warn, wlang] = tl("latin_warning", { chars: found.join(", ") }); latin.textContent = `⚠ ${warn}`; latin.lang = wlang; }
    };
    box.addEventListener("input", () => { saved[name] = box.value; save(); update(); terms?._redraw?.(); });
    box.addEventListener("focus", () => { state.activeField = box; });
    update();
    return { area: box, block: h("div", { class: "napishi-field" }, h("label", { for: id }, ui("span", labelKey)), inputWithPreview(box), h("div", { class: "napishi-meta" }, count), latin, h("div", { class: "accent-slot" })) };
  };
  const draft = field("draft", "napishi_draft", 6);
  const rewrite = field("rewrite", "napishi_rewrite", 5);
  let terms = null;
  const reveal = h("div", { class: "reveal napishi-reveal", hidden: true });
  const toggleMark = (key, value) => {
    saved.marked = value ? [...new Set([...saved.marked, key])] : saved.marked.filter((entry) => entry !== key);
    save();
  };
  const markBox = (key, labelKey = "my_error") => {
    const box = h("input", { type: "checkbox", checked: saved.marked.includes(key) });
    box.addEventListener("change", () => toggleMark(key, box.checked));
    return h("label", { class: "mark-error" }, box, " ", ui("span", labelKey));
  };
  const buildReveal = () => {
    if (reveal.childNodes.length) return;
    const models = task.model_answers || (task.model_answer ? [task.model_answer] : []);
    const rubric = Array.isArray(task.rubric) ? task.rubric : task.rubric ? [task.rubric] : [];
    const rubricLang = task.rubric_lang || (lessonPart(lesson) <= 2 ? "en" : lang);
    if (models.length) reveal.append(ui("h3", "model_answers"), h("ol", { class: "model-answers", lang }, models.map((model) => h("li", null, disp(model, area)))));
    if (rubric.length) reveal.append(ui("h3", "rubric"), h("ul", { class: "rubric-list" }, rubric.map((point, i) => h("li", null, h("span", { lang: rubricLang }, point), " ", markBox(`rubric:${i}`)))));
    if (task.key_terms?.length) { terms = keyTermsLine(task.key_terms, () => `${draft.area.value} ${rewrite.area.value}`, lesson); reveal.append(terms); }
    const errors = task.typical_errors || task.tipichnye_oshibki || [];
    if (errors.length) {
      reveal.append(ui("h3", "napishi_typical"), h("ul", { class: "typical-errors" }, errors.map((error, i) => h("li", null,
        h("span", { lang }, h("s", null, disp(error.wrong || error.error, area)), h("span", { "aria-hidden": "true" }, " → "), h("strong", null, disp(error.right || error.correction, area))),
        error.note ? h("span", { class: "error-note", lang: error.note_lang || rubricLang }, ` · ${error.note}`) : null,
        " ", markBox(`error:${i}`)))));
    }
    reveal.append(ui("p", "napishi_mark", { class: "napishi-instruction" }), rewrite.block);
  };
  const show = () => {
    buildReveal();
    reveal.hidden = false;
    saved.revealed = saved.revealed || new Date().toISOString();
    save();
  };
  const copyBox = h("textarea", { class: "copy-fallback", readonly: true, rows: "8", hidden: true, lang });
  const copy = async () => {
    const parts = [courseString("feedback_prompt"), "", `${courseString("feedback_task")}:`, stripStress(task.prompt || "").text, "", `${courseString("feedback_text")}:`, draft.area.value.trim()];
    if (rewrite.area.value.trim()) parts.push("", `${courseString("feedback_rewrite")}:`, rewrite.area.value.trim());
    const text = parts.join("\n");
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch { ok = false; }
    if (!ok) {
      copyBox.value = text; copyBox.hidden = false; copyBox.focus(); copyBox.select();
      try { ok = document.execCommand("copy"); } catch { ok = false; }
    }
    const [msg, mlang] = tl(ok ? "copied" : "copy_failed");
    toast(msg, mlang);
  };
  const hint = task.hint_en || task.hint;
  const section = h("section", { class: "napishi", id: "napishi", "aria-labelledby": "napishi-title" },
    h("header", { class: "napishi-head" }, ui("h2", "napishi", { id: "napishi-title" })),
    h("p", { class: "prompt", lang }, disp(task.prompt || "", area)),
    task.length_hint ? h("p", { class: "length-hint", lang }, disp(task.length_hint, area)) : null,
    state.english && hint ? h("p", { class: "en-hint", lang: "en" }, hint) : null,
    draft.block,
    h("div", { class: "item-actions" },
      ui("button", "reveal", { type: "button", class: "small-button", "aria-controls": "napishi-reveal", onclick: show }),
      ui("button", "copy_feedback", { type: "button", class: "small-button", onclick: copy })),
    copyBox,
    reveal,
    stepEnd(lesson, "write"));
  reveal.id = "napishi-reveal";
  if (saved.revealed) show();
  bindAccentBar(section);
  return section;
}

// ------------------------------------------------------------------ vocabulary

function posLabel(pos) {
  const custom = state.english ? null : state.course?.ui_strings?.pos;
  const map = { ...POS_EN, ...(custom || {}) };
  return String(pos || "").split("/").map((part) => map[part.trim()] || part.trim()).join(" / ");
}

function renderVocabulary(lesson) {
  const words = lesson.vocabulary || [];
  if (!words.length) return null;
  const lang = targetLang();
  return h("details", { class: "vocabulary" },
    h("summary", null, ui("span", "vocabulary", { class: "vocab-title" }), " ", ui("small", "words_count", null, { n: words.length })),
    h("dl", { class: "vocab-list" }, words.map((word) => {
      const form = word.citation_form || word.display_form || "";
      const gender = word.gender && !/\(.*\)/.test(form) ? ` (${t(`gender_${word.gender}`)})` : "";
      return h("div", { class: `vocab-row${word.new === false ? " recycled" : ""}` },
        h("dt", { lang }, form, gender),
        h("dd", null,
          word.part_of_speech ? h("abbr", { class: "pos", title: word.part_of_speech, lang: "en" }, posLabel(word.part_of_speech)) : null,
          h("span", { lang: "en" }, word.current_sense || ""),
          capability("vocabulary_self_check") ? vocabularySelfCheck(lesson, word) : null));
    })),
    capability("vocabulary_self_check") ? ui("button", "vocabulary_export", { type: "button", class: "small-button vocabulary-export", onclick: exportVocabulary }) : null);
}

function vocabularySelfCheck(lesson, word) {
  const id = word.lexeme_id || word.id || word.citation_form;
  const group = h("div", { class: "vocabulary-self-check", role: "group", "aria-label": word.citation_form || id });
  const saved = vocabularyStore().rating(lesson.id, id);
  for (const value of ["knew", "context", "no"]) {
    const button = ui("button", `vocabulary_${value}`, { type: "button", class: "small-button", "data-rating": value,
      "aria-pressed": String(saved === value), onclick: () => {
        vocabularyStore().rate(lesson.id, id, value);
        for (const item of group.children) item.setAttribute("aria-pressed", String(item === button));
      } });
    group.append(button);
  }
  return group;
}
function exportVocabulary() {
  const blob = new Blob([`${JSON.stringify(vocabularyStore().exportVocabulary(), null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = h("a", { href: url, download: `${state.course.id}-vocabulary.json` });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ------------------------------------------------------------------ finish & Anki

// ------------------------------------------------------------------ workbook book

function renderWorkbookBook(lesson, order, part) {
  const groups = Core.storySections(lesson).map((section, i) => renderWorkbook(lesson, section, i, { book: true })).filter(Boolean);
  const statusKey = `status_${lesson.status || "draft"}`;
  return [
    h("header", { class: "lesson-header", id: "workbook-book" },
      h("p", { class: "eyebrow" },
        h("span", { lang: tl("workbook")[1] }, `${t("workbook")} · `),
        part && part.number !== "" ? h("span", { lang: tl("part")[1] }, `${t("part")} ${part.number} · `) : null,
        h("span", { lang: tl("lesson")[1] }, lessonLabel(order))),
      h("h1", { id: "lesson-title", lang: targetLang(), tabindex: "-1" }, lesson.title || ""),
      lesson.status && lesson.status !== "published" ? ui("span", statusKey, { class: "status-badge" }) : null),
    h("p", { class: "workbook-back" }, h("a", { href: `#${encodeURIComponent(lesson.id)}` },
      h("span", { "aria-hidden": "true" }, "← "), ui("span", "back_to_chapter"))),
    stressConfig() ? h("div", { class: "lesson-toolbar" }, renderStressToggle(lesson)) : null,
    renderStepper(lesson),
    ...groups,
    groups.length ? null : ui("p", "no_exercises", { class: "status-card" }),
    stepEnd(lesson, "workbook"),
    renderPagination(lesson, "/workbook")
  ];
}

function renderWorkbookLink(lesson) {
  if (!exerciseBook(state.course) || !hasWorkbook(lesson, state.course, Core)) return null;
  return h("p", { class: "workbook-link" }, h("a", { class: "button secondary", href: `#${encodeURIComponent(lesson.id)}/workbook` },
    ui("span", "open_workbook"), h("span", { "aria-hidden": "true" }, " →")));
}

// "↑ in the story" from the workbook opens the chapter at that sentence. The workbook's
// history entry keeps its scroll position, so Back (or the floating button) returns there.
function jumpToStory(lesson, segmentId) {
  const here = location.hash.includes("/") ? location.hash : `#${encodeURIComponent(lesson.id)}/workbook`;
  history.replaceState({ ...(history.state || {}), scrollY: window.scrollY }, "", here);
  history.pushState({ fromWorkbook: true, segment: segmentId }, "", `#${encodeURIComponent(lesson.id)}`);
  showStoryFromWorkbook(lesson, segmentId);
}
function showStoryFromWorkbook(lesson, segmentId) {
  state.book = "chapter";
  state.navBook = null;
  renderLesson(lesson);
  setLessonTitle(lesson);
  renderNav();
  $("#lesson").append(h("button", { type: "button", class: "button primary return-to-workbook", onclick: () => history.back() },
    h("span", { "aria-hidden": "true" }, "← "), ui("span", "back_to_exercise")));
  requestAnimationFrame(() => scrollToSegment(segmentId));
}

function renderFinish(lesson, order) {
  const finished = completed().has(lesson.id);
  const label = lesson.completion?.button_label;
  const button = h("button", { type: "button", class: "button primary finish-button", "aria-pressed": String(finished) });
  const update = (done) => {
    button.replaceChildren();
    if (done) button.append(h("span", { "aria-hidden": "true" }, "✓ "), h("span", { lang: tl("finished_state")[1] }, bare(t("finished_state"))));
    else if (label) button.append(h("span", { lang: targetLang() }, label));
    else button.append(ui("span", "finish"));
    button.setAttribute("aria-pressed", String(done));
  };
  update(finished);
  state.refreshFinish = update;
  button.addEventListener("click", () => {
    const done = !completed().has(lesson.id);
    setCompletion(lesson.id, done);
    update(done);
    renderNav();
    if (stepperFor(lesson)) refreshStepper(lesson);
    const [text, lang] = tl(done ? "finished_announce" : "unfinished_announce", { title: lesson.title });
    toast(text, lang);
  });
  const cumulative = order > 1 ? ui("button", "anki_cumulative", { type: "button", class: "button secondary", onclick: () => downloadAnki(lesson, true) }, { n: order }) : null;
  let includeKnown = null;
  if (inflectingAnki()) {
    const box = h("input", { type: "checkbox", id: "anki-include-known", checked: setting("anki-include-known") === "1" });
    box.addEventListener("change", () => store(courseKey("anki-include-known"), box.checked ? "1" : "0"));
    includeKnown = h("label", { class: "anki-known", for: "anki-include-known" }, box, " ", ui("span", "anki_include_known"));
  }
  return h("footer", { class: "lesson-finish", id: "lesson-finish" },
    button,
    h("div", { class: "anki-actions" },
      ui("button", "anki_lesson", { type: "button", class: "button secondary", onclick: () => downloadAnki(lesson, false) }),
      cumulative, includeKnown));
}

function renderPagination(lesson, suffix = "") {
  const list = entries();
  const index = list.findIndex((entry) => entry.id === lesson.id);
  const previous = list.slice(0, index).reverse().find(available);
  const next = list.slice(index + 1).find(available);
  const link = (entry, key, rel) => (entry
    ? h("a", { class: `page-link ${rel}`, href: `#${encodeURIComponent(entry.id)}${suffix}`, rel },
      rel === "prev" ? h("span", { "aria-hidden": "true" }, "← ") : null,
      ui("span", key), h("span", { class: "page-title", lang: targetLang() }, ` · ${entry.title}`),
      rel === "next" ? h("span", { "aria-hidden": "true" }, " →") : null)
    : h("span"));
  return h("nav", { class: "lesson-pagination", "aria-label": `${t("previous")} / ${t("next")}` },
    link(previous, "previous", "prev"), link(next, "next", "next"));
}

async function loadLexicon() {
  if (state.lexicon !== undefined) return state.lexicon;
  try { state.lexicon = await loadJSON(resolve(state.course.lexicon_path || "lexicon.json")); }
  catch { state.lexicon = null; }
  return state.lexicon;
}

// Scaffolded exports support known-word baselines independently of morphology.
function inflectingAnki() { return state.course?.anki?.mode === "scaffolded" || Core.isInflectingCourse(state.course); }

// Known lexemes for exports: baseline_path (default plan/baseline.json) plus, when
// the plan is reachable (serving the source repository), its rows marked known. The public
// bundle's baseline file already holds the merged list.
async function loadKnown() {
  if (state.known !== undefined) return state.known;
  const optional = async (file) => { try { return file ? await loadJSON(resolve(file)) : null; } catch { return null; } };
  // Scaffolded courses derive their complete known list ahead of time. Their
  // private authoring plan is not needed by the reader (nor shipped publicly).
  const planPath = state.course.anki?.mode === "scaffolded" ? null : state.course.plan_path || "plan/chapters.json";
  const [baseline, plan] = await Promise.all([optional(state.course.baseline_path || "plan/baseline.json"), optional(planPath)]);
  state.known = knownList(baseline, plan);
  return state.known;
}

async function downloadAnki(lesson, cumulative) {
  const order = lesson.order ?? lesson._entry?.order ?? 1;
  const list = entries().filter(available).filter((entry, i) => (cumulative ? entryOrder(entry, i) <= order : entry.id === lesson.id));
  const [lexicon, lessons] = await Promise.all([
    loadLexicon(),
    Promise.all(list.map((entry) => fetchLesson(entry).catch(() => null)))
  ]);
  const labels = {};
  list.forEach((entry) => { labels[entry.id] = `${courseString("lesson")} ${entry.order ?? ""}`.trim(); });
  const extra = inflectingAnki() ? { known: await loadKnown(), includeKnown: setting("anki-include-known") === "1" } : {};
  const { cards, text } = Core.ankiExport({
    course: state.course, lexicon, lessons: lessons.filter(Boolean), lessonIds: list.map((entry) => entry.id),
    lessonLabels: labels, unmutation: state.course?.unmutation, ...extra
  });
  if (!cards.length) { const [msg, lang] = tl("anki_empty"); toast(msg, lang); return; }
  const name = cumulative ? `${state.course.id}-01-${pad(order)}-anki.txt` : `${state.course.id}-${pad(order)}-anki.txt`;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = h("a", { href: url, download: name });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const [msg, lang] = tl("anki_done", { n: cards.length });
  toast(msg, lang);
  if (stepperFor(lesson) && !stepTicks(lesson.id).anki) setTick(lesson, "anki", true);
}

// ------------------------------------------------------------------ audio

async function loadAudioSources(lesson) {
  const media = lesson.media || {};
  const declared = media.audio_sources || (media.audio_manifest ? [{ id: "default", label: "Default", manifest: media.audio_manifest, default: true }]
    : state.course?.audio?.lesson_sources?.[lesson.id] || []);
  const sources = (await Promise.all(declared.map(async (source) => {
    try {
      const url = resolve(source.manifest);
      return { ...source, data: await loadJSON(url), base: new URL("./", url).href };
    } catch { return null; }
  }))).filter(Boolean);
  if (!sources.length) return null;
  const saved = store(`${state.course.id}:audio-source`);
  const selected = sources.find((source) => source.id === saved) || sources.find((source) => source.default) || sources[0];
  return { sources, selected };
}

const player = typeof Audio === "undefined" ? null : new Audio();
// on: something is playing or paused (the dock shows); continuous: a whole chapter or part
// is queued (the toolbar button reads Stop); paused: playback is paused or needs permission.
// activeId is the sentence being heard: kept by ID so a re-render (stress marks, interface
// language) can find it again (rebindAudio). offsets: the chapter file's lesson_offsets.
const audioState = { queue: [], lesson: null, active: null, activeId: null, offsets: null, button: null, on: false, continuous: false, paused: false };
let playbackSeq = 0;

function renderAudioControls(lesson) {
  const audio = lesson._audio;
  if (!audio) return null;
  const hasSegments = Object.keys(audio.selected.data?.segments || {}).length > 0;
  if (!hasSegments && !audio.selected.data?.lesson) return null;
  const listen = h("button", { type: "button", class: "pill listen", "aria-pressed": "false" });
  const setListen = (playing) => {
    listen.replaceChildren(h("span", { "aria-hidden": "true" }, playing ? "■ " : "▶ "), ui("span", playing ? "stop" : "listen"));
    listen.setAttribute("aria-pressed", String(playing));
  };
  setListen(audioState.continuous);
  audioState.button = setListen;
  listen.addEventListener("click", () => {
    if (audioState.continuous) { stopAudio(); return; }
    playLesson(lesson);
  });
  const controls = [listen];
  if (audio.sources.length > 1) {
    const select = h("select", { id: "audio-source" }, audio.sources.map((source) => new Option(source.label || source.id, source.id, false, source.id === audio.selected.id)));
    select.addEventListener("change", () => {
      stopAudio();
      audio.selected = audio.sources.find((source) => source.id === select.value) || audio.selected;
      store(`${state.course.id}:audio-source`, audio.selected.id);
      const scroll = window.scrollY;
      renderLesson(lesson);
      window.scrollTo(0, scroll);
      $("#audio-source")?.focus();
    });
    controls.push(h("label", { class: "voice-picker" }, ui("span", "voice"), " ", select));
  }
  return h("div", { class: "audio-controls" }, controls);
}

function segmentOrder(lesson) {
  return Core.storySections(lesson).flatMap((section) => (section.segments || []).map((segment) => segment.id));
}

function playLesson(lesson) {
  const data = lesson._audio?.selected?.data;
  if (data?.lesson) {
    stopAudio();
    audioState.continuous = true;
    audioState.offsets = data.lesson_offsets && Object.keys(data.lesson_offsets).length ? data.lesson_offsets : null;
    playFile(new URL(data.lesson, lesson._audio.selected.base).href, null);
    audioState.button?.(true);
    return;
  }
  playSegments(segmentOrder(lesson).filter((id) => data?.segments?.[id]), lesson, true);
}

function playSegments(ids, lesson, continuous = false) {
  stopAudio();
  audioState.queue = [...ids];
  audioState.lesson = lesson;
  audioState.continuous = continuous;
  if (continuous) audioState.button?.(true);
  advanceQueue();
}

function advanceQueue() {
  const lesson = audioState.lesson;
  const id = audioState.queue.shift();
  if (!id || !lesson?._audio) { stopAudio(); return; }
  const file = lesson._audio.selected.data.segments?.[id];
  if (!file) { advanceQueue(); return; }
  playFile(new URL(file, lesson._audio.selected.base).href, id);
}

function markActive(id) {
  audioState.active?.classList.remove("audio-playing");
  audioState.activeId = id || null;
  audioState.active = id ? document.getElementById(id) : null;
  audioState.active?.classList.add("audio-playing");
}
function rebindAudio() {
  if (!audioState.on) return;
  markActive(audioState.activeId);
  syncParaButtons();
}

// The segment heard at `time` in a chapter file: the last one started, so the pause between
// two sentences still belongs to the first.
function segmentAt(offsets, time) {
  let found = null;
  for (const [id, [start]] of Object.entries(offsets || {})) if (start <= time && (!found || start >= found.start)) found = { id, start };
  return found?.id || null;
}

function playFile(src, segmentId) {
  markActive(segmentId);
  audioState.on = true;
  audioState.paused = false;
  updateDock();
  player.src = src;
  tryPlay();
}

function tryPlay() {
  const seq = ++playbackSeq;
  player.play().catch((error) => {
    if (seq !== playbackSeq) return;
    if (error.name === "NotAllowedError") {
      audioState.paused = true;
      updateDock();
    } else advanceQueue();
  });
}

function toggleAudioPause() {
  if (!audioState.on) return;
  audioState.paused = !audioState.paused;
  playbackSeq += 1;
  if (audioState.paused) player.pause(); else tryPlay();
  updateDock();
}

function updateDock() {
  const dock = $("#audio-dock");
  if (!dock) return;
  dock.hidden = !audioState.on;
  document.body.classList.toggle("audio-docked", audioState.on);
  dock.setAttribute("aria-label", t("audio"));
  const main = $("#audio-pause");
  main.textContent = audioState.paused ? "▶" : "❚❚";
  main.setAttribute("aria-label", t(audioState.paused ? "resume" : "pause"));
  main.title = main.getAttribute("aria-label");
  const stop = $("#audio-stop");
  stop.textContent = "■";
  stop.setAttribute("aria-label", t("stop"));
  stop.title = stop.getAttribute("aria-label");
  syncParaButtons();
}

function stopAudio() {
  playbackSeq += 1;
  audioState.queue = [];
  player.pause();
  markActive(null);
  audioState.offsets = null;
  audioState.on = audioState.continuous = audioState.paused = false;
  audioState.button?.(false);
  updateDock();
}
player?.addEventListener("ended", () => { audioState.active?.classList.remove("audio-playing"); if (audioState.queue.length) advanceQueue(); else stopAudio(); });
function syncMediaPause() {
  if (!audioState.on) return;
  // Read the current media state: queued events can belong to a replaced clip.
  if (player.paused && !audioState.paused) playbackSeq += 1;
  audioState.paused = player.paused;
  updateDock();
}
player?.addEventListener("pause", syncMediaPause);
player?.addEventListener("play", syncMediaPause);
player?.addEventListener("timeupdate", () => {
  if (!audioState.offsets || !audioState.on) return;
  const id = segmentAt(audioState.offsets, player.currentTime);
  if (id !== audioState.activeId) { markActive(id); syncParaButtons(); }
});
player?.addEventListener("error", () => { if (audioState.queue.length) advanceQueue(); else stopAudio(); });

// ------------------------------------------------------------------ navigation drawer

// Narrow screens open the course panel as a drawer; wide screens fold the sidebar away.
const narrowNav = () => window.matchMedia?.("(max-width: 860px)").matches;
function syncNavToggle() {
  const expanded = narrowNav() ? $("#course-nav").classList.contains("open") : !document.documentElement.classList.contains("nav-collapsed");
  $("#nav-toggle").setAttribute("aria-expanded", String(expanded));
}
function toggleSidebar() {
  const collapsed = document.documentElement.classList.toggle("nav-collapsed");
  store("nav-collapsed", collapsed ? "1" : null);
  syncNavToggle();
  scheduleAlign();
}

function openNav() {
  $("#course-nav").classList.add("open");
  $("#nav-toggle").setAttribute("aria-expanded", "true");
  $("#main").inert = true;
  ($("#course-nav a[aria-current]") || $("#course-nav a"))?.focus();
}
function closeNav(returnFocus) {
  if (!$("#course-nav").classList.contains("open")) return;
  $("#course-nav").classList.remove("open");
  $("#nav-toggle").setAttribute("aria-expanded", "false");
  $("#main").inert = false;
  syncNavToggle();
  if (returnFocus) $("#nav-toggle").focus();
}

function showError(error) {
  $("#loading").hidden = true;
  for (const id of VIEWS) if ($(`#${id}`)) $(`#${id}`).hidden = true;
  const box = $("#error");
  box.hidden = false;
  box.replaceChildren(ui("strong", "load_error"), " ", h("span", { lang: "en" }, error.message), " ", ui("span", "serve_hint"));
}

// ------------------------------------------------------------------ boot

async function init() {
  state.index = await loadIndex();
  const picked = pickCourse(state.index);
  state.baseUrl = picked.base;
  state.indexEntry = picked.entry;
  state.english = store("english-chrome") !== "0";
  try {
    state.course = await loadJSON(new URL("course.json", state.baseUrl).href);
  } catch (error) { showError(error); return; }
  if (state.course.id && (state.index?.courses || []).some((course) => course.id === state.course.id)) store("last-course", state.course.id);
  state.notesHidden = setting("notes-hidden", "notes-hidden") === "1";
  state.oral = setting("oral", "pensa-oral") === "1";
  // English interface by default: the toggle opts into target-language chrome.
  state.english = setting("english", "english-chrome") !== "0";
  applyChrome();
  installStressStripper();
  if (stressHiddenEverywhere()) stripStressNodes(document.body);
  await route();
}

function applyTheme() {
  const light = document.documentElement.dataset.theme === "light";
  const button = $("#theme-toggle");
  button.textContent = light ? "☾" : "☀";
  button.setAttribute("aria-label", light ? "Switch to night mode" : "Switch to day mode");
  button.title = button.getAttribute("aria-label");
}

function boot() {
  $(".skip-link").addEventListener("click", (event) => {
    event.preventDefault();
    closeNav(false);
    $("#main").focus({ preventScroll: true });
    $("#main").scrollIntoView();
  });
  applyTheme();
  $("#theme-toggle").addEventListener("click", () => {
    const light = document.documentElement.dataset.theme !== "light";
    if (light) document.documentElement.dataset.theme = "light"; else delete document.documentElement.dataset.theme;
    store("theme", light ? "light" : null);
    applyTheme();
  });
  syncNavToggle();
  $("#nav-toggle").addEventListener("click", () => {
    if (!narrowNav()) toggleSidebar();
    else if ($("#course-nav").classList.contains("open")) closeNav(true); else openNav();
  });
  $("#audio-pause").addEventListener("click", toggleAudioPause);
  $("#audio-stop").addEventListener("click", stopAudio);
  $("#english-toggle").addEventListener("click", () => {
    state.english = !state.english;
    store(courseKey("english"), state.english ? "1" : "0");
    const scroll = window.scrollY;
    applyChrome();
    if (state.view === "lesson" && state.current) renderLesson(state.current);
    else if (state.view === "overview") showOverview(false);
    else if (state.view === "intro") showIntro(false);
    else if (state.view === "whats-next") showWhatsNext(false);
    window.scrollTo(0, scroll);
    updateDock();
    $("#english-toggle").focus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && glossPop) { event.preventDefault(); closeGloss(); return; }
    if (event.key === "Escape") closeGloss(); // also cancels a lookup still loading
    if (event.key === "Escape" && $("#course-nav").classList.contains("open")) { event.preventDefault(); closeNav(true); }
  });
  // A tap outside the popup and the story's words closes it (a word opens its own).
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest?.(".gloss-pop, .story .w, .note-marker")) closeGloss();
  }, true);
  $("#lightbox").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  window.addEventListener("hashchange", () => {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (document.getElementById(hash)?.classList.contains("seg")) return;
    // Back/forward between steps of the open lesson scrolls instead of re-rendering it.
    const [lessonHash, stepHash] = hash.split("/");
    const restoreY = typeof history.state?.scrollY === "number" ? history.state.scrollY : null;
    if (stepHash && state.view === "lesson" && state.current?.id === lessonHash && enterStep(state.current, stepHash, { restoreY })) return;
    // Back from the workbook to a chapter of the open lesson: switch books without a refetch.
    if (!stepHash && state.view === "lesson" && state.current?.id === lessonHash && state.book === "workbook") {
      closeNav(false);
      if (history.state?.fromWorkbook && history.state.segment) return showStoryFromWorkbook(state.current, history.state.segment);
      state.book = "chapter"; state.navBook = null;
      renderLesson(state.current); setLessonTitle(state.current); renderNav();
      window.scrollTo(0, restoreY ?? 0);
      return;
    }
    if (state.course) route();
  });
  window.addEventListener("resize", () => {
    if (!narrowNav()) closeNav(false);
    syncNavToggle();
    placeGloss();
    scheduleAlign();
  });
  document.fonts?.ready?.then(scheduleAlign);
  window.visualViewport?.addEventListener("resize", placeGloss);
  // Timing: any input counts as activity; leaving the page saves the time so far.
  for (const type of ["scroll", "keydown", "pointerdown", "pointermove", "touchstart", "input"]) {
    window.addEventListener(type, noteActivity, { passive: true, capture: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { timerTick(); flushTiming(); } else timer.last = Date.now();
  });
  window.addEventListener("pagehide", () => { timerTick(); flushTiming(); });
  init();
}

// Pure helpers for Node tests (tests/static-app.test.cjs loads this file in a vm).
globalThis.IllustratedReader = {
  stripStress, segmentAt, latinLetters, formsTable, lexemeFormsIndex, containsLexeme, commonPrefix,
  knownList, isWorkbookExercise, isNapishi, sectionExercises, napishiOf, buildSteps, nextStep, addTime, timingExport, STEP_KINDS,
  exerciseBook, hasWorkbook, isWorkbookStep,
  UI_DEFAULTS
};
if (typeof document !== "undefined" && document.getElementById?.("main")) boot();
