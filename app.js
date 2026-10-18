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
  listen: "Listen", stop: "Stop", voice: "Voice", grammar: "Grammar", grammar_note_en: "Note (English)",
  in_story: "in the story", pensa: "Exercises", oral_mode: "Oral mode", check: "Check", reveal: "Show",
  retry: "Try again", reveal_all: "Show all", example: "Example", correct: "Correct!",
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
  latin_warning: "Latin letters: {chars}. Switch the keyboard layout?",
  stepper: "Steps", step_read: "Read {n}", step_exercises: "Workbook {n}", step_grammar: "Grammar",
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
  ex_type_podstanovka: "Substitute", ex_type_otvet: "Answer", ex_type_soedini: "Join", ex_type_rasstav: "Word order",
  ex_type_napishi: "Write", timing_summary: "Time per chapter", timing_total: "Total:", minutes: "{n} min",
  anki_include_known: "Include words I already know"
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
  index: null, indexEntry: null, rereadView: null, known: undefined
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

function store(key, value) {
  const full = `illustrated-input:${key}`;
  try {
    if (value === undefined) return localStorage.getItem(full);
    if (value === null) localStorage.removeItem(full); else localStorage.setItem(full, value);
  } catch { /* storage unavailable: preferences simply do not persist */ }
  return null;
}

// Per-course storage: illustrated-input:<course-id>:<name>. A setting falls back to its
// old global key, so preferences made before courses were separated carry over.
function courseKey(name) { return `${state.course?.id || "course"}:${name}`; }
function setting(name, legacy) {
  const own = store(courseKey(name));
  return own !== null ? own : (legacy ? store(legacy) : null);
}
function readJSONStore(name, fallback = {}) {
  try { return JSON.parse(store(courseKey(name)) || "null") ?? fallback; } catch { return fallback; }
}
function writeJSONStore(name, value) { store(courseKey(name), JSON.stringify(value)); }

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

function usesRuChecker() {
  const checker = state.course?.answer_checker;
  return checker ? checker === "ru" : targetLang() === "ru";
}
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

