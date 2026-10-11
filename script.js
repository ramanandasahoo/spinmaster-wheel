/* SpinMaster – script.js
   PART 1 of 2: constants, data, storage, undo/redo, wheel drawing, spin engine.
   PART 2 (next): page wiring, option editor, presets, saved wheels, settings, init.
   Part 2 is appended directly after this part to form the single file script.js.
   Part 2 supplies these functions used here: toast(), afterOptionsChange(),
   renderHistory(). */
'use strict';

/* ---------- Constants ---------- */
const STORE = 'spinmaster.v1.';
const LIMITS = { options: 100, label: 60, name: 40, weight: 100, history: 100, saved: 50, presets: 30, undo: 50 };
const TAU = Math.PI * 2;
const POINTER_ANGLE = -Math.PI / 2; /* the pointer sits at the top of the wheel */
const WHEEL_FONT = '"Trebuchet MS", Roboto, "Segoe UI", system-ui, sans-serif';
const HEX = /^#[0-9a-f]{6}$/i;

const PALETTES = [
  { id: 'candy', name: 'Candy pop', colors: ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5', '#f78c6b', '#4cc9f0', '#b5179e'] },
  { id: 'ocean', name: 'Ocean', colors: ['#0077b6', '#00b4d8', '#48cae4', '#2a9d8f', '#264653', '#5e60ce', '#7ae0d0', '#3a86ff'] },
  { id: 'sunset', name: 'Sunset', colors: ['#d62828', '#f77f00', '#fcbf49', '#e5446d', '#9d4edd', '#ff7b54', '#c9184a', '#ffb703'] },
  { id: 'forest', name: 'Forest', colors: ['#2d6a4f', '#52b788', '#95d5b2', '#b08968', '#6a994e', '#bc6c25', '#386641', '#a7c957'] },
  { id: 'jewel', name: 'Jewel', colors: ['#6a0dad', '#0f9d8a', '#d4a017', '#c1121f', '#1d4ed8', '#db2777', '#047857', '#7c3aed'] }
];

const numberRange = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
const BUILTIN_PRESETS = [
  { id: 'yes-no', name: 'Yes / No', options: ['Yes', 'No'] },
  { id: 'true-false', name: 'True / False', options: ['True', 'False'] },
  { id: 'days', name: 'Days of the Week', options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
  { id: 'num-10', name: 'Numbers 1–10', options: numberRange(1, 10) },
  { id: 'num-20', name: 'Numbers 1–20', options: numberRange(1, 20) },
  { id: 'food', name: 'Food Picker', options: ['Pizza', 'Burgers', 'Sushi', 'Tacos', 'Pasta', 'Salad', 'Curry', 'Sandwiches'] },
  { id: 'colors', name: 'Color Wheel', options: ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Pink', 'Brown'],
    colors: ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#ec407a', '#795548'] },
  { id: 'directions', name: 'Directions', options: ['North', 'North East', 'East', 'South East', 'South', 'South West', 'West', 'North West'] },
  { id: 'lucky', name: 'Lucky Numbers', options: ['3', '7', '9', '13', '21', '42', '77', '88'] },
  { id: 'emoji', name: 'Emoji Fun', options: ['😀', '😎', '🥳', '🤖', '👻', '🦄', '🍕', '🚀'] },
  { id: 'classroom', name: 'Classroom Name Picker', options: numberRange(1, 10).map((n) => 'Student ' + n) },
  { id: 'challenge', name: 'Custom Challenge', options: ['Do 10 jumping jacks', 'Sing a song', 'Tell a joke', 'Dance for 20 seconds', 'Draw a doodle', 'Say a tongue twister', 'Do an impression', 'Share a fun fact'] }
];

const ELEMENT_IDS = ('theme-color theme-btn fullscreen-btn install-btn wheel-name-display wheel-stage wheel-canvas ' +
  'wheel-description confetti-canvas spin-btn spin-hint winner-card winner-text spin-again-btn add-form new-option-input ' +
  'add-option-btn option-error undo-btn redo-btn sort-btn shuffle-btn copy-btn export-btn clear-btn weighted-toggle ' +
  'option-count options-empty option-list import-text import-append-btn import-replace-btn import-file builtin-presets ' +
  'custom-presets-empty custom-presets-list preset-form preset-name-input preset-save-btn palette-options duration-range ' +
  'duration-output sound-toggle confetti-toggle elimination-toggle reduced-motion-toggle save-wheel-form wheel-name-input ' +
  'save-wheel-btn save-error saved-empty saved-list export-json-btn import-json-text import-json-btn import-json-file ' +
  'history-empty history-list clear-history-btn app-dialog dialog-form dialog-title dialog-message dialog-input-wrap ' +
  'dialog-input-label dialog-input dialog-error dialog-cancel dialog-confirm toast-region option-item-template ' +
  'custom-preset-template saved-item-template history-item-template').split(' ');

/* ---------- State ---------- */
const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const state = {
  options: [], /* { id, label, color, weight } */
  wheelName: 'Untitled wheel',
  weighted: false,
  paletteId: 'candy',
  settings: null,
  saved: [], presets: [], history: [],
  rotation: 0, spinning: false, loadWarning: false
};
const els = {};

function defaultSettings() {
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return { duration: 6, sound: false, confetti: true, elimination: false, reducedMotion: motionQuery.matches, theme: dark ? 'dark' : 'light' };
}
function isReducedMotion() { return state.settings.reducedMotion || motionQuery.matches; }

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);
const camel = (id) => id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const mod = (n, m) => ((n % m) + m) % m;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cacheElements() {
  const missing = [];
  ELEMENT_IDS.forEach((id) => { const el = $(id); if (!el) missing.push(id); els[camel(id)] = el; });
  if (missing.length) console.error('SpinMaster: missing elements in index.html: ' + missing.join(', '));
  return missing.length === 0;
}

/* Random numbers: crypto-based, unbiased (rejection sampling). */
function randomUint32() {
  const c = window.crypto;
  if (c && c.getRandomValues) { const a = new Uint32Array(1); c.getRandomValues(a); return a[0]; }
  return Math.floor(Math.random() * 4294967296);
}
function randomFloat() { return randomUint32() / 4294967296; }
function randomInt(n) {
  const limit = Math.floor(4294967296 / n) * n;
  let x;
  do { x = randomUint32(); } while (x >= limit);
  return x % n;
}
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = randomInt(i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  return arr;
}

/* Text and colors */
function cleanLabel(value, max = LIMITS.label) {
  const text = String(value === undefined || value === null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(text).slice(0, max).join('');
}
function normHex(value, fallback) {
  if (typeof value === 'string') {
    let s = value.trim();
    if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    if (HEX.test(s)) return s.toLowerCase();
  }
  return fallback;
}
function hexToRgb(h) { return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); }
function shade(hex, amt) { /* amt > 0 lightens, amt < 0 darkens */
  return 'rgb(' + hexToRgb(hex).map((c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))).join(',') + ')';
}
function textOn(hex) { const [r, g, b] = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1a1f29' : '#ffffff'; }
function paletteById(id) { return PALETTES.find((p) => p.id === id) || PALETTES[0]; }
function paletteColor(i, pid = state.paletteId) { const c = paletteById(pid).colors; return c[i % c.length]; }

/* ---------- Building and validating data ---------- */
function makeOption(label, color, weight) {
  return { id: uid(), label, color, weight: clamp(Math.round(Number(weight)) || 1, 1, LIMITS.weight) };
}
function optionsFromPreset(preset, pid = state.paletteId) {
  return preset.options.map((label, i) => makeOption(label, preset.colors ? preset.colors[i % preset.colors.length] : paletteColor(i, pid), 1));
}
function sanitizeOptions(list, pid) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const raw of list) {
    if (out.length >= LIMITS.options) break;
    const item = typeof raw === 'string' || typeof raw === 'number' ? { label: raw } : raw;
    if (!item || typeof item !== 'object') continue;
    const label = cleanLabel(item.label);
    if (!label) continue;
    out.push(makeOption(label, normHex(item.color, paletteColor(out.length, pid)), item.weight));
  }
  return out;
}
/* Returns a clean wheel object, or null if the data is not usable. Never runs imported data. */
function sanitizeWheel(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const palette = PALETTES.some((p) => p.id === raw.palette) ? raw.palette : 'candy';
  const options = sanitizeOptions(raw.options, palette);
  if (!options.length) return null;
  return { name: cleanLabel(raw.name, LIMITS.name) || 'Untitled wheel', weighted: raw.weighted === true, palette, options };
}
function wheelToJSON(name = state.wheelName) {
  return {
    app: 'SpinMaster', version: 1, name, weighted: state.weighted, palette: state.paletteId,
    options: state.options.map((o) => ({ label: o.label, color: o.color, weight: o.weight }))
  };
}
function applyWheelData(w) { /* copies options so saved data is never shared with live state */
  state.options = w.options.map((o) => makeOption(o.label, o.color, o.weight));
  state.wheelName = w.name;
  state.weighted = w.weighted;
  state.paletteId = w.palette;
}
function sanitizeStoredList(raw, max) {
  const out = [];
  const seen = new Set();
  if (!Array.isArray(raw)) return out;
  for (const r of raw) {
    if (out.length >= max) break;
    const w = sanitizeWheel(r);
    if (!w) continue;
    let id = r && typeof r.id === 'string' ? r.id.slice(0, 40) : '';
    if (!id || seen.has(id)) id = uid();
    seen.add(id);
    out.push(Object.assign({ id }, w));
  }
  return out;
}
function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((h) => {
    if (!h || typeof h !== 'object') return null;
    const winner = cleanLabel(h.winner);
    const time = Number(h.time);
    if (!winner || !Number.isFinite(time)) return null;
    return { winner, wheel: cleanLabel(h.wheel, LIMITS.name) || 'Untitled wheel', time };
  }).filter(Boolean).slice(0, LIMITS.history);
}
function sanitizeSettings(raw, base) {
  const s = Object.assign({}, base);
  if (raw && typeof raw === 'object') {
    s.duration = clamp(Math.round(Number(raw.duration)) || base.duration, 2, 15);
    ['sound', 'confetti', 'elimination', 'reducedMotion'].forEach((k) => { if (typeof raw[k] === 'boolean') s[k] = raw[k]; });
    if (raw.theme === 'dark' || raw.theme === 'light') s.theme = raw.theme;
  }
  return s;
}

