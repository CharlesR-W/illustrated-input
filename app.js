"use strict";

const COURSE_URL = "content/cy/course.json";
const state = { course: null, lessons: new Map(), lessonIndex: 0 };
const $ = (selector) => document.querySelector(selector);
const { normalise, accepted, tsvField, toggleCompleted } = window.IllustratedCore;

function completedKey() { return `illustrated-input:${state.course?.id || "course"}:completed`; }
function completedLessons() {
  try { return new Set(JSON.parse(localStorage.getItem(completedKey()) || "[]")); }
  catch { return new Set(); }
}
function saveCompleted(set) { localStorage.setItem(completedKey(), JSON.stringify([...set])); }
function lessonEntries(course) { return course.lessons || course.lesson_index || []; }
function lessonId(entry) { return typeof entry === "string" ? entry : entry.id || entry.lesson_id; }
function lessonTitle(entry) { return typeof entry === "string" ? entry : entry.title || entry.name || lessonId(entry); }
function lessonPath(entry) { return typeof entry === "string" ? `lessons/${entry}.json` : entry.path || entry.file || `lessons/${lessonId(entry)}.json`; }
function lessonAvailable(entry) { return typeof entry === "string" || Boolean(entry.path || entry.file) || entry.status !== "planned"; }
function adjacentAvailableIndex(direction) {
  const entries = lessonEntries(state.course);
  for (let i = state.lessonIndex + direction; i >= 0 && i < entries.length; i += direction) if (lessonAvailable(entries[i])) return i;
  return -1;
}

async function loadJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
  return response.json();
}

async function init() {
  try {
    state.course = await loadJSON(COURSE_URL);
    renderCourse();
    const hashId = decodeURIComponent(location.hash.slice(1));
    const found = lessonEntries(state.course).findIndex((item) => lessonId(item) === hashId);
    await openLesson(found >= 0 ? found : 0);
  } catch (error) { showError(error); }
}

function renderCourse() {
  const course = state.course;
  const language = typeof course.language === "object" ? course.language : {};
  $("#course-language").textContent = course.language_name || language.name || language.endonym || course.language || "Course";
  $("#course-title").textContent = course.title || course.name || `${language.name || course.language} course`;
  $("#course-description").textContent = course.description || course.summary || course.subtitle || "";
  document.title = `${course.title || course.name || language.name || course.language} · Illustrated Input`;
  renderLessonList();
}

function renderLessonList() {
  const done = completedLessons();
  const entries = lessonEntries(state.course);
  $("#lesson-list").replaceChildren(...entries.map((entry, index) => {
    const id = lessonId(entry);
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button"; button.className = "lesson-link";
    if (!lessonAvailable(entry)) { button.disabled = true; button.title = "Planned lesson"; }
    if (index === state.lessonIndex) button.setAttribute("aria-current", "page");
    button.innerHTML = `<span class="lesson-number">${String(index + 1).padStart(2, "0")}</span><span></span><span class="lesson-check" aria-label="${done.has(id) ? "Finished" : "Not finished"}">${done.has(id) ? "✓" : ""}</span>`;
    button.children[1].textContent = lessonTitle(entry);
    if (lessonAvailable(entry)) button.addEventListener("click", () => openLesson(index)); li.append(button); return li;
  }));
  const available = entries.filter(lessonAvailable);
  const completedAvailable = available.filter((entry) => done.has(lessonId(entry))).length;
  const pct = available.length ? Math.round(completedAvailable / available.length * 100) : 0;
  $("#progress-count").textContent = `${completedAvailable} / ${available.length}`;
  $("#progress-fill").style.width = `${pct}%`;
  $(".progress-track").setAttribute("aria-valuenow", String(pct));
}

async function openLesson(index) {
  const entries = lessonEntries(state.course);
  if (index < 0 || index >= entries.length) return;
  if (!lessonAvailable(entries[index])) return;
  state.lessonIndex = index; const entry = entries[index]; const id = lessonId(entry);
  $("#loading").hidden = false; $("#lesson").hidden = true; $("#error").hidden = true;
  try {
    if (!state.lessons.has(id)) {
      const base = COURSE_URL.slice(0, COURSE_URL.lastIndexOf("/") + 1);
      const lesson = await loadJSON(new URL(lessonPath(entry), new URL(base, location.href)).href);
      const sources = lesson.media?.audio_sources || (lesson.media?.audio_manifest ? [{ id: "default", label: "Default", manifest: lesson.media.audio_manifest, default: true }] : []);
      if (sources.length) {
        lesson._audioSources = await Promise.all(sources.map(async (source) => {
          const manifestUrl = new URL(source.manifest, new URL(base, location.href));
          return { ...source, data: await loadJSON(manifestUrl.href), base: new URL("./", manifestUrl).href };
        }));
        const savedSource = localStorage.getItem(`illustrated-input:${lesson.course_id}:audio-source`);
        lesson._selectedAudioSource = lesson._audioSources.find((source) => source.id === savedSource) || lesson._audioSources.find((source) => source.default) || lesson._audioSources[0];
        lesson._audioManifest = lesson._selectedAudioSource.data;
        lesson._audioBase = lesson._selectedAudioSource.base;
      }
      state.lessons.set(id, lesson);
    }
    renderLesson(state.lessons.get(id)); location.hash = encodeURIComponent(id);
    renderLessonList(); $("#course-nav").classList.remove("open"); $(".nav-toggle").setAttribute("aria-expanded", "false");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) { showError(error); }
}

