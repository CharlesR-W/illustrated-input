"use strict";

// Test page for the Ancient Greek placement diagnostic. Loads the item bank
// (content/grc/diagnostic/stage-1.json, or ?bank=<path from the site root>), runs intake →
// practice → core sections → submit → results/export → optional modules. Everything is
// autosaved to localStorage when available. Design: docs/greek-diagnostic-spec.md.
(function main() {
  const G = window.GreekInput;
  const C = window.GrcDiagnosticCore;
  let language = document.body.dataset.language || "grc";
  const languageName = () => language === "ru" ? "Russian" : "Greek";
  let STATE_FORMAT = `${language}-diagnostic-state/1`;
  const DEFAULT_BANK = document.body.dataset.bank || "content/grc/diagnostic/stage-1.json";
  const MAX_SPANS = 5;
  const MAX_GLOSSES = 3;

  let bank = null;
  let bankRel = DEFAULT_BANK;
  let storageKey = "";
  let plan = null;
  let state = null;
  let visit = null;
  let ticker = null;
  let pausedClosedMs = 0;

  const $ = (selector, root = document) => root.querySelector(selector);
  const iso = () => new Date().toISOString();

  // ------------------------------------------------------------------ DOM helper

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    const props = {};
    for (const [key, value] of Object.entries(attrs ?? {})) {
      if (value == null || value === false) continue;
      if (key === "class") el.className = value;
      else if (key === "text") el.textContent = value;
      else if (key === "value" || key === "checked") props[key] = value;
      else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of children.flat(Infinity)) {
      if (child == null || child === false) continue;
      el.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    Object.assign(el, props);
    return el;
  }

  const greek = (text, tag = "span", cls = "greek") => h(tag, { class: cls, lang: language }, text);

  function marked(text, tag = "p", cls = "dx-greek") {
    return h(tag, { class: cls, lang: language }, C.parseMarked(text).map((seg) => (seg.mark ? h("u", { class: "dx-marked" }, seg.text) : seg.text)));
  }

  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("is-visible");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("is-visible"), 2600);
  }

  function fmtMs(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }

  // -------------------------------------------------------------- state, storage

  function freshState() {
    return {
      format: STATE_FORMAT,
      bank: { id: bank.id, version: bank.version, url: bankRel },
      started_at: null, updated_at: null,
      intake: null,
      view: "test",
      cursor: { section: plan.sections[0].id, screen: 0 },
      done_sections: [],
      responses: {}, timers: {}, passages: {}, pauses: [],
      retry: { spans: [], pending: null },
      practice: { responses: {}, checked: {} },
      submitted: {}, modules: {}
    };
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(storageKey);
      const saved = raw ? JSON.parse(raw) : null;
      return saved?.format === STATE_FORMAT ? saved : null;
    } catch { return null; }
  }

  function save() {
    if (!state) return;
    flushVisit();
    state.updated_at = iso();
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* the page works without storage */ }
  }

  function clearSaved() {
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------ clock and pauses

  const openPause = () => { const last = state.pauses[state.pauses.length - 1]; return last && !last.end ? last : null; };

  function recomputePaused() {
    pausedClosedMs = state.pauses.reduce((sum, p) => sum + (p.end ? Date.parse(p.end) - Date.parse(p.start) : 0), 0);
  }

  // Milliseconds that exclude pauses; only differences within one page session are used.
  function activeNow() {
    const open = openPause();
    return Date.now() - pausedClosedMs - (open ? Date.now() - Date.parse(open.start) : 0);
  }

  function beginVisit(key) {
    if (visit?.key === key) return;
    endVisit();
    const timer = state.timers[key] ??= { ms: 0, visits: 0, first_shown_at: iso() };
    timer.visits += 1;
    visit = { key, start: activeNow() };
  }

  function flushVisit() {
    if (!visit) return;
    const now = activeNow();
    state.timers[visit.key].ms += now - visit.start;
    visit.start = now;
  }

  function endVisit() { flushVisit(); visit = null; }

  function noteInput(key) {
    const timer = state.timers[key];
    if (!timer || visit?.key !== key) return;
    flushVisit();
    const at = Math.round(timer.ms);
    timer.first_input_ms ??= at;
    timer.last_input_ms = at;
  }

  function setPaused(paused, reason = "manual") {
    const open = openPause();
    if (paused && !open) {
      flushVisit();
      state.pauses.push({ start: iso(), end: null, reason, where: screenKey() });
    } else if (!paused && open) {
      open.end = iso();
      recomputePaused();
    } else return;
    syncPauseUi();
    save();
  }

  function syncPauseUi() {
    const paused = Boolean(openPause());
    $("#pause-toggle").setAttribute("aria-pressed", String(paused));
    $("#pause-toggle").textContent = paused ? "Paused" : "Pause";
    $("#pause-overlay").hidden = !paused;
    if (paused) $("#resume").focus();
  }

  // ------------------------------------------------------------- plan and screens

  const section = (id) => plan.sections.find((s) => s.id === id);
  const coreSections = () => plan.sections.filter((s) => !s.optional);
  const optionalSections = () => plan.sections.filter((s) => s.optional);
  const item = (id) => bank.items[id];

  function replan() { plan = C.planBank(bank, state?.intake); }

  // A section becomes a list of screens. Passages get a timed reading screen and a
  // self-rating screen; below 50% only gist questions follow, then a stop/continue choice.
  function screensFor(sec) {
    if (sec.kind === "intake") return [{ type: "intake", key: "intake" }, { type: "practice", key: "practice" }];
    if (sec.kind === "retry") return [{ type: "retry", key: "retry" }];
    const screens = [];
    const handled = new Set();
    for (const id of sec.items) {
      if (handled.has(id) || !item(id)) continue;
      const it = item(id);
      if (it.kind !== "passage") { screens.push({ type: "item", key: id, id }); continue; }
      screens.push({ type: "read", key: `read:${id}`, passage: id }, { type: "rate", key: `rate:${id}`, passage: id });
      const questions = sec.items.filter((q) => item(q)?.passage === id);
      questions.forEach((q) => handled.add(q));
      const info = state.passages[id] ?? {};
      if (info.self_rating != null && info.self_rating < 50) {
        const gist = questions.filter((q) => item(q).gist);
        const rest = questions.filter((q) => !item(q).gist);
        gist.forEach((q) => screens.push({ type: "item", key: q, id: q }));
        if (rest.length) {
          screens.push({ type: "lowchoice", key: `low:${id}`, passage: id, rest });
          if (info.low_choice === "continue") rest.forEach((q) => screens.push({ type: "item", key: q, id: q }));
        }
      } else {
        questions.forEach((q) => screens.push({ type: "item", key: q, id: q }));
      }
    }
    return screens;
  }

  function screenKey() {
    if (state.view !== "test") return state.view;
    const sec = section(state.cursor.section);
    const screens = sec ? screensFor(sec) : [];
    return `${state.cursor.section}/${screens[state.cursor.screen]?.key ?? "?"}`;
  }

  function isAnswered(id) {
    const r = state.responses[id];
    if (!r) return false;
    switch (item(id).kind) {
      case "mc": case "vocab": return r.choice != null || Boolean(r.dont_know);
      case "span": return r.selection?.from != null;
      default: return Boolean(C.normaliseResponse(language === "ru" ? r.text : G.transliterate(r.text ?? ""), language));
    }
  }

  const questionIds = (sec) => (sec.items ?? []).filter((id) => item(id) && item(id).kind !== "passage");

  // ------------------------------------------------------------------- render

  function render({ focus = false } = {}) {
    const focusKey = document.activeElement?.dataset?.fk;
    const scrollY = window.scrollY;
    const panelScroll = $(".dx-passage")?.scrollTop ?? 0;
    clearInterval(ticker);
    renderProgress();
    const host = $("#screen");
    host.replaceChildren();
    if (state.view === "results") { endVisit(); host.append(renderResults()); }
    else if (state.view === "submit") { endVisit(); host.append(renderSubmit()); }
    else host.append(renderTestScreen());
    syncPauseUi();
    save();
    if (focus) {
      window.scrollTo(0, 0);
      $(".dx-title", host)?.focus({ preventScroll: true });
    } else {
      window.scrollTo(0, scrollY);
      const panel = $(".dx-passage");
      if (panel) panel.scrollTop = panelScroll;
      if (focusKey) $(`[data-fk="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
    }
  }

  function renderProgress() {
    const nav = $("#progress");
    nav.hidden = false;
    const list = h("ol", { class: "dx-steps" });
    const done = new Set(state.done_sections);
    const shown = [...coreSections(), ...optionalSections().filter((s) => state.modules[s.id] || state.submitted[s.id])];
    for (const sec of shown) {
      const current = state.view === "test" && state.cursor.section === sec.id;
      const qs = questionIds(sec);
      const count = sec.kind === "items" ? `${qs.filter(isAnswered).length}/${qs.length}` : sec.kind === "retry" ? `${state.retry.spans.length}/${MAX_SPANS}` : "";
      list.append(h("li", { class: `dx-step${done.has(sec.id) ? " is-done" : ""}${current ? " is-current" : ""}`, "aria-current": current ? "step" : null },
        h("b", {}, sec.title), count ? h("small", {}, count) : null));
    }
    if (state.view !== "test") list.append(h("li", { class: `dx-step${state.submitted.core ? " is-done" : " is-current"}` }, h("b", {}, state.submitted.core ? "Results" : "Submit")));
    nav.replaceChildren(list);
    const current = list.querySelector(".is-current");
    if (current && list.scrollWidth > list.clientWidth) list.scrollLeft = current.offsetLeft - list.offsetLeft - 16;
    if (state.view === "test") {
      const sec = section(state.cursor.section);
      const screens = screensFor(sec);
      const pct = Math.round(((state.cursor.screen + 1) / screens.length) * 100);
      nav.append(
        h("div", { class: "dx-bar", role: "progressbar", "aria-label": `${sec.title} progress`, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": pct }, h("span", { style: `width:${pct}%` })),
        h("p", { class: "dx-bar-label" }, `${sec.title}: step ${state.cursor.screen + 1} of ${screens.length}`)
      );
    }
  }

  function go(sectionId, screen) {
    endVisit();
    $("#notice").hidden = true;
    state.cursor = { section: sectionId, screen };
    render({ focus: true });
  }

  function finishSection(sec) {
    endVisit();
    if (!state.done_sections.includes(sec.id)) state.done_sections.push(sec.id);
    if (sec.optional) {
      state.submitted[sec.id] = iso();
      state.modules[sec.id] = "submitted";
      state.view = "results";
      render({ focus: true });
      return;
    }
    const next = coreSections().find((s) => !state.done_sections.includes(s.id));
    if (next) go(next.id, 0);
    else { state.view = "submit"; render({ focus: true }); }
  }

  // Shared bottom navigation. `next` = { label, enabled, onClick, hint }.
  function navBar(sec, screens, index, next = {}) {
    const last = index === screens.length - 1;
    const label = next.label ?? (last ? (sec.optional ? "Finish and submit module" : "Finish section") : "Next");
    const nextButton = h("button", {
      class: "button primary", type: "button", id: "next", disabled: next.enabled === false,
      onclick: () => {
        if (screens[index]?.type === "item" && C.shouldStopSection(bank, sec,
          screens.slice(0, index + 1).filter((s) => s.type === "item").map((s) => s.id), state.responses)) {
          const completed = new Set(screens.slice(0, index + 1).filter((s) => s.type === "item").map((s) => s.id));
          state.not_reached = [...new Set([...(state.not_reached ?? []), ...questionIds(sec).filter((id) => !completed.has(id))])];
          finishSection(sec);
          toast("Section ended after consecutive blank or unknown answers.");
          return;
        }
        if (next.onClick) next.onClick(); else if (last) finishSection(sec); else go(sec.id, index + 1); }
    }, label);
    const back = index > 0
      ? h("button", { class: "button quiet", type: "button", id: "back", onclick: () => go(sec.id, index - 1) }, "Back") : null;
    const hint = next.hint ?? (last && sec.kind !== "intake" ? "Finishing a section locks its answers." : "");
    return h("div", { class: "dx-nav" },
      h("p", { class: "dx-hint" }, hint, hint ? " " : "", h("kbd", {}, "Ctrl"), "+", h("kbd", {}, "Enter"), " = next"),
      h("div", { class: "dx-row" }, back, nextButton));
  }

  function renderTestScreen() {
    let sec = section(state.cursor.section);
    if (!sec) { sec = coreSections()[0]; state.cursor = { section: sec.id, screen: 0 }; }
    const screens = screensFor(sec);
    const index = Math.min(Math.max(0, state.cursor.screen), screens.length - 1);
    state.cursor.screen = index;
    const screen = screens[index];
    switch (screen.type) {
      case "intake": return renderIntake(sec, screens, index);
      case "practice": return renderPractice(sec, screens, index);
      case "read": return renderRead(sec, screens, index, screen.passage);
      case "rate": return renderRate(sec, screens, index, screen.passage);
      case "lowchoice": return renderLowChoice(sec, screens, index, screen);
      case "retry": return renderRetry(sec, screens, index);
      default: return renderItemScreen(sec, screens, index, screen.id);
    }
  }

  function screenShell(sec, title, { eyebrow, lede, wide } = {}) {
    return h("section", { class: `dx-screen${wide ? " is-wide" : ""}`, "aria-labelledby": "screen-title" },
      h("p", { class: "dx-eyebrow" }, eyebrow ?? sec.title),
      h("h1", { class: "dx-title", id: "screen-title", tabindex: "-1" }, title),
      lede ? h("p", { class: "dx-lede" }, lede) : null,
      sec.intro_en && state.view === "test" && state.cursor.screen === 0 ? h("p", { class: "dx-notice" }, sec.intro_en) : null);
  }

  // ------------------------------------------------------------------- intake

  function renderIntake(sec, screens, index) {
    const intake = state.intake ?? {};
    const shell = screenShell(sec, "Before you start", {
      lede: language === "ru" ? "A few questions about what you have read. About 15 minutes of reading plus an optional 8 minutes of vocabulary and production. You can return later; answers save in this browser." : "A few questions about what you have read, so the test can avoid passages you already know. About 35 minutes in all; you can stop at the end of any section and come back — everything saves in this browser."
    });
    const read = new Set(intake.texts_read ?? []);
    const form = h("form", { class: "dx-card", id: "intake-form", onsubmit: (e) => { e.preventDefault(); submit(); } },
      language === "ru" ? null : h("label", { class: "dx-field" }, h("span", {}, "Last Athenaze chapter you finished"),
        h("input", { class: "dx-input", id: "intake-chapter", name: "chapter", inputmode: "numeric", autocomplete: "off", value: intake.last_athenaze_chapter ?? "", style: "max-width:10rem" })),
      h("fieldset", { class: "dx-field" }, h("legend", {}, `Texts you have already read in ${languageName()}`),
        h("div", { class: "dx-checks" }, (bank.intake.texts_read ?? []).map((text, i) =>
          h("label", { class: "dx-check" }, h("input", { type: "checkbox", name: "texts", value: text, id: `intake-text-${i}`, checked: read.has(text) }), text)))),
      h("label", { class: "dx-field" }, h("span", {}, "Anything else you have read ", h("small", {}, "(optional)")),
        h("input", { class: "dx-input", id: "intake-other", value: intake.other_texts ?? "", autocomplete: "off" })),
      h("label", { class: "dx-field" }, h("span", {}, "Features that feel sticky ", h("small", {}, "(free text: forms, constructions, anything)")),
        h("textarea", { class: "dx-textarea", id: "intake-sticky", value: intake.sticky_features ?? "" })),
      h("label", { class: "dx-field" }, h("span", {}, "Anything else I should know ", h("small", {}, "(optional)")),
        h("textarea", { class: "dx-textarea", id: "intake-notes", value: intake.notes ?? "", style: "min-height:4rem" })));
    function submit() {
      const fd = new FormData(form);
      state.intake = {
        ...(language === "ru" ? {} : { last_athenaze_chapter: $("#intake-chapter").value.trim() }),
        texts_read: fd.getAll("texts"),
        other_texts: $("#intake-other").value.trim(),
        sticky_features: $("#intake-sticky").value.trim(),
        notes: $("#intake-notes").value.trim(),
        submitted_at: iso()
      };
      state.started_at ??= iso();
      replan();
      go(sec.id, index + 1);
      if (plan.fallbacks_applied.some((f) => f.familiarity_affected)) {
        showNotice([h("span", {}, "The alternative passage is also from a text you have read. Its results are marked familiarity-affected and do not independently establish your level on unfamiliar prose.")]);
      } else if (plan.fallbacks_applied.length) {
        showNotice([h("span", {}, "Swapped to the alternative passage. Familiarity will be recorded in the report.")]);
      }
    }
    if (language === "ru") shell.append(keyHelp(false));
    shell.append(form, navBar(sec, screens, index, { label: "Continue to practice", onClick: submit, hint: "" }));
    return shell;
  }

  // ----------------------------------------------------------------- practice

  function keyHelp(open = false) {
    if (language === "ru") return h("details", { class: "dx-keyhelp", open },
      h("summary", {}, "How to type Russian"),
      h("p", { class: "dx-cue" }, "Type Latin phonetic letters or Cyrillic. The preview shows your Russian answer. Stress is optional; е and ё score alike."),
      h("div", { class: "dx-keytable" }, Object.entries(window.RussianInput.LATIN)
        .filter(([key]) => key !== "|")
        .map(([latin, ru]) => h("span", {}, h("kbd", {}, latin), " ", greek(ru)))),
      h("p", { class: "dx-cue" }, "Longer combinations win. Use | to separate letters: s|h → сх, c|h → цх, e|' → еь. e/ye → е; e'/eh → э; y → ы; j → й; w → щ. Capitals work too."));
    const pairs = Object.entries(G.LATIN).map(([latin, gr]) => h("span", {}, h("kbd", {}, latin), " ", greek(gr)));
    const marks = [["(", "rough ἁ"], [")", "smooth ἀ"], ["/", "acute ά"], ["\\", "grave ὰ"], ["=", "circumflex ᾶ"], ["|", "iota sub. ᾳ"], ["+", "diaeresis ϊ"]];
    return h("details", { class: "dx-keyhelp", open },
      h("summary", {}, "How to type Greek"),
      h("p", { class: "dx-cue" }, "Type Greek directly, or Latin letters (shown live in Greek below the box). Accents and breathings are optional; final ς is automatic."),
      h("div", { class: "dx-keytable" }, pairs),
      h("p", { class: "dx-cue" }, "Optional marks after the letter: ", marks.map(([k, label], i) => [i ? " · " : "", h("kbd", {}, k), " ", label]), ". Example: ", h("kbd", {}, "h)=lqon"), " → ", greek("ἦλθον"), "."));
  }

  function renderPractice(sec, screens, index) {
    const shell = screenShell(sec, "Practice", {
      lede: "One of each kind of question, untimed and never scored. Try each one and press Check to see how it works. Nothing here counts."
    });
    shell.append(keyHelp(true));
    const practice = C.resolvePractice(bank);
    const passages = practice.filter((p) => p.kind === "passage");
    const findPassage = (id) => passages.find((p) => p.id === id) ?? item(id);
    for (const it of practice) {
      if (it.kind === "passage") continue;
      const store = state.practice.responses[it.id] ??= {};
      const card = h("div", { class: "dx-question", style: "margin-top:1rem" });
      const feedback = h("div", { class: "dx-feedback", hidden: true, role: "status" });
      const ctx = { practice: true, response: store, passage: it.passage ? findPassage(it.passage) : null, onChange: () => save(), rerender: () => render() };
      if (ctx.passage && (it.kind === "span" || it.kind === "write")) card.append(passageView(ctx.passage, it.kind === "span" ? { select: store, onSelect: (sel) => { store.selection = sel; render(); } } : {}));
      card.append(...[questionBody(it, ctx)].flat(Infinity).filter(Boolean));
      const check = h("button", { class: "small-button", type: "button", onclick: () => { state.practice.checked[it.id] = true; showFeedback(); save(); } }, "Check");
      function showFeedback() {
        if (!state.practice.checked[it.id]) return;
        const res = practiceVerdict(it, store, ctx.passage);
        feedback.hidden = false;
        feedback.className = `dx-feedback ${res.good === true ? "is-good" : res.good === false ? "is-bad" : ""}`;
        feedback.replaceChildren(...res.nodes);
      }
      showFeedback();
      card.append(h("div", { class: "dx-row", style: "margin-top:.6rem" }, check), feedback);
      shell.append(card);
    }
    shell.append(navBar(sec, screens, index, { label: "Start the test" }));
    return shell;
  }

  function practiceVerdict(it, store, passage) {
    if (it.kind === "mc" || it.kind === "vocab") {
      const ok = store.choice === it.answer;
      return { good: store.choice == null ? null : ok, nodes: [store.choice == null ? "Choose an option first. " : ok ? "Right. " : "Not quite. ", `Answer: ${it.options[it.answer]}.`, it.why?.[it.answer] ? ` ${it.why[it.answer]}` : ""] };
    }
    if (it.kind === "span") {
      const res = C.scoreSpan(it, passage, store.selection);
      const key = C.describeSelection(passage, { from: C.flatIndex(passage, it.answer.sentence, it.answer.start), to: C.flatIndex(passage, it.answer.sentence, it.answer.end) });
      return { good: res.status === "omitted" ? null : res.status === "correct", nodes: [res.status === "omitted" ? "Select some words first. " : `${Math.round(res.overlap * 100)}% overlap. `, "Key: ", greek(key?.greek ?? "")] };
    }
    if (it.kind === "cloze") {
      const res = C.scoreCloze(it, store.text, language);
      const words = { correct: "Right.", wrong: "Not the expected form.", not_assessable: "Without accents this could be another form, so it would count as not assessable.", review: "This would go to review.", omitted: "Type an answer first." };
      return { good: res.status === "correct" ? true : res.status === "wrong" ? false : null, nodes: [words[res.status] ?? res.status, res.label ? ` (${res.label})` : "", " Accepted: ", greek(it.accepted.join(", ")), "."] };
    }
    if (it.kind === "write") {
      return { good: null, nodes: ["Written answers are read by Claude afterwards. A model answer: ", greek((it.model_answers ?? [])[0] ?? "—"), "."] };
    }
    return { good: null, nodes: [] };
  }

  // ----------------------------------------------------------------- passages

  // opts.select: the response-like object holding .selection; opts.onSelect(sel).
  // opts.marks: Set of flat indices to tint (retry spans). opts.reference: smaller panel.
  function passageView(passage, opts = {}) {
    const selectable = Boolean(opts.onSelect);
    const sel = opts.select?.selection;
    const lo = sel?.from != null ? Math.min(sel.from, sel.to) : -1;
    const hi = sel?.from != null ? Math.max(sel.from, sel.to) : -2;
    let flat = 0;
    const body = h(passage.verse ? "div" : "p", { class: passage.verse ? "dx-verse" : "dx-prose", lang: language });
    passage.sentences.forEach((sentence, si) => {
      const span = h("span", { class: "dx-sentence", "data-sentence": sentence.id });
      sentence.tokens.forEach((token, ti) => {
        const i = flat++;
        const cls = `dx-tok${i >= lo && i <= hi ? " is-selected" : ""}${sel?.open && i === sel.from ? " is-anchor" : ""}${opts.marks?.has(i) ? " is-marked" : ""}`;
        if (ti) span.append(" ");
        if (selectable) {
          span.append(h("button", {
            type: "button", class: cls, "data-fk": `tok-${passage.id}-${i}`, "aria-pressed": String(i >= lo && i <= hi),
            onclick: (e) => opts.onSelect(nextSelection(sel, i, e.shiftKey))
          }, token.t));
        } else span.append(h("span", { class: cls }, token.t));
      });
      if (si < passage.sentences.length - 1 && !passage.verse) body.append(span, " ");
      else body.append(span);
    });
    const panel = h("div", { class: `dx-passage${opts.reference ? " is-reference" : ""}` },
      h("p", { class: "dx-passage-label" }, passage.label),
      passage.context_en ? h("p", { class: "dx-context" }, passage.context_en) : null,
      body,
      passage.word_help?.length ? h("dl", { class: "dx-word-help", "aria-label": "Word help" },
        passage.word_help.map((w) => h("div", {}, h("dt", { lang: language }, w.greek), h("dd", {}, w.en)))) : null);
    if (selectable) {
      const current = C.describeSelection(passage, sel);
      panel.append(h("p", { class: "dx-selection", "aria-live": "polite" },
        current ? ["Selected: ", greek(current.greek), " "] : "Tap the first word, then the last word of the span. Shift-click extends.",
        current ? h("button", { class: "small-button", type: "button", onclick: () => opts.onSelect(null) }, "Clear") : null));
    }
    return panel;
  }

  // First tap anchors a one-word span; the next tap (or any shift-tap) extends it from the
  // anchor; a tap after that starts again.
  function nextSelection(current, i, extend) {
    if (current?.from != null && (current.open || extend)) return { from: current.from, to: i, open: false };
    return { from: i, to: i, open: true };
  }

  function renderRead(sec, screens, index, pid) {
    const passage = item(pid);
    const info = state.passages[pid] ??= {};
    const shell = screenShell(sec, passage.label, { lede: passage.context_en });
    const started = Boolean(info.reading_started_at);
    const finished = Boolean(info.reading_finished_at);
    const timerKey = `read:${pid}`;
    if (!started) {
      shell.append(h("div", { class: "dx-blank" }, h("div", {},
        h("p", {}, "Read the passage through once at your normal pace. The reading timer runs until you press ", h("strong", {}, "Finished reading"), ". You can reread it while answering the questions."),
        h("button", { class: "button primary", type: "button", id: "start-reading", onclick: () => { info.reading_started_at = iso(); render(); $("#finish-reading")?.focus(); } }, "Start reading"))));
    } else {
      if (!finished) beginVisit(timerKey);
      const clock = h("span", { class: "dx-timer", id: "reading-clock" });
      const tick = () => { flushVisit(); clock.textContent = fmtMs(state.timers[timerKey]?.ms ?? 0); };
      tick();
      if (!finished) ticker = setInterval(tick, 1000);
      shell.append(passageView(passage), h("div", { class: "dx-row", style: "margin-top:.8rem" },
        h("span", {}, finished ? "Reading time " : "Reading… ", clock),
        finished ? null : h("button", { class: "button secondary", type: "button", id: "finish-reading", onclick: () => { endVisit(); info.reading_finished_at = iso(); render(); $("#next")?.focus(); } }, "Finished reading")));
    }
    shell.append(navBar(sec, screens, index, { enabled: finished, hint: finished ? "" : "Next unlocks when you finish reading." }));
    return shell;
  }

  function renderRate(sec, screens, index, pid) {
    const passage = item(pid);
    const info = state.passages[pid] ??= {};
    const locked = Boolean(info.rated_at);
    const shell = screenShell(sec, "How much did you understand?", { lede: "A rough sense is fine. The passage stays visible." });
    const value = h("output", { class: "dx-slider-value", id: "rating-value" }, info.self_rating != null ? `${info.self_rating}%` : "—");
    const slider = h("input", {
      type: "range", class: "dx-slider", id: "rating", min: 0, max: 100, step: 5, value: info.self_rating ?? 50, disabled: locked,
      "aria-label": "Self-rated understanding, percent", "aria-valuetext": info.self_rating != null ? `${info.self_rating}%` : "not set",
      oninput: () => {
        info.self_rating = Number(slider.value);
        value.textContent = `${info.self_rating}%`;
        slider.setAttribute("aria-valuetext", `${info.self_rating}%`);
        $("#next").disabled = false;
        save();
      }
    });
    shell.append(h("div", { class: "dx-split" },
      passageView(passage, { reference: true }),
      h("div", { class: "dx-question" },
        h("p", { class: "dx-prompt" }, "Move the slider: how much of the passage did you follow?"),
        value, slider, h("div", { class: "dx-scale", "aria-hidden": "true" }, h("span", {}, "0%"), h("span", {}, "50%"), h("span", {}, "100%")),
        locked ? h("p", { class: "dx-cue" }, "Rating recorded.") : null)));
    shell.append(navBar(sec, screens, index, {
      enabled: info.self_rating != null,
      onClick: () => {
        if (!info.rated_at) info.rated_at = iso();
        go(sec.id, index + 1);
      },
      hint: locked ? "" : "Your rating is fixed once you go on."
    }));
    return shell;
  }

  function renderLowChoice(sec, screens, index, screen) {
    const info = state.passages[screen.passage];
    const shell = screenShell(sec, "Stop here, or keep going?", {
      lede: `You rated this passage below 50%. That is useful information in itself. You can skip the remaining ${screen.rest.length} question${screen.rest.length === 1 ? "" : "s"} on it, or try them.`
    });
    const choose = (choice) => {
      info.low_choice = choice;
      info.low_choice_at = iso();
      const after = screensFor(sec);
      if (index === after.length - 1) finishSection(sec); else go(sec.id, index + 1);
    };
    shell.append(h("div", { class: "dx-row" },
      h("button", { class: `button ${info.low_choice === "continue" ? "primary" : "secondary"}`, type: "button", id: "low-continue", disabled: Boolean(info.low_choice), onclick: () => choose("continue") }, "Try the remaining questions"),
      h("button", { class: `button ${info.low_choice === "skip" ? "primary" : "secondary"}`, type: "button", id: "low-skip", disabled: Boolean(info.low_choice), onclick: () => choose("skip") }, "Skip them")));
    if (info.low_choice) shell.append(h("p", { class: "dx-cue" }, info.low_choice === "skip" ? "You skipped the rest of this passage." : "You chose to continue."));
    shell.append(navBar(sec, screens, index, { enabled: Boolean(info.low_choice) }));
    return shell;
  }

  // -------------------------------------------------------------- item screens

  function renderItemScreen(sec, screens, index, id) {
    const it = item(id);
    beginVisit(id);
    const response = state.responses[id] ??= {};
    const passage = it.passage ? item(it.passage) : null;
    const titles = { mc: it.greek ? "Read the sentence" : "Question", span: `Point to the ${languageName()}`, cloze: "Fill the gap", vocab: "What does the word mean here?", write: `Write in ${languageName()}` };
    const qNumber = questionIds(sec).indexOf(id) + 1;
    const shell = screenShell(sec, titles[it.kind] ?? "Question", { eyebrow: `${sec.title} · ${qNumber} of ${questionIds(sec).length}`, wide: Boolean(passage) });
    const ctx = {
      practice: false, response, passage,
      onChange: () => { noteInput(id); save(); renderProgress(); },
      rerender: () => render()
    };
    const card = h("div", { class: "dx-question" }, questionBody(it, ctx));
    if (passage) {
      const panel = it.kind === "span"
        ? passageView(passage, { select: response, onSelect: (sel) => { response.selection = sel; noteInput(id); render(); } })
        : passageView(passage, { reference: true });
      shell.append(h("div", { class: "dx-split" }, panel, card));
    } else shell.append(card);
    shell.append(navBar(sec, screens, index));
    return shell;
  }

  function questionBody(it, ctx) {
    switch (it.kind) {
      case "mc": return mcBody(it, ctx);
      case "vocab": return vocabBody(it, ctx);
      case "span": return spanBody(it, ctx);
      case "cloze": return clozeBody(it, ctx);
      case "write": return writeBody(it, ctx);
      default: return h("p", {}, `Unknown item kind ${it.kind}`);
    }
  }

  function optionList(it, ctx, name) {
    const r = ctx.response;
    return h("div", { class: "dx-options", role: "radiogroup", "aria-labelledby": `${name}-prompt` },
      C.displayOrder(it).map((i, pos) => h("label", { class: "dx-option" },
        h("input", {
          type: "radio", name, value: i, checked: r.choice === i, "data-fk": `${name}-opt-${i}`, "data-option": pos,
          onchange: () => { if (r.choice != null && r.choice !== i) r.changes = (r.changes ?? 0) + 1; r.choice = i; r.dont_know = false; ctx.onChange(); }
        }),
        h("span", { class: "dx-key", "aria-hidden": "true" }, String(pos + 1)),
        h("span", {}, it.options[i]))));
  }

  function mcBody(it, ctx) {
    const name = `${ctx.practice ? "practice-" : ""}${it.id}`;
    const r = ctx.response;
    const nodes = [];
    if (it.greek) nodes.push(marked(it.greek));
    nodes.push(h("p", { class: "dx-prompt", id: `${name}-prompt` }, it.prompt_en), optionList(it, ctx, name));
    if (!ctx.practice) nodes.push(h("button", {
      class: "small-button", type: "button", "aria-pressed": String(Boolean(r.dont_know)),
      onclick: () => { r.choice = null; r.dont_know = !r.dont_know; ctx.onChange(); ctx.rerender(); }
    }, "I don’t know — leave blank"));
    return nodes;
  }

  function vocabBody(it, ctx) {
    const name = `${ctx.practice ? "practice-" : ""}${it.id}`;
    const r = ctx.response;
    const conf = [["sure", "Sure"], ["guess", "Guess"], ["unknown", "Don’t know the word"]];
    return [
      marked(it.greek),
      h("p", { class: "dx-prompt", id: `${name}-prompt` }, "What does the underlined word mean here?"),
      optionList(it, ctx, name),
      h("fieldset", { class: "dx-confidence" }, h("legend", {}, "How confident are you?"),
        conf.map(([value, label]) => h("label", { class: "dx-option" },
          h("input", { type: "radio", name: `${name}-confidence`, value, checked: r.confidence === value, "data-confidence": value, "data-fk": `${name}-conf-${value}`,
            onchange: () => { r.confidence = value; ctx.onChange(); } }),
          h("span", {}, label))))
    ];
  }

  function spanBody(it, ctx) {
    return [
      h("p", { class: "dx-prompt" }, it.prompt_en),
      h("p", { class: "dx-cue" }, ctx.practice ? "Select the words in the passage above." : "Select the words in the passage: tap the first word, then the last.")
    ];
  }

  function greekPreview(input, multiline) {
    const out = h("output", { lang: language });
    const update = () => { out.textContent = (language === "ru" ? window.RussianInput : G).transliterate(input.value); };
    input.addEventListener("input", update);
    update();
    return h("p", { class: "dx-preview" }, language === "ru" ? "Cyrillic: " : "Greek: ", out);
  }

  function clozeBody(it, ctx) {
    const r = ctx.response;
    const [before, after] = C.splitGap(it.greek);
    const name = `${ctx.practice ? "practice-" : ""}${it.id}`;
    const input = h("input", {
      type: "text", lang: language, id: `${name}-input`, "data-fk": `${name}-input`, autocomplete: "off", autocapitalize: "off", spellcheck: "false",
      "aria-label": "Your answer for the gap", value: r.text ?? "",
      oninput: () => { r.text = input.value; ctx.onChange(); }
    });
    const cue = it.subtype === "meaning"
      ? ["(", greek(it.lemma), " · meaning: ", it.meaning_en, ")"]
      : ["(", greek(it.lemma), " · ", it.target_en, ")"];
    return [
      h("p", { class: "dx-cloze", lang: language }, before, input, after),
      h("p", { class: "dx-cue" }, cue),
      greekPreview(input, false),
      ctx.practice ? null : keyHelp(false)
    ];
  }

  function writeBody(it, ctx) {
    const r = ctx.response;
    const name = `${ctx.practice ? "practice-" : ""}${it.id}`;
    const area = h("textarea", {
      class: "dx-textarea greek", lang: language, id: `${name}-input`, "data-fk": `${name}-input`, spellcheck: "false", autocapitalize: "off", "aria-label": `Your ${languageName()}`, value: r.text ?? "",
      oninput: () => { r.text = area.value; ctx.onChange(); }
    });
    return [
      h("p", { class: "dx-prompt" }, it.prompt_en),
      it.givens?.length ? h("ol", { class: "dx-givens", lang: language }, it.givens.map((g) => h("li", {}, g))) : null,
      area,
      greekPreview(area, true),
      ctx.practice ? null : keyHelp(false)
    ];
  }

  // -------------------------------------------------------------------- retry

  function renderRetry(sec, screens, index) {
    const retry = state.retry;
    const shell = screenShell(sec, "Where did you get stuck?", {
      wide: true,
      lede: `Mark up to ${MAX_SPANS} places in these passages where your reading stopped. For each, say what you think it means (“no idea” is fine), then take help in stages: glosses, a structure cue, and finally the translation.`
    });
    const busy = retry.spans.find((s) => s.stage !== "done");
    const canMark = !busy && retry.spans.length < MAX_SPANS;
    const marks = {};
    for (const span of retry.spans) {
      const lo = Math.min(span.selection.from, span.selection.to);
      const hi = Math.max(span.selection.from, span.selection.to);
      const set = marks[span.passage] ??= new Set();
      for (let i = lo; i <= hi; i++) set.add(i);
    }
    const passagesBox = h("div", { class: "dx-retry-passages" });
    for (const pid of sec.passages) {
      const passage = item(pid);
      const pending = retry.pending?.passage === pid ? { selection: retry.pending.selection } : {};
      passagesBox.append(passageView(passage, {
        marks: marks[pid],
        select: pending,
        onSelect: canMark ? (sel) => { retry.pending = sel ? { passage: pid, selection: sel } : null; render(); } : null
      }));
    }
    shell.append(passagesBox);
    const status = h("div", { class: "dx-row", style: "margin-top:.8rem" });
    if (canMark) {
      status.append(h("button", {
        class: "button primary", type: "button", id: "add-span", disabled: !retry.pending,
        onclick: () => {
          const n = retry.spans.length + 1;
          retry.spans.push({ id: `span-${n}`, passage: retry.pending.passage, selection: { from: retry.pending.selection.from, to: retry.pending.selection.to }, created_at: iso(), stage: "interpret", steps: [], draft: "", revealed: [] });
          retry.pending = null;
          render();
          $(`#span-${n}-text`)?.focus();
        }
      }, "Mark this as a sticking point"), h("span", { class: "dx-cue" }, `${retry.spans.length} of ${MAX_SPANS} marked`));
    } else if (busy) status.append(h("span", { class: "dx-cue" }, "Finish working through the open sticking point below before marking another."));
    else status.append(h("span", { class: "dx-cue" }, `You have marked ${MAX_SPANS}, the maximum.`));
    shell.append(status);
    for (const span of [...retry.spans].reverse()) shell.append(spanCard(span));
    shell.append(navBar(sec, screens, index, {
      hint: retry.spans.length ? "" : "If nothing stopped you, just finish the section."
    }));
    return shell;
  }

  function spanCard(span) {
    const passage = item(span.passage);
    const sel = C.describeSelection(passage, span.selection);
    const tokens = C.passageTokens(passage).slice(sel.flat[0], sel.flat[1] + 1);
    const step = (name, extra = {}) => span.steps.push({ step: name, at: iso(), ...extra });
    const card = h("div", { class: "dx-span-card", id: `${span.id}-card` },
      h("h3", {}, `Sticking point ${span.id.replace("span-", "")} · ${passage.label}`),
      h("p", { class: "dx-span-greek", lang: language }, sel.greek));
    const history = span.steps.filter((s) => s.text != null);
    if (history.length) card.append(h("ol", { class: "dx-history" }, history.map((s) => h("li", {}, `${s.step.replaceAll("_", " ")}: “${s.text}”`))));

    if (span.stage !== "interpret") {
      const revealed = new Set(span.revealed);
      const chips = tokens.map((tok) => {
        const isOpen = revealed.has(tok.flat);
        const usable = Boolean(tok.gloss);
        return h("button", {
          type: "button", class: "dx-chip", "aria-pressed": String(isOpen), "data-fk": `${span.id}-chip-${tok.flat}`,
          disabled: !usable || (!isOpen && (span.revealed.length >= MAX_GLOSSES || span.stage !== "glosses")) || isOpen,
          onclick: () => { span.revealed.push(tok.flat); step("gloss_revealed", { token: { sentence: tok.sentence, index: tok.ti, t: tok.t, lemma: tok.lemma ?? null, gloss: tok.gloss } }); render(); }
        }, h("span", { lang: language }, tok.t), isOpen ? h("small", {}, ` ${tok.lemma ? `${tok.lemma} · ` : ""}${tok.gloss}`) : null);
      });
      card.append(h("p", { class: "dx-cue" }, span.stage === "glosses" ? `Choose up to ${MAX_GLOSSES} words to gloss (${span.revealed.length} used).` : "Glosses:"), h("div", { class: "dx-chips" }, chips));
    }
    if (["structure", "reveal", "done"].includes(span.stage)) {
      const sentences = sel.sentences.map((sid) => passage.sentences.find((s) => s.id === sid));
      card.append(h("p", { class: "dx-legend" },
        h("span", {}, h("span", { class: "dx-bracket" }, "[ ]"), " clauses"),
        h("span", {}, h("span", { class: "dx-subject" }, "subject")),
        h("span", {}, h("span", { class: "dx-verb" }, "main verb"))));
      for (const sentence of sentences) card.append(structureView(sentence));
    }
    if (span.stage === "done") {
      card.append(h("p", { class: "dx-translation" }, sel.sentences.map((sid) => passage.sentences.find((s) => s.id === sid).translation_en).join(" ")));
      return card;
    }
    const prompts = {
      interpret: "What do you think this says? Write it in English (“no idea” is fine).",
      glosses: "Revise your interpretation with the glosses.",
      structure: "Revise again with the structure cue."
    };
    const area = h("textarea", {
      class: "dx-textarea", id: `${span.id}-text`, "data-fk": `${span.id}-text`, value: span.draft ?? "", style: "min-height:4.5rem",
      "aria-label": prompts[span.stage],
      oninput: () => { span.draft = area.value; button.disabled = !area.value.trim(); save(); }
    });
    const actions = {
      interpret: ["Show glosses", () => { step("interpretation", { text: span.draft.trim() }); span.stage = "glosses"; }],
      glosses: ["Show the structure cue", () => { step("revised_after_glosses", { text: span.draft.trim() }); step("structure_revealed", { sentences: sel.sentences }); span.stage = "structure"; }],
      structure: ["Show the translation", () => { step("revised_after_structure", { text: span.draft.trim() }); step("translation_revealed", { sentences: sel.sentences }); span.stage = "done"; }]
    };
    const [label, act] = actions[span.stage];
    const button = h("button", { class: "button primary", type: "button", id: `${span.id}-next`, disabled: !(span.draft ?? "").trim(), onclick: () => { act(); render(); $(`#${span.id}-text`)?.focus({ preventScroll: true }); } }, label);
    const extra = span.stage === "interpret"
      ? [h("button", { class: "small-button", type: "button", onclick: () => { span.draft = "no idea"; area.value = "no idea"; button.disabled = false; save(); } }, "No idea"),
        h("button", { class: "small-button", type: "button", onclick: () => { state.retry.spans = state.retry.spans.filter((s) => s !== span); render(); } }, "Remove")]
      : [];
    card.append(h("label", { class: "dx-field" }, h("span", {}, prompts[span.stage]), area), h("div", { class: "dx-row" }, button, extra));
    return card;
  }

  function structureView(sentence) {
    const st = sentence.structure ?? {};
    const subject = new Set(st.subject ?? []);
    const verb = new Set(st.main_verb ?? []);
    const clauses = st.clauses ?? [];
    const p = h("p", { class: "dx-structure", lang: language });
    sentence.tokens.forEach((token, i) => {
      if (i) p.append(" ");
      for (const clause of clauses.filter((c) => c.start === i).sort((a, b) => b.end - a.end)) {
        p.append(h("span", { class: "dx-bracket" }, "[", h("sub", { lang: "en" }, clause.label)));
      }
      p.append(h("span", { class: subject.has(i) ? "dx-subject" : verb.has(i) ? "dx-verb" : null }, token.t));
      for (const _ of clauses.filter((c) => c.end === i)) p.append(h("span", { class: "dx-bracket" }, "]"));
    });
    if (!clauses.length && !subject.size && !verb.size) p.append(h("span", { class: "dx-cue", lang: "en" }, " (no structure cue for this sentence)"));
    return p;
  }

  // ------------------------------------------------------------------- submit

  function renderSubmit() {
    const shell = h("section", { class: "dx-screen", "aria-labelledby": "screen-title" },
      h("p", { class: "dx-eyebrow" }, "Core test complete"),
      h("h1", { class: "dx-title", id: "screen-title", tabindex: "-1" }, "Submit the core test"),
      h("p", { class: "dx-lede" }, "Once you submit, the answers, explanations and reference translations appear, and you can export the results. Optional modules come after."));
    const rows = coreSections().filter((s) => s.kind === "items").map((s) => {
      const qs = questionIds(s);
      return h("tr", {}, h("td", {}, s.title), h("td", {}, String(qs.filter(isAnswered).length)), h("td", {}, String(qs.length)));
    });
    shell.append(h("div", { class: "dx-card" }, h("div", { class: "dx-table-wrap" }, h("table", { class: "dx-summary" },
      h("thead", {}, h("tr", {}, h("th", {}, "Section"), h("th", {}, "Answered"), h("th", {}, "Questions"))), h("tbody", {}, rows))),
      h("div", { class: "dx-row", style: "margin-top:1rem" },
        h("button", { class: "button primary", type: "button", id: "submit-core", onclick: () => { state.submitted.core = iso(); state.view = "results"; render({ focus: true }); } }, "Submit and see results"))));
    return shell;
  }

  // ------------------------------------------------------------------ results

  const STATUS_TEXT = { correct: "Correct", wrong: "Not right", not_assessable: "Not assessable", review: "For review", omitted: "Left blank", skipped: "Skipped", not_reached: "Not reached", not_submitted: "Not submitted" };

  function results() { flushVisit(); return C.buildResults(bank, state, { bankUrl: bankRel }); }

  function renderResults() {
    const out = results();
    const shell = h("section", { class: "dx-screen dx-results", "aria-labelledby": "screen-title" },
      h("p", { class: "dx-eyebrow" }, `Submitted ${new Date(state.submitted.core).toLocaleString()}`),
      h("h1", { class: "dx-title", id: "screen-title", tabindex: "-1" }, "Results"),
      h("p", { class: "dx-lede" }, "These are the raw results. Export them and give the file to Claude, who writes the placement report from it."));
    shell.append(exportCard(out));

    const offers = optionalSections().filter((s) => !state.submitted[s.id]);
    if (offers.length) {
      shell.append(h("div", { class: "dx-card" }, h("h2", {}, "Optional modules"), h("p", { class: "dx-cue" }, language === "ru" ? "Optional vocabulary and production: about eight minutes. Answers stay hidden until submission." : "About five minutes each. Answers stay hidden until you submit the module."),
        offers.map((s) => h("div", { class: "dx-row", style: "margin:.5rem 0" },
          h("button", { class: "button secondary", type: "button", id: `start-${s.id}`, onclick: () => {
            state.modules[s.id] = "started"; state.view = "test";
            const screens = screensFor(s);
            go(s.id, state.cursor.section === s.id ? Math.min(state.cursor.screen, screens.length - 1) : 0);
          } }, `${state.modules[s.id] === "started" ? "Resume" : "Start"}: ${s.title.replace(/^Optional:\s*/i, "")}`)))));
    }

    const summaryRows = Object.entries(out.summary.by_section).map(([id, t]) =>
      h("tr", {}, h("td", {}, section(id)?.title ?? id), ...["correct", "wrong", "not_assessable", "review", "omitted", "skipped", "not_reached", "total"].map((k) => h("td", {}, String(t[k])))));
    shell.append(h("div", { class: "dx-card" }, h("h2", {}, "Summary"), h("div", { class: "dx-table-wrap" }, h("table", { class: "dx-summary" },
      h("thead", {}, h("tr", {}, ["Section", "Correct", "Wrong", "N/A", "Review", "Blank", "Skipped", "Not reached", "Total"].map((t) => h("th", {}, t)))),
      h("tbody", {}, summaryRows)))));

    const bySection = {};
    for (const row of out.items) (bySection[row.section] ??= []).push(row);
    for (const [sid, rows] of Object.entries(bySection)) {
      const card = h("div", { class: "dx-card" }, h("h2", {}, section(sid)?.title ?? sid));
      for (const row of rows) card.append(resultRow(row));
      shell.append(card);
    }

    if (out.passages.length) {
      const card = h("div", { class: "dx-card" }, h("h2", {}, "Reference translations"));
      for (const p of out.passages) {
        card.append(h("h3", {}, p.label, p.familiarity_affected ? h("span", { class: "dx-badge review", style: "margin-left:.5rem" }, "familiarity-affected") : null),
          h("p", { class: "dx-cue" }, `Reading time ${p.reading ? fmtMs(p.reading.active_ms) : "—"} · question time ${fmtMs(p.question_active_ms)} · self-rating ${p.self_rating_pct ?? "—"}%`),
          h("ul", { class: "dx-ref" }, p.reference.map((s) => h("li", {}, greek(s.greek), h("span", { class: "en" }, s.translation_en)))));
      }
      shell.append(card);
    }
    if (out.retry.length) {
      const card = h("div", { class: "dx-card" }, h("h2", {}, "Sticking points"));
      for (const span of out.retry) {
        card.append(h("h3", { lang: language, class: "greek" }, span.selection?.greek ?? span.id),
          h("ol", { class: "dx-history" }, span.steps.filter((s) => s.text != null).map((s) => h("li", {}, `${s.step.replaceAll("_", " ")}: “${s.text}”`))),
          h("p", { class: "dx-translation" }, span.reference_translation ?? ""));
      }
      shell.append(card);
    }
    return shell;
  }

  function resultRow(row) {
    const it = item(row.id);
    const s = row.score;
    const head = h("div", { class: "dx-result-head" }, h("span", { class: `dx-badge ${s.status}` }, STATUS_TEXT[s.status] ?? s.status), h("code", {}, row.id));
    const box = h("div", { class: "dx-result" }, head);
    if (it.greek && it.kind !== "cloze") box.append(marked(it.greek, "p", "dx-greek"));
    if (it.kind === "mc" || it.kind === "vocab") {
      box.append(h("p", { class: "dx-prompt" }, it.kind === "vocab" ? "What does the underlined word mean here?" : it.prompt_en));
      box.append(h("ul", { class: "dx-why" }, C.displayOrder(it).map((i) => [it.options[i], i]).map(([option, i]) => h("li", { class: `${i === it.answer ? "is-key" : ""}${i === row.response.choice ? " is-chosen" : ""}` },
        i === it.answer ? "✓ " : i === row.response.choice ? "✗ " : "· ", option, it.why?.[i] ? ` — ${it.why[i]}` : "", i === row.response.choice ? " (your answer)" : ""))));
      if (it.kind === "vocab") box.append(h("p", { class: "dx-cue" }, `Confidence: ${row.response.confidence ?? "not given"}`));
    } else if (it.kind === "span") {
      const passage = item(it.passage);
      const key = C.describeSelection(passage, { from: C.flatIndex(passage, it.answer.sentence, it.answer.start), to: C.flatIndex(passage, it.answer.sentence, it.answer.end) });
      box.append(h("p", { class: "dx-prompt" }, it.prompt_en),
        h("p", {}, "Your selection: ", row.response.selection ? greek(row.response.selection.greek) : "none", s.overlap != null ? ` (${Math.round(s.overlap * 100)}% overlap)` : ""),
        h("p", {}, "Key: ", greek(key.greek)), it.why ? h("p", { class: "dx-cue" }, it.why) : null);
    } else if (it.kind === "cloze") {
      const [before, after] = C.splitGap(it.greek);
      box.append(h("p", { class: "dx-greek", lang: language }, before, h("u", { class: "dx-marked" }, it.accepted[0]), after),
        h("p", { class: "dx-cue" }, "(", greek(it.lemma), " · ", it.subtype === "meaning" ? `meaning: ${it.meaning_en}` : it.target_en, ")"),
        h("p", {}, "You typed: ", h("code", {}, row.response.raw || "—"), row.response.raw ? [" → ", greek(row.response.greek)] : null),
        s.label ? h("p", {}, "Pattern: ", s.label) : null,
        h("p", { class: "dx-cue" }, "Accepted: ", greek(it.accepted.join(", "))));
    } else if (it.kind === "write") {
      box.append(h("p", { class: "dx-prompt" }, it.prompt_en),
        it.givens?.length ? h("ol", { class: "dx-givens", lang: language }, it.givens.map((g) => h("li", {}, g))) : null,
        h("p", {}, "You wrote: ", row.response.greek ? greek(row.response.greek) : "—"),
        (it.model_answers ?? []).length ? h("p", {}, "Model: ", greek(it.model_answers.join(" / "))) : null,
        it.rubric ? h("p", { class: "dx-cue" }, it.rubric) : null);
    }
    return box;
  }

  function exportCard(out) {
    const json = JSON.stringify(out, null, 2);
    const filename = `${language}-diagnostic-results-${(state.submitted.core ?? iso()).slice(0, 10)}.json`;
    const area = h("textarea", { readonly: true, id: "export-json", "aria-label": "Results JSON", value: json });
    return h("div", { class: "dx-card dx-export" },
      h("h2", {}, "Export"),
      h("p", { class: "dx-cue" }, `Everything: intake, each response (raw, ${languageName()}, normalised), scores and labels, timings, sticking-point steps, self-ratings, and bank ${bank.id} v${bank.version}.`),
      h("div", { class: "dx-row" },
        h("button", { class: "button primary", type: "button", id: "download-json", onclick: () => {
          const blob = new Blob([JSON.stringify(results(), null, 2)], { type: "application/json" });
          const a = h("a", { href: URL.createObjectURL(blob), download: filename });
          document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          toast(`Downloaded ${filename}`);
        } }, "Download JSON"),
        h("button", { class: "button secondary", type: "button", id: "copy-json", onclick: async () => {
          const text = JSON.stringify(results(), null, 2);
          area.value = text;
          try { await navigator.clipboard.writeText(text); toast("Copied to the clipboard"); }
          catch { area.focus(); area.select(); try { document.execCommand("copy"); toast("Copied to the clipboard"); } catch { toast("Select the text below and copy it"); } }
        } }, "Copy to clipboard")),
      h("details", { style: "margin-top:.8rem" }, h("summary", {}, "Show the JSON"), area));
  }

  // ----------------------------------------------------------------- keyboard

  function onKey(e) {
    if (!state || openPause()) return;
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      const next = $("#next");
      if (next && !next.disabled) { e.preventDefault(); next.click(); }
      return;
    }
    const tag = document.activeElement?.tagName;
    const typing = tag === "TEXTAREA" || (tag === "INPUT" && !["radio", "checkbox", "range"].includes(document.activeElement.type));
    if (typing || e.altKey || e.ctrlKey || e.metaKey || state.view !== "test") return;
    const screen = $("#screen");
    if (screen.querySelectorAll(".dx-question").length !== 1) return;
    if (/^[1-9]$/.test(e.key)) {
      const radio = screen.querySelector(`.dx-question input[data-option="${Number(e.key) - 1}"]`);
      if (radio) { e.preventDefault(); radio.click(); radio.focus(); }
    } else if (["s", "g", "u"].includes(e.key.toLowerCase())) {
      const value = { s: "sure", g: "guess", u: "unknown" }[e.key.toLowerCase()];
      const radio = screen.querySelector(`input[data-confidence="${value}"]`);
      if (radio) { e.preventDefault(); radio.click(); radio.focus(); }
    }
  }

  // --------------------------------------------------------------------- boot

  function showNotice(nodes) {
    const notice = $("#notice");
    notice.replaceChildren(...nodes);
    notice.hidden = false;
  }

  async function boot() {
    const params = new URLSearchParams(location.search);
    const root = new URL("../../", location.href);
    bankRel = params.get("bank") || DEFAULT_BANK;
    const url = new URL(bankRel, root);
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      bank = await res.json();
    } catch (error) {
      const status = $("#status");
      status.classList.add("error");
      status.replaceChildren(h("strong", {}, "Couldn’t load the item bank. "), `${url.pathname}: ${error.message}. `,
        params.get("bank") ? "" : h("span", {}, "To try the page with the test fixture, open ", h("a", { href: `?bank=tests/fixtures/${language}-diagnostic-fixture.json` }, `?bank=tests/fixtures/${language}-diagnostic-fixture.json`), "."));
      $("#bank-label").textContent = "No item bank";
      return;
    }
    language = C.languageOf(bank);
    STATE_FORMAT = `${language}-diagnostic-state/1`;
    document.title = `${languageName()} placement diagnostic`;
    $(".dx-brand strong").textContent = document.title;
    $(".dx-mark").textContent = language === "ru" ? "Ру" : "Ἑλ";
    $(".dx-mark").lang = language;
    storageKey = C.storageKeyFor(bank, new URL(bankRel, root).pathname);
    $("#bank-label").textContent = `${bank.title ?? bank.id} · v${bank.version}`;
    $("#status").hidden = true;
    plan = C.planBank(bank, null);
    const saved = loadSaved();
    state = saved?.started_at ? saved : freshState();
    if (saved?.started_at) {
      replan();
      // Closing or reloading the tab leaves a "tab hidden" pause open; it ends now.
      const open = openPause();
      if (open?.reason === "tab hidden") { open.end = iso(); open.reason = "tab hidden or page closed"; }
      recomputePaused();
      const when = saved.updated_at ? new Date(saved.updated_at).toLocaleString() : "earlier";
      const nodes = [h("span", {}, `Welcome back: resumed from ${when}.`)];
      if (saved.bank?.version !== bank.version) nodes.push(h("span", {}, ` Your answers were saved against bank version ${saved.bank?.version}; this is ${bank.version}, so some items may have changed.`));
      showNotice(nodes);
      state.bank = { id: bank.id, version: bank.version, url: bankRel };
    }
    $("#pause-toggle").hidden = false;
    $("#start-over").hidden = false;
    $("#pause-toggle").addEventListener("click", () => setPaused(!openPause()));
    $("#resume").addEventListener("click", () => setPaused(false));
    const confirmBox = $("#confirm-reset");
    $("#start-over").addEventListener("click", () => {
      confirmBox.hidden = !confirmBox.hidden;
      $("#start-over").setAttribute("aria-expanded", String(!confirmBox.hidden));
      if (!confirmBox.hidden) $("#confirm-reset-no").focus();
    });
    $("#confirm-reset-no").addEventListener("click", () => { confirmBox.hidden = true; $("#start-over").setAttribute("aria-expanded", "false"); $("#start-over").focus(); });
    $("#confirm-reset-yes").addEventListener("click", () => {
      visit = null;
      clearSaved();
      plan = C.planBank(bank, null);
      state = freshState();
      recomputePaused();
      confirmBox.hidden = true;
      $("#start-over").setAttribute("aria-expanded", "false");
      $("#notice").hidden = true;
      render({ focus: true });
      toast("Started over");
    });
    document.addEventListener("keydown", onKey);
    // A hidden tab counts as an interruption; it ends when the tab is visible again.
    document.addEventListener("visibilitychange", () => {
      if (!state) return;
      const open = openPause();
      if (document.hidden && !open) setPaused(true, "tab hidden");
      else if (!document.hidden && open?.reason === "tab hidden") setPaused(false);
    });
    window.addEventListener("pagehide", save);
    setInterval(() => { if (state && !document.hidden) save(); }, 10000);
    render({ focus: false });
  }

  window.GrcDiagnostic = { get state() { return state; }, get bank() { return bank; }, results: () => results(), save };
  boot();
}());