/* ---------- Saving and loading (localStorage) ---------- */
function readStore(key) {
  try { const t = localStorage.getItem(STORE + key); return t === null ? null : JSON.parse(t); }
  catch (e) { state.loadWarning = true; return null; }
}
function writeStore(key, value) {
  try { localStorage.setItem(STORE + key, JSON.stringify(value)); return true; }
  catch (e) { return false; }
}
function loadAll() {
  state.settings = sanitizeSettings(readStore('settings'), defaultSettings());
  const stored = sanitizeWheel(readStore('wheel'));
  if (stored) applyWheelData(stored);
  else state.options = optionsFromPreset(BUILTIN_PRESETS.find((p) => p.id === 'food'));
  state.saved = sanitizeStoredList(readStore('saved'), LIMITS.saved);
  state.presets = sanitizeStoredList(readStore('presets'), LIMITS.presets);
  state.history = sanitizeHistory(readStore('history'));
}
let saveTimer = 0;
let saveWarned = false;
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); }
function saveNow() {
  clearTimeout(saveTimer);
  const ok = [
    writeStore('wheel', wheelToJSON()), writeStore('settings', state.settings), writeStore('saved', state.saved),
    writeStore('presets', state.presets), writeStore('history', state.history)
  ].every(Boolean);
  if (!ok && !saveWarned) { saveWarned = true; toast('Could not save to this browser. Changes may be lost when you close the page.'); }
}

/* ---------- Undo and redo (options, weighted mode and palette) ---------- */
const undoStack = [];
const redoStack = [];
let lastSnapshot = '';
function snapshot() {
  return JSON.stringify({ options: state.options.map((o) => ({ label: o.label, color: o.color, weight: o.weight })), weighted: state.weighted, palette: state.paletteId });
}
function resetUndo() { undoStack.length = 0; redoStack.length = 0; lastSnapshot = snapshot(); updateUndoButtons(); }
function updateUndoButtons() {
  els.undoBtn.disabled = state.spinning || !undoStack.length;
  els.redoBtn.disabled = state.spinning || !redoStack.length;
}
/* Call after every finished change. Typing may update state live; call this once on "change". */
function commitChange() {
  const now = snapshot();
  if (now === lastSnapshot) return;
  undoStack.push(lastSnapshot);
  if (undoStack.length > LIMITS.undo) undoStack.shift();
  redoStack.length = 0;
  lastSnapshot = now;
  updateUndoButtons();
}
function restoreSnapshot(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return; }
  const palette = PALETTES.some((p) => p.id === data.palette) ? data.palette : 'candy';
  state.options = sanitizeOptions(data.options, palette);
  state.weighted = data.weighted === true;
  state.paletteId = palette;
  lastSnapshot = snapshot();
  afterOptionsChange();
  updateUndoButtons();
}
function undo() {
  if (state.spinning || !undoStack.length) return false;
  redoStack.push(snapshot());
  restoreSnapshot(undoStack.pop());
  return true;
}
function redo() {
  if (state.spinning || !redoStack.length) return false;
  undoStack.push(snapshot());
  restoreSnapshot(redoStack.pop());
  return true;
}

/* ---------- Wheel geometry ---------- */
/* Segments are laid out clockwise from 3 o'clock. Weighted mode sizes each slice by weight,
   so the picture always matches the odds. */
function getSegments() {
  const n = state.options.length;
  if (!n) return [];
  const total = state.weighted ? state.options.reduce((sum, o) => sum + o.weight, 0) : n;
  let start = 0;
  return state.options.map((opt) => {
    const size = TAU * (state.weighted ? opt.weight : 1) / total;
    const seg = { opt, start, end: start + size };
    start += size;
    return seg;
  });
}
/* Which segment is under the pointer for a given wheel rotation. */
function indexAtPointer(rotation, segs = getSegments()) {
  if (!segs.length) return -1;
  const a = mod(POINTER_ANGLE - rotation, TAU);
  for (let i = 0; i < segs.length; i++) if (a >= segs[i].start && a < segs[i].end) return i;
  return segs.length - 1;
}
function pickWinnerIndex() {
  const n = state.options.length;
  if (!state.weighted) return randomInt(n);
  let r = randomFloat() * state.options.reduce((sum, o) => sum + o.weight, 0);
  for (let i = 0; i < n; i++) { r -= state.options[i].weight; if (r < 0) return i; }
  return n - 1;
}