function renderLesson(lesson) {
  $("#loading").hidden = true; $("#lesson").hidden = false;
  $("#lesson-kicker").textContent = `Lesson ${lesson.order || state.lessonIndex + 1}`;
  $("#lesson-title").textContent = lesson.title;
  const contract = lesson.learning_contract || {};
  $("#lesson-goal").textContent = contract.communicative_goal || contract.communicative_goals?.join(" · ") || lesson.summary || "";
  $("#lesson-status").textContent = lesson.status || "draft";
  renderStory(lesson.story || lesson.sections || [], lesson);
  renderVocabulary(lesson.vocabulary || []);
  renderGrammar(lesson.grammar_observation || lesson.grammar || {});
  renderExercises(lesson.pensa || lesson.exercises || {});
  updateFinishButton(lesson);
  $("#anki-button").onclick = () => downloadAnki(lesson);
  $("#finish-button").onclick = () => toggleFinished(lesson);
  const hasAudio = Boolean(lesson._audioManifest?.lesson);
  $("#audio-toolbar").hidden = !hasAudio;
  if (hasAudio) {
    $("#play-lesson").onclick = () => playAudio(new URL(lesson._audioManifest.lesson, lesson._audioBase).href, $("#play-lesson"));
    const selector = $("#audio-source"); selector.replaceChildren(...lesson._audioSources.map((source) => new Option(source.label, source.id, false, source.id === lesson._selectedAudioSource.id)));
    selector.onchange = () => {
      mediaPlayer.pause(); const source = lesson._audioSources.find((item) => item.id === selector.value);
      lesson._selectedAudioSource = source; lesson._audioManifest = source.data; lesson._audioBase = source.base;
      localStorage.setItem(`illustrated-input:${lesson.course_id}:audio-source`, source.id);
      renderStory(lesson.story || lesson.sections || [], lesson);
      $("#play-lesson").onclick = () => playAudio(new URL(lesson._audioManifest.lesson, lesson._audioBase).href, $("#play-lesson"));
      toast(`Audio source: ${source.label}`);
    };
  }
  const previous = adjacentAvailableIndex(-1), next = adjacentAvailableIndex(1);
  $("#previous-button").disabled = previous < 0;
  $("#next-button").disabled = next < 0;
  $("#previous-button").onclick = () => openLesson(previous);
  $("#next-button").onclick = () => openLesson(next);
}

function renderStory(sections, lesson) {
  if (!Array.isArray(sections)) sections = sections.sections || [];
  $("#story").replaceChildren(...sections.map((section, sectionIndex) => {
    const wrap = document.createElement("section"); wrap.className = "story-section";
    if (section.title) { const h = document.createElement("h4"); h.textContent = section.title; wrap.append(h); }
    const segments = section.segments || section.sentences || (section.text ? [{ text: section.text }] : []);
    const paragraph = document.createElement("p"); paragraph.className = "story-prose";
    paragraph.lang = state.course.language_code || state.course.language?.code || "cy";
    segments.forEach((segment, index) => {
      const sentence = document.createElement("span");
      sentence.id = segment.id || `segment-${sectionIndex}-${index}`;
      sentence.textContent = segment.text || segment.target_text;
      const audioFile = lesson._audioManifest?.segments?.[segment.id];
      if (audioFile) {
        sentence.classList.add("has-audio"); sentence.tabIndex = 0; sentence.setAttribute("role", "button"); sentence.setAttribute("aria-label", `Play: ${sentence.textContent}`);
        const play = () => playAudio(new URL(audioFile, lesson._audioBase).href, sentence);
        sentence.addEventListener("click", play); sentence.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); play(); } });
      }
      paragraph.append(sentence, document.createTextNode(" "));
    });
    const presentedAids = segments.flatMap((segment) => segment.inference_aids || segment.aids || []).filter((aid) => aid.presentation);
    const marginAids = presentedAids.filter((aid) => aid.presentation === "margin_diagram");
    const sceneAids = presentedAids.filter((aid) => aid.presentation === "inline_scene");
    const readingRow = document.createElement("div"); readingRow.className = "reading-row"; readingRow.append(paragraph);
    if (marginAids.length) {
      const margin = document.createElement("aside"); margin.className = "margin-aids"; margin.setAttribute("aria-label", "Reading aids");
      margin.replaceChildren(...marginAids.map((aid) => renderAid(aid, "Margin diagram"))); readingRow.append(margin);
    }
    wrap.append(readingRow, ...sceneAids.map((aid) => renderAid(aid, "Scene illustration"))); return wrap;
  }));
}