function renderCourseSwitch() {
  const box = $("#course-switch");
  if (!box) return;
  const list = visibleCourses();
  const current = state.course?.id;
  if (list.length < 2 && list.every((course) => course.id === current)) { box.hidden = true; box.replaceChildren(); return; }
  const select = h("select", { id: "course-select" }, list.map((course) =>
    h("option", { value: course.id, lang: course.language || null, selected: course.id === current }, course.title || course.id)));
  if (!list.some((course) => course.id === current)) select.prepend(h("option", { value: "", selected: true, lang: targetLang() }, state.course?.title || current || ""));
  select.addEventListener("change", () => {
    const course = list.find((item) => item.id === select.value);
    if (course) location.href = courseHref(course);
  });
  box.replaceChildren(h("label", { class: "course-switch-label", for: "course-select" }, ui("span", "course_select")), select);
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
  const key = (value) => ru.foldYo(ru.normalise(value));
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

const STEP_KINDS = ["read", "exercises", "grammar", "pensa", "write", "reread", "anki", "done"];

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

function buildSteps(lesson, { core = globalThis.IllustratedCore, roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"] } = {}) {
  const sections = core.storySections(lesson);
  const steps = [];
  sections.forEach((section, i) => {
    const n = roman[i] || String(i + 1);
    steps.push({ id: `read-${i + 1}`, kind: "read", n });
    if (sectionExercises(lesson, section, i).length) steps.push({ id: `ex-${i + 1}`, kind: "exercises", n });
  });
  const pensa = lesson?.pensa || (Array.isArray(lesson?.exercises) && !lesson.exercises.some(isWorkbookExercise) ? lesson.exercises : null);
  if (lesson?.grammar || lesson?.grammar_observation || lesson?.words_with_history) steps.push({ id: "grammar", kind: "grammar" });
  if (pensa && Object.keys(pensa).length) steps.push({ id: "pensa", kind: "pensa" });
  if (napishiOf(lesson, sections)) steps.push({ id: "write", kind: "write" });
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
function completed() { return Core.readCompleted(safeStorage(), completedKey()); }
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
  nav.replaceChildren(...parts().map((part) => h("section", { class: "nav-part" },
    part.number !== "" ? h("h2", { class: "nav-part-title" },
      h("span", { lang: tl("part")[1] }, `${t("part")} ${part.number}`),
      part.title ? h("span", { lang: targetLang() }, ` · ${part.title}`) : null) : null,
    h("ol", { class: "lesson-list" }, part.members.map(({ entry, order }) => {
      const isCurrent = state.current?.id === entry.id && state.view === "lesson";
      const finished = done.has(entry.id);
      const inner = [
        h("span", { class: "lesson-number", "aria-hidden": "true" }, pad(order)),
        h("span", { class: "lesson-name", lang: targetLang() }, entry.title || entry.id),
        finished ? h("span", { class: "lesson-check" }, h("span", { "aria-hidden": "true" }, "✓"), h("span", { class: "visually-hidden", lang: tl("finished_state")[1] }, bare(t("finished_state")))) : null
      ];
      if (!available(entry)) {
        return h("li", null, h("span", { class: "lesson-link planned" }, inner, ui("span", "planned", { class: "visually-hidden" })));
      }
      return h("li", null, h("a", { class: "lesson-link", href: `#${encodeURIComponent(entry.id)}`, "aria-current": isCurrent ? "page" : null }, inner));
    })))));
}

// ------------------------------------------------------------------ routing

function introText() { return state.course?.intro_en; }
function introSeenKey() { return `${state.course.id}:intro-seen`; }
function whatsNext() { return state.course?.whats_next || (state.course?.whats_next_path ? { path: state.course.whats_next_path } : null); }

const VIEWS = ["intro", "overview", "lesson", "whats-next"];
function showView(name) {
  if (state.view === "lesson" && name !== "lesson") stopStepTimer();
  state.view = name;
  for (const id of VIEWS) if ($(`#${id}`)) $(`#${id}`).hidden = id !== name;
  $("#loading").hidden = true; $("#error").hidden = true;
  closeNav(false);
}

let firstRoute = true;
async function route() {
  const hash = decodeURIComponent(location.hash.slice(1));
  const focus = !firstRoute;
  firstRoute = false;
  if (hash === "intro" && introText()) return showIntro(focus);
  if (hash === "whats-next" && whatsNext()) return showWhatsNext(focus);
  if (!hash && introText() && !store(introSeenKey())) return showIntro(false);
  const [lessonHash, stepHash] = hash.split("/");
  const entry = entries().find((item) => item.id === lessonHash);
  if (entry && available(entry)) return openLesson(entry, focus, stepHash);
  return showOverview(focus && hash !== "");
}

function focusHeading(selector) {
  const el = $(selector);
  if (!el) return;
  el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

// ------------------------------------------------------------------ intro

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
      body,
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
    otherCourses(),
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
  if (usesRuChecker()) await loadAnswerForms(lesson, entry);
  state.lessons.set(entry.id, lesson);
  return lesson;
}

// The forms table (design §10.5): inline answer_forms, else answer_forms_path, else the
// analyser's default sidecar analysis/<lesson file>.forms.json. Missing is fine.
async function loadAnswerForms(lesson, entry) {
  if (!lesson.answer_forms) {
    const file = entryPath(entry).split("/").pop().replace(/\.json$/, "");
    const path = lesson.answer_forms_path || `analysis/${file}.forms.json`;
    try {
      const data = await loadJSON(resolve(path));
      const table = data.answer_forms || data.forms || data;
      lesson.answer_forms = Object.fromEntries(Object.entries(table).filter(([token]) => !token.startsWith("_")));
      if (data.lexeme_forms && !lesson.lexeme_forms) lesson.lexeme_forms = data.lexeme_forms;
    } catch { /* no table: the ladder skips the ending and aspect rungs */ }
  }
  const lexicon = await loadLexicon();
  lesson._formsTable = formsTable(lesson, Core.ru);
  lesson._lexemeForms = lexemeFormsIndex(lesson, lexicon, Core.ru);
}

async function openLesson(entry, focus = true, stepId = null) {
  if (state.view !== "lesson") { $("#loading").hidden = false; }
  try {
    const lesson = await fetchLesson(entry);
    stopAudio();
    state.current = lesson;
    store(`${state.course.id}:last-lesson`, lesson.id);
    renderLesson(lesson);
    showView("lesson");
    renderNav();
    window.scrollTo(0, 0);
    document.title = `${lesson.title} · ${state.course.title || "Illustrated Input"}`;
    state.rereadView = null;
    if (stepId && enterStep(lesson, stepId)) { /* scrolled */ } else if (focus) focusHeading("#lesson-title");
    startStepTimer(lesson);
  } catch (error) { showError(error); }
}

function renderLesson(lesson) {
  const article = $("#lesson");
  const order = lesson.order ?? lesson._entry?.order;
  const part = partOf(lesson);
  article.classList.toggle("notes-hidden", state.notesHidden);
  const lastOfPart = part && part.members.at(-1)?.entry.id === lesson.id;
  article.replaceChildren(...[
    renderLessonHeader(lesson, order, part),
    renderToolbar(lesson),
    renderStepper(lesson),
    renderCover(lesson),
    renderStory(lesson),
    renderWordsWithHistory(lesson),
    renderGrammar(lesson),
    renderPensa(lesson),
    renderNapishi(lesson),
    renderVocabulary(lesson),
    renderFinish(lesson, order),
    lastOfPart ? renderAfterword(part) : null,
    renderPagination(lesson)
  ].filter(Boolean));
  markStepRegions(article, lesson);
  bindStoryObservers(article);
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
    for (const anchor of document.querySelectorAll("#lesson .anchor, #lesson .note-marker")) anchor.tabIndex = state.notesHidden ? -1 : 0;
    for (const drawer of document.querySelectorAll("#lesson .inline-notes")) closeDrawer(drawer);
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

function renderStory(lesson) {
  const sections = Core.storySections(lesson);
  const manifest = lesson._audio?.selected?.data;
  return h("div", { class: "story", id: "story" }, sections.map((section, sectionIndex) => {
    const prose = h("div", { class: "prose-col", lang: targetLang() });
    const margin = h("div", { class: "margin-col", role: "complementary", "aria-label": t("notes") });
    let paragraph = null;
    let speaker = null;
    let pendingScenes = [];
    const closeParagraph = () => {
      if (paragraph) prose.append(paragraph);
      for (const scene of pendingScenes) prose.append(scene);
      paragraph = null; pendingScenes = [];
    };
    for (const segment of section.segments || []) {
      const turn = segment.speaker && segment.speaker !== speaker;
      if (!paragraph || segment.paragraph_start || turn) {
        closeParagraph();
        paragraph = h("p", { class: `story-para${segment.speaker ? " turn" : ""}` });
        speaker = segment.speaker || null;
      }
      const { sentence, notes, scenes } = renderSegment(segment, manifest, lesson);
      if (paragraph.childNodes.length) paragraph.append(" ");
      paragraph.append(sentence);
      margin.append(...notes);
      pendingScenes.push(...scenes);
    }
    closeParagraph();
    const heading = section.title
      ? h("h2", { class: "section-title", id: `${section.id || `section-${sectionIndex}`}-title`, lang: targetLang() },
        h("span", { class: "section-number", "aria-hidden": "true" }, `${ROMAN[sectionIndex] || sectionIndex + 1}.`), ` ${disp(section.title)}`)
      : null;
    return h("section", { class: "story-section", id: section.id || `section-${sectionIndex + 1}`, "aria-labelledby": heading ? heading.id : null, "data-section": String(sectionIndex + 1) },
      heading, h("div", { class: "section-body" }, prose, margin),
      stepEnd(lesson, `read-${sectionIndex + 1}`),
      renderWorkbook(lesson, section, sectionIndex));
  }));
}

const MARGIN = new Set(["margin_gloss", "margin_vignette", "margin_diagram"]);

// Anchor lookup for a segment. Courses with a stress block match on the stress-free text
// (anchors may be written with or without marks) and map back through the offset map when
// stress is shown; other courses use the plain lookup unchanged.
function anchorLocator(source) {
  if (!stressConfig()) return { text: source, find: (anchor) => Core.findAnchor(source, anchor) };
  const stripped = stripStress(source);
  const shown = disp(source, "story") !== source || !source.includes(ACUTE) ? "plain" : "stressed";
  return {
    text: shown === "plain" ? stripped.text : source,
    find: (anchor) => {
      const found = Core.findAnchor(stripped.text, stripStress(anchor).text);
      if (!found || shown === "plain") return found;
      return { start: stripped.map[found.start], end: stripped.map[found.end] };
    }
  };
}

function renderSegment(segment, manifest, lesson) {
  const locator = anchorLocator(segment.text || "");
  const text = locator.text;
  const aids = Core.presentedAids(segment);
  const ranges = [];
  const loose = [];
  aids.forEach((aid, index) => {
    if (!MARGIN.has(aid.presentation)) return;
    const found = aid.anchor_text ? locator.find(aid.anchor_text) : null;
    const item = { aid, index };
    if (!found) { loose.push(item); return; }
    const existing = ranges.find((range) => found.start < range.end && found.end > range.start);
    if (existing) {
      existing.start = Math.min(existing.start, found.start); existing.end = Math.max(existing.end, found.end);
      existing.items.push(item);
    } else ranges.push({ ...found, items: [item] });
  });
  ranges.sort((a, b) => a.start - b.start);

  const sentence = h("span", { class: "seg", id: segment.id, "data-segment": segment.id });
  const notes = [];
  let cursor = 0;
  ranges.forEach((range, k) => {
    if (range.start > cursor) sentence.append(text.slice(cursor, range.start));
    const anchorId = `${segment.id}-a${k}`;
    const noteEls = range.items.map(({ aid, index }) => buildNote(aid, `${segment.id}-n${index}`, anchorId));
    notes.push(...noteEls);
    const anchor = h("button", {
      type: "button", class: "anchor", id: anchorId, tabindex: state.notesHidden ? "-1" : "0",
      "aria-describedby": noteEls.map((note) => note.id).join(" ")
    }, text.slice(range.start, range.end));
    wireAnchor(anchor, range.items, sentence, noteEls);
    sentence.append(anchor);
    cursor = range.end;
  });
  if (cursor < text.length) sentence.append(text.slice(cursor));
  if (loose.length) {
    const markerId = `${segment.id}-m`;
    const noteEls = loose.map(({ aid, index }) => buildNote(aid, `${segment.id}-n${index}`, segment.id));
    notes.push(...noteEls);
    const marker = h("button", { type: "button", class: "note-marker", id: markerId, tabindex: state.notesHidden ? "-1" : "0", "aria-label": t("notes"), "aria-describedby": noteEls.map((note) => note.id).join(" ") }, "*");
    wireAnchor(marker, loose, sentence, noteEls);
    sentence.append(marker);
  }
  const scenes = aids.filter((aid) => aid.presentation === "inline_scene").map((aid) => renderScene(aid)).filter(Boolean);

  const audioFile = manifest?.segments?.[segment.id];
  if (audioFile) {
    sentence.classList.add("has-audio");
    sentence.tabIndex = 0;
    const play = (event) => {
      if (event.target.closest(".anchor, .note-marker, .inline-notes")) return;
      if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
      if (event.type === "keydown" && event.target !== sentence) return;
      event.preventDefault();
      playSegments([segment.id], lesson);
    };
    sentence.addEventListener("click", play);
    sentence.addEventListener("keydown", play);
  }
  return { sentence, notes, scenes };
}

function glossContent(text) {
  return String(text ?? "").split(/(←|↔|→|=)/).map((part) => (/^(←|↔|→|=)$/.test(part) ? h("span", { class: "gloss-op" }, part) : part));
}

function buildNote(aid, id, anchorId, inline = false) {
  const lang = targetLang();
  if (aid.presentation === "margin_gloss") {
    return h("div", { class: `note note-gloss gloss-${aid.gloss_kind || "note"}`, id: inline ? null : id, "data-anchor": anchorId, lang }, glossContent(disp(aid.gloss || aid.text, "glosses")));
  }
  const kind = aid.presentation === "margin_vignette" ? "vignette" : "diagram";
  const label = disp(aid.label || "", "glosses");
  const caption = label ? h("figcaption", { lang }, label) : null;
  const figure = h("figure", { class: `note note-${kind}`, id: inline ? null : id, "data-anchor": anchorId });
  if (!aid.src) { figure.classList.add("missing"); figure.append(caption || ""); return figure; }
  const img = mediaImage(aid, kind);
  const button = h("button", { type: "button", class: "enlarge", "aria-label": `${t("enlarge")}${label || aid.alt ? `: ${label || aid.alt}` : ""}`, onclick: () => openLightbox(aid) }, img);
  img.addEventListener("error", () => {
    figure.classList.add("missing");
    button.remove();
    if (!caption) figure.hidden = true;
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

function wireAnchor(anchor, items, sentence, noteEls) {
  const pair = (on) => {
    anchor.classList.toggle("paired", on);
    for (const note of noteEls) note.classList.toggle("paired", on);
  };
  anchor.addEventListener("mouseenter", () => pair(true));
  anchor.addEventListener("mouseleave", () => pair(false));
  anchor.addEventListener("focus", () => pair(true));
  anchor.addEventListener("blur", () => pair(false));
  for (const note of noteEls) {
    note.addEventListener("mouseenter", () => pair(true));
    note.addEventListener("mouseleave", () => pair(false));
  }
  anchor.addEventListener("click", (event) => {
    event.stopPropagation();
    if (state.notesHidden) return;
    if (!isNarrow(anchor)) {
      for (const note of noteEls) { note.classList.remove("flash"); void note.offsetWidth; note.classList.add("flash"); }
      return;
    }
    const drawerId = `${anchor.id}-drawer`;
    const open = document.getElementById(drawerId);
    if (open) { closeDrawer(open); return; }
    const drawer = h("span", { class: "inline-notes", id: drawerId, role: "note" },
      items.map(({ aid, index }) => buildNote(aid, `${sentence.id}-n${index}`, anchor.id, true)));
    drawer.dataset.anchor = anchor.id;
    let after = sentence;
    while (after.nextElementSibling?.classList.contains("inline-notes")) after = after.nextElementSibling;
    after.after(drawer);
    anchor.setAttribute("aria-expanded", "true");
    anchor.setAttribute("aria-controls", drawerId);
  });
}

function closeDrawer(drawer) {
  const anchor = document.getElementById(drawer.dataset.anchor);
  anchor?.setAttribute("aria-expanded", "false");
  drawer.remove();
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
  return stepperCourse() || buildSteps(lesson, { core: Core, roman: ROMAN }).some((step) => step.kind === "exercises");
}
function lessonSteps(lesson) { return lesson._steps ||= buildSteps(lesson, { core: Core, roman: ROMAN }); }
function stepTicks(lessonId) { return readJSONStore("steps")[lessonId] || {}; }
function stepLabel(step) {
  const key = { read: "step_read", exercises: "step_exercises", grammar: "step_grammar", pensa: "step_pensa", write: "step_write", reread: "step_reread", anki: "step_anki", done: "step_done" }[step.kind];
  return tl(key, { n: step.n ?? "" }).map((value, i) => (i === 0 ? String(value).trim() : value));
}
function stepDone(lesson, step, ticks = stepTicks(lesson.id)) {
  return Boolean(ticks[step.id]) || (step.id === "done" && completed().has(lesson.id));
}
function lessonNextStep(lesson) { return nextStep(lessonSteps(lesson), stepTicks(lesson.id), completed().has(lesson.id)); }

function setTick(lesson, stepId, on) {
  if (stepId === "done") {
    Core.setCompleted(safeStorage(), completedKey(), lesson.id, on);
    state.refreshFinish?.(on);
    renderNav();
  }
  const all = readJSONStore("steps");
  const ticks = all[lesson.id] ||= {};
  if (on) ticks[stepId] = new Date().toISOString(); else delete ticks[stepId];
  writeJSONStore("steps", all);
  refreshStepper(lesson);
}

function stepTarget(stepId) {
  const [kind, n] = stepId.split("-");
  if (kind === "read") return document.querySelector(`#lesson [data-section="${n}"]`);
  if (kind === "ex") return document.getElementById(`wb-${n}`);
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
function enterStep(lesson, stepId) {
  const reread = stepId === "reread";
  const wanted = reread && stressConfig() ? lesson.id : null;
  if ((state.rereadView || null) !== wanted) {
    state.rereadView = wanted;
    renderLesson(lesson);
  }
  const scrolled = scrollToStep(stepId);
  if (reread && lesson._audio && (lesson._audio.selected?.data?.lesson || Object.keys(lesson._audio.selected?.data?.segments || {}).length)) playLesson(lesson);
  return scrolled;
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
      const tick = h("button", { type: "button", class: "step-tick", "aria-pressed": String(done), "aria-label": `${label}: ${doneText}`, lang },
        h("span", { "aria-hidden": "true" }, done ? "✓" : ""));
      tick.addEventListener("click", () => setTick(lesson, step.id, !stepDone(lesson, step)));
      const link = h("a", { class: "step-link", href: `#${encodeURIComponent(lesson.id)}/${step.id}`, lang, "aria-current": isNext ? "step" : null,
        onclick: (event) => { if (enterStep(lesson, step.id)) event.preventDefault(); } },
        isNext ? h("span", { "aria-hidden": "true" }, "→ ") : null, label,
        done ? h("span", { class: "visually-hidden", lang: doneLang }, ` (${doneText})`) : null);
      return h("li", { class: `step${done ? " is-done" : ""}${isNext ? " is-next" : ""}` }, tick, link);
    })));
}

// "Step done" at the end of a step's block: ticks it and moves to the next unticked step.
function stepEnd(lesson, stepId) {
  if (!stepperFor(lesson)) return null;
  const step = lessonSteps(lesson).find((item) => item.id === stepId);
  if (!step) return null;
  const box = h("div", { class: "step-end", "data-step": stepId });
  box._paint = () => {
    const done = stepDone(lesson, step);
    const next = lessonNextStep(lesson);
    const button = h("button", { type: "button", class: "small-button step-done", "aria-pressed": String(done) },
      h("span", { "aria-hidden": "true" }, done ? "✓ " : "○ "), ui("span", done ? "step_marked" : "step_mark"),
      h("span", { class: "visually-hidden", lang: stepLabel(step)[1] }, ` · ${stepLabel(step)[0]}`));
    button.addEventListener("click", () => {
      const now = !stepDone(lesson, step);
      setTick(lesson, stepId, now);
      if (now) { const after = lessonNextStep(lesson); if (after) enterStep(lesson, after.id); }
    });
    const nextLink = done && next ? h("a", { class: "step-next", href: `#${encodeURIComponent(lesson.id)}/${next.id}`, lang: stepLabel(next)[1],
      onclick: (event) => { if (enterStep(lesson, next.id)) event.preventDefault(); } }, t("step_next", { step: stepLabel(next)[0] }), h("span", { "aria-hidden": "true" }, " ↓")) : null;
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
  for (const section of article.querySelectorAll(".story-section[data-section]")) mark(section, [`read-${section.dataset.section}`, "reread"]);
  for (const block of article.querySelectorAll(".workbook")) mark(block, [`ex-${block.id.replace("wb-", "")}`]);
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

function otherCourses() {
  const others = visibleCourses().filter((course) => course.id !== state.course?.id);
  if (!others.length) return null;
  return h("p", { class: "other-courses" }, ui("span", "course_select"), ": ",
    others.map((course, i) => [i ? " · " : "", h("a", { href: courseHref(course), lang: course.language || null }, course.title || course.id)]));
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

function storyLink(segmentId) {
  return h("a", { class: "story-link", href: `#${segmentId}`, lang: tl("in_story")[1], onclick: (event) => { event.preventDefault(); scrollToSegment(segmentId); } },
    h("span", { "aria-hidden": "true" }, "↑ "), t("in_story"));
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
  return h("section", { class: "grammar", id: "grammar", "aria-labelledby": "grammar-title" },
    h("h2", { id: "grammar-title" }, ui("span", "grammar"), title ? h("span", { lang }, ` · ${title}`) : null),
    rule ? h("p", { class: "grammar-rule", lang }, rule) : null,
    (grammar.tables || []).map((table) => {
      const header = table.header || [];
      const showHeader = header.some((cell) => String(cell).trim());
      return h("div", { class: "table-wrap", tabindex: "0", role: "region", "aria-label": table.caption || t("grammar") },
        h("table", { lang },
          table.caption ? h("caption", null, table.caption) : null,
          showHeader ? h("thead", null, h("tr", null, header.map((cell) => h("th", { scope: "col" }, cell)))) : null,
          h("tbody", null, (table.rows || []).map((row) => h("tr", null, row.map((cell) => h("td", null, cell)))))));
    }),
    grammar.examples?.length ? h("ul", { class: "grammar-examples" }, grammar.examples.map((example) => {
      const segment = segments.get(example.segment_id);
      const text = example.text || segment?.text;
      if (!text) return null;
      return h("li", null, h("span", { lang }, text), segment ? [" ", storyLink(example.segment_id)] : null);
    })) : null,
    nodyn ? h("details", { class: "nodyn" }, ui("summary", "grammar_note_en"), h("p", { lang: "en" }, nodyn)) : null,
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

function pensaStore(lesson) {
  if (!state.pensa.has(lesson.id)) state.pensa.set(lesson.id, new Map());
  return state.pensa.get(lesson.id);
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
  section.addEventListener("focusout", () => {
    setTimeout(() => { if (!document.activeElement?.matches?.(ANSWER_FIELDS)) hideAccentBar(); }, 0);
  });
}

function renderObrazec(example, area) {
  if (!example) return null;
  const prompt = typeof example === "string" ? example : example.prompt;
  const answer = typeof example === "string" ? "" : example.answer;
  return h("div", { class: "enghraifft" },
    ui("span", usesRuChecker() ? "obrazec" : "example", { class: "enghraifft-label" }),
    h("span", { lang: targetLang() }, disp(prompt, area), answer ? [" ", h("strong", null, disp(answer, area))] : null));
}

function renderPensa(lesson) {
  const groups = pensaGroups(lessonPensa(lesson));
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
          list.append(renderItem(item, group, counter, memory, aids, lesson, { area: "pensa" }));
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

// Answer check: the Russian §8.3 ladder from core.js for courses that use it; otherwise
// the original (Welsh) checker, unchanged.
function checkAnswer(item, values, group, lesson) {
  if (usesRuChecker() && Core.ru?.checkResponse) {
    return Core.ru.checkResponse(item, values, { forms: lesson._formsTable || formsTable(lesson, Core.ru) });
  }
  return Core.checkResponse(item, values, { mutationHint: Boolean(item.mutation_hint ?? group.mutation_hint), unmutation: state.course?.unmutation });
}

// Typed token with the differing ending marked (design §8.3 "highlight the ending").
function markedEnding(item, slotIndex, result) {
  const lang = targetLang();
  const typed = result.token || "";
  const ru = Core.ru;
  const answers = Core.slotAnswers(item)[slotIndex] || [];
  let prefix = Math.max(typed.length - 1, 0);
  for (const answer of answers) {
    const tokens = ru.foldYo(ru.normalise(answer)).split(" ");
    const expected = tokens[result.tokenIndex];
    if (expected !== undefined) { prefix = Math.min(commonPrefix(ru.foldYo(typed), expected), Math.max(typed.length - 1, 0)); break; }
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
  const ruLadder = usesRuChecker() && Boolean(Core.ru?.checkResponse);
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
    if (!cyrillicCourse()) return;
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
    input.addEventListener("input", () => { saved.values[slotIndex] = input.value; clearState(); warnLatin(); });
    input.addEventListener("focus", () => { state.activeField = input; });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); check(true); }
    });
    fields.push(input);
    return input;
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
  li.append(prompt);

  let textarea = null;
  if (mode === "self_check") {
    textarea = h("textarea", { class: "answer-field self", lang, rows: "2", "aria-label": itemLabel, "aria-describedby": `${promptTextId} ${feedback.id}`, spellcheck: "false" });
    textarea.value = saved.values[0] || "";
    textarea.addEventListener("input", () => { saved.values[0] = textarea.value; warnLatin(); });
    textarea.addEventListener("focus", () => { state.activeField = textarea; });
    li.append(h("div", { class: "answer-line" }, textarea));
  } else if (parts.length === 1) {
    li.append(h("div", { class: "answer-line" }, makeInput(0, false)));
  }
  if (mode === "choice" && item.choices?.length) {
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
  const retry = ruLadder || opts.retry
    ? ui("button", "retry", { type: "button", class: "small-button retry-button", hidden: true, onclick: () => {
      fields.forEach((field, i) => { field.value = ""; saved.values[i] = ""; });
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

  function check(advance) {
    const values = fields.map((field) => field.value);
    const result = checkAnswer(item, values, group, lesson);
    saved.checked = true;
    const good = (status) => status === "correct" || status === "correct_yo";
    fields.forEach((field, i) => {
      const status = result.slots[i]?.status;
      field.classList.toggle("is-correct", good(status));
      field.classList.toggle("is-wrong", Boolean(status) && !good(status) && status !== "empty");
    });
    feedback.className = `feedback status-${result.status}`;
    const messages = { correct: "correct", correct_yo: "correct_yo", accent: "accent_hint", mutation: "mutation_hint", ending: "ending_hint", aspect: "aspect_hint", wrong: "wrong", empty: "empty" };
    if (result.status === "common_wrong") {
      feedback.replaceChildren(h("span", { lang }, disp(result.hint, area) || t("wrong")));
    } else {
      const content = [ruLadder ? h("span", { "aria-hidden": "true" }, good(result.status) ? "✓ " : result.status === "empty" ? "" : "• ") : null, ui("span", messages[result.status] || "wrong")].filter(Boolean);
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
    opts.onOutcome?.(item, result.status);
    if (good(result.status) && advance) focusNextItem(li);
  }

  function doReveal() {
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
    opts.onOutcome?.(item, "revealed", true);
  }
  li._reveal = doReveal;

  if (mode !== "self_check") actions.append(ui("button", "check", { type: "button", class: "small-button check-button", onclick: () => check(false) }));
  if (retry) actions.append(retry);
  actions.append(ui("button", "reveal", { type: "button", class: "small-button", onclick: doReveal }));
  if (sourceIds.length) actions.append(storyLink(sourceIds[0]));
  li.append(actions, feedback, reveal);
  if (saved.revealed) doReveal();
  if (saved.checked && fields.some((field) => field.value.trim())) check(false);
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
      const found = Boolean(typed.trim()) && (usesRuChecker() && Core.ru
        ? containsLexeme(typed, lesson._lexemeForms || lexemeFormsIndex(lesson, state.lexicon, Core.ru), id, lemma)
        : Core.containsLemma(typed, lemma, state.course?.unmutation));
      return h("span", { class: `term${found ? " found" : ""}`, lang }, found ? "✓ " : "", lemma);
    }));
  };
  draw();
  line._redraw = draw;
  return line;
}

function focusNextItem(li) {
  const all = [...document.querySelectorAll("#lesson .pensa .item")];
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
// pointer targets (tabindex -1) that insert at the caret without stealing focus.
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
    type: "button", tabindex: "-1", lang: targetLang(), onclick: (event) => insertChar(event.shiftKey ? char.toUpperCase() : char)
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
  return { all, record, save: () => writeJSONStore("workbook", all) };
}

function recordOutcome(lesson, exerciseId, item, status) {
  const { record, save } = workbookRecord(lesson);
  const key = `${exerciseId}:${item.id}`;
  const entry = record.items[key] ||= { tries: 0 };
  if (status === "revealed") entry.revealed = new Date().toISOString();
  else if (status.startsWith("self_")) entry.self = status.slice(5);
  else if (status !== "empty") { entry.tries += 1; entry.status = status; }
  entry.at = new Date().toISOString();
  save();
}

function exerciseTitle(exercise) {
  if (exercise.title) return [disp(exercise.title, "exercises"), targetLang()];
  return tl(`ex_type_${String(exercise.type || "").toLowerCase()}`);
}

function renderWorkbook(lesson, section, sectionIndex) {
  const exercises = sectionExercises(lesson, section, sectionIndex);
  if (!exercises.length) return null;
  const n = ROMAN[sectionIndex] || sectionIndex + 1;
  const id = `wb-${sectionIndex + 1}`;
  const memory = pensaStore(lesson);
  const aids = Core.lessonAidIndex(lesson);
  const block = h("section", { class: `workbook${state.oral ? " oral" : ""}`, id, "aria-labelledby": `${id}-title` },
    h("header", { class: "workbook-head" },
      h("h3", { id: `${id}-title` }, h("span", { lang: tl("workbook")[1] }, t("workbook")), ` ${n}`),
      oralToggle()),
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
    const { record, save } = workbookRecord(lesson);
    if (record.skipped[exId]) delete record.skipped[exId]; else record.skipped[exId] = new Date().toISOString();
    save();
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
    words.note_en ? h("details", { class: "nodyn" }, ui("summary", "note_en"), h("p", { lang: "en" }, words.note_en)) : null);
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
      const found = cyrillicCourse() ? latinLetters(box.value) : [];
      latin.hidden = !found.length;
      if (found.length) { const [warn, wlang] = tl("latin_warning", { chars: found.join(", ") }); latin.textContent = `⚠ ${warn}`; latin.lang = wlang; }
    };
    box.addEventListener("input", () => { saved[name] = box.value; save(); update(); terms?._redraw?.(); });
    box.addEventListener("focus", () => { state.activeField = box; });
    update();
    return { area: box, block: h("div", { class: "napishi-field" }, h("label", { for: id }, ui("span", labelKey)), box, h("div", { class: "napishi-meta" }, count), latin, h("div", { class: "accent-slot" })) };
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
          h("span", { lang: "en" }, word.current_sense || "")));
    })));
}