/* ---------- Wheel drawing (Canvas, high-DPI) ---------- */
let layout = { size: 0, dirty: true, items: [] };
let drawQueued = false;
function invalidateWheel() { layout.dirty = true; requestDraw(); }
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; drawWheel(); });
}
function fitText(ctx, text, maxW, maxFont) {
  let f = maxFont;
  ctx.font = '700 ' + f + 'px ' + WHEEL_FONT;
  while (ctx.measureText(text).width > maxW && f > 10) { f -= 1; ctx.font = '700 ' + f + 'px ' + WHEEL_FONT; }
  if (ctx.measureText(text).width <= maxW) return { text, font: f };
  const chars = Array.from(text);
  while (chars.length > 1 && ctx.measureText(chars.join('') + '…').width > maxW) chars.pop();
  return { text: chars.join('') + '…', font: f };
}
function buildLayout(ctx, segs, r, hub, size) {
  const maxW = r * 0.92 - hub * 1.5;
  layout = {
    size, dirty: false,
    items: segs.map((s) => {
      const thick = 2 * r * 0.6 * Math.sin(Math.min(s.end - s.start, Math.PI) / 2);
      const color = textOn(s.opt.color);
      if (thick < 8) return { text: '', font: 8, color };
      return Object.assign(fitText(ctx, s.opt.label, maxW, clamp(Math.min(r * 0.13, thick * 0.7), 8, 30)), { color });
    })
  };
}
function drawHub(ctx, c, hub) {
  ctx.save();
  ctx.translate(c, c);
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = hub * 0.4; ctx.shadowOffsetY = hub * 0.12;
  const g = ctx.createLinearGradient(-hub, -hub, hub, hub);
  g.addColorStop(0, '#fbfcfd'); g.addColorStop(0.35, '#b9c0cc'); g.addColorStop(0.6, '#eef0f4'); g.addColorStop(1, '#7d8594');
  ctx.beginPath(); ctx.arc(0, 0, hub, 0, TAU); ctx.fillStyle = g; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = hub * 0.08; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.stroke();
  const d = ctx.createRadialGradient(-hub * 0.2, -hub * 0.25, hub * 0.05, 0, 0, hub * 0.62);
  d.addColorStop(0, '#ffffff'); d.addColorStop(1, '#a5adba');
  ctx.beginPath(); ctx.arc(0, 0, hub * 0.62, 0, TAU); ctx.fillStyle = d; ctx.fill();
  ctx.restore();
}
function drawWheel() {
  const canvas = els.wheelCanvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const size = Math.floor(Math.min(rect.width, rect.height));
  if (size < 20) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const px = Math.round(size * dpr);
  if (canvas.width !== px || canvas.height !== px) { canvas.width = px; canvas.height = px; layout.dirty = true; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const segs = getSegments();
  const c = size / 2;
  const r = c - 1;
  const hub = r * 0.17;
  if (!segs.length) {
    ctx.beginPath(); ctx.arc(c, c, r, 0, TAU); ctx.fillStyle = '#e9ecf1'; ctx.fill();
    ctx.fillStyle = '#566074'; ctx.font = '700 ' + Math.round(r * 0.11) + 'px ' + WHEEL_FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Add options', c, c + r * 0.4);
    drawHub(ctx, c, hub);
    return;
  }
  if (layout.dirty || layout.size !== size) buildLayout(ctx, segs, r, hub, size);

  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(state.rotation);
  segs.forEach((s, i) => {
    const col = s.opt.color;
    const g = ctx.createRadialGradient(0, 0, hub, 0, 0, r);
    g.addColorStop(0, shade(col, 0.22)); g.addColorStop(0.6, col); g.addColorStop(1, shade(col, -0.14));
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, s.start, s.end); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke();
    const item = layout.items[i];
    if (item && item.text) {
      ctx.save();
      ctx.rotate((s.start + s.end) / 2);
      ctx.font = '700 ' + item.font + 'px ' + WHEEL_FONT;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      if (item.color === '#ffffff') { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 2; }
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, r * 0.92, 0);
      ctx.restore();
    }
  });
  if (segs.length > 1 && segs.length <= 48) { /* metal pegs on the rim */
    const peg = Math.max(2, r * 0.018);
    segs.forEach((s) => {
      ctx.beginPath(); ctx.arc(Math.cos(s.start) * r * 0.975, Math.sin(s.start) * r * 0.975, peg, 0, TAU);
      ctx.fillStyle = '#f4f5f8'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
    });
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(c, c, r, 0, TAU); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.stroke();
  drawHub(ctx, c, hub);
}

/* ---------- Sound (Web Audio, created only after a tap) ---------- */
/* One shared AudioContext, created or resumed only from a user gesture. Every effect checks
   state.settings.sound, so the existing Sound toggle controls all of them. */
const SFX_MASTER_VOLUME = 0.8; /* overall level, 0 to 1 */
const SFX_MAX_VOICES = 24;     /* hard cap on sounds playing at once */
let audioCtx = null;
let masterGain = null;
let noiseBuffer = null;
let lastTickAt = 0;
let sfxSerial = 0;             /* bumped by result sounds so a button click stays quiet when one plays */
const sfxLast = { click: 0, add: 0, error: 0, win: 0 };
const activeVoices = new Set(); /* { src, nodes, group } for every sound still playing */

function unlockAudio() {
  if (!state.settings.sound) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) {
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = SFX_MASTER_VOLUME;
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state !== 'running') {
      const p = audioCtx.resume();
      if (p && p.catch) p.catch(() => { /* needs a user gesture; the next tap retries */ });
      return p;
    }
  } catch (e) { /* sound is optional */ }
}
/* Sounds play only when sound is on and the context is really running, so nothing queues up
   while the browser still has audio locked. */
function soundReady() { return !!(state.settings.sound && audioCtx && masterGain && audioCtx.state === 'running'); }
function trackVoice(src, nodes, group) {
  const voice = { src, nodes, group };
  activeVoices.add(voice);
  src.onended = () => {
    activeVoices.delete(voice);
    nodes.forEach((n) => { try { n.disconnect(); } catch (e) { /* already gone */ } });
  };
}
/* Silences and releases playing sounds; with a group name, only that group. */
function stopSounds(group) {
  activeVoices.forEach((v) => {
    if (group && v.group !== group) return;
    activeVoices.delete(v);
    try { v.src.onended = null; v.src.stop(); } catch (e) { /* not started or already stopped */ }
    v.nodes.forEach((n) => { try { n.disconnect(); } catch (e) { /* already gone */ } });
  });
}
function stopSpinSound() { stopSounds('tick'); lastTickAt = 0; }
function stopAllSounds() {
  stopSounds();
  lastTickAt = 0;
  if (audioCtx && audioCtx.state === 'running') {
    const p = audioCtx.suspend(); /* also stops all audio work while sound is off */
    if (p && p.catch) p.catch(() => { /* not essential */ });
  }
}
function beep(freq, dur, type, vol, delay = 0, group = 'ui', endFreq = 0) {
  if (!soundReady() || activeVoices.size >= SFX_MAX_VOICES) return;
  try {
    const t = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.005); /* soft attack avoids clicks */
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain); gain.connect(masterGain);
    osc.start(t); osc.stop(t + dur + 0.02);
    trackVoice(osc, [osc, gain], group);
  } catch (e) { /* sound is optional */ }
}
function getNoiseBuffer() { /* built once and reused by every tick */
  if (!noiseBuffer) {
    const len = Math.floor(audioCtx.sampleRate * 0.04);
    noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}
/* Spin tick: a sharp flapper click plus a soft wooden tock. It is called once each time a
   segment passes the pointer, so ticks slow down with the wheel, and it never plays more than
   about 25 per second however fast the wheel moves. */
function playTick() {
  if (!soundReady() || activeVoices.size >= SFX_MAX_VOICES) return;
  const now = performance.now();
  const gap = lastTickAt ? now - lastTickAt : 0;
  if (lastTickAt && gap < 40) return;
  lastTickAt = now;
  const slow = clamp(gap / 400, 0, 1); /* 0 = fast wheel, 1 = nearly stopped: lower and fuller */
  try {
    const t = audioCtx.currentTime;
    const src = audioCtx.createBufferSource();
    src.buffer = getNoiseBuffer();
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 3400 - slow * 1200; filter.Q.value = 2.5;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.3 + slow * 0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);
    src.connect(filter); filter.connect(gain); gain.connect(masterGain);
    src.start(t); src.stop(t + 0.03);
    trackVoice(src, [src, filter, gain], 'tick');
    beep(900 - slow * 380, 0.04, 'triangle', 0.07 + slow * 0.03, 0, 'tick');
  } catch (e) { /* sound is optional */ }
}
/* Winner chime: three rising notes (C, E, G), about 0.7 seconds in all. */
function playWin() {
  sfxSerial++;
  const now = performance.now();
  if (now - sfxLast.win < 400) return;
  sfxLast.win = now;
  beep(523.25, 0.28, 'triangle', 0.12, 0, 'win');
  beep(659.25, 0.28, 'triangle', 0.12, 0.13, 'win');
  beep(783.99, 0.45, 'triangle', 0.12, 0.26, 'win');
}
/* Very short, quiet button click. */
function playClick() {
  const now = performance.now();
  if (now - sfxLast.click < 40) return;
  sfxLast.click = now;
  beep(1800, 0.03, 'sine', 0.06, 0, 'ui', 900);
}
/* Subtle two-note confirmation when an option is added. */
function playAdd() {
  sfxSerial++;
  const now = performance.now();
  if (now - sfxLast.add < 120) return;
  sfxLast.add = now;
  beep(660, 0.09, 'sine', 0.07, 0, 'ui');
  beep(990, 0.12, 'sine', 0.07, 0.07, 'ui');
}
/* Gentle two-note falling tone for invalid input or errors. */
function playError() {
  sfxSerial++;
  const now = performance.now();
  if (now - sfxLast.error < 250) return;
  sfxLast.error = now;
  beep(300, 0.14, 'sine', 0.1, 0, 'ui');
  beep(240, 0.2, 'sine', 0.1, 0.12, 'ui');
}