function renderAid(aid, label) {
  const figure = document.createElement("figure"); figure.className = `reading-aid ${aid.presentation.replaceAll("_", "-")}`;
  const media = document.createElement("img"); media.className = "aid-image"; media.src = new URL(aid.src, new URL(COURSE_URL, location.href)).href; media.alt = aid.alt || ""; media.loading = "lazy";
  figure.append(media); return figure;
}

const mediaPlayer = new Audio();
let activeAudioTarget = null;
function playAudio(src, target) {
  if (mediaPlayer.src === src && !mediaPlayer.paused) { mediaPlayer.pause(); return; }
  if (activeAudioTarget) activeAudioTarget.classList.remove("audio-playing");
  activeAudioTarget = target; target.classList.add("audio-playing"); mediaPlayer.src = src; mediaPlayer.play().catch(() => target.classList.remove("audio-playing"));
}
mediaPlayer.addEventListener("ended", () => { if (activeAudioTarget) activeAudioTarget.classList.remove("audio-playing"); activeAudioTarget = null; });
mediaPlayer.addEventListener("pause", () => { if (activeAudioTarget) activeAudioTarget.classList.remove("audio-playing"); });

function renderVocabulary(words) {
  $("#vocab-count").textContent = `${words.length} new ${words.length === 1 ? "word" : "words"}`;
  const dl = document.createElement("dl"); dl.className = "vocab-list";
  const partLabels = { adjective: "adj.", adverb: "adv.", noun: "n.", verb: "v.", article: "art.", conjunction: "conj.", preposition: "prep.", pronoun: "pron.", "particle/preposition": "particle / prep." };
  for (const word of words) { const row = document.createElement("div"); row.className = "vocab-row"; const dt = document.createElement("dt"); dt.textContent = word.citation_form || word.display_form || word.front; const dd = document.createElement("dd"); const pos = word.part_of_speech || word.pos || ""; const badge = document.createElement("span"); badge.className = "pos-label"; badge.textContent = partLabels[pos] || pos; const sense = document.createElement("span"); sense.textContent = word.current_sense || word.sense || word.meaning || ""; if (pos) dd.append(badge); dd.append(sense); row.append(dt, dd); dl.append(row); }
  $("#vocabulary").replaceChildren(dl);
}

function renderGrammar(grammar) {
  if (typeof grammar === "string") grammar = { target_language: grammar };
  const fragment = document.createDocumentFragment();
  const primary = grammar.target_language || grammar.observation || grammar.text || grammar.note;
  if (primary) { const p = document.createElement("p"); p.className = "grammar-note"; p.lang = state.course.language_code || state.course.language?.code || "cy"; p.textContent = primary; fragment.append(p); }
  const bridge = grammar.bridge_language || grammar.bridge_note || grammar.reference;
  if (bridge) { const p = document.createElement("p"); p.className = "grammar-bridge"; p.textContent = bridge; fragment.append(p); }
  $("#grammar").replaceChildren(fragment);
}

function exerciseGroups(pensa) {
  if (Array.isArray(pensa)) return pensa;
  return ["A", "B", "C"].map((key) => pensa[key] || pensa[key.toLowerCase()]).filter(Boolean).map((value, i) => ({ label: "ABC"[i], ...(Array.isArray(value) ? { items: value } : value) }));
}
function renderExercises(pensa) {
  $("#exercises").replaceChildren(...exerciseGroups(pensa).map((group, index) => {
    const section = document.createElement("section"); section.className = "pensa-group";
    const header = document.createElement("header"); const label = group.label || group.type || "ABC"[index]; header.innerHTML = `<h4>Pensum ${label}</h4><p></p>`; header.children[1].textContent = group.instructions || group.description || ["Form and pattern", "Meaning and words", "Understand and respond"][index]; section.append(header);
    for (const item of group.items || group.questions || group.exercises || []) section.append(renderExercise(item)); return section;
  }));
}