// ------------------------------------------------------------------ finish & Anki

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
    Core.setCompleted(safeStorage(), completedKey(), lesson.id, done);
    update(done);
    renderNav();
    if (stepperFor(lesson)) refreshStepper(lesson);
    const [text, lang] = tl(done ? "finished_announce" : "unfinished_announce", { title: lesson.title });
    toast(text, lang);
  });
  const cumulative = order > 1 ? ui("button", "anki_cumulative", { type: "button", class: "button secondary", onclick: () => downloadAnki(lesson, true) }, { n: order }) : null;
  let includeKnown = null;
  if (ruAnki()) {
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

function renderPagination(lesson) {
  const list = entries();
  const index = list.findIndex((entry) => entry.id === lesson.id);
  const previous = list.slice(0, index).reverse().find(available);
  const next = list.slice(index + 1).find(available);
  const link = (entry, key, rel) => (entry
    ? h("a", { class: `page-link ${rel}`, href: `#${encodeURIComponent(entry.id)}`, rel },
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

function ruAnki() { return Boolean(Core.ru?.isCourse?.(state.course)); }

// Known lexemes for the Russian export: baseline_path (default plan/baseline.json) plus, when
// the plan is reachable (serving the source repository), its rows marked known. The public
// bundle's baseline file already holds the merged list.
async function loadKnown() {
  if (state.known !== undefined) return state.known;
  const optional = async (file) => { try { return file ? await loadJSON(resolve(file)) : null; } catch { return null; } };
  const [baseline, plan] = await Promise.all([optional(state.course.baseline_path || "plan/baseline.json"), optional(state.course.plan_path || "plan/chapters.json")]);
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
  const extra = ruAnki() ? { known: await loadKnown(), includeKnown: setting("anki-include-known") === "1" } : {};
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
  const declared = media.audio_sources || (media.audio_manifest ? [{ id: "default", label: "Default", manifest: media.audio_manifest, default: true }] : []);
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
const audioState = { queue: [], lesson: null, active: null, button: null };

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
  setListen(false);
  audioState.button = setListen;
  listen.addEventListener("click", () => {
    if (!player.paused || audioState.queue.length) { stopAudio(); return; }
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
  if (data?.lesson) { playFile(new URL(data.lesson, lesson._audio.selected.base).href, null); audioState.button?.(true); return; }
  playSegments(segmentOrder(lesson).filter((id) => data?.segments?.[id]), lesson, true);
}

function playSegments(ids, lesson, continuous = false) {
  stopAudio();
  audioState.queue = [...ids];
  audioState.lesson = lesson;
  if (continuous) audioState.button?.(true);
  advanceQueue();
}

function advanceQueue() {
  const lesson = audioState.lesson;
  const id = audioState.queue.shift();
  if (!id || !lesson?._audio) { stopAudio(); return; }
  const file = lesson._audio.selected.data.segments?.[id];
  if (!file) { advanceQueue(); return; }
  playFile(new URL(file, lesson._audio.selected.base).href, document.getElementById(id));
}

function playFile(src, target) {
  audioState.active?.classList.remove("audio-playing");
  audioState.active = target;
  target?.classList.add("audio-playing");
  player.src = src;
  player.play().catch(() => advanceQueue());
}

function stopAudio() {
  audioState.queue = [];
  player.pause();
  audioState.active?.classList.remove("audio-playing");
  audioState.active = null;
  audioState.button?.(false);
}
player?.addEventListener("ended", () => { audioState.active?.classList.remove("audio-playing"); if (audioState.queue.length) advanceQueue(); else stopAudio(); });
player?.addEventListener("error", () => { if (audioState.queue.length) advanceQueue(); else stopAudio(); });

// ------------------------------------------------------------------ navigation drawer

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
  state.english = store("english-chrome") === "1";
  try {
    state.course = await loadJSON(new URL("course.json", state.baseUrl).href);
  } catch (error) { showError(error); return; }
  if (state.course.id && (state.index?.courses || []).some((course) => course.id === state.course.id)) store("last-course", state.course.id);
  state.notesHidden = setting("notes-hidden", "notes-hidden") === "1";
  state.oral = setting("oral", "pensa-oral") === "1";
  state.english = setting("english", "english-chrome") === "1";
  applyChrome();
  await route();
}

function boot() {
  $("#nav-toggle").addEventListener("click", () => {
    if ($("#course-nav").classList.contains("open")) closeNav(true); else openNav();
  });
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
    $("#english-toggle").focus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("#course-nav").classList.contains("open")) { event.preventDefault(); closeNav(true); }
  });
  $("#lightbox").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  window.addEventListener("hashchange", () => {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (document.getElementById(hash)?.classList.contains("seg")) return;
    if (state.course) route();
  });
  window.addEventListener("resize", scheduleAlign);
  document.fonts?.ready?.then(scheduleAlign);
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
  stripStress, latinLetters, formsTable, lexemeFormsIndex, containsLexeme, commonPrefix,
  knownList, isWorkbookExercise, isNapishi, sectionExercises, napishiOf, buildSteps, nextStep, addTime, timingExport, STEP_KINDS,
  UI_DEFAULTS
};
if (typeof document !== "undefined" && document.getElementById?.("main")) boot();