/* ---------- Confetti ---------- */
let confettiRaf = 0;
function launchConfetti() {
  if (!state.settings.confetti || isReducedMotion()) return;
  const cv = els.confettiCanvas;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rect = els.wheelStage.getBoundingClientRect();
  const colors = paletteById(state.paletteId).colors.concat(['#ffffff']);
  const parts = Array.from({ length: 120 }, () => {
    const a = -Math.PI / 2 + (randomFloat() - 0.5) * Math.PI * 1.1;
    const speed = 6 + randomFloat() * 9;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      w: 6 + randomFloat() * 6, h: 4 + randomFloat() * 5, rot: randomFloat() * TAU, vr: (randomFloat() - 0.5) * 0.4, color: colors[randomInt(colors.length)] };
  });
  cancelAnimationFrame(confettiRaf);
  const t0 = performance.now();
  const step = (now) => {
    const t = now - t0;
    ctx.clearRect(0, 0, W, H);
    let alive = false;
    parts.forEach((p) => {
      p.vy += 0.25; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y < H + 20) alive = true;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = clamp(1 - (t - 2200) / 800, 0, 1);
      ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (alive && t < 3000) confettiRaf = requestAnimationFrame(step);
    else ctx.clearRect(0, 0, W, H);
  };
  confettiRaf = requestAnimationFrame(step);
}

/* ---------- Spinning ---------- */
function canSpin() { return !state.spinning && state.options.length >= 2; }
function updateSpinControls() {
  els.spinBtn.setAttribute('aria-disabled', canSpin() ? 'false' : 'true');
  els.spinHint.textContent = state.spinning ? 'Spinning…'
    : state.options.length < 2 ? 'Add at least 2 options to spin.' : 'Tap Spin to pick a winner.';
}
/* Locks every editing control while the wheel moves, then restores them. */
function setSpinning(on) {
  state.spinning = on;
  if (!on) stopSpinSound(); /* the spin sound can never outlive the spin */
  els.wheelStage.classList.toggle('is-spinning', on);
  document.querySelectorAll('.panels button, .panels input, .panels textarea, #spin-again-btn').forEach((el) => { el.disabled = on; });
  updateUndoButtons();
  updateSpinControls();
}
function showWinner(label) {
  els.winnerText.textContent = label;
  els.winnerCard.classList.add('has-winner');
  els.winnerCard.classList.remove('is-revealed');
  void els.winnerCard.offsetWidth; /* restart the reveal animation */
  els.winnerCard.classList.add('is-revealed');
  els.spinAgainBtn.hidden = false;
}
function clearWinner() {
  els.winnerText.textContent = 'Spin the wheel to pick a winner.';
  els.winnerCard.classList.remove('has-winner', 'is-revealed');
  els.spinAgainBtn.hidden = true;
}
function addHistoryEntry(label) {
  state.history.unshift({ winner: label, wheel: state.wheelName, time: Date.now() });
  if (state.history.length > LIMITS.history) state.history.length = LIMITS.history;
  renderHistory();
  saveSoon();
}
/* The winner is chosen first, the wheel is turned so that winner ends under the pointer,
   and the announced result is then read back from the final wheel position. */
function startSpin() {
  if (state.spinning) return;
  if (state.options.length < 2) { toastError('Add at least 2 options to spin.'); return; }
  unlockAudio();
  const segs = getSegments();
  const planned = pickWinnerIndex();
  const seg = segs[planned];
  const landing = seg.start + (seg.end - seg.start) * (0.12 + randomFloat() * 0.76); /* keep away from the edges */
  const wanted = mod(POINTER_ANGLE - landing, TAU);
  const reduced = isReducedMotion();
  const turns = reduced ? 1 : 4 + randomInt(4);
  const duration = reduced ? Math.min(1500, state.settings.duration * 250) : state.settings.duration * 1000;
  const target = state.rotation + turns * TAU + mod(wanted - mod(state.rotation, TAU), TAU);
  setSpinning(true);
  animateSpin(target, duration, planned);
}
function animateSpin(target, duration, planned) {
  const from = state.rotation;
  const t0 = performance.now();
  let lastIdx = indexAtPointer(from);
  const step = (now) => {
    const t = clamp((now - t0) / duration, 0, 1);
    state.rotation = from + (target - from) * (1 - Math.pow(1 - t, 4));
    drawWheel();
    const idx = indexAtPointer(state.rotation);
    if (idx !== lastIdx) { lastIdx = idx; playTick(); }
    if (t < 1) requestAnimationFrame(frame);
    else finishSpin(target, planned);
  };
  const frame = (now) => {
    try { step(now); } catch (err) { stopSpinSound(); playError(); throw err; }
  };
  requestAnimationFrame(frame);
}
async function finishSpin(target, planned) {
  try {
    stopSpinSound();
    state.rotation = mod(target, TAU);
    drawWheel();
    const index = indexAtPointer(state.rotation);
    const winner = state.options[index];
    if (index !== planned) console.warn('SpinMaster: landed segment differs from plan; announcing the segment under the pointer.');
    showWinner(winner.label);
    addHistoryEntry(winner.label);
    playWin();
    launchConfetti();
    if (state.settings.elimination) {
      await sleep(isReducedMotion() ? 400 : 1100);
      const at = state.options.findIndex((o) => o.id === winner.id);
      if (at !== -1) {
        state.options.splice(at, 1);
        commitChange();
        afterOptionsChange({ keepWinner: true });
        toast('"' + winner.label + '" removed. Use Undo to bring it back.');
      }
    }
  } catch (err) {
    playError();
    throw err;
  } finally {
    setSpinning(false);
  }
}

/* =====================================================================
   PART 2 of 2: toasts, dialog, option editor, presets, saved wheels,
   settings, history display, startup. Appended directly after Part 1.
   ===================================================================== */

/* ---------- Toasts ---------- */
function toast(message) {
  if (!els.toastRegion) { console.log(message); return; }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  els.toastRegion.appendChild(el);
  while (els.toastRegion.children.length > 3) els.toastRegion.firstElementChild.remove();
  setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 300); }, 3200);
}

/* An error message with its gentle warning tone. */
function toastError(message) { playError(); toast(message); }

