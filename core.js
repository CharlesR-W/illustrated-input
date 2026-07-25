"use strict";

(function expose(root) {
  function normalise(value) {
    return String(value).trim().toLocaleLowerCase().replace(/[.!?¿¡]/g, "").replace(/\s+/g, " ");
  }

  function accepted(item) {
    const answers = item.accepted_answers || item.answers || item.answer || [];
    return (Array.isArray(answers) ? answers : [answers]).map(normalise);
  }

  function tsvField(value) {
    const text = String(value ?? "").replace(/\r?\n/g, "<br>");
    return /[\t"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function toggleCompleted(storage, key, lessonId) {
    let values = [];
    try { values = JSON.parse(storage.getItem(key) || "[]"); } catch { values = []; }
    const completed = new Set(values);
    if (completed.has(lessonId)) completed.delete(lessonId); else completed.add(lessonId);
    storage.setItem(key, JSON.stringify([...completed]));
    return completed;
  }

  function presentedAids(segment) {
    return (segment?.inference_aids || segment?.aids || [])
      .filter((aid) => aid?.presentation);
  }

  function lessonAidIndex(lesson) {
    const source = lesson?.story || lesson?.sections || [];
    const sections = Array.isArray(source) ? source : source.sections || [];
    const aids = new Map();
    for (const section of sections) {
      for (const segment of section.segments || section.sentences || []) {
        for (const aid of presentedAids(segment)) {
          if (aid.ref && aid.src) aids.set(aid.ref, aid);
        }
      }
    }
    return aids;
  }

  const api = { normalise, accepted, tsvField, toggleCompleted, presentedAids, lessonAidIndex };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.IllustratedCore = api;
}(typeof window !== "undefined" ? window : globalThis));
