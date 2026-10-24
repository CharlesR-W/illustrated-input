"use strict";

// Language-neutral practice scheduling. Storage is optional; blocked storage still
// permits practice in memory. A batch is a presentation size, never a daily limit.
(function expose(root) {
  const DAY = 86400000;
  const INTERVALS = [1, 3, 7, 16, 35];
  const LEVEL = { clean: 0, hint: 1, reveal: 2 };
  function grade(stages) {
    const values = Array.isArray(stages) ? stages : Object.values(stages);
    if (values.length !== 5 || values.some((s) => !Object.hasOwn(LEVEL, s))) throw new Error("A kata session requires five completed items");
    const reveals = values.filter((s) => s === "reveal").length;
    const hints = values.filter((s) => s === "hint").length;
    return reveals === 0 && hints <= 1 ? "comfortable" : reveals <= 1 ? "passed" : "failed";
  }
  function schedule(previous = {}, result, now = Date.now()) {
    if (!["comfortable", "passed", "failed"].includes(result)) throw new Error("Unknown kata grade");
    const oldBox = Math.min(5, Math.max(1, previous.box || 1));
    const retired = oldBox === 5 && result === "comfortable";
    const box = result === "comfortable" ? Math.min(5, oldBox + 1) : result === "failed" ? Math.max(1, oldBox - 1) : oldBox;
    return { ...previous, box, retired, due: retired ? null : now + INTERVALS[box - 1] * DAY, last_grade: result, reviewed_at: now };
  }
  function draw(pool, random = Math.random) {
    if (pool.length < 5 || new Set(pool.map((item) => item.id)).size !== pool.length) throw new Error("Kata pool needs at least five unique item ids");
    const copy = [...pool];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(random() * (i + 1)));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, 5);
  }
  const batch = (due, offset = 0, size = 3) => due.slice(offset, offset + size);
  function createStore(storage, courseId) {
    const key = `illustrated:${courseId}:practice:v1`;
    let state = { kata: {}, vocabulary: {} };
    try {
      const saved = JSON.parse(storage?.getItem(key) || "null");
      if (saved && typeof saved.kata === "object" && saved.kata && typeof saved.vocabulary === "object" && saved.vocabulary) state = saved;
    } catch { /* unavailable or corrupt browser storage */ }
    function save() { try { storage?.setItem(key, JSON.stringify(state)); } catch { /* memory remains usable */ } }
    function register(lesson, now = Date.now()) {
      const active = new Set((lesson.grammar?.kata || []).filter((k) => k.scheduled).map((k) => k.id));
      for (const [id, record] of Object.entries(state.kata)) if (record.lesson_id === lesson.id && !active.has(id)) delete state.kata[id];
      for (const kata of lesson.grammar?.kata || []) {
        if (!kata.scheduled) continue;
        const old = state.kata[kata.id] || { id: kata.id, lesson_id: lesson.id, box: 1, due: now, retired: false, items: {} };
        const items = Object.fromEntries(kata.pool.map((item) => [item.id, old.items?.[item.id] ?? null]));
        state.kata[kata.id] = { ...old, lesson_id: lesson.id, items };
      }
      save();
      return state;
    }
    function due(now = Date.now()) {
      return Object.values(state.kata).filter((k) => !k.retired && Number.isFinite(k.due) && k.due <= now).sort((a, b) => a.due - b.due || a.id.localeCompare(b.id));
    }
    function reconcile(lessonIds) {
      const available = new Set(lessonIds);
      for (const [id, record] of Object.entries(state.kata)) if (!available.has(record.lesson_id)) delete state.kata[id];
      save();
    }
    function record(kata, stages, now = Date.now()) {
      const result = grade(stages);
      const ids = new Set(kata.pool.map((item) => item.id));
      if (Object.keys(stages).some((id) => !ids.has(id))) throw new Error("Unknown kata item id");
      if (!kata.scheduled) return { last_grade: result, scheduled: false };
      const previous = state.kata[kata.id];
      if (!previous) throw new Error("Open the lesson before recording its kata");
      const items = { ...previous.items };
      for (const [id, stage] of Object.entries(stages)) items[id] = { stage, reviewed_at: now };
      state.kata[kata.id] = schedule({ ...previous, items }, result, now);
      save();
      return state.kata[kata.id];
    }
    function vocabulary(lessonId, lexemeId, value) {
      if (!["knew", "context", "no"].includes(value)) throw new Error("Unknown vocabulary self-check");
      (state.vocabulary[lessonId] ||= {})[lexemeId] = value;
      save();
    }
    return { read: () => state, register, reconcile, due, record, vocabulary,
      exportVocabulary: () => ({ format: "vocabulary-self-check/1", course_id: courseId, results: JSON.parse(JSON.stringify(state.vocabulary)) }) };
  }
  const api = { DAY, INTERVALS, grade, schedule, draw, batch, createStore };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Kata = api;
}(typeof window !== "undefined" ? window : globalThis));