/* ---------- Dialog (replaces confirm() and prompt()) ---------- */
let dialogResolve = null;
function openDialog(opts) {
  const d = els.appDialog;
  if (typeof d.showModal !== 'function') { /* very old browsers */
    if (opts.input) { const v = window.prompt(opts.title, opts.input.value || ''); return Promise.resolve(v === null ? null : cleanLabel(v, LIMITS.name) || null); }
    return Promise.resolve(window.confirm(opts.title + '\n' + (opts.message || '')) ? true : null);
  }
  return new Promise((resolve) => {
    els.dialogTitle.textContent = opts.title;
    els.dialogMessage.textContent = opts.message || '';
    els.dialogConfirm.textContent = opts.confirmText || 'OK';
    els.dialogInputWrap.hidden = !opts.input;
    els.dialogError.hidden = true;
    els.dialogInput.removeAttribute('aria-invalid');
    if (opts.input) { els.dialogInputLabel.textContent = opts.input.label; els.dialogInput.value = opts.input.value || ''; }
    dialogResolve = resolve;
    d.showModal();
    if (opts.input) { els.dialogInput.focus(); els.dialogInput.select(); } else els.dialogConfirm.focus();
  });
}
function closeDialog(result) {
  const resolve = dialogResolve;
  dialogResolve = null;
  if (els.appDialog.open) els.appDialog.close();
  if (resolve) resolve(result);
}
const askConfirm = (title, message, confirmText) => openDialog({ title, message, confirmText }).then((r) => r === true);
const askName = (title, value, confirmText) => openDialog({ title, input: { label: 'Name', value }, confirmText });
function bindDialog() {
  els.dialogForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (els.dialogInputWrap.hidden) { closeDialog(true); return; }
    const value = cleanLabel(els.dialogInput.value, LIMITS.name);
    if (!value) {
      els.dialogError.textContent = 'Enter a name.';
      els.dialogError.hidden = false;
      playError();
      els.dialogInput.setAttribute('aria-invalid', 'true');
      els.dialogInput.focus();
      return;
    }
    closeDialog(value);
  });
  els.dialogCancel.addEventListener('click', () => closeDialog(null));
  els.appDialog.addEventListener('click', (e) => { if (e.target === els.appDialog) closeDialog(null); });
  els.appDialog.addEventListener('close', () => closeDialog(null));
}

/* ---------- File and clipboard helpers ---------- */
function fileSlug(name) {
  return 'spinmaster-' + (cleanLabel(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'wheel');
}
function downloadFile(filename, text, type) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.hidden = true;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Download started: ' + filename);
  } catch (e) { toastError('Could not create the download in this browser.'); }
}
async function copyText(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* try the fallback */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}
function readFileText(file, maxBytes) {
  return new Promise((resolve) => {
    if (!file) { resolve(null); return; }
    if (file.size > maxBytes) { toastError('That file is too large.'); resolve(null); return; }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => { toastError('Could not read that file.'); resolve(null); };
    reader.readAsText(file);
  });
}

/* ---------- Appearance and settings ---------- */
function applyTheme() {
  const dark = state.settings.theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  els.themeBtn.setAttribute('aria-pressed', String(dark));
  els.themeColor.setAttribute('content', dark ? '#171b22' : '#e4e7ec');
}
function applyReducedMotion() { document.documentElement.dataset.reducedMotion = String(isReducedMotion()); }
function syncSettingsUI() {
  const s = state.settings;
  els.soundToggle.checked = s.sound;
  els.confettiToggle.checked = s.confetti;
  els.eliminationToggle.checked = s.elimination;
  els.reducedMotionToggle.checked = s.reducedMotion;
  els.durationRange.value = String(s.duration);
  els.durationOutput.textContent = s.duration + ' s';
}
function syncNameUI() {
  els.wheelNameDisplay.textContent = state.wheelName;
  els.wheelNameInput.value = state.wheelName;
}
function bindSettings() {
  els.themeBtn.addEventListener('click', () => { state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark'; applyTheme(); saveSoon(); });
  els.soundToggle.addEventListener('change', () => { state.settings.sound = els.soundToggle.checked; if (state.settings.sound) Promise.resolve(unlockAudio()).then(playTick); else stopAllSounds(); saveSoon(); });
  els.confettiToggle.addEventListener('change', () => { state.settings.confetti = els.confettiToggle.checked; saveSoon(); });
  els.eliminationToggle.addEventListener('change', () => { state.settings.elimination = els.eliminationToggle.checked; saveSoon(); });
  els.reducedMotionToggle.addEventListener('change', () => { state.settings.reducedMotion = els.reducedMotionToggle.checked; applyReducedMotion(); saveSoon(); });
  els.durationRange.addEventListener('input', () => {
    state.settings.duration = clamp(Math.round(Number(els.durationRange.value)) || 6, 2, 15);
    els.durationOutput.textContent = state.settings.duration + ' s';
    saveSoon();
  });
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', applyReducedMotion);

  /* Fullscreen */
  const fsOn = () => !!document.fullscreenElement;
  if (!document.fullscreenEnabled) els.fullscreenBtn.hidden = true;
  els.fullscreenBtn.addEventListener('click', () => {
    const job = fsOn() ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    Promise.resolve(job).catch(() => toastError('Fullscreen is not available here.'));
  });
  document.addEventListener('fullscreenchange', () => { els.fullscreenBtn.setAttribute('aria-pressed', String(fsOn())); invalidateWheel(); });

  /* Install prompt (shown only when the browser offers it) */
  els.installBtn.addEventListener('click', async () => {
    if (!installEvent) return;
    const evt = installEvent;
    installEvent = null;
    els.installBtn.hidden = true;
    try { await evt.prompt(); } catch (e) { /* the browser declined to show it */ }
  });
}
let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; if (els.installBtn) els.installBtn.hidden = false; });
window.addEventListener('appinstalled', () => { installEvent = null; if (els.installBtn) els.installBtn.hidden = true; });

/* ---------- Button click sounds ---------- */
/* One delegated listener for the whole page, so a click can never sound twice. The click is
   skipped for disabled buttons, and when the click already produced its own result sound
   (option added, error, winner). */
const CLICK_SOUND_SELECTOR = ['#spin-btn', '#spin-again-btn', '#add-option-btn', '#undo-btn', '#redo-btn', '#sort-btn',
  '#shuffle-btn', '#clear-btn', '#copy-btn', '#export-btn', '#import-append-btn', '#import-replace-btn', '#preset-save-btn',
  '#save-wheel-btn', '#export-json-btn', '#import-json-btn', '#theme-btn', '#fullscreen-btn', '#install-btn',
  '#clear-history-btn', '#dialog-confirm', '#dialog-cancel', '#builtin-presets button', '.load-preset', '.rename-preset',
  '.delete-preset', '.load-wheel', '.rename-wheel', '.export-wheel', '.delete-wheel'].join(',');
function bindSoundEffects() {
  /* Mobile browsers keep audio locked until a tap, so unlock or resume it on the first gesture. */
  document.addEventListener('touchend', () => { if (state.settings.sound) unlockAudio(); }, { passive: true });
  document.addEventListener('click', (e) => {
    if (!state.settings.sound) return;
    unlockAudio();
    const btn = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!btn || !btn.matches(CLICK_SOUND_SELECTOR) || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
    const serial = sfxSerial;
    /* Wait until the button's own handlers (and a form submit) have run, then click only if quiet. */
    setTimeout(() => { if (sfxSerial === serial && state.settings.sound) playClick(); }, 0);
  }, true);
}