function renderExercise(item) {
  const wrap = document.createElement("div"); wrap.className = "exercise";
  const prompt = document.createElement("p"); prompt.className = "prompt"; prompt.lang = state.course.language_code || state.course.language?.code || "cy"; prompt.textContent = item.prompt || item.question || item.text; wrap.append(prompt);
  const feedback = document.createElement("p"); feedback.className = "feedback"; feedback.setAttribute("aria-live", "polite");
  if (item.choices?.length) {
    const choices = document.createElement("div"); choices.className = "choices"; let selected = "";
    for (const value of item.choices) { const button = document.createElement("button"); button.type = "button"; button.className = "choice"; button.textContent = typeof value === "string" ? value : value.text; button.onclick = () => { selected = button.textContent; choices.querySelectorAll("button").forEach((b) => b.classList.toggle("selected", b === button)); }; choices.append(button); }
    const actions = exerciseButtons(() => selected, feedback, item); wrap.append(choices, actions, feedback);
  } else {
    const row = document.createElement("div"); row.className = "answer-row"; const input = document.createElement("input"); input.type = "text"; input.autocomplete = "off"; input.setAttribute("aria-label", "Your answer");
    const check = document.createElement("button"); check.type = "button"; check.textContent = "Check"; check.onclick = () => checkAnswer(input.value, feedback, item); input.addEventListener("keydown", (e) => { if (e.key === "Enter") check.click(); });
    const reveal = document.createElement("button"); reveal.type = "button"; reveal.textContent = "Reveal"; reveal.onclick = () => revealAnswer(feedback, item); row.append(input, check, reveal); wrap.append(row, feedback);
  } return wrap;
}
function exerciseButtons(getValue, feedback, item) { const actions = document.createElement("div"); actions.className = "exercise-actions"; const check = document.createElement("button"); check.type="button"; check.textContent="Check"; check.onclick=()=>checkAnswer(getValue(),feedback,item); const reveal=document.createElement("button"); reveal.type="button"; reveal.textContent="Reveal"; reveal.onclick=()=>revealAnswer(feedback,item); actions.append(check,reveal); return actions; }
function checkAnswer(value, feedback, item) { const answers=accepted(item); const correct=answers.includes(normalise(value)); feedback.className=`feedback ${correct ? "correct" : "incorrect"}`; feedback.textContent=correct ? "That’s it." : (value ? "Not quite — try again or reveal the answer." : "Choose or enter an answer first."); }
function revealAnswer(feedback, item) { const raw=item.accepted_answers || item.answers || item.answer; feedback.className="feedback"; feedback.textContent=raw ? `Answer: ${(Array.isArray(raw) ? raw : [raw]).join(" / ")}` : (item.rubric || "Compare your answer with the story."); }

function toggleFinished(lesson) { const done=toggleCompleted(localStorage, completedKey(), lesson.id); updateFinishButton(lesson); renderLessonList(); toast(done.has(lesson.id) ? "Lesson finished — da iawn!" : "Lesson marked unfinished."); }
function updateFinishButton(lesson) { const finished=completedLessons().has(lesson.id); $("#finish-button").textContent=finished ? "✓ Lesson finished" : "Mark lesson finished"; $("#finish-heading").textContent=finished ? "Lesson complete" : "Finish this lesson"; }
function downloadAnki(lesson) {
  const metadata=lesson.anki_export || lesson.export || {}; const cards=metadata.cards || lesson.vocabulary || [];
  const rows=[["guid","front","back","tags","source"]];
  for (const card of cards) { const lexeme=card.lexeme_id || card.id; const stage=card.card_stage || "intro"; const guid=card.guid || `${state.course.id}:${lexeme}:${stage}`; const front=card.front || card.citation_form || card.display_form; const example=card.example || card.example_sentence || ""; const sense=card.back || card.current_sense || card.sense || card.meaning || ""; const back=example ? `${sense}<br><i>${example}</i>` : sense; const tags=Array.isArray(card.tags) ? card.tags.join(" ") : card.tags || `${state.course.id} ${lesson.id}`; rows.push([guid,front,back,tags,card.source || lesson.id]); }
  const body=rows.map((row)=>row.map(tsvField).join("\t")).join("\n"); const blob=new Blob([body],{type:"text/tab-separated-values;charset=utf-8"}); const url=URL.createObjectURL(blob); const link=document.createElement("a"); link.href=url; link.download=`${state.course.id}-${lesson.id}-anki.tsv`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),0); toast(`Downloaded ${cards.length} Anki cards.`);
}
function toast(message) { const el=$("#toast"); el.textContent=message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove("show"),2400); }
function showError(error) { $("#loading").hidden=true; $("#lesson").hidden=true; $("#error").hidden=false; $("#error").textContent=`The course could not be opened. ${error.message} Run this site through a local web server rather than opening index.html directly.`; }

$(".nav-toggle").addEventListener("click", (event) => { const open=$("#course-nav").classList.toggle("open"); event.currentTarget.setAttribute("aria-expanded", String(open)); });
window.addEventListener("hashchange", () => { const index=lessonEntries(state.course || {}).findIndex((entry)=>lessonId(entry)===decodeURIComponent(location.hash.slice(1))); if(index>=0 && index!==state.lessonIndex) openLesson(index); });
init();
