"use strict";

// Pure logic for the Ancient Greek placement diagnostic: planning the test from the bank
// and the intake, scoring, and building the results export. Shared by the page
// (window.GrcDiagnosticCore) and Node tests (require). No DOM access here.
// Contract: content/grc/diagnostic/FORMAT.md; design: docs/greek-diagnostic-spec.md.
(function expose(root) {
  const Greek = (typeof module !== "undefined" && module.exports) ? require("../../greek.js") : root.GreekInput;

  const RESULTS_FORMAT = "grc-diagnostic-results/1";

  // --------------------------------------------------------------- text helpers

  // "ὁ [[στρατηγὸς]] ἦλθεν" → [{ text: "ὁ ", mark: false }, { text: "στρατηγὸς", mark: true }, …]
  function parseMarked(text) {
    const out = [];
    const re = /\[\[([^\]]+)\]\]/g;
    let last = 0;
    let match;
    const source = String(text ?? "");
    while ((match = re.exec(source))) {
      if (match.index > last) out.push({ text: source.slice(last, match.index), mark: false });
      out.push({ text: match[1], mark: true });
      last = re.lastIndex;
    }
    if (last < source.length) out.push({ text: source.slice(last), mark: false });
    return out;
  }

  const stripMarks = (text) => String(text ?? "").replace(/\[\[([^\]]+)\]\]/g, "$1");
  const splitGap = (text) => { const [before, ...rest] = String(text ?? "").split("___"); return [before, rest.join("___")]; };

  // Every token in a passage with its sentence and a passage-wide flat index.
  function passageTokens(passage) {
    const out = [];
    (passage?.sentences ?? []).forEach((sentence, si) => {
      sentence.tokens.forEach((token, ti) => out.push({ flat: out.length, sentence: sentence.id, si, ti, ...token }));
    });
    return out;
  }

  function flatIndex(passage, sentenceId, tokenIndex) {
    let offset = 0;
    for (const sentence of passage?.sentences ?? []) {
      if (sentence.id === sentenceId) return tokenIndex < sentence.tokens.length ? offset + tokenIndex : -1;
      offset += sentence.tokens.length;
    }
    return -1;
  }

  // { from, to } flat indices (either order) → sentence-local description.
  function describeSelection(passage, selection) {
    if (!selection || selection.from == null || selection.to == null) return null;
    const tokens = passageTokens(passage);
    const from = Math.min(selection.from, selection.to);
    const to = Math.max(selection.from, selection.to);
    if (from < 0 || to >= tokens.length) return null;
    const slice = tokens.slice(from, to + 1);
    return {
      from: { sentence: tokens[from].sentence, token: tokens[from].ti },
      to: { sentence: tokens[to].sentence, token: tokens[to].ti },
      flat: [from, to],
      sentences: [...new Set(slice.map((tok) => tok.sentence))],
      greek: slice.map((tok) => tok.t).join(" ")
    };
  }

  // Banks key the right answer first; show options in a stable per-item shuffle so
  // position gives nothing away. Responses still store the bank's option index.
  function displayOrder(item) {
    const n = item.options?.length ?? 0;
    let seed = 2166136261;
    for (const ch of String(item.id)) seed = Math.imul(seed ^ ch.codePointAt(0), 16777619) >>> 0;
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
      const j = seed % (i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  }

  // ------------------------------------------------------------------- scoring

  function scoreMc(item, choice) {
    if (choice == null) return { status: "omitted" };
    return { status: choice === item.answer ? "correct" : "wrong" };
  }

  // Overlap is intersection over union of token sets (so selecting the whole passage
  // does not score), compared with the item's min_overlap.
  function spanOverlap(passage, answer, selection) {
    if (!selection || selection.from == null || selection.to == null) return 0;
    const start = flatIndex(passage, answer.sentence, answer.start);
    const end = flatIndex(passage, answer.sentence, answer.end);
    if (start < 0 || end < 0) return 0;
    const from = Math.min(selection.from, selection.to);
    const to = Math.max(selection.from, selection.to);
    const inter = Math.max(0, Math.min(end, to) - Math.max(start, from) + 1);
    const union = (end - start + 1) + (to - from + 1) - inter;
    return union ? inter / union : 0;
  }

  // Correct needs overlap ≥ min_overlap and every `answer.require` token (indices within
  // answer.sentence) inside the selection.
  function scoreSpan(item, passage, selection) {
    if (!selection || selection.from == null) return { status: "omitted", overlap: 0 };
    const overlap = Math.round(spanOverlap(passage, item.answer, selection) * 1000) / 1000;
    const from = Math.min(selection.from, selection.to);
    const to = Math.max(selection.from, selection.to);
    const required = item.answer.require ?? [];
    const missing = required.filter((ti) => { const i = flatIndex(passage, item.answer.sentence, ti); return i < from || i > to; });
    const ok = overlap >= (item.min_overlap ?? 0.5) && missing.length === 0;
    return required.length ? { status: ok ? "correct" : "wrong", overlap, missing_required: missing } : { status: ok ? "correct" : "wrong", overlap };
  }

  // `combine` answers matching a listed normalised string are correct; everything else
  // written goes to Claude's review.
  function scoreWrite(item, raw) {
    const greek = Greek.transliterate(raw ?? "");
    const normalised = Greek.normalise(greek);
    if (!normalised) return { status: "omitted", greek, normalised };
    if (item.subtype === "combine" && (item.accepted ?? []).includes(normalised)) return { status: "correct", greek, normalised };
    return { status: "review", greek, normalised };
  }

  function scoreCloze(item, raw) {
    const result = Greek.scoreCloze(item, raw ?? "");
    return { ...result, status: result.status === "empty" ? "omitted" : result.status };
  }

  // --------------------------------------------------------------------- plan

  function resolvePractice(bank) {
    return (bank.practice ?? []).map((entry) => (typeof entry === "string" ? bank.items[entry] : entry)).filter(Boolean);
  }

  function readTexts(intake) {
    return new Set(intake?.texts_read ?? []);
  }

  // Apply intake fallbacks. For each fallback that fires, in every section the block of
  // items tied to the original (the item itself, and items whose `passage` is it) is
  // replaced at its first position by the items tied to the replacement that no section
  // lists, keeping only kinds that the removed block had (so a write item replaces a
  // write item). Retry sections swap the passage id.
  function planBank(bank, intake) {
    const read = readTexts(intake);
    const listed = new Set(bank.sections.flatMap((section) => section.items ?? []));
    const swaps = [];
    for (const [original, rule] of Object.entries(bank.intake?.fallbacks ?? {})) {
      if (!read.has(rule.if_read) || !bank.items[rule.use]) continue;
      // familiar_if: the replacement's own source has also been read, so results on it are
      // kept but flagged as familiarity-affected.
      const familiar = Boolean(rule.familiar_if && read.has(rule.familiar_if));
      swaps.push({ original, use: rule.use, because: `read ${rule.if_read}`, familiarity_affected: familiar, ...(familiar ? { familiar_because: `read ${rule.familiar_if}` } : {}) });
    }
    const itemOrder = Object.keys(bank.items);
    const sections = bank.sections.map((section) => {
      const kind = section.kind ?? "items";
      let items = [...(section.items ?? [])];
      let passages = [...(section.passages ?? [])];
      for (const swap of swaps) {
        const tied = (id) => id === swap.original || bank.items[id]?.passage === swap.original;
        const at = items.findIndex(tied);
        if (at >= 0) {
          const kinds = new Set(items.filter(tied).map((id) => bank.items[id]?.kind));
          const replacement = itemOrder.filter((id) => !listed.has(id)
            && (id === swap.use || bank.items[id]?.passage === swap.use)
            && kinds.has(bank.items[id].kind));
          replacement.sort((a, b) => (a === swap.use ? -1 : b === swap.use ? 1 : 0));
          items = [...items.slice(0, at).filter((id) => !tied(id)), ...replacement, ...items.slice(at).filter((id) => !tied(id))];
        }
        passages = passages.map((id) => (id === swap.original ? swap.use : id));
      }
      return { id: section.id, title: section.title, kind, optional: Boolean(section.optional), intro_en: section.intro_en ?? null, items, passages };
    });
    return { sections, fallbacks_applied: swaps };
  }

  // ------------------------------------------------------------------- export

  const TEXT_KINDS = new Set(["cloze", "write"]);

  function itemKey(item) {
    switch (item.kind) {
      case "mc": case "vocab":
        return { answer: item.answer, answer_text: item.options[item.answer], why: item.why ?? null };
      case "span":
        return { sentence: item.answer.sentence, start: item.answer.start, end: item.answer.end, require: item.answer.require ?? [], min_overlap: item.min_overlap };
      case "cloze":
        return { accepted: item.accepted, collapsed: item.collapsed ?? [], error_patterns: item.error_patterns ?? [] };
      case "write":
        return { model_answers: item.model_answers ?? [], accepted: item.accepted ?? [], rubric: item.rubric ?? null, shape: item.shape ?? null };
      default:
        return null;
    }
  }

  function scoreItem(bank, item, response) {
    const r = response ?? {};
    switch (item.kind) {
      case "mc": return scoreMc(item, r.choice);
      case "vocab": return scoreMc(item, r.choice);
      case "span": return scoreSpan(item, bank.items[item.passage], r.selection);
      case "cloze": return scoreCloze(item, r.text);
      case "write": return scoreWrite(item, r.text);
      default: return { status: "n/a" };
    }
  }

  function describeResponse(bank, item, response) {
    const r = response ?? {};
    const out = {};
    if (item.kind === "mc" || item.kind === "vocab") {
      out.choice = r.choice ?? null;
      out.choice_text = r.choice != null ? item.options[r.choice] : null;
      if (item.kind === "vocab") out.confidence = r.confidence ?? null;
      if (r.changes) out.changes = r.changes;
    } else if (item.kind === "span") {
      out.selection = describeSelection(bank.items[item.passage], r.selection);
    } else if (TEXT_KINDS.has(item.kind)) {
      out.raw = r.text ?? "";
      out.greek = Greek.transliterate(r.text ?? "");
      out.normalised = Greek.normalise(out.greek);
    }
    return out;
  }

  function emptyTally() {
    return { total: 0, correct: 0, wrong: 0, not_assessable: 0, review: 0, omitted: 0, skipped: 0 };
  }

  function tally(target, status) {
    target.total += 1;
    if (status in target) target[status] += 1;
  }

  function timerOut(timer) {
    if (!timer) return null;
    return {
      active_ms: Math.round(timer.ms ?? 0),
      visits: timer.visits ?? 0,
      first_shown_at: timer.first_shown_at ?? null,
      first_input_ms: timer.first_input_ms ?? null,
      last_input_ms: timer.last_input_ms ?? null
    };
  }

  // Everything Claude needs to write the report, flattened so it reads without the bank.
  function buildResults(bank, state, options = {}) {
    const plan = planBank(bank, state.intake);
    const submitted = state.submitted ?? {};
    const sectionSubmitted = (section) => (section.optional ? Boolean(submitted[section.id]) : Boolean(submitted.core));
    const sectionOf = {};
    for (const section of plan.sections) for (const id of section.items) sectionOf[id] = section;
    const familiarPassages = new Set(plan.fallbacks_applied.filter((f) => f.familiarity_affected).map((f) => f.use));
    const familiar = (id) => familiarPassages.has(id) || familiarPassages.has(bank.items[id]?.passage) || undefined;
    const skipped = (item) => {
      const p = item.passage && state.passages?.[item.passage];
      return Boolean(p && p.low_choice === "skip" && !item.gist && sectionOf[item.passage] === sectionOf[item.id]);
    };

    const items = [];
    const bySection = {};
    const byDomain = {};
    const byKind = {};
    for (const section of plan.sections) {
      if (section.kind !== "items") continue;
      if (section.optional && !submitted[section.id]) continue;
      for (const id of section.items) {
        const item = bank.items[id];
        if (!item || item.kind === "passage") continue;
        const response = state.responses?.[id];
        let score = sectionSubmitted(section) ? scoreItem(bank, item, response) : { status: "not_submitted" };
        if (skipped(item) && score.status === "omitted") score = { status: "skipped", reason: "self-rating below 50%; learner chose to skip" };
        const row = {
          id, section: section.id, kind: item.kind,
          subtype: item.subtype ?? null,
          gist: item.gist ?? undefined,
          passage: item.passage ?? null,
          domain: item.domain ?? null, primary_tag: item.primary_tag ?? null, tags: item.tags ?? [],
          prompt_en: item.prompt_en ?? null,
          greek: item.greek ? stripMarks(item.greek) : null,
          target: item.greek && /\[\[/.test(item.greek) ? parseMarked(item.greek).filter((seg) => seg.mark).map((seg) => seg.text).join(" … ") : undefined,
          lemma: item.lemma ?? undefined,
          target_en: item.target_en ?? undefined,
          meaning_en: item.meaning_en ?? undefined,
          givens: item.givens ?? undefined,
          options: item.options ?? undefined,
          band: item.band ?? undefined,
          key: itemKey(item),
          response: describeResponse(bank, item, response),
          score,
          familiarity_affected: familiar(id),
          timing: timerOut(state.timers?.[id])
        };
        items.push(JSON.parse(JSON.stringify(row)));
        tally(bySection[section.id] ??= emptyTally(), score.status);
        if (item.domain) tally(byDomain[item.domain] ??= emptyTally(), score.status);
        tally(byKind[item.kind + (item.subtype ? `:${item.subtype}` : "")] ??= emptyTally(), score.status);
      }
    }

    const passages = [];
    for (const section of plan.sections) {
      if (section.kind !== "items" || (section.optional && !submitted[section.id])) continue;
      for (const id of section.items) {
        const passage = bank.items[id];
        if (passage?.kind !== "passage") continue;
        const info = state.passages?.[id] ?? {};
        const questionIds = section.items.filter((qid) => bank.items[qid]?.passage === id);
        passages.push({
          id, section: section.id, label: passage.label, source: passage.source ?? null, authentic: passage.authentic ?? null,
          familiarity_affected: familiar(id),
          reading: timerOut(state.timers?.[`read:${id}`]),
          reading_started_at: info.reading_started_at ?? null,
          reading_finished_at: info.reading_finished_at ?? null,
          self_rating_pct: info.self_rating ?? null,
          low_rating_path: info.self_rating != null && info.self_rating < 50
            ? { gist_items: questionIds.filter((qid) => bank.items[qid].gist), choice: info.low_choice ?? null }
            : null,
          question_active_ms: Math.round(questionIds.reduce((sum, qid) => sum + (state.timers?.[qid]?.ms ?? 0), 0)),
          questions: questionIds,
          reference: passage.sentences.map((s) => ({ id: s.id, greek: s.tokens.map((t) => t.t).join(" "), translation_en: s.translation_en }))
        });
      }
    }

    const retry = (state.retry?.spans ?? []).map((span) => {
      const passage = bank.items[span.passage];
      const sel = describeSelection(passage, span.selection);
      return {
        id: span.id, passage: span.passage, created_at: span.created_at ?? null,
        familiarity_affected: familiar(span.passage),
        selection: sel,
        reference_translation: sel ? sel.sentences.map((sid) => passage.sentences.find((s) => s.id === sid)?.translation_en).join(" ") : null,
        steps: span.steps ?? [],
        final_stage: span.stage ?? null
      };
    });

    const pauses = state.pauses ?? [];
    return {
      format: RESULTS_FORMAT,
      exported_at: options.now ?? new Date().toISOString(),
      how_to_read: [
        "score.status: correct | wrong | not_assessable (diacritic-free answer collides with a distinct form) | review (Claude to judge) | omitted (no answer) | skipped (passage self-rated below 50% and learner skipped) | not_submitted.",
        "Cloze/write responses keep raw (as typed), greek (after transliteration) and normalised (no diacritics) forms; score.label is the matched error pattern, null if unclassified.",
        "Span selections give sentence ids and 0-based token indices (inclusive); score.overlap is intersection-over-union with the key; correct also needs every key.require token selected (score.missing_required lists any that were not).",
        "familiarity_affected: true marks a fallback passage (and its items) from a book the learner has also read; keep those results but do not let them independently establish the level on unfamiliar prose (plan.fallbacks_applied says why).",
        "Timings are active milliseconds (pauses excluded); latency is descriptive only.",
        "Retry steps are in order, each with an ISO timestamp: interpretation (text), gloss_revealed (one per word the learner chose, max 3), revised_after_glosses (text), structure_revealed, revised_after_structure (text), translation_revealed. A span with fewer steps was abandoned part-way.",
        "Self-ratings are 0–100%; below 50% the learner saw only gist questions first and then chose to continue or skip (passages[].low_rating_path)."
      ],
      bank: { id: bank.id, version: bank.version, url: options.bankUrl ?? state.bank?.url ?? null },
      intake: state.intake ?? null,
      plan: {
        sections: plan.sections.map((s) => ({ id: s.id, title: s.title, kind: s.kind, optional: s.optional, items: s.items, passages: s.passages })),
        fallbacks_applied: plan.fallbacks_applied
      },
      session: {
        started_at: state.started_at ?? null,
        core_submitted_at: submitted.core ?? null,
        modules: Object.fromEntries(plan.sections.filter((s) => s.optional).map((s) => [s.id, {
          title: s.title,
          status: submitted[s.id] ? "submitted" : state.modules?.[s.id] ?? "not_taken",
          submitted_at: submitted[s.id] ?? null
        }])),
        pauses,
        total_paused_ms: pauses.reduce((sum, p) => sum + (p.end && p.start ? Date.parse(p.end) - Date.parse(p.start) : 0), 0)
      },
      summary: { by_section: bySection, by_domain: byDomain, by_kind: byKind },
      passages,
      items,
      retry,
      practice: state.practice?.responses ?? {}
    };
  }

  const api = {
    RESULTS_FORMAT, displayOrder, parseMarked, stripMarks, splitGap, passageTokens, flatIndex, describeSelection,
    scoreMc, spanOverlap, scoreSpan, scoreWrite, scoreCloze, scoreItem, resolvePractice, planBank, buildResults
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GrcDiagnosticCore = api;
}(typeof window !== "undefined" ? window : globalThis));