/* ---------- Palettes ---------- */
function renderPalettes() {
  const frag = document.createDocumentFragment();
  PALETTES.forEach((p) => {
    const label = document.createElement('label');
    label.className = 'palette-option';
    const input = document.createElement('input');
    input.type = 'radio'; input.name = 'palette'; input.value = p.id; input.className = 'palette-option__input';
    const swatches = document.createElement('span');
    swatches.className = 'palette-option__swatches';
    swatches.setAttribute('aria-hidden', 'true');
    p.colors.slice(0, 5).forEach((c) => { const s = document.createElement('span'); s.className = 'palette-option__swatch'; s.style.background = c; swatches.appendChild(s); });
    const name = document.createElement('span');
    name.className = 'palette-option__name';
    name.textContent = p.name;
    label.append(input, swatches, name);
    frag.appendChild(label);
  });
  els.paletteOptions.replaceChildren(frag);
}
function syncPaletteUI() {
  els.paletteOptions.querySelectorAll('.palette-option').forEach((label) => {
    const input = label.querySelector('input');
    const on = input.value === state.paletteId;
    input.checked = on;
    label.classList.toggle('is-selected', on);
  });
}

/* ---------- Refreshing the page after options change ---------- */
function updateOptionMeta() {
  const n = state.options.length;
  els.optionCount.textContent = n + (n === 1 ? ' option' : ' options') + (n >= LIMITS.options ? ' (maximum)' : '');
  els.optionsEmpty.hidden = n > 0;
  els.wheelCanvas.setAttribute('aria-label', n ? 'Spin wheel with ' + n + (n === 1 ? ' option' : ' options') : 'Empty spin wheel');
  const parts = state.options.slice(0, 20).map((o) => (state.weighted ? o.label + ' (weight ' + o.weight + ')' : o.label));
  els.wheelDescription.textContent = n ? 'Options: ' + parts.join(', ') + (n > 20 ? ', and ' + (n - 20) + ' more.' : '.') : 'The wheel has no options yet.';
}
/* opts.list === false: do not rebuild the option rows (used while typing).
   opts.keepWinner: keep the winner card (used for color and label edits). */
function afterOptionsChange(opts = {}) {
  els.optionList.dataset.weighted = String(state.weighted);
  els.weightedToggle.checked = state.weighted;
  syncPaletteUI();
  if (opts.list !== false) renderOptionList();
  updateOptionMeta();
  invalidateWheel();
  updateSpinControls();
  updateUndoButtons();
  if (!opts.keepWinner) clearWinner();
  saveSoon();
}
function afterWheelLoaded() { syncNameUI(); afterOptionsChange(); }

/* ---------- Option rows ---------- */
function labelRow(li, opt) {
  li.querySelector('.option-color').setAttribute('aria-label', 'Color for ' + opt.label);
  li.querySelector('.option-label').setAttribute('aria-label', 'Option label');
  li.querySelector('.option-weight').setAttribute('aria-label', 'Weight for ' + opt.label + ' (higher means more likely)');
  li.querySelector('.drag-handle').setAttribute('aria-label', 'Reorder ' + opt.label + ' (drag, or use the arrow keys)');
  li.querySelector('.move-up').setAttribute('aria-label', 'Move ' + opt.label + ' up');
  li.querySelector('.move-down').setAttribute('aria-label', 'Move ' + opt.label + ' down');
  li.querySelector('.delete-option').setAttribute('aria-label', 'Delete ' + opt.label);
}
function renderOptionList() {
  const frag = document.createDocumentFragment();
  const last = state.options.length - 1;
  state.options.forEach((opt, i) => {
    const li = els.optionItemTemplate.content.firstElementChild.cloneNode(true);
    li.dataset.id = opt.id;
    li.querySelector('.option-color').value = opt.color;
    li.querySelector('.option-label').value = opt.label;
    li.querySelector('.option-weight').value = String(opt.weight);
    li.querySelector('.move-up').disabled = i === 0;
    li.querySelector('.move-down').disabled = i === last;
    labelRow(li, opt);
    frag.appendChild(li);
  });
  els.optionList.replaceChildren(frag);
}
const rowIndex = (el) => Array.prototype.indexOf.call(els.optionList.children, el.closest('.option-item'));
function focusRow(i, selector) {
  const row = els.optionList.children[i];
  const target = row && (row.querySelector(selector) || row.querySelector('.delete-option'));
  if (target && !target.disabled) target.focus(); else els.newOptionInput.focus();
}
function moveOption(i, dir, selector) {
  const j = i + dir;
  if (j < 0 || j >= state.options.length) return;
  const tmp = state.options[i]; state.options[i] = state.options[j]; state.options[j] = tmp;
  commitChange();
  afterOptionsChange();
  focusRow(j, selector);
}
function onOptionClick(e) {
  const btn = e.target.closest('button');
  if (!btn || state.spinning) return;
  const i = rowIndex(btn);
  if (i < 0) return;
  if (btn.classList.contains('move-up')) moveOption(i, -1, '.move-up');
  else if (btn.classList.contains('move-down')) moveOption(i, 1, '.move-down');
  else if (btn.classList.contains('delete-option')) {
    state.options.splice(i, 1);
    commitChange();
    afterOptionsChange();
    if (state.options.length) focusRow(Math.min(i, state.options.length - 1), '.delete-option'); else els.newOptionInput.focus();
  }
}
function onOptionInput(e) { /* live updates while typing or dragging a slider; no row rebuild */
  const t = e.target;
  const opt = state.options[rowIndex(t)];
  if (!opt) return;
  if (t.classList.contains('option-label')) { const v = cleanLabel(t.value); if (v) { opt.label = v; invalidateWheel(); } }
  else if (t.classList.contains('option-color')) { opt.color = normHex(t.value, opt.color); invalidateWheel(); }
  else if (t.classList.contains('option-weight')) { const n = Math.round(Number(t.value)); if (n >= 1 && n <= LIMITS.weight) { opt.weight = n; invalidateWheel(); } }
}
function onOptionChange(e) { /* finished edit: validate, then record one undo step */
  const t = e.target;
  const row = t.closest('.option-item');
  const opt = state.options[rowIndex(t)];
  if (!opt) return;
  if (t.classList.contains('option-label')) {
    const v = cleanLabel(t.value);
    if (!v) { t.value = opt.label; toastError('An option cannot be empty.'); return; }
    t.value = v; opt.label = v; labelRow(row, opt);
    commitChange(); afterOptionsChange({ list: false, keepWinner: true });
  } else if (t.classList.contains('option-color')) {
    opt.color = normHex(t.value, opt.color); t.value = opt.color;
    commitChange(); afterOptionsChange({ list: false, keepWinner: true });
  } else if (t.classList.contains('option-weight')) {
    const n = clamp(Math.round(Number(t.value)) || 1, 1, LIMITS.weight);
    t.value = String(n); opt.weight = n; labelRow(row, opt);
    commitChange(); afterOptionsChange({ list: false });
  }
}
function onOptionKey(e) {
  const handle = e.target.closest('.drag-handle');
  if (!handle || state.spinning || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  moveOption(rowIndex(handle), e.key === 'ArrowUp' ? -1 : 1, '.drag-handle');
}

/* Drag to reorder (mouse, touch and pen) */
let drag = null;
function clearDropMarks() { els.optionList.querySelectorAll('.drop-before, .drop-after').forEach((r) => r.classList.remove('drop-before', 'drop-after')); }
function onDragStart(e) {
  const handle = e.target.closest('.drag-handle');
  if (!handle || state.spinning || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const li = handle.closest('.option-item');
  e.preventDefault();
  drag = { li, handle, id: e.pointerId, from: rowIndex(handle), to: rowIndex(handle) };
  try { handle.setPointerCapture(e.pointerId); } catch (err) { /* not essential */ }
  li.classList.add('is-dragging');
}
function onDragMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  if (e.clientY < 70) window.scrollBy(0, -14); else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 14);
  clearDropMarks();
  drag.to = drag.from;
  const over = document.elementFromPoint(e.clientX, e.clientY);
  const row = over && over.closest ? over.closest('.option-item') : null;
  if (!row || row === drag.li || row.parentNode !== els.optionList) return;
  const rect = row.getBoundingClientRect();
  const after = e.clientY > rect.top + rect.height / 2;
  row.classList.add(after ? 'drop-after' : 'drop-before');
  let to = rowIndex(row) + (after ? 1 : 0);
  if (drag.from < to) to -= 1;
  drag.to = to;
}
function onDragEnd(e, cancelled) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  clearDropMarks();
  d.li.classList.remove('is-dragging');
  try { d.handle.releasePointerCapture(d.id); } catch (err) { /* not essential */ }
  if (cancelled || d.to === d.from) return;
  const moved = state.options.splice(d.from, 1)[0];
  state.options.splice(d.to, 0, moved);
  commitChange();
  afterOptionsChange();
}

/* ---------- Adding, bulk tools and import/export of options ---------- */
function showOptionError(message) {
  playError();
  els.optionError.textContent = message;
  els.optionError.hidden = false;
  els.newOptionInput.setAttribute('aria-invalid', 'true');
}
function clearOptionError() {
  els.optionError.hidden = true;
  els.newOptionInput.removeAttribute('aria-invalid');
}
function addOption() {
  const label = cleanLabel(els.newOptionInput.value);
  if (!label) { showOptionError('Type an option first.'); els.newOptionInput.focus(); return; }
  if (state.options.length >= LIMITS.options) { showOptionError('You can have up to ' + LIMITS.options + ' options.'); return; }
  clearOptionError();
  state.options.push(makeOption(label, paletteColor(state.options.length), 1));
  commitChange();
  afterOptionsChange();
  els.newOptionInput.value = '';
  els.newOptionInput.focus();
  playAdd();
}
function optionsAsText() { return state.options.map((o) => o.label).join('\n'); }
function parseLines(text) { return String(text).split(/\r?\n/).map((l) => cleanLabel(l)).filter(Boolean); }
function importLines(replace) {
  const lines = parseLines(els.importText.value);
  if (!lines.length) { toastError('Type or paste at least one option, one per line.'); els.importText.focus(); return; }
  const next = replace ? [] : state.options.slice();
  const room = LIMITS.options - next.length;
  if (room <= 0) { toastError('You already have the maximum of ' + LIMITS.options + ' options.'); return; }
  const take = lines.slice(0, room);
  take.forEach((label) => next.push(makeOption(label, paletteColor(next.length), 1)));
  state.options = next;
  commitChange();
  afterOptionsChange();
  els.importText.value = '';
  playAdd();
  toast((replace ? 'Replaced with ' : 'Added ') + take.length + (take.length === 1 ? ' option.' : ' options.') +
    (take.length < lines.length ? ' The rest were skipped (limit ' + LIMITS.options + ').' : ''));
}
function bindOptionTools() {
  els.addForm.addEventListener('submit', (e) => { e.preventDefault(); addOption(); });
  els.newOptionInput.addEventListener('input', clearOptionError);
  els.optionList.addEventListener('click', onOptionClick);
  els.optionList.addEventListener('input', onOptionInput);
  els.optionList.addEventListener('change', onOptionChange);
  els.optionList.addEventListener('keydown', onOptionKey);
  els.optionList.addEventListener('pointerdown', onDragStart);
  els.optionList.addEventListener('pointermove', onDragMove);
  els.optionList.addEventListener('pointerup', (e) => onDragEnd(e, false));
  els.optionList.addEventListener('pointercancel', (e) => onDragEnd(e, true));

  els.undoBtn.addEventListener('click', undo);
  els.redoBtn.addEventListener('click', redo);
  els.sortBtn.addEventListener('click', () => {
    if (state.options.length < 2) { toastError('Add at least 2 options to sort.'); return; }
    state.options.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
    commitChange(); afterOptionsChange();
  });
  els.shuffleBtn.addEventListener('click', () => {
    if (state.options.length < 2) { toastError('Add at least 2 options to shuffle.'); return; }
    shuffleInPlace(state.options);
    commitChange(); afterOptionsChange();
  });
  els.copyBtn.addEventListener('click', async () => {
    if (!state.options.length) { toastError('There are no options to copy.'); return; }
    const ok = await copyText(optionsAsText());
    if (!ok) playError();
    toast(ok ? 'Copied ' + state.options.length + (state.options.length === 1 ? ' option.' : ' options.') : 'Could not copy. Try Export .txt instead.');
  });
  els.exportBtn.addEventListener('click', () => {
    if (!state.options.length) { toastError('There are no options to export.'); return; }
    downloadFile(fileSlug(state.wheelName) + '.txt', optionsAsText() + '\n', 'text/plain');
  });
  els.clearBtn.addEventListener('click', async () => {
    const n = state.options.length;
    if (!n) { toastError('There are no options to remove.'); return; }
    if (!(await askConfirm('Remove all options?', 'This removes all ' + n + ' options. Undo can bring them back.', 'Remove all'))) return;
    state.options = [];
    commitChange(); afterOptionsChange();
    els.newOptionInput.focus();
  });
  els.weightedToggle.addEventListener('change', () => {
    state.weighted = els.weightedToggle.checked;
    commitChange(); afterOptionsChange();
  });
  els.importAppendBtn.addEventListener('click', () => importLines(false));
  els.importReplaceBtn.addEventListener('click', () => importLines(true));
  els.importFile.addEventListener('change', async () => {
    const text = await readFileText(els.importFile.files[0], 200 * 1024);
    els.importFile.value = '';
    if (text === null) return;
    els.importText.value = text;
    toast('File loaded. Choose Add to wheel or Replace options.');
  });
  els.spinBtn.addEventListener('click', startSpin);
  els.spinAgainBtn.addEventListener('click', startSpin);
}

/* ---------- Named lists: custom presets and saved wheels ---------- */
function renderNamedList(listEl, emptyEl, template, items, labels) {
  emptyEl.hidden = items.length > 0;
  const frag = document.createDocumentFragment();
  items.forEach((item) => {
    const li = template.content.firstElementChild.cloneNode(true);
    li.dataset.id = item.id;
    li.querySelector('.item-row__main').textContent = item.name;
    Object.keys(labels).forEach((sel) => { const b = li.querySelector(sel); if (b) b.setAttribute('aria-label', labels[sel] + ' ' + item.name); });
    frag.appendChild(li);
  });
  listEl.replaceChildren(frag);
}
function renderCustomPresets() {
  renderNamedList(els.customPresetsList, els.customPresetsEmpty, els.customPresetTemplate, state.presets,
    { '.load-preset': 'Load preset', '.rename-preset': 'Rename preset', '.delete-preset': 'Delete preset' });
}
function renderSaved() {
  renderNamedList(els.savedList, els.savedEmpty, els.savedItemTemplate, state.saved,
    { '.load-wheel': 'Load wheel', '.rename-wheel': 'Rename wheel', '.export-wheel': 'Export wheel', '.delete-wheel': 'Delete wheel' });
}
function renderKey(key) { if (key === 'presets') renderCustomPresets(); else renderSaved(); }
function bindNamedList(listEl, handlers) {
  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    const li = btn && btn.closest('li');
    if (!btn || !li || state.spinning) return;
    for (const sel in handlers) if (btn.matches(sel)) { handlers[sel](li.dataset.id); return; }
  });
}
async function renameNamed(key, id) {
  const item = state[key].find((x) => x.id === id);
  if (!item) return;
  const next = await askName('Rename', item.name, 'Rename');
  if (!next) return;
  if (key === 'saved' && state.wheelName === item.name) { state.wheelName = next; syncNameUI(); }
  item.name = next;
  renderKey(key); saveSoon();
}
async function removeNamed(key, id) {
  const i = state[key].findIndex((x) => x.id === id);
  if (i < 0) return;
  const noun = key === 'saved' ? 'wheel' : 'preset';
  if (!(await askConfirm('Delete ' + noun + '?', '"' + state[key][i].name + '" will be removed from this device.', 'Delete'))) return;
  state[key].splice(i, 1);
  renderKey(key); saveSoon();
}
function exportObject(w) {
  return { app: 'SpinMaster', version: 1, name: w.name, weighted: w.weighted, palette: w.palette,
    options: w.options.map((o) => ({ label: o.label, color: o.color, weight: o.weight })) };
}
/* Adds or replaces an entry (matched by name, ignoring case) in state.saved or state.presets. */
async function storeNamed(key, name, limit) {
  const list = state[key];
  const same = list.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (same) {
    if (!(await askConfirm('Replace "' + same.name + '"?', 'An item with this name already exists. Its options will be replaced.', 'Replace'))) return null;
  } else if (list.length >= limit) {
    return 'You can keep up to ' + limit + ' of these. Delete one first.';
  }
  const data = sanitizeWheel(wheelToJSON(name));
  if (same) Object.assign(same, data); else list.push(Object.assign({ id: uid() }, data));
  renderKey(key); saveSoon();
  return true;
}

/* ---------- Presets ---------- */
function renderBuiltinPresets() {
  const frag = document.createDocumentFragment();
  BUILTIN_PRESETS.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn--small'; b.dataset.preset = p.id; b.textContent = p.name;
    frag.appendChild(b);
  });
  els.builtinPresets.replaceChildren(frag);
}
function loadBuiltinPreset(id) {
  const p = BUILTIN_PRESETS.find((x) => x.id === id);
  if (!p) return;
  state.options = optionsFromPreset(p);
  state.wheelName = p.name;
  commitChange();
  afterWheelLoaded();
}
function bindPresets() {
  els.builtinPresets.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && !state.spinning && b.dataset.preset) loadBuiltinPreset(b.dataset.preset);
  });
  bindNamedList(els.customPresetsList, {
    '.load-preset': (id) => { const p = state.presets.find((x) => x.id === id); if (p) { applyWheelData(p); commitChange(); afterWheelLoaded(); } },
    '.rename-preset': (id) => renameNamed('presets', id),
    '.delete-preset': (id) => removeNamed('presets', id)
  });
  els.presetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = cleanLabel(els.presetNameInput.value, LIMITS.name);
    if (!name) { toastError('Enter a name for the preset.'); els.presetNameInput.focus(); return; }
    if (!state.options.length) { toastError('Add some options before saving a preset.'); return; }
    const result = await storeNamed('presets', name, LIMITS.presets);
    if (result === true) { els.presetNameInput.value = ''; toast('Preset "' + name + '" saved.'); }
    else if (typeof result === 'string') toastError(result);
  });
}

/* ---------- Saved wheels ---------- */
function showSaveError(message) {
  if (message) playError();
  els.saveError.textContent = message;
  els.saveError.hidden = !message;
  if (message) els.wheelNameInput.setAttribute('aria-invalid', 'true'); else els.wheelNameInput.removeAttribute('aria-invalid');
}
function importWheelText(text) {
  if (text.length > 500000) { toastError('That file is too large.'); return; }
  let data;
  try { data = JSON.parse(text); } catch (e) { toastError('That is not valid JSON.'); return; }
  const w = sanitizeWheel(data);
  if (!w) { toastError('That is not a SpinMaster wheel. It needs an options list.'); return; }
  applyWheelData(w);
  commitChange();
  afterWheelLoaded();
  els.importJsonText.value = '';
  toast('Imported "' + w.name + '". Use Save wheel to keep it.');
}
function bindSavedWheels() {
  els.wheelNameInput.addEventListener('input', () => {
    state.wheelName = cleanLabel(els.wheelNameInput.value, LIMITS.name) || 'Untitled wheel';
    els.wheelNameDisplay.textContent = state.wheelName;
    showSaveError('');
    saveSoon();
  });
  els.saveWheelForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = cleanLabel(els.wheelNameInput.value, LIMITS.name);
    if (!name) { showSaveError('Enter a name for this wheel.'); els.wheelNameInput.focus(); return; }
    if (!state.options.length) { showSaveError('Add at least one option before saving.'); return; }
    showSaveError('');
    const result = await storeNamed('saved', name, LIMITS.saved);
    if (result === true) { state.wheelName = name; syncNameUI(); saveSoon(); toast('Saved "' + name + '".'); }
    else if (typeof result === 'string') showSaveError(result);
  });
  bindNamedList(els.savedList, {
    '.load-wheel': (id) => { const w = state.saved.find((x) => x.id === id); if (w) { applyWheelData(w); commitChange(); afterWheelLoaded(); toast('Loaded "' + w.name + '".'); } },
    '.rename-wheel': (id) => renameNamed('saved', id),
    '.export-wheel': (id) => { const w = state.saved.find((x) => x.id === id); if (w) downloadFile(fileSlug(w.name) + '.json', JSON.stringify(exportObject(w), null, 2), 'application/json'); },
    '.delete-wheel': (id) => removeNamed('saved', id)
  });
  els.exportJsonBtn.addEventListener('click', () => {
    if (!state.options.length) { toastError('There are no options to export.'); return; }
    downloadFile(fileSlug(state.wheelName) + '.json', JSON.stringify(wheelToJSON(), null, 2), 'application/json');
  });
  els.importJsonBtn.addEventListener('click', () => {
    const text = els.importJsonText.value.trim();
    if (!text) { toastError('Paste exported JSON first.'); els.importJsonText.focus(); return; }
    importWheelText(text);
  });
  els.importJsonFile.addEventListener('change', async () => {
    const text = await readFileText(els.importJsonFile.files[0], 500 * 1024);
    els.importJsonFile.value = '';
    if (text !== null) importWheelText(text);
  });
}

/* ---------- History ---------- */
function formatTime(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return { text: '', iso: '' };
  let text;
  try { text = d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { text = d.toLocaleString(); }
  return { text, iso: d.toISOString() };
}
function renderHistory() {
  const frag = document.createDocumentFragment();
  state.history.forEach((h) => {
    const li = els.historyItemTemplate.content.firstElementChild.cloneNode(true);
    li.querySelector('.history-item__winner').textContent = h.winner;
    li.querySelector('.history-item__wheel').textContent = h.wheel;
    const t = formatTime(h.time);
    const timeEl = li.querySelector('.history-item__time');
    timeEl.textContent = t.text;
    if (t.iso) timeEl.dateTime = t.iso;
    frag.appendChild(li);
  });
  els.historyList.replaceChildren(frag);
  els.historyEmpty.hidden = state.history.length > 0;
  els.clearHistoryBtn.hidden = state.history.length === 0;
}
function bindHistory() {
  els.clearHistoryBtn.addEventListener('click', async () => {
    if (!state.history.length) return;
    if (!(await askConfirm('Clear history?', 'All ' + state.history.length + ' recorded spins will be deleted.', 'Clear history'))) return;
    state.history = [];
    renderHistory(); saveSoon();
    toast('History cleared.');
  });
}

/* ---------- Startup ---------- */
function initApp() {
  if (!cacheElements()) return;
  loadAll();
  applyTheme();
  applyReducedMotion();
  renderPalettes();
  renderBuiltinPresets();
  renderCustomPresets();
  renderSaved();
  renderHistory();
  syncNameUI();
  syncSettingsUI();
  bindDialog();
  bindSettings();
  bindSoundEffects();
  bindOptionTools();
  bindPresets();
  bindSavedWheels();
  bindHistory();
  afterOptionsChange();
  resetUndo();
  if (installEvent) els.installBtn.hidden = false;

  if (window.ResizeObserver) new ResizeObserver(invalidateWheel).observe(els.wheelStage);
  window.addEventListener('resize', invalidateWheel);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
  window.addEventListener('pagehide', saveNow);
  requestDraw();
  if (state.loadWarning) toast('Some saved data could not be read, so defaults were used.');
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* offline mode is optional */ }); });
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp); else initApp();
