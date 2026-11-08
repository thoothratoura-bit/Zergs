'use strict';
/* ============================================================
 *  ミドリ島の勇者  —  スマホ対応 見下ろし型アクションアドベンチャー
 *  すべてのグラフィック・音はコードで生成しています（外部素材なし）
 * ============================================================ */
(function () {

// ================= 基本設定 =================
const W = 256, H = 200, HUD_H = 24, TS = 16, COLS = 16, ROWS = 11, VW = 256, VH = 176;
const JFONT = '"Hiragino Maru Gothic ProN","Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP","Noto Sans CJK JP","Yu Gothic UI","Yu Gothic","Meiryo",sans-serif';
const HERO_SPEED = 78, ATTACK_T = 0.24, SPIN_T = 0.42, CHARGE_T = 0.7;
const DIRS = [[0, 1], [0, -1], [-1, 0], [1, 0]]; // 下, 上, 左, 右
const SAVE_KEY = 'midori-hero-save-v1';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let SCALE = 3;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const lerp = (a, b, t) => a + (b - a) * t;
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + (s || 0) * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function circleRect(cx, cy, r, b) {
  const nx = clamp(cx, b.x, b.x + b.w), ny = clamp(cy, b.y, b.y + b.h);
  return (cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) < r * r;
}

// ================= サウンド =================
let actx = null, master = null, sfxGain = null, musGain = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('midori-muted') === '1'; } catch (e) { /* ignore */ }

function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    actx = new AC();
    master = actx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(actx.destination);
    sfxGain = actx.createGain(); sfxGain.gain.value = 0.55; sfxGain.connect(master);
    musGain = actx.createGain(); musGain.gain.value = 0.4; musGain.connect(master);
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    music.next = actx.currentTime + 0.05;
  } catch (e) { actx = null; }
}
function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('midori-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  if (master) master.gain.value = muted ? 0 : 1;
  updateSoundButton();
}
function tone(type, f0, f1, dur, vol, delay) {
  if (!actx) return;
  const t = actx.currentTime + (delay || 0);
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, vol, freq, delay) {
  if (!actx) return;
  const t = actx.currentTime + (delay || 0);
  const s = actx.createBufferSource(); s.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.2), t + dur);
  const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + dur + 0.03);
}
function noteFreq(n) {
  const m = /^([A-G])(#?)(\d)$/.exec(n);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0);
  return 440 * Math.pow(2, ((+m[3] + 1) * 12 + base - 69) / 12);
}
const SFX = {
  sword() { noise(0.09, 0.22, 4500); tone('square', 900, 300, 0.08, 0.05); },
  spin() { for (let i = 0; i < 4; i++) noise(0.08, 0.2, 5000, i * 0.08); tone('square', 400, 1200, 0.3, 0.04); },
  charge() { tone('square', 1200, 1600, 0.1, 0.05); tone('square', 1600, 2200, 0.12, 0.05, 0.09); },
  hit() { tone('square', 420, 90, 0.12, 0.11); },
  kill() { noise(0.25, 0.28, 2500); tone('square', 600, 60, 0.2, 0.07); },
  hurt() { tone('sawtooth', 520, 110, 0.25, 0.14); },
  gem() { tone('square', 1320, 1320, 0.05, 0.07); tone('square', 1980, 1980, 0.1, 0.07, 0.05); },
  heart() { tone('triangle', 660, 660, 0.06, 0.25); tone('triangle', 990, 990, 0.12, 0.25, 0.06); },
  key() { ['E5', 'G5', 'C6'].forEach((n, i) => tone('square', noteFreq(n), noteFreq(n), 0.08, 0.07, i * 0.07)); },
  door() { noise(0.3, 0.3, 700); tone('square', 140, 60, 0.25, 0.07); },
  bomb() { tone('square', 300, 300, 0.04, 0.05); },
  boom() { noise(0.7, 0.6, 1400); tone('sine', 120, 30, 0.5, 0.4); },
  secret() { ['C5', 'E5', 'G5', 'B5', 'D6', 'G6'].forEach((n, i) => tone('triangle', noteFreq(n), noteFreq(n), 0.16, 0.22, i * 0.08)); },
  fanfare() {
    ['G4', 'C5', 'E5', 'G5'].forEach((n, i) => tone('square', noteFreq(n), noteFreq(n), 0.12, 0.06, i * 0.1));
    tone('square', noteFreq('C6'), noteFreq('C6'), 0.7, 0.06, 0.4);
    tone('triangle', noteFreq('C4'), noteFreq('C4'), 0.9, 0.22, 0.4);
  },
  text() { tone('square', 880, 880, 0.02, 0.025); },
  select() { tone('square', 660, 990, 0.06, 0.05); },
  boomerang() { tone('triangle', 650, 900, 0.1, 0.07); },
  shutter() { noise(0.25, 0.3, 900); tone('square', 90, 70, 0.2, 0.06); },
  clank() { tone('square', 1800, 1500, 0.06, 0.05); },
  stomp() { noise(0.45, 0.5, 450); tone('sine', 90, 30, 0.45, 0.45); },
  throw() { tone('square', 300, 650, 0.08, 0.05); },
  error() { tone('square', 220, 220, 0.1, 0.07); tone('square', 160, 160, 0.14, 0.07, 0.11); },
  gameover() { ['E4', 'D#4', 'D4', 'C#4'].forEach((n, i) => tone('triangle', noteFreq(n), noteFreq(n) * 0.98, 0.3, 0.25, i * 0.3)); },
  buy() { ['C5', 'G5'].forEach((n, i) => tone('square', noteFreq(n), noteFreq(n), 0.08, 0.06, i * 0.08)); },
};
function sfx(name) { if (!actx || muted) return; try { SFX[name](); } catch (e) { /* ignore */ } }

// ---- BGM（オリジナル曲） ----
function parseTrack(str) {
  const map = {}; let step = 0;
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '|') continue;
    const [n, l] = tok.split(':');
    const len = l ? +l : 1;
    if (n !== '.') (map[step] || (map[step] = [])).push({ f: noteFreq(n), len });
    step += len;
  }
  return { map, len: step };
}
const SONG_SRC = {
  field: { bpm: 132, tracks: [
    { type: 'square', vol: 0.06, notes: 'C5:2 G4 C5 E5:2 D5 C5 | D5:3 E5 D5:2 G4:2 | A4:2 C5 F5 E5:2 D5 C5 | D5:6 . . | C5:2 G4 C5 E5:2 G5 E5 | F5:3 E5 D5:2 C5 D5 | E5:2 C5 A4 D5:2 B4 G4 | C5:6 . .' },
    { type: 'triangle', vol: 0.16, notes: 'C3 . G3 . C3 . G3 . | G2 . D3 . G2 . D3 . | F2 . C3 . F2 . C3 . | G2 . D3 . G2 . B2 . | C3 . G3 . C3 . G3 . | F2 . C3 . F2 . C3 . | A2 . E3 . G2 . D3 . | C3 . G3 . C3:2 . .' },
  ] },
  dungeon: { bpm: 100, tracks: [
    { type: 'square', vol: 0.045, notes: 'A4:2 C5:2 E5:2 D5 C5 | B4:4 G#4:4 | A4:2 C5:2 F5:2 E5 D5 | E5:8 | F5:2 E5:2 D5:2 C5 B4 | C5:2 B4:2 A4:2 G#4:2 | A4:2 B4 C5 D5:2 C5 B4 | A4:8' },
    { type: 'triangle', vol: 0.16, notes: 'A2 . E3 . A2 . E3 . | E2 . B2 . E2 . G#2 . | F2 . C3 . F2 . C3 . | E2 . B2 . E2 . B2 . | D3 . A2 . D3 . A2 . | A2 . E3 . E2 . G#2 . | F2 . C3 . E2 . B2 . | A2 . E3 . A2:4' },
  ] },
  boss: { bpm: 150, tracks: [
    { type: 'square', vol: 0.055, notes: 'E5 E5 . E5 F5 E5 D#5 E5 | G5 F5 E5 D5 C5 D5 E5:2 | E5 E5 . E5 F5 E5 D#5 E5 | A5 G5 F5 E5 D5:2 B4:2' },
    { type: 'triangle', vol: 0.18, notes: 'A2 A3 A2 A3 A2 A3 A2 A3 | F2 F3 F2 F3 G2 G3 G2 G3 | A2 A3 A2 A3 A2 A3 A2 A3 | D3 D2 D3 D2 E2 E3 E2 E3' },
  ] },
  cave: { bpm: 90, tracks: [
    { type: 'triangle', vol: 0.13, notes: 'C5:2 E5:2 G5:4 | F5:2 D5:2 B4:4 | C5:2 E5:2 A5:4 | G5:8' },
    { type: 'triangle', vol: 0.12, notes: 'C3:4 G2:4 | G2:4 D3:4 | A2:4 E3:4 | C3:8' },
  ] },
  ending: { bpm: 100, tracks: [
    { type: 'triangle', vol: 0.16, notes: 'C5:2 G4 C5 E5:2 D5 C5 | D5:3 E5 D5:2 G4:2 | A4:2 C5 F5 E5:2 D5 C5 | D5:6 . . | C5:2 G4 C5 E5:2 G5 E5 | F5:3 E5 D5:2 C5 D5 | E5:2 C5 A4 D5:2 B4 G4 | C5:8' },
    { type: 'square', vol: 0.03, notes: 'E4:4 G4:4 | B3:4 D4:4 | C4:4 A4:4 | B3:8 | E4:4 G4:4 | A4:4 F4:4 | E4:4 D4:4 | E4:8' },
  ] },
};
const SONGS = {};
for (const k in SONG_SRC) {
  const s = SONG_SRC[k];
  const tracks = s.tracks.map(t => Object.assign({ type: t.type, vol: t.vol }, parseTrack(t.notes)));
  SONGS[k] = { bpm: s.bpm, tracks, len: Math.max(...tracks.map(t => t.len)) };
}
const music = { name: null, song: null, step: 0, next: 0 };
function setMusic(name) {
  if (music.name === name) return;
  music.name = name; music.song = name ? SONGS[name] : null; music.step = 0;
  if (actx) music.next = actx.currentTime + 0.08;
}
function playNote(type, f, t, dur, vol) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.012);
  g.gain.setValueAtTime(vol, t + Math.max(0.02, dur - 0.05));
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g); g.connect(musGain); o.start(t); o.stop(t + dur + 0.03);
}
function updateMusic() {
  if (!actx || !music.song || actx.state !== 'running') return;
  const s = music.song, sd = 60 / s.bpm / 2;
  if (music.next < actx.currentTime - 0.3) music.next = actx.currentTime + 0.05;
  while (music.next < actx.currentTime + 0.2) {
    for (const tr of s.tracks) {
      const notes = tr.map[music.step % tr.len];
      if (notes) for (const n of notes) playNote(tr.type, n.f, music.next, n.len * sd * 0.92, tr.vol);
    }
    music.next += sd;
    music.step = (music.step + 1) % s.len;
  }
}

// ================= スプライト（ドット絵） =================
const PAL = {
  k: '#18141e', w: '#ffffff', h: '#ec8a34', H: '#a9521c', s: '#f9d2aa', S: '#d8996a',
  b: '#3d80ea', d: '#24489e', y: '#ffd84a', n: '#8a5a2c', N: '#55351a',
  g: '#5fd24e', G: '#2e8a33', r: '#e84a4a', R: '#962234', p: '#9b5bd2', P: '#5a2e8c',
  e: '#a9b0ba', E: '#626a76', o: '#ff9c32', c: '#74e8ff', C: '#2a8fcc', t: '#f2e6c2', x: '#34344a',
};
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function makeSprite(rows, pal) {
  pal = pal || PAL;
  const h = rows.length, w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const c = mkCanvas(w, h), g = c.getContext('2d');
  for (let j = 0; j < h; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.' || ch === ' ') continue;
      const col = pal[ch] || PAL[ch];
      if (!col) continue;
      g.fillStyle = col; g.fillRect(i, j, 1, 1);
    }
  }
  return c;
}
const flipCache = new WeakMap(), whiteCache = new WeakMap();
function flipped(img) {
  let c = flipCache.get(img);
  if (!c) {
    c = mkCanvas(img.width, img.height);
    const g = c.getContext('2d'); g.translate(img.width, 0); g.scale(-1, 1); g.drawImage(img, 0, 0);
    flipCache.set(img, c);
  }
  return c;
}
function whitened(img) {
  let c = whiteCache.get(img);
  if (!c) {
    c = mkCanvas(img.width, img.height);
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    whiteCache.set(img, c);
  }
  return c;
}
function flipV(img) { const c = mkCanvas(img.width, img.height), g = c.getContext('2d'); g.translate(0, img.height); g.scale(1, -1); g.drawImage(img, 0, 0); return c; }
function rotCW(img) { const c = mkCanvas(img.height, img.width), g = c.getContext('2d'); g.translate(img.height, 0); g.rotate(Math.PI / 2); g.drawImage(img, 0, 0); return c; }
function spr(img, x, y, flip, white) {
  let im = img;
  if (flip) im = flipped(im);
  if (white) im = whitened(im);
  ctx.drawImage(im, Math.round(x), Math.round(y));
}

const SPR_DATA = {
  pDown1: [
    '................', '.....kkkkkk.....', '....khhhhhhk....', '...khhhhhhhhk...',
    '...khhhhhhhhk...', '...kHhsssshHk...', '...kssksskssk...', '...kssksskssk...',
    '....kssssssk....', '...kkbbbbbbkk...', '..ksbbbyybbbsk..', '..kskbbbbbbksk..',
    '...kddddddddk...', '...kdbbkkbbdk...', '...knnk..knnk...', '...kkkk..kkkk...'],
  pDown2: [
    '................', '.....kkkkkk.....', '....khhhhhhk....', '...khhhhhhhhk...',
    '...khhhhhhhhk...', '...kHhsssshHk...', '...kssksskssk...', '...kssksskssk...',
    '....kssssssk....', '...kkbbbbbbkk...', '..ksbbbyybbbsk..', '..kskbbbbbbksk..',
    '...kddddddddk...', '...kdbbkkbbdk...', '...knnk..kkkk...', '...kkkk.........'],
  pUp1: [
    '................', '.....kkkkkk.....', '....khhhhhhk....', '...khhhhhhhhk...',
    '...khhhhhhhhk...', '...khhhhhhhhk...', '...khHhhhhHhk...', '...kHhhhhhhHk...',
    '....kHHHHHHk....', '...kkbbbbbbkk...', '..ksbbbbbbbbsk..', '..kskbbbbbbksk..',
    '...kddddddddk...', '...kdbbkkbbdk...', '...knnk..knnk...', '...kkkk..kkkk...'],
  pUp2: [
    '................', '.....kkkkkk.....', '....khhhhhhk....', '...khhhhhhhhk...',
    '...khhhhhhhhk...', '...khhhhhhhhk...', '...khHhhhhHhk...', '...kHhhhhhhHk...',
    '....kHHHHHHk....', '...kkbbbbbbkk...', '..ksbbbbbbbbsk..', '..kskbbbbbbksk..',
    '...kddddddddk...', '...kdbbkkbbdk...', '...knnk..kkkk...', '...kkkk.........'],
  pRight1: [
    '................', '....kkkkkkk.....', '...khhhhhhhk....', '..khhhhhhhhhk...',
    '..khhhhhhhhhk...', '..khHhhhssssk...', '..khhhhssskskk..', '..kHhhhssskssk..',
    '...kHhssssssk...', '....kbbbbbbk....', '....kbbbbbsk....', '....kyyyyysk....',
    '....kddddddk....', '....kdbbbbdk....', '....knnkknnk....', '....kkkkkkkk....'],
  pRight2: [
    '................', '....kkkkkkk.....', '...khhhhhhhk....', '..khhhhhhhhhk...',
    '..khhhhhhhhhk...', '..khHhhhssssk...', '..khhhhssskskk..', '..kHhhhssskssk..',
    '...kHhssssssk...', '....kbbbbbbk....', '....kbbbbbsk....', '....kyyyyysk....',
    '....kddddddk....', '...kdbbkkbbdk...', '..knnk....knnk..', '..kkk......kkk..'],
  slime1: [
    '................', '................', '................', '................',
    '......kkkk......', '....kkggggkk....', '...kggggggggk...', '..kggggggggwgk..',
    '..kgggkggkggwk..', '.kggggkggkggggk.', '.kggggggggggggk.', '.kggggggggggggk.',
    '.kGggggggggggGk.', '..kGGGGGGGGGGk..', '...kkkkkkkkkk...', '................'],
  slime2: [
    '................', '................', '................', '................',
    '................', '................', '.....kkkkkk.....', '...kkggggggkk...',
    '..kggggggggwgk..', '.kggggkggkgggwk.', 'kgggggkggkgggggk', 'kggggggggggggggk',
    'kGggggggggggggGk', '.kGGGGGGGGGGGGk.', '..kkkkkkkkkkkk..', '................'],
  bat1: [
    '................', '................', '................', 'k..............k',
    'kk............kk', 'kpk....kk....kpk', 'kppk..kppk..kppk', 'kpppkkprrpkkpppk',
    '.kppppppppppppk.', '..kpppkppkpppk..', '...kk.kwwk.kk...', '.......kk.......',
    '................', '................', '................', '................'],
  bat2: [
    '................', '................', '................', '................',
    '................', '.......kk.......', '......kppk......', '..kkkkprrpkkkk..',
    '.kppppppppppppk.', 'kppkpppkkpppkppk', 'kpk.kkkwwkkk.kpk', 'kk............kk',
    'k..............k', '................', '................', '................'],
  goblin1: [
    '................', '...k........k...', '..kek......kek..', '..kekkkkkkkkek..',
    '...krrrrrrrrk...', '..krrrrrrrrrrk..', '..krrkyrrykrrk..', '..krrkkrrkkrrk..',
    '..krrrrrrrrrrk..', '...krwrrrrwrk...', '...kkrrrrrrkk...', '..krrknnnnkrrk..',
    '..krkknnnnkkrk..', '....knnnnnnk....', '....krrkkrrk....', '....kkk..kkk....'],
  goblin2: [
    '................', '...k........k...', '..kek......kek..', '..kekkkkkkkkek..',
    '...krrrrrrrrk...', '..krrrrrrrrrrk..', '..krrkyrrykrrk..', '..krrkkrrkkrrk..',
    '..krrrrrrrrrrk..', '...krwrrrrwrk...', '...kkrrrrrrkk...', '..krrknnnnkrrk..',
    '..krkknnnnkkrk..', '....knnnnnnk....', '...krrk..krrk...', '...kkk....kkk...'],
  skel1: [
    '................', '.....kkkkkk.....', '....kttttttk....', '...kttttttttk...',
    '...ktkkttkktk...', '...ktkkttkktk...', '...kttttttttk...', '....kttkkttk....',
    '.....ktktkk.....', '...kk.kttk.kk...', '..ktkkttttkktk..', '..kt.kkttkk.tk..',
    '..kk.kttttk.kk..', '.....kk..kk.....', '.....kt..tk.....', '....kkk..kkk....'],
  skel2: [
    '................', '.....kkkkkk.....', '....kttttttk....', '...kttttttttk...',
    '...ktkkttkktk...', '...ktkkttkktk...', '...kttttttttk...', '....kttkkttk....',
    '.....ktktkk.....', '...kk.kttk.kk...', '..ktkkttttkktk..', '..kt.kkttkk.tk..',
    '..kk.kttttk.kk..', '....kk....kk....', '....kt....tk....', '...kkk....kkk...'],
  oldman: [
    '................', '......kkkk......', '.....kppppk.....', '....kppppppk....',
    '....kssssssk....', '...kskksskksk...', '...kssssssssk...', '...kwwwsswwwk...',
    '...kwwwwwwwwk...', '..kpkwwwwwwkpk..', '..kppkwwwwkppk..', '..kpppkwwkpppk..',
    '..kppppppppppk..', '..kppppppppppk..', '..kPPPPPPPPPPk..', '...kkkkkkkkkk...'],
  merchant: [
    '................', '.....kkkkkk.....', '....krrrrrrk....', '...krrrrrrrrk...',
    '..kkkkkkkkkkkk..', '...kssssssssk...', '...kskssssksk...', '...ksssSSsssk...',
    '...kNNNNNNNNk...', '....kssssssk....', '..kkwwwwwwwwkk..', '..kgkwwwwwwkgk..',
    '..kgkwwwwwwkgk..', '..kskwwwwwwksk..', '...kwwwwwwwwk...', '...kkkkkkkkkk...'],
  heart: ['.kk.kk.', 'kwrkrrk', 'krrrrrk', 'krrrrrk', '.krrrk.', '..krk..', '...k...'],
  heartHalf: ['.kk.kk.', 'kwrkEEk', 'krrrEEk', 'krrrEEk', '.krrEk.', '..krk..', '...k...'],
  heartEmpty: ['.kk.kk.', 'kEEkEEk', 'kEEEEEk', 'kEEEEEk', '.kEEEk.', '..kEk..', '...k...'],
  gem: ['...kk...', '..kwgk..', '.kwgggk.', 'kwggggGk', 'kgggggGk', 'kgggggGk', 'kgggggGk', 'kgggggGk', '.kgggGk.', '..kgGk..', '...kk...'],
  key: ['..kkkk..', '.kyyyyk.', 'kyykkyyk', 'kyk..kyk', 'kyykkyyk', '.kyyyyk.', '..kyyk..', '..kyyk..', '..kyyk..', '..kyykk.', '..kyyyyk', '..kyykk.', '..kyyyyk', '..kkkkk.'],
  bosskey: ['..kkkkkk..', '.kooooook.', 'kookkkkook', 'kokrrrrkok', 'kokrwrrkok', 'kookkkkook', '.kooooook.', '...kook...', '...kook...', '...kookkk.', '...koooook', '...kookkk.', '...kooook.', '...kookk..', '...koooook', '...kkkkkk.'],
  bomb: ['.......kyk..', '......k.o...', '....kkkk....', '..kkxxxxkk..', '.kxxwxxxxxk.', '.kxwxxxxxxk.', 'kxxxxxxxxxxk', 'kxxxxxxxxxxk', 'kxxxxxxxxxxk', '.kxxxxxxxxk.', '.kxxxxxxxxk.', '..kkxxxxkk..', '....kkkk....'],
  hc: ['..kkk...kkk..', '.kwrrk.krrrk.', 'kwwrrrkrrrrrk', 'kwrrrrrrrrrrk', 'krrrrrrrrrrrk', 'krrrrrrrrrrRk', '.krrrrrrrrRk.', '..krrrrrrRk..', '...krrrrRk...', '....krrRk....', '.....kRk.....', '......k......'],
  sword: ['...kk...', '..kwwk..', '..kwek..', '..kwek..', '..kwek..', '..kwek..', '..kwek..', '..kwek..', '..kwek..', 'kkkwekkk', 'kyyyyyyk', 'kkkyykkk', '..knnk..', '..knnk..', '..kyyk..', '...kk...'],
  boomerang: ['.kkkkkkkk...', 'kooooooook..', 'koyyyyyyok..', 'koykkkkkk...', 'koyk........', 'koyk........', 'koyk........', 'koyk........', 'kook........', '.kk.........'],
  chest: ['..kkkkkkkkkkkk..', '.knnnnnnnnnnnnk.', 'knnNNNNNNNNNNnnk', 'knnnnnnnnnnnnnnk', 'kyyyyyykkyyyyyyk', 'kkkkkkkyykkkkkkk', 'knnnnnkyyknnnnnk', 'knnnnnnkknnnnnnk', 'knnnnnnnnnnnnnnk', 'kyyyyyyyyyyyyyyk', 'knnnnnnnnnnnnnnk', 'kNNNNNNNNNNNNNNk', '.kkkkkkkkkkkkkk.'],
  chestOpen: ['..kkkkkkkkkkkk..', '.knnnnnnnnnnnnk.', 'kyyyyyyyyyyyyyyk', 'kkkkkkkkkkkkkkkk', 'kxxxxxxxxxxxxxxk', 'kxxxxxxxxxxxxxxk', 'kkkkkkkkkkkkkkkk', 'knnnnnnnnnnnnnnk', 'knnnnnnnnnnnnnnk', 'kyyyyyyyyyyyyyyk', 'knnnnnnnnnnnnnnk', 'kNNNNNNNNNNNNNNk', '.kkkkkkkkkkkkkk.'],
  crystal: ['.....kk.....', '....kwck....', '...kwccCk...', '..kwcccCCk..', '.kwccccCCCk.', 'kwcccccCCCCk', 'kccccccCCCCk', 'kccccccCCCCk', 'kccccccCCCCk', '.kcccccCCCk.', '..kccccCCk..', '...kcccCk...', '....kcCk....', '.....kk.....'],
  potion: ['...kkkk...', '...kwwk...', '....kk....', '...kwwk...', '..kwrrrk..', '.kwrrrrrk.', 'kwrrrrrrrk', 'krrrrrrrrk', 'krrrrrrrRk', '.krrrrrRk.', '..kkkkkk..'],
  gemS: ['..k..', '.kgk.', 'kwggk', 'kgggk', 'kgggk', '.kgk.', '..k..'],
  keyS: ['.kkk.', 'kykyk', 'kyyyk', '.kyk.', '.kyk.', '.kyyk', '.kyk.', '.kyyk', '..k..'],
  bombS: ['....ky.', '..kkk..', '.kxxxk.', 'kxwxxxk', 'kxxxxxk', '.kxxxk.', '..kkk..'],
};

// タイル用のドット絵
const TILE_DATA = {
  tree: { pal: { k: '#163a1b', G: '#2f8d3b', l: '#62c95c', D: '#1d6529', n: '#7a4a22', s: 'rgba(0,0,0,0.18)' }, rows: [
    '.....kkkkkk.....', '...kkGGGGGGkk...', '..kGGlllGGGGGk..', '.kGGllllGGGGGGk.',
    '.kGlllGGGGGGGGk.', 'kGGllGGGGGGlGGGk', 'kGGGGGGGGGllGGGk', 'kGGGGGGGGGGGGGDk',
    'kGGGlGGGGGGGGDDk', '.kGGGGGGGGGGDDk.', '.kDGGGGGGGGDDDk.', '..kDDGGGGDDDDk..',
    '...kkDDDDDDkk...', '.....kknnkk.....', '......knnk......', '.....ssssss.....'] },
  rock: { pal: { k: '#2e2e36', w: '#e8e8f0', e: '#a8a8b8', E: '#6e6e80', s: 'rgba(0,0,0,0.18)' }, rows: [
    '................', '................', '.....kkkkkk.....', '...kkwwweeekk...',
    '..kwwweeeeeeEk..', '.kwweeeeeeeeeEk.', '.kweeeeeeeeeeEk.', 'kweeeeeeeeeeEEEk',
    'keeeeeeeeeeEEEEk', 'keeeeeeeeeEEEEEk', 'keeeeeeeEEEEEEEk', '.keeeeEEEEEEEEk.',
    '.kEEEEEEEEEEEEk.', '..kkEEEEEEEEkk..', '....kkkkkkkk....', '...ssssssssss...'] },
  bush: { pal: { k: '#1d5420', g: '#62d050', G: '#38a03a', w: '#b8f090', s: 'rgba(0,0,0,0.18)' }, rows: [
    '................', '....kkk..kkk....', '...kgggkkgggk...', '..kggwggggwggk..',
    '.kggwgggggggggk.', '.kgggggGggggGgk.', 'kggggGggggGgggGk', 'kgggggggGgggggGk',
    'kgwggGggggggGggk', 'kgggggggwgggggGk', '.kggGgggggggGgk.', '.kGgggggGgggGGk.',
    '..kGGGgggGGGGk..', '...kkGGGGGGkk...', '.....kkkkkk.....', '....ssssssss....'] },
  cactus: { pal: { k: '#1f4a1e', g: '#4caa48', w: '#90e080', s: 'rgba(0,0,0,0.15)' }, rows: [
    '................', '......kkk.......', '.....kgggk......', '.....kgwgk......',
    '.kk..kgggk......', 'kggk.kgwgk..kk..', 'kgwk.kgggk.kggk.', 'kgggkkgwgk.kgwk.',
    '.kgggggggkkkggk.', '..kkkkgwggggggk.', '.....kgggkkkkk..', '.....kgwgk......',
    '.....kgggk......', '.....kgggk......', '....kkkkkkk.....', '...sssssssss....'] },
  sign: { pal: { k: '#3a2410', y: '#d8a860', N: '#8a5a2c', n: '#7a4a22', s: 'rgba(0,0,0,0.18)' }, rows: [
    '................', '................', '.kkkkkkkkkkkkkk.', '.kyyyyyyyyyyyyk.',
    '.kyNNNyNNNNyyyk.', '.kyyyyyyyyyyyyk.', '.kyNNNNyNNNyyyk.', '.kyyyyyyyyyyyyk.',
    '.kNNNNNNNNNNNNk.', '.kkkkkkkkkkkkkk.', '......knnk......', '......knnk......',
    '......knnk......', '......knnk......', '.....ssssss.....', '................'] },
  statue: { pal: { k: '#22222c', e: '#9a9aac', E: '#62627a', w: '#c8c8d8' }, rows: [
    '...kk......kk...', '..kek......kek..', '..keekkkkkkeek..', '...keeeeeeeek...',
    '..keeEkeekEeek..', '..keekkeekkeek..', '..keeeeeeeeeek..', '...keEEEEEEek...',
    '..kkeeeeeeeekk..', '.keekeeeeeekeek.', '.keekeeeeeekeek.', '.kEEkeeeeeekEEk.',
    '..kkkEEEEEEkkk..', '.kwwwwwwwwwwwwk.', '.kEEEEEEEEEEEEk.', '.kkkkkkkkkkkkkk.'] },
  brazier: { pal: { k: '#1a1a22', y: '#c9a040', N: '#5a5a6a' }, rows: [
    '................', '................', '................', '................',
    '................', '................', '................', '..kkkkkkkkkkkk..',
    '..kyyyyyyyyyyk..', '...kNNNNNNNNk...', '....kNNNNNNk....', '.....kNNNNk.....',
    '......kNNk......', '......kNNk......', '.....kkkkkk.....', '....kNNNNNNk....'] },
  arch: { pal: { k: '#3a2010', x: '#050308' }, rows: [
    '................', '................', '....kkkkkkkk....', '...kxxxxxxxxk...',
    '..kxxxxxxxxxxk..', '..kxxxxxxxxxxk..', '.kxxxxxxxxxxxxk.', '.kxxxxxxxxxxxxk.',
    '.kxxxxxxxxxxxxk.', '.kxxxxxxxxxxxxk.', '.kxxxxxxxxxxxxk.', '.kxxxxxxxxxxxxk.',
    '.kxxxxxxxxxxxxk.', '.kxxxxxxxxxxxxk.', '.kxxxxxxxxxxxxk.', '.kxxxxxxxxxxxxk.'] },
};
const MTN_ROWS = [
  'MMMLMMMMMMMLMMMM', 'MMLLLMMMMMLLLMMM', 'MLLMMDMMMLLMMDMM', 'MLMMMDMMLLMMMMDM',
  'MMMMDDMMLMMMMMDM', 'DDDDDMMMMMMMMDDM', 'MMMLMMMDDDDDDDMM', 'MMLLLMMMMLMMMMMD',
  'MLLMMMMMLLLMMMMD', 'MLMMMMDMLMMMMMDD', 'MMMMMMDMMMMMMDDM', 'DMMMMDDMMMMMDDMM',
  'DDDDDDMMMLMMDMMM', 'MMLMMMMMLLLMDMML', 'MLLLMMMLLMMMDMLL', 'MMMMMMMMMMMMDMMM'];

const SP = {}, TL = {};
function buildSprites() {
  for (const k in SPR_DATA) SP[k] = makeSprite(SPR_DATA[k]);
  SP.slimeB1 = makeSprite(SPR_DATA.slime1, Object.assign({}, PAL, { g: '#5aa8f4', G: '#2852ac' }));
  SP.slimeB2 = makeSprite(SPR_DATA.slime2, Object.assign({}, PAL, { g: '#5aa8f4', G: '#2852ac' }));
  SP.gem5 = makeSprite(SPR_DATA.gem, Object.assign({}, PAL, { g: '#74e8ff', G: '#2a8fcc' }));
  SP.gemS5 = makeSprite(SPR_DATA.gemS, Object.assign({}, PAL, { g: '#74e8ff' }));
  SP.swUp = SP.sword;
  SP.swDown = flipV(SP.sword);
  SP.swRight = rotCW(SP.sword);
  SP.swLeft = flipped(SP.swRight);
  for (const k in TILE_DATA) TL[k] = makeSprite(TILE_DATA[k].rows, Object.assign({}, PAL, TILE_DATA[k].pal));
  TL.mtn = makeSprite(MTN_ROWS, { L: '#d39459', M: '#a86b39', D: '#6c3f1d' });
  TL.cwall = makeSprite(MTN_ROWS, { L: '#6e5444', M: '#4b362a', D: '#2a1d15' });
}

// ================= マップデータ =================
//  . 草  , 花  : 砂  T 木  M 山  R 岩  W 水  b 橋  B しげみ(剣で切れる)
//  C 洞窟  D 遺跡入口  S 石壁  I 看板  % ひび割れ(爆弾で壊せる)  Y サボテン  O 石像
//  # 壁  _ 床  L カギ扉  K ボス扉  G シャッター  Q 洞窟の壁  t かがり火
const CAVE_ROWS = [
  'QQQQQQQQQQQQQQQQ', 'QQQQQQQQQQQQQQQQ', 'QQ____________QQ', 'QQ____________QQ',
  'QQ___t____t___QQ', 'QQ____________QQ', 'QQ____________QQ', 'QQ____________QQ',
  'QQ____________QQ', 'QQQQQQQ__QQQQQQQ', 'QQQQQQQ__QQQQQQQ'];

const MAPS = {
  world: { type: 'world', w: 4, h: 3, music: 'field', rooms: [
    [
      { // (0,0) 山の道具屋
        t: ['MMMMMMMMMMMMMMMM', 'MMMMMMMMMMMMMMMM', 'MMMMMCMMMMMMMMMM', 'MM.....I.......M', 'MM..............', 'MM...R..........', 'MM..............', 'MM.....R....R..M', 'MMM............M', 'MMMMM......MMMMM', 'MMMMMMMMMMMMMMMM'],
        e: [['goblin', 7, 6], ['slime', 10, 5], ['slime', 12, 4]],
        warps: { '5,2': { map: 'cave_shop', rx: 0, ry: 0, tx: 7.5, ty: 8, dir: 1 } },
        signs: { '7,3': '↑ 道具屋\n「爆弾 あります」' },
      },
      { // (1,0) 山道
        t: ['MMMMMMMMMMMMMMMM', 'MMMMMMMMMMMMMMMM', 'MM..R......R..MM', 'M..............M', '..........R.....', '....R...........', '................', 'M.....R.....R..M', 'MM.............M', 'MMM..........MMM', 'MMMMMM....MMMMMM'],
        e: [['goblin', 5, 4], ['goblin', 11, 7], ['slime', 8, 3]],
      },
      { // (2,0) 北の湖
        t: ['MMMMMMMMMMMMMMMM', 'MMMTTTTTTTTTTMMM', 'MT....WWWWW...TM', 'T....WWWWWWW..TM', '.....WWWWWWW...M', '......WWWWWW...M', '.........WW....M', 'T.....,..WW....M', 'T..B.....WW...TM', 'TT.......WW...TM', 'TTTTTT....WWTTTM'],
        e: [['slime', 3, 6], ['slime', 6, 8], ['slime', 2, 4]],
        items: [{ k: 'hc', tx: 12, ty: 6, id: 'hc_lake' }],
      },
      { // (3,0) 古の遺跡
        t: ['MMMMMMMMMMMMMMMM', 'MMMSSSSSSSSSSMMM', 'MMSSSSSDDSSSSSMM', 'MT.SS......SS.TM', 'MT............TM', 'MT..O......O..TM', 'MT............TM', 'MT..O......O..TM', 'MT............TM', 'MTTTTTBBBBTTTTTM', 'MTTTTT....TTTTTM'],
        e: [['goblin', 3, 4], ['goblin', 12, 6], ['bat', 7, 5]],
        warps: {
          '7,2': { map: 'dungeon', rx: 1, ry: 2, tx: 7.5, ty: 8.5, dir: 1, cp: true },
          '8,2': { map: 'dungeon', rx: 1, ry: 2, tx: 7.5, ty: 8.5, dir: 1, cp: true },
        },
      },
    ],
    [
      { // (0,1) 西の森
        t: ['TTTTTTTTTTTTTTTT', 'TT,,TTT..TTT,,TT', 'T...T......T...T', 'T.....B..B.....T', 'T..T............', 'T.....TT........', 'T..T............', 'T...B.....T....T', 'TT.....T......TT', 'TTT...........TT', 'TTTTTT....TTTTTT'],
        e: [['slime', 5, 5], ['slime', 9, 7], ['bat', 12, 3], ['bat', 4, 8]],
      },
      { // (1,1) はじまりの草原
        t: ['TTTTTT....TTTTTT', 'TMMMMT.....,..TT', 'TMMCMT........TT', 'T..............T', '................', '......I.........', '................', 'T....,.....B...T', 'T..B.......BB..T', 'TT............TT', 'TTTTTT....TTTTTT'],
        warps: { '3,2': { map: 'cave_sword', rx: 0, ry: 0, tx: 7.5, ty: 8, dir: 1 } },
        signs: { '6,5': '↑北: 山道  ←西: 森\n→東: 川と遺跡  ↓南: 浜辺' },
      },
      { // (2,1) 川の橋
        t: ['TTTTTT....WWTTTT', 'T.........WWT..T', 'T..B......WW...T', 'T.........WW...T', '..........bb....', '..........bb....', '..........bb....', 'T..T......WW...T', 'T......B..WW...T', 'TT........WW..TT', 'TTTTTT....WWTTTT'],
        e: [['slime', 4, 3], ['goblin', 5, 7], ['goblin', 13, 8]],
      },
      { // (3,1) 東の野原
        t: ['MTTTTT....TTTTTM', 'MT...I........TM', 'MT..R......R..TM', 'T..............T', '.....,.........T', '...............T', '...........,...T', 'T..............T', 'T...R......R...T', 'TT............TT', 'TTTTTT....TTTTTT'],
        e: [['goblin', 4, 5], ['goblin', 10, 3], ['slime', 8, 7], ['slime', 12, 6]],
        signs: { '5,1': '↑ 古の遺跡\nしげみは 剣で 切れる。' },
      },
    ],
    [
      { // (0,2) 古い森（ひみつの洞窟）
        t: ['TTTTTT....TTTTTT', 'TMMM%MT....TTTTT', 'T.....I.......TT', 'T..T.....T.....T', 'T...............', 'T......T........', 'T...............', 'T..T.......T...T', 'T.....,,.......T', 'TT...T.....T..TT', 'TTTTTTTTTTTTTTTT'],
        e: [['bat', 4, 4], ['bat', 9, 6], ['bat', 12, 3], ['slime', 7, 8]],
        warps: { '4,1': { map: 'cave_secret', rx: 0, ry: 0, tx: 7.5, ty: 8, dir: 1 } },
        signs: { '6,2': 'ひびの入った 岩は もろい。\n爆弾が あれば…' },
      },
      { // (1,2) 南の浜辺
        t: ['TTTTTT....TTTTTT', 'T,,...........TT', 'T....R.....R...T', 'T.......I......T', '................', '::::::::::::::::', '::::::::::::::::', 'R::R:::::::::R:R', 'RR::::::::::::RR', 'WWWWWWWWWWWWWWWW', 'WWWWWWWWWWWWWWWW'],
        e: [['slime', 4, 6], ['slime', 11, 6], ['goblin', 8, 7]],
        signs: { '8,3': '北の湖の 小島で\nなにかが 光っているらしい。' },
      },
      { // (2,2) 湖のほとり
        t: ['TTTTTT....WWTTTT', 'T.........WW...T', 'T...WWW...WWWW.T', 'T..WWWWW..WWWW.T', '................', '....,.....,.....', '................', 'R:::::::::::::RR', 'RR::::R:::::::RR', 'WWWWWWWWWWWWWWWW', 'WWWWWWWWWWWWWWWW'],
        e: [['goblin', 5, 6], ['goblin', 11, 7], ['slime', 8, 5]],
      },
      { // (3,2) 砂漠
        t: ['TTTTTT::::TTTTTT', 'R::::::::::::::R', 'R:::YY:::::::::R', 'R::::::::::YY::R', ':::::::::::::::R', ':::::::YY::::::R', ':::::::::::::::R', 'R::YY::::::::::R', 'R::::::::::YY::R', 'RR::::::::::::RR', 'RRRRRRRRRRRRRRRR'],
        e: [['goblin', 4, 4], ['goblin', 10, 6], ['goblin', 6, 8], ['slime', 12, 4]],
        items: [{ k: 'gem5', tx: 13, ty: 1, id: 'desert1' }, { k: 'gem5', tx: 14, ty: 1, id: 'desert2' }, { k: 'gem5', tx: 14, ty: 2, id: 'desert3' }],
      },
    ],
  ] },

  dungeon: { type: 'dungeon', w: 3, h: 3, music: 'dungeon', rooms: [
    [
      { // (0,0) ひみつの宝物庫
        t: ['################', '#______________#', '#_t__________t_#', '#______________#', '#______________#', '#______________#', '#______________#', '#______________#', '#_t__________t_#', '#______________#', '#######%%#######'],
        items: [{ k: 'gem5', tx: 5, ty: 4, id: 'ds1' }, { k: 'gem5', tx: 10, ty: 4, id: 'ds2' }, { k: 'gem5', tx: 5, ty: 7, id: 'ds3' }, { k: 'gem5', tx: 10, ty: 7, id: 'ds4' }, { k: 'bomb', tx: 7, ty: 5 }, { k: 'heart', tx: 8, ty: 5 }],
      },
      { // (1,0) ボスの間
        t: ['################', '#______________#', '#_t__________t_#', '#______________#', '#______________#', '#______________#', '#______________#', '#______________#', '#_t__________t_#', '#______________#', '#######GG#######'],
        e: [['golem', 7, 3]],
        boss: true,
        intro: ['ゴゴゴゴ……!', '岩の魔人 ゴロムが あらわれた!'],
        clearDrop: [{ k: 'crystal', tx: 7.5, ty: 4.5, id: 'crystal' }, { k: 'hc', tx: 7.5, ty: 7, id: 'hc_boss' }],
      },
      { // (2,0) 宝の部屋
        t: ['################', '#______________#', '#_t__________t_#', '#______________#', '#______________#', '#______________#', '#______________#', '#______________#', '#_t__________t_#', '#______________#', '#######LL#######'],
        e: [['skeleton', 4, 4], ['skeleton', 11, 6], ['slimeB', 7, 3], ['slimeB', 8, 7]],
        clearDrop: [{ k: 'chest', item: 'boomerang', tx: 7.5, ty: 5, id: 'boomerang' }],
      },
    ],
    [
      { // (0,1) ボスのカギの部屋
        t: ['#######%%#######', '#______________#', '#___WWWWWWWW___#', '#___WWWWWWWW___#', '#___WWW__WWW___#', '#___WWW__WWW___L', '#___WWWWWWWW___#', '#___WWWWWWWW___#', '#___WWWWWWWW___#', '#______________#', '################'],
        e: [['skeleton', 2, 3], ['skeleton', 13, 7], ['bat', 6, 1], ['bat', 9, 9]],
        items: [{ k: 'bosskey', tx: 7.5, ty: 4.5, id: 'bosskey' }],
      },
      { // (1,1) 中央の広間
        t: ['#######KK#######', '#______________#', '#__O________O__#', '#______________#', '#______________#', 'L______________G', '#______________#', '#______________#', '#__O________O__#', '#______________#', '#######__#######'],
        e: [['skeleton', 4, 3], ['skeleton', 11, 3], ['skeleton', 7, 7]],
      },
      { // (2,1) 東の部屋
        t: ['#######LL#######', '#______________#', '#_##________##_#', '#_#__________#_#', '#______________#', '_______________#', '#______________#', '#_#__________#_#', '#_##________##_#', '#______________#', '################'],
        e: [['goblin', 5, 4], ['goblin', 10, 6], ['slimeB', 8, 8]],
        items: [{ k: 'key', tx: 14, ty: 9, id: 'dk2' }],
      },
    ],
    [
      null,
      { // (1,2) 入口
        t: ['#######__#######', '#______________#', '#_O__________O_#', '#______________#', '#______________#', '_______________#', '#______________#', '#______________#', '#_O__________O_#', '#______________#', '#######__#######'],
        e: [['slimeB', 4, 4], ['slimeB', 11, 4], ['slimeB', 7, 7]],
        exitTo: { map: 'world', rx: 3, ry: 0, tx: 7.5, ty: 3, dir: 0, cp: true },
      },
      null,
    ],
  ] },

  cave_sword: { type: 'cave', w: 1, h: 1, music: 'cave', parent: { rx: 1, ry: 1 }, rooms: [[{
    t: CAVE_ROWS,
    npcs: [{ k: 'oldman', tx: 7.5, ty: 4, talk: () => S.hasSword
      ? ['北東の 遺跡に 魔人が ひそんでおる。', 'しげみは 剣で 切りひらけるぞ。\nひびの入った岩は 爆弾で こわせるという。']
      : ['その剣を もっていきなさい。'] }],
    items: [{ k: 'sword', tx: 7.5, ty: 6, id: 'sword' }],
    intro: ['おお、よく来たな。\nわしは この島の 長老じゃ。', '島の外は 魔物で あふれておる。\nこの剣を もっていきなさい。'],
    exitTo: { map: 'world', rx: 1, ry: 1, tx: 3, ty: 3, dir: 0, cp: true },
  }]] },

  cave_shop: { type: 'cave', w: 1, h: 1, music: 'cave', parent: { rx: 0, ry: 0 }, rooms: [[{
    t: CAVE_ROWS,
    npcs: [{ k: 'merchant', tx: 7.5, ty: 4, talk: () => ['いらっしゃい!', 'ほしい品物の 上を あるけば 買えるよ。\nジェムは 魔物を たおすと 手に入るよ。'] }],
    shop: [
      { item: 'bombs', price: 10, tx: 4.5, ty: 6.5 },
      { item: 'hc', price: 50, tx: 7.5, ty: 6.5, id: 'hc_shop' },
      { item: 'potion', price: 5, tx: 10.5, ty: 6.5 },
    ],
    intro: ['いらっしゃい! 道具屋へ ようこそ。', '品物の 上を あるけば 買えるよ。'],
    exitTo: { map: 'world', rx: 0, ry: 0, tx: 5, ty: 3, dir: 0, cp: true },
  }]] },

  cave_secret: { type: 'cave', w: 1, h: 1, music: 'cave', parent: { rx: 0, ry: 2 }, rooms: [[{
    t: CAVE_ROWS,
    items: [{ k: 'hc', tx: 7.5, ty: 5, id: 'hc_secret' }, { k: 'gem5', tx: 4, ty: 6, id: 'cs1' }, { k: 'gem5', tx: 11, ty: 6, id: 'cs2' }],
    exitTo: { map: 'world', rx: 0, ry: 2, tx: 4, ty: 2, dir: 0, cp: true },
  }]] },
};

// 鍵(小)は 西の部屋をクリアすると出現
MAPS.dungeon.rooms[2][0] = { // (0,2) 西の部屋
  t: ['################', '#______________#', '#_WW________WW_#', '#_WW________WW_#', '#______________#', '#_______________', '#______________#', '#_WW________WW_#', '#_WW________WW_#', '#______________#', '################'],
  e: [['bat', 5, 4], ['bat', 10, 5], ['bat', 7, 7], ['bat', 11, 6]],
  clearDrop: [{ k: 'key', tx: 7.5, ty: 5, id: 'dk1' }],
};

const SOLID = new Set(['T', 'M', 'R', 'W', 'B', 'S', 'I', '%', 'Y', '#', 'L', 'K', 'O', 'Q', 't']);
const WALLISH = new Set(['#', 'Q', 'L', 'K', '%', 'G']);

// ================= ゲーム状態 =================
function newSave() {
  return {
    hasSword: false, hasBoomerang: false, hasBombs: false, bossKey: false,
    bombs: 0, maxBombs: 8, gems: 0, keys: 0, maxHp: 6, hp: 6, item: null,
    flags: {}, visited: {}, kills: 0, deaths: 0, time: 0,
    cp: { map: 'world', rx: 1, ry: 1, tx: 7, ty: 6, dir: 0 },
  };
}
let S = newSave();
function saveGame() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.flags) return Object.assign(newSave(), s); } catch (e) { /* ignore */ }
  return null;
}

const G = {
  state: 'title', t: 0, room: null,
  enemies: [], projs: [], pickups: [], effects: [], bombs: [], npcs: [], boomer: null,
  shake: 0, dlg: null, ig: null, scroll: null, fade: null, queued: null,
  titleSel: 0, goSel: 0, msgCd: 0,
};
const hero = {
  x: 112, y: 96, dir: 0, hb: { ox: 3, oy: 7, w: 10, h: 9 },
  anim: 0, attack: 0, spin: 0, charging: false, charge: 0, charged: false,
  inv: 0, kbT: 0, kbx: 0, kby: 0, hitSet: null, dead: 0,
};
const hbr = e => ({ x: e.x + e.hb.ox, y: e.y + e.hb.oy, w: e.hb.w, h: e.hb.h });
const ecx = e => e.x + e.hb.ox + e.hb.w / 2;
const ecy = e => e.y + e.hb.oy + e.hb.h / 2;
const roomKey = r => r.map + ':' + r.rx + ',' + r.ry;

// ================= 部屋 =================
function getDef(map, rx, ry) { const m = MAPS[map]; return (m.rooms[ry] && m.rooms[ry][rx]) || null; }
function loadRoom(map, rx, ry) {
  const def = getDef(map, rx, ry);
  const tiles = def.t.map(r => r.split(''));
  const r = { map, rx, ry, def, tiles, type: MAPS[map].type, cache: null, dirty: true, shutClosed: false, hadEnemies: false, clearedNow: false, hasG: false };
  const pre = 'open:' + map + ':' + rx + ',' + ry + ':';
  for (const k in S.flags) {
    if (k.indexOf(pre) === 0) {
      const [tx, ty] = k.slice(pre.length).split(',').map(Number);
      tiles[ty][tx] = openedChar(r, tx, ty);
    }
  }
  for (const row of tiles) if (row.indexOf('G') >= 0) r.hasG = true;
  G.room = r;
  return r;
}
function openedChar(r, tx, ty) {
  if (r.def.warps && r.def.warps[tx + ',' + ty]) return 'C';
  return r.type === 'world' ? '.' : '_';
}
function tileAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return '';
  return G.room.tiles[ty][tx];
}
function tileRaw(r, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return null;
  return r.tiles[ty][tx];
}
function setTile(tx, ty, ch) { G.room.tiles[ty][tx] = ch; G.room.dirty = true; }
function solidTile(tx, ty, who) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return who !== 'hero';
  const c = G.room.tiles[ty][tx];
  if (c === 'G') return G.room.shutClosed;
  if (who === 'fly') return c === '#' || c === 'Q' || c === 'M' || c === 'T' || c === 'S';
  if (who === 'proj' && c === 'W') return false;
  return SOLID.has(c);
}
function pointSolid(x, y, who) { return solidTile(Math.floor(x / TS), Math.floor(y / TS), who); }

// 扉・ひび割れを開ける（隣の部屋の対応する扉も一緒に）
function openDoorAt(tx, ty) {
  const r = G.room, ch = r.tiles[ty][tx];
  const list = [[tx, ty]], seen = new Set([tx + ',' + ty]);
  for (let i = 0; i < list.length; i++) {
    const [x, y] = list[i];
    for (const [ddx, ddy] of DIRS) {
      const nx = x + ddx, ny = y + ddy, k = nx + ',' + ny;
      if (!seen.has(k) && tileRaw(r, nx, ny) === ch) { seen.add(k); list.push([nx, ny]); }
    }
  }
  for (const [x, y] of list) {
    S.flags['open:' + roomKey(r) + ':' + x + ',' + y] = 1;
    setTile(x, y, openedChar(r, x, y));
    let nrx = r.rx, nry = r.ry, ntx = x, nty = y;
    if (y === 0) { nry--; nty = ROWS - 1; } else if (y === ROWS - 1) { nry++; nty = 0; } else if (x === 0) { nrx--; ntx = COLS - 1; } else if (x === COLS - 1) { nrx++; ntx = 0; } else continue;
    const nd = getDef(r.map, nrx, nry);
    if (nd && 'LK%'.indexOf(nd.t[nty][ntx]) >= 0) S.flags['open:' + r.map + ':' + nrx + ',' + nry + ':' + ntx + ',' + nty] = 1;
  }
  saveGame();
}

function enterRoom() {
  const r = G.room, def = r.def;
  G.enemies = []; G.projs = []; G.pickups = []; G.npcs = []; G.bombs = []; G.boomer = null;
  r.doorMsg = false;
  S.visited[roomKey(r)] = 1;
  const cleared = !!S.flags['clear:' + roomKey(r)];
  if (def.e && !cleared) for (const [type, tx, ty] of def.e) G.enemies.push(spawnEnemy(type, tx, ty));
  r.hadEnemies = G.enemies.length > 0;
  if (def.items) for (const it of def.items) if (!it.id || !S.flags['got:' + it.id]) addPickup(it.k, it.tx * 16 + 8, it.ty * 16 + 8, { id: it.id, life: -1 });
  if (def.clearDrop && cleared) spawnClearDrop(def.clearDrop, false);
  if (def.npcs) for (const n of def.npcs) G.npcs.push({ k: n.k, x: n.tx * 16, y: n.ty * 16, hb: { ox: 2, oy: 4, w: 12, h: 12 }, talk: n.talk });
  if (def.shop) for (const s of def.shop) if (!s.id || !S.flags['got:' + s.id]) G.pickups.push({ kind: 'shop', item: s.item, price: s.price, x: s.tx * 16 + 8, y: s.ty * 16 + 8, id: s.id, z: 0, vz: 0, life: -1 });
  if (def.boss) setMusic(cleared ? 'dungeon' : 'boss');
  else setMusic(MAPS[r.map].music);
  if (def.intro && !S.flags['intro:' + roomKey(r)]) { S.flags['intro:' + roomKey(r)] = 1; showDialog(def.intro); }
  saveGame();
}
function spawnClearDrop(list, fresh) {
  for (const d of list) {
    const got = d.id && S.flags['got:' + d.id];
    if (d.k === 'chest') {
      G.pickups.push({ kind: 'chest', item: d.item, id: d.id, x: d.tx * 16 + 8, y: d.ty * 16 + 8, open: !!got, z: 0, vz: 0, life: -1 });
    } else if (!got) {
      addPickup(d.k, d.tx * 16 + 8, d.ty * 16 + 8, { id: d.id, life: -1 });
    } else continue;
    if (fresh) addEffect('puff', d.tx * 16 + 8, d.ty * 16 + 8);
  }
  if (fresh) sfx('secret');
}
function onRoomClear() {
  const r = G.room, def = r.def;
  if (r.type === 'dungeon') S.flags['clear:' + roomKey(r)] = 1;
  if (r.shutClosed) { r.shutClosed = false; sfx('door'); }
  if (def.clearDrop) spawnClearDrop(def.clearDrop, true);
  if (def.boss) setMusic('dungeon');
  saveGame();
}

// ================= エンティティ =================
const ETYPES = {
  slime: { hp: 2, dmg: 1, hb: { ox: 2, oy: 7, w: 12, h: 8 } },
  slimeB: { hp: 3, dmg: 1, hb: { ox: 2, oy: 7, w: 12, h: 8 } },
  bat: { hp: 1, dmg: 1, hb: { ox: 3, oy: 5, w: 10, h: 6 }, fly: true },
  goblin: { hp: 3, dmg: 1, hb: { ox: 3, oy: 4, w: 10, h: 11 } },
  skeleton: { hp: 4, dmg: 2, hb: { ox: 3, oy: 3, w: 10, h: 12 } },
  golem: { hp: 14, dmg: 2, hb: { ox: 4, oy: 8, w: 24, h: 22 }, boss: true },
};
function spawnEnemy(type, tx, ty) {
  const d = ETYPES[type];
  return {
    type, x: tx * 16, y: ty * 16, hp: d.hp, hb: d.hb, dmg: d.dmg, dir: randi(0, 3),
    t: rand(0.3, 1.2), state: type === 'golem' ? 'walk' : 'idle', spawn: 0.45, inv: 0, stun: 0,
    kbT: 0, kbx: 0, kby: 0, anim: rand(0, 1), z: 0, vx: 0, vy: 0, tvx: 0, tvy: 0, ct: 0,
    boss: !!d.boss, fly: !!d.fly, cd: rand(1.2, 2.5),
  };
}
function addPickup(kind, x, y, o) {
  const p = Object.assign({ kind, x, y, z: 0, vz: 0, life: 9, id: null }, o || {});
  G.pickups.push(p);
  return p;
}
function addEffect(kind, x, y, o) { G.effects.push(Object.assign({ kind, x, y, t: 0 }, o || {})); }
function rollDrop(x, y) {
  const r = Math.random();
  const lowHp = S.hp <= 2;
  if (r < (lowHp ? 0.35 : 0.15)) addPickup('heart', x, y, { vz: 70 });
  else if (r < 0.45) addPickup('gem', x, y, { vz: 70 });
  else if (r < 0.52) addPickup('gem5', x, y, { vz: 70 });
  else if (r < 0.6 && S.hasBombs) addPickup('bomb', x, y, { vz: 70 });
}

function collideAt(e, x, y, who) {
  const hb = e.hb;
  const x0 = x + hb.ox, y0 = y + hb.oy, x1 = x0 + hb.w - 0.01, y1 = y0 + hb.h - 0.01;
  const tx0 = Math.floor(x0 / TS), tx1 = Math.floor(x1 / TS), ty0 = Math.floor(y0 / TS), ty1 = Math.floor(y1 / TS);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (solidTile(tx, ty, who)) return true;
  if (who === 'hero') {
    const box = { x: x0, y: y0, w: hb.w, h: hb.h };
    for (const n of G.npcs) if (overlap(box, hbr(n))) return true;
    for (const p of G.pickups) if (p.kind === 'chest' && overlap(box, { x: p.x - 8, y: p.y - 6, w: 16, h: 13 })) return true;
  }
  return false;
}
function moveAxis(e, mx, my, who) {
  const steps = Math.ceil(Math.max(Math.abs(mx), Math.abs(my)) / 0.5);
  if (!steps) return false;
  const sx = mx / steps, sy = my / steps;
  for (let i = 0; i < steps; i++) {
    if (collideAt(e, e.x + sx, e.y + sy, who)) return true;
    e.x += sx; e.y += sy;
  }
  return false;
}
// 角にひっかかった時に少しずらしてあげる（スマホで快適に動けるように）
function nudge(e, axis, fx, fy, amt) {
  for (let o = 1; o <= 8; o++) {
    for (const s of [-1, 1]) {
      const ox = axis === 'x' ? s * o : 0, oy = axis === 'y' ? s * o : 0;
      if (!collideAt(e, e.x + ox, e.y + oy, 'hero') && !collideAt(e, e.x + ox + fx, e.y + oy + fy, 'hero')) {
        const step = Math.min(amt, o) * s;
        if (axis === 'x') { if (!collideAt(e, e.x + step, e.y, 'hero')) e.x += step; }
        else if (!collideAt(e, e.x, e.y + step, 'hero')) e.y += step;
        return;
      }
    }
  }
}

// ================= 入力 =================
const input = { dx: 0, dy: 0, a: false, b: false, aP: false, bP: false, upP: false, downP: false, swapP: false, menuP: false, tapP: false, tapX: 0, tapY: 0 };
const keys = {};
const held = { a: 0, b: 0 };
const pressed = { swap: false, menu: false, tap: false, a: false, b: false };
let tapPos = { x: 0, y: 0 };
let prevIn = { a: false, b: false, up: false, down: false };
const stick = { id: null, ox: 0, oy: 0, dx: 0, dy: 0, mag: 0 };
const stickZone = document.getElementById('stick-zone');
const stickBase = document.getElementById('stick-base');
const stickKnob = document.getElementById('stick-knob');
const STICK_R = 46;

function pollInput() {
  let dx = 0, dy = 0;
  if (keys.ArrowLeft || keys.KeyA) dx -= 1;
  if (keys.ArrowRight || keys.KeyD) dx += 1;
  if (keys.ArrowUp || keys.KeyW) dy -= 1;
  if (keys.ArrowDown || keys.KeyS) dy += 1;
  if (stick.id !== null && stick.mag > 0.28) { dx += stick.dx; dy += stick.dy; }
  if (dx || dy) {
    const q = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    dx = Math.round(Math.cos(q) * 1000) / 1000; dy = Math.round(Math.sin(q) * 1000) / 1000;
  }
  input.dx = dx; input.dy = dy;
  const a = !!(keys.KeyZ || keys.KeyJ || keys.Space) || held.a > 0;
  const b = !!(keys.KeyX || keys.KeyK) || held.b > 0;
  const up = dy < -0.5, down = dy > 0.5;
  input.a = a || pressed.a; input.b = b || pressed.b;
  input.aP = (a && !prevIn.a) || pressed.a; input.bP = (b && !prevIn.b) || pressed.b;
  input.upP = up && !prevIn.up; input.downP = down && !prevIn.down;
  prevIn = { a: input.a, b: input.b, up, down };
  input.swapP = pressed.swap; input.menuP = pressed.menu; input.tapP = pressed.tap;
  input.tapX = tapPos.x; input.tapY = tapPos.y;
  pressed.swap = pressed.menu = pressed.tap = pressed.a = pressed.b = false;
}

window.addEventListener('keydown', e => {
  initAudio();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'KeyZ' || e.code === 'KeyJ' || e.code === 'Space') pressed.a = true;
  if (e.code === 'KeyX' || e.code === 'KeyK') pressed.b = true;
  if (e.code === 'KeyC' || e.code === 'KeyL' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') pressed.swap = true;
  if (e.code === 'Enter' || e.code === 'Escape' || e.code === 'KeyP') pressed.menu = true;
  if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; releaseAll(); });

const ptrs = new Map();
function btnDown(name, el) {
  if (el) el.classList.add('pressed');
  if (name === 'a' || name === 'b') { if (!held[name]) pressed[name] = true; held[name]++; }
  else if (name === 'swap') pressed.swap = true;
  else if (name === 'menu') pressed.menu = true;
  else if (name === 'sound') toggleMute();
  if (navigator.vibrate && (name === 'a' || name === 'b')) { try { navigator.vibrate(8); } catch (e) { /* ignore */ } }
}
function btnUp(name, el) {
  if (el) el.classList.remove('pressed');
  if (name === 'a' || name === 'b') held[name] = Math.max(0, held[name] - 1);
}
function placeStickBase(cx, cy) {
  const zr = stickZone.getBoundingClientRect();
  stickBase.style.left = (cx - zr.left) + 'px';
  stickBase.style.top = (cy - zr.top) + 'px';
}
function moveStick(x, y) {
  let dx = x - stick.ox, dy = y - stick.oy;
  const d = Math.hypot(dx, dy);
  if (d > STICK_R) { // ベースが指についてくる
    stick.ox += dx * (1 - STICK_R / d); stick.oy += dy * (1 - STICK_R / d);
    placeStickBase(stick.ox, stick.oy);
    dx = x - stick.ox; dy = y - stick.oy;
  }
  stick.dx = dx / STICK_R; stick.dy = dy / STICK_R; stick.mag = Math.min(1, Math.hypot(stick.dx, stick.dy));
  stickKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
}
function endStick() {
  stick.id = null; stick.dx = stick.dy = stick.mag = 0;
  stickKnob.style.transform = '';
  stickBase.style.left = ''; stickBase.style.top = '';
}
function releaseAll() {
  for (const [, p] of ptrs) if (p.type === 'btn') btnUp(p.btn, p.el);
  ptrs.clear(); held.a = held.b = 0; endStick();
}
document.addEventListener('pointerdown', e => {
  initAudio();
  const el = e.target;
  const b = el && el.closest ? el.closest('[data-btn]') : null;
  if (b) { ptrs.set(e.pointerId, { type: 'btn', btn: b.dataset.btn, el: b }); btnDown(b.dataset.btn, b); e.preventDefault(); return; }
  if (el && el.closest && el.closest('#stick-zone') && stick.id === null) {
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY;
    placeStickBase(e.clientX, e.clientY); moveStick(e.clientX, e.clientY);
    ptrs.set(e.pointerId, { type: 'stick' }); e.preventDefault(); return;
  }
  if (el === canvas) {
    const r = canvas.getBoundingClientRect();
    tapPos = { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
    pressed.tap = true; e.preventDefault();
  }
}, { passive: false });
document.addEventListener('pointermove', e => { if (e.pointerId === stick.id) { moveStick(e.clientX, e.clientY); e.preventDefault(); } }, { passive: false });
function ptrUp(e) {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  ptrs.delete(e.pointerId);
  if (p.type === 'btn') btnUp(p.btn, p.el);
  else if (p.type === 'stick') endStick();
}
document.addEventListener('pointerup', ptrUp);
document.addEventListener('pointercancel', ptrUp);
document.addEventListener('touchstart', e => { if (e.target && e.target.closest && e.target.closest('#app')) e.preventDefault(); }, { passive: false });
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    releaseAll();
    if (G.state === 'play') G.state = 'pause';
    if (actx) actx.suspend();
  } else if (actx) actx.resume();
});

const bLabel = document.getElementById('b-label');
const soundBtn = document.getElementById('btn-sound');
let lastBLabel = '';
function updateBLabel() {
  const t = S.item === 'boomerang' ? 'ブーメラン' : S.item === 'bombs' ? '爆弾' : '-';
  if (t !== lastBLabel) { bLabel.textContent = t; lastBLabel = t; }
}
function updateSoundButton() { soundBtn.textContent = muted ? '♪ OFF' : '♪ ON'; }
updateSoundButton();

// ================= 画面レイアウト =================
function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const landscape = vw > vh * 1.05;
  let cw, ch;
  if (!landscape) {
    cw = vw; ch = cw * H / W;
    const maxH = vh * 0.56;
    if (ch > maxH) { ch = maxH; cw = ch * W / H; }
  } else {
    ch = vh; cw = ch * W / H;
    const side = Math.max(150, Math.min(220, vw * 0.2));
    if (cw > vw - side * 2) { cw = vw - side * 2; ch = cw * H / W; }
  }
  cw = Math.floor(cw); ch = Math.floor(ch);
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  document.getElementById('screen').style.height = ch + 'px';
  document.body.classList.toggle('landscape', landscape);
  document.documentElement.style.setProperty('--side', Math.floor((vw - cw) / 2) + 'px');
  const dpr = window.devicePixelRatio || 1;
  SCALE = clamp(Math.ceil(cw * dpr / W), 1, 6);
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 200));

// ================= ダイアログ =================
const DLG_FONT = '9px ' + JFONT;
function wrapText(str, maxW) {
  ctx.font = DLG_FONT;
  const out = [];
  for (const para of str.split('\n')) {
    let line = '';
    for (const ch of Array.from(para)) {
      if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch;
    }
    out.push(line);
  }
  return out;
}
function showDialog(lines, after) {
  if (!Array.isArray(lines)) lines = [lines];
  if (G.state === 'fade' || G.state === 'scroll') { G.queued = [lines, after]; return; }
  const pages = [];
  for (const l of lines) {
    const wrapped = wrapText(l, 226);
    for (let i = 0; i < wrapped.length; i += 3) pages.push(wrapped.slice(i, i + 3));
  }
  G.dlg = { pages, i: 0, shown: 0, after };
  G.state = 'dialog';
}
function flushQueued() {
  if (G.queued) { const q = G.queued; G.queued = null; showDialog(q[0], q[1]); }
}
function updateDialog(dt) {
  const d = G.dlg;
  const total = d.pages[d.i].reduce((n, l) => n + Array.from(l).length, 0);
  if (d.shown < total) {
    const before = Math.floor(d.shown);
    d.shown = Math.min(total, d.shown + dt * 38);
    if (Math.floor(d.shown) !== before && Math.floor(d.shown) % 2 === 0) sfx('text');
  }
  if (input.aP || input.bP || input.tapP) {
    if (d.shown < total) d.shown = total;
    else {
      d.i++; d.shown = 0;
      if (d.i >= d.pages.length) {
        G.dlg = null; G.ig = null; G.state = 'play';
        if (d.after) d.after();
      } else sfx('select');
    }
  }
}

// ================= アイテム取得 =================
const ITEM_TEXT = {
  sword: ['古びた剣を 手に入れた!', 'Aボタンで 剣をふる。\nAを 長押しして はなすと 回転斬り!'],
  hc: ['ハートの器を 手に入れた!', 'ライフの 最大値が 1つ ふえた!'],
  bosskey: ['ボスのカギを 手に入れた!', '遺跡の おくの 大扉を あけられる。'],
  boomerang: ['ブーメランを 手に入れた!', 'Bボタンで 投げる。 敵を しびれさせたり、\n遠くの アイテムを とってこられる!'],
  bombs: ['爆弾を 手に入れた!', 'Bボタンで 置く。 ひびの入った\n壁や 岩を こわせるぞ。'],
  crystal: ['光の結晶を とりもどした!'],
};
function itemGet(kind, after) {
  hero.attack = 0; hero.spin = 0; hero.charging = false; hero.charge = 0; hero.charged = false; hero.dir = 0;
  G.state = 'itemget';
  G.ig = { kind, t: 0, after };
  sfx('fanfare');
}
function updateItemGet(dt) {
  G.ig.t += dt;
  if (G.ig.t >= 1.3) {
    let lines = (ITEM_TEXT[G.ig.kind] || []).slice();
    if ((G.ig.kind === 'boomerang' || G.ig.kind === 'bombs') && S.hasBoomerang && S.hasBombs) lines.push('「⇄ 切替」ボタン(Cキー)で\nBボタンの アイテムを 切りかえられる。');
    const after = G.ig.after;
    if (lines.length) showDialog(lines, after);
    else { G.ig = null; G.state = 'play'; if (after) after(); }
  }
}
function collectPickup(p) {
  const i = G.pickups.indexOf(p);
  if (i >= 0) G.pickups.splice(i, 1);
  if (p.id) S.flags['got:' + p.id] = 1;
  switch (p.kind) {
    case 'gem': S.gems = Math.min(999, S.gems + 1); sfx('gem'); break;
    case 'gem5': S.gems = Math.min(999, S.gems + 5); sfx('gem'); break;
    case 'heart': S.hp = Math.min(S.maxHp, S.hp + 2); sfx('heart'); break;
    case 'bomb': S.bombs = Math.min(S.maxBombs, S.bombs + 2); sfx('gem'); break;
    case 'key':
      S.keys++; sfx('key');
      if (!S.flags.tipKey) { S.flags.tipKey = 1; showDialog(['小さなカギを 手に入れた!', 'カギのかかった 扉を 1つ あけられる。']); }
      break;
    case 'bosskey': S.bossKey = true; itemGet('bosskey'); break;
    case 'hc': S.maxHp += 2; S.hp = S.maxHp; itemGet('hc'); break;
    case 'sword': S.hasSword = true; itemGet('sword'); break;
    case 'crystal': itemGet('crystal', startEnding); break;
  }
  saveGame();
}
function openChest(c) {
  if (c.open) return;
  c.open = true;
  if (c.id) S.flags['got:' + c.id] = 1;
  if (c.item === 'boomerang') { S.hasBoomerang = true; if (!S.item) S.item = 'boomerang'; }
  itemGet(c.item);
  saveGame();
}
function buy(p) {
  if (p.denied) return;
  if (S.gems < p.price) {
    p.denied = true; sfx('error');
    showDialog('ジェムが たりないよ! (' + p.price + ' ジェム ひつよう)');
    return;
  }
  S.gems -= p.price;
  G.pickups.splice(G.pickups.indexOf(p), 1);
  if (p.id) S.flags['got:' + p.id] = 1;
  if (p.item === 'bombs') {
    S.bombs = Math.min(S.maxBombs, S.bombs + 4);
    if (!S.hasBombs) { S.hasBombs = true; if (!S.item) S.item = 'bombs'; itemGet('bombs'); } else sfx('buy');
  } else if (p.item === 'hc') { S.maxHp += 2; S.hp = S.maxHp; itemGet('hc'); }
  else if (p.item === 'potion') { S.hp = S.maxHp; sfx('heart'); }
  saveGame();
}

// ================= 主人公 =================
function resetHeroActions() {
  hero.attack = 0; hero.spin = 0; hero.charging = false; hero.charge = 0; hero.charged = false; hero.kbT = 0; hero.inv = 0;
}
function setFacing(dx, dy) {
  const ax = Math.abs(dx), ay = Math.abs(dy), d = hero.dir;
  if (ax > 0.1 && ay > 0.1) {
    if ((d === 0 && dy > 0) || (d === 1 && dy < 0) || (d === 2 && dx < 0) || (d === 3 && dx > 0)) return;
  }
  if (ax >= ay) hero.dir = dx < 0 ? 2 : 3; else hero.dir = dy < 0 ? 1 : 0;
}
function swordRect() {
  const x = hero.x, y = hero.y;
  switch (hero.dir) {
    case 0: return { x: x + 4, y: y + 12, w: 8, h: 15 };
    case 1: return { x: x + 4, y: y - 11, w: 8, h: 15 };
    case 2: return { x: x - 11, y: y + 6, w: 15, h: 8 };
    default: return { x: x + 12, y: y + 6, w: 15, h: 8 };
  }
}
function startAttack() {
  hero.attack = ATTACK_T; hero.hitSet = new Set(); hero.charging = true; hero.charge = 0; hero.charged = false;
  sfx('sword');
}
function startSpin() {
  hero.spin = SPIN_T; hero.hitSet = new Set(); sfx('spin');
}
function cutBush(tx, ty) {
  setTile(tx, ty, '.');
  for (let i = 0; i < 6; i++) addEffect('leaf', tx * 16 + 8, ty * 16 + 8, { vx: rand(-50, 50), vy: rand(-70, -10), dur: 0.5 });
  if (Math.random() < 0.18) rollDrop(tx * 16 + 8, ty * 16 + 8);
}
function swordHits(rect, dmg, radial) {
  for (const e of G.enemies) {
    if (e.spawn > 0 || e.dying || hero.hitSet.has(e)) continue;
    if (e.boss && e.z > 4) continue;
    if (overlap(rect, hbr(e))) {
      hero.hitSet.add(e);
      let kx, ky;
      if (radial) { const a = Math.atan2(ecy(e) - ecy(hero), ecx(e) - ecx(hero)); kx = Math.cos(a); ky = Math.sin(a); }
      else { kx = DIRS[hero.dir][0]; ky = DIRS[hero.dir][1]; }
      hurtEnemy(e, dmg, kx, ky);
    }
  }
  const tx0 = Math.floor(rect.x / TS), tx1 = Math.floor((rect.x + rect.w - 1) / TS), ty0 = Math.floor(rect.y / TS), ty1 = Math.floor((rect.y + rect.h - 1) / TS);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (tileAt(tx, ty) === 'B') cutBush(tx, ty);
}
function tryInteract() {
  const [fx, fy] = DIRS[hero.dir];
  const px = ecx(hero) + fx * 11, py = ecy(hero) + fy * 11;
  for (const n of G.npcs) {
    const r = hbr(n);
    if (px > r.x - 5 && px < r.x + r.w + 5 && py > r.y - 5 && py < r.y + r.h + 5) { showDialog(n.talk()); return true; }
  }
  for (const c of G.pickups) {
    if (c.kind === 'chest' && !c.open && Math.abs(px - c.x) < 13 && Math.abs(py - c.y) < 12) { openChest(c); return true; }
  }
  const tx = Math.floor(px / TS), ty = Math.floor(py / TS);
  if (tileAt(tx, ty) === 'I') {
    const txt = G.room.def.signs && G.room.def.signs[tx + ',' + ty];
    if (txt) { showDialog(txt); return true; }
  }
  return false;
}
function useItem() {
  if (S.item === 'boomerang' && S.hasBoomerang) {
    if (G.boomer) return;
    let dx = input.dx, dy = input.dy;
    if (!dx && !dy) { dx = DIRS[hero.dir][0]; dy = DIRS[hero.dir][1]; }
    const m = Math.hypot(dx, dy);
    G.boomer = { x: ecx(hero), y: ecy(hero) - 2, vx: dx / m * 210, vy: dy / m * 210, t: 0, back: false, carry: [], rot: 0, st: 0 };
  } else if (S.item === 'bombs' && S.hasBombs) {
    if (S.bombs <= 0 || G.bombs.length >= 2) { sfx('error'); return; }
    const [fx, fy] = DIRS[hero.dir];
    let bx = ecx(hero) + fx * 12, by = ecy(hero) + fy * 12;
    if (pointSolid(bx, by, 'hero') && !(tileAt(Math.floor(bx / 16), Math.floor(by / 16)) === '%')) { bx = ecx(hero); by = ecy(hero); }
    G.bombs.push({ x: bx, y: by, t: 1.5 });
    S.bombs--; sfx('bomb');
  }
}
function swapItem() {
  const list = [];
  if (S.hasBoomerang) list.push('boomerang');
  if (S.hasBombs) list.push('bombs');
  if (!list.length) return;
  S.item = list[(list.indexOf(S.item) + 1) % list.length];
  sfx('select');
}
function checkDoors() {
  const [fx, fy] = DIRS[hero.dir];
  const px = ecx(hero) + fx * (hero.hb.w / 2 + 2), py = ecy(hero) + fy * (hero.hb.h / 2 + 2);
  const tx = Math.floor(px / TS), ty = Math.floor(py / TS);
  const c = tileAt(tx, ty);
  if (c === 'L') {
    if (S.keys > 0) { S.keys--; openDoorAt(tx, ty); sfx('door'); }
    else if (!G.room.doorMsg) { G.room.doorMsg = true; showDialog('カギが かかっている。'); }
  } else if (c === 'K') {
    if (S.bossKey) { openDoorAt(tx, ty); sfx('door'); }
    else if (!G.room.doorMsg) { G.room.doorMsg = true; showDialog('大きな カギ穴が ある。\nボスのカギが ひつようだ。'); }
  }
}
function updateHero(dt) {
  const h = hero;
  h.inv = Math.max(0, h.inv - dt);
  if (h.kbT > 0) {
    h.kbT -= dt;
    moveAxis(h, h.kbx * dt, 0, 'hero'); moveAxis(h, 0, h.kby * dt, 'hero');
  }
  if (h.attack > 0) {
    h.attack -= dt;
    if (!input.a) h.charging = false;
    const ph = 1 - h.attack / ATTACK_T;
    if (ph > 0.12 && ph < 0.9) swordHits(swordRect(), 1, false);
    if (h.attack <= 0) h.attack = 0;
    checkEdges();
    return;
  }
  if (h.spin > 0) {
    h.spin -= dt;
    const c = { x: ecx(h) - 24, y: ecy(h) - 24, w: 48, h: 48 };
    swordHits(c, 2, true);
    if (h.spin <= 0) h.spin = 0;
    return;
  }
  if (h.charging) {
    if (input.a) {
      h.charge += dt;
      if (h.charge >= CHARGE_T && !h.charged) { h.charged = true; sfx('charge'); }
    } else {
      const doSpin = h.charged;
      h.charging = false; h.charge = 0; h.charged = false;
      if (doSpin) { startSpin(); return; }
    }
  }
  const dx = input.dx, dy = input.dy;
  if (h.kbT <= 0 && (dx || dy)) {
    if (!h.charging) setFacing(dx, dy);
    const sp = HERO_SPEED * (h.charging ? 0.55 : 1) * dt;
    const bx = moveAxis(h, dx * sp, 0, 'hero');
    const by = moveAxis(h, 0, dy * sp, 'hero');
    if (bx && !dy) nudge(h, 'y', Math.sign(dx), 0, sp);
    if (by && !dx) nudge(h, 'x', 0, Math.sign(dy), sp);
    if (bx || by) checkDoors();
    h.anim += dt;
  } else h.anim = 0;
  if (input.aP) {
    if (!tryInteract() && S.hasSword && G.state === 'play') startAttack();
  }
  if (input.bP && G.state === 'play') useItem();
  if (G.state !== 'play') return;
  checkWarp();
  checkEdges();
}
function hurtHero(dmg, sx, sy) {
  if (hero.inv > 0 || G.state !== 'play') return;
  S.hp -= dmg;
  hero.inv = 1.0;
  const a = Math.atan2(ecy(hero) - sy, ecx(hero) - sx);
  hero.kbx = Math.cos(a) * 190; hero.kby = Math.sin(a) * 190; hero.kbT = 0.14;
  hero.attack = 0; hero.spin = 0; hero.charging = false; hero.charge = 0; hero.charged = false;
  sfx('hurt'); G.shake = Math.max(G.shake, 0.12);
  if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) { /* ignore */ } }
  if (S.hp <= 0) { S.hp = 0; gameOver(); }
}
function checkWarp() {
  const tx = Math.floor(ecx(hero) / TS), ty = Math.floor(ecy(hero) / TS);
  const c = tileAt(tx, ty);
  if (c === 'C' || c === 'D') {
    const w = G.room.def.warps && G.room.def.warps[tx + ',' + ty];
    if (w) warpTo(w);
  }
}
function checkEdges() {
  const cx = ecx(hero), cy = ecy(hero);
  let dx = 0, dy = 0;
  if (cx < 0) dx = -1; else if (cx > VW) dx = 1; else if (cy < 0) dy = -1; else if (cy > VH) dy = 1;
  if (!dx && !dy) return;
  const r = G.room;
  if (getDef(r.map, r.rx + dx, r.ry + dy)) startScroll(dx, dy);
  else if (r.def.exitTo) warpTo(r.def.exitTo);
  else { hero.x = clamp(hero.x, -hero.hb.ox, VW - hero.hb.ox - hero.hb.w); hero.y = clamp(hero.y, -hero.hb.oy, VH - hero.hb.oy - hero.hb.h); }
}

// ================= 画面切りかえ =================
function clearEntities() { G.enemies = []; G.projs = []; G.pickups = []; G.npcs = []; G.bombs = []; G.boomer = null; G.effects = []; }
function startScroll(dx, dy) {
  const old = G.room;
  ensureCache(old);
  const oldCache = old.cache;
  loadRoom(old.map, old.rx + dx, old.ry + dy);
  ensureCache(G.room);
  const hb = hero.hb;
  let px1 = hero.x, py1 = hero.y;
  if (dx === 1) px1 = -hb.ox; else if (dx === -1) px1 = VW - hb.ox - hb.w;
  if (dy === 1) py1 = -hb.oy; else if (dy === -1) py1 = VH - hb.oy - hb.h;
  G.scroll = { dx, dy, t: 0, dur: dx ? 0.6 : 0.5, oldCache, px0: hero.x, py0: hero.y, px1, py1 };
  clearEntities();
  hero.attack = 0; hero.spin = 0; hero.charging = false; hero.kbT = 0;
  G.state = 'scroll';
}
function updateScroll(dt) {
  const s = G.scroll;
  s.t += dt; hero.anim += dt;
  if (s.t >= s.dur) {
    hero.x = s.px1; hero.y = s.py1;
    G.scroll = null; G.state = 'play';
    enterRoom(); flushQueued();
  }
}
function startFade(mid, dur) { G.state = 'fade'; G.fade = { t: 0, mid, done: false, dur: dur || 0.3 }; }
function updateFade(dt) {
  const f = G.fade;
  f.t += dt;
  if (!f.done && f.t >= f.dur) { f.done = true; f.mid(); }
  if (f.t >= f.dur * 2) { G.fade = null; if (G.state === 'fade') G.state = 'play'; flushQueued(); }
}
function warpTo(dest) {
  startFade(() => {
    loadRoom(dest.map, dest.rx, dest.ry);
    clearEntities();
    hero.x = dest.tx * 16; hero.y = dest.ty * 16; hero.dir = dest.dir || 0;
    hero.attack = 0; hero.spin = 0; hero.charging = false; hero.kbT = 0;
    if (dest.cp) S.cp = { map: dest.map, rx: dest.rx, ry: dest.ry, tx: dest.tx, ty: dest.ty, dir: dest.dir || 0 };
    enterRoom();
  });
}

// ================= 敵 =================
function hurtEnemy(e, dmg, kx, ky) {
  if (e.inv > 0 || e.spawn > 0 || e.dying) return;
  e.hp -= dmg;
  e.inv = e.boss ? 0.6 : 0.3;
  e.stun = 0;
  if (!e.boss) { e.kbx = kx * 230; e.kby = ky * 230; e.kbT = 0.13; }
  sfx(e.boss ? 'stomp' : 'hit');
  addEffect('spark', ecx(e), ecy(e));
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  if (e.boss) {
    e.dying = true; e.t = 1.8; e.z = 0; G.projs = [];
    S.flags.boss = 1; S.kills++;
    return;
  }
  const i = G.enemies.indexOf(e);
  if (i >= 0) G.enemies.splice(i, 1);
  S.kills++;
  addEffect('puff', ecx(e), ecy(e), { big: true });
  sfx('kill');
  rollDrop(ecx(e), ecy(e));
}
function dirToward(e, tx, ty) {
  const dx = tx - ecx(e), dy = ty - ecy(e);
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0);
}
const AI = {
  slime(e, dt) {
    e.t -= dt;
    if (e.state === 'idle') {
      if (e.t <= 0) {
        e.state = 'hop'; e.t = 0.45;
        const a = Math.random() < 0.5 ? Math.atan2(ecy(hero) - ecy(e), ecx(hero) - ecx(e)) : rand(0, Math.PI * 2);
        const sp = e.type === 'slimeB' ? 66 : 55;
        e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp;
      }
    } else {
      moveAxis(e, e.vx * dt, 0, 'enemy'); moveAxis(e, 0, e.vy * dt, 'enemy');
      e.z = Math.sin((1 - e.t / 0.45) * Math.PI) * 5;
      if (e.t <= 0) { e.state = 'idle'; e.t = rand(0.4, 1.1); e.z = 0; }
    }
  },
  bat(e, dt) {
    e.t -= dt;
    if (e.state === 'rest' || e.state === 'idle') {
      if (e.t <= 0) { e.state = 'fly'; e.t = rand(2, 4); }
      return;
    }
    e.ct -= dt;
    if (e.ct <= 0) {
      e.ct = rand(0.2, 0.6);
      const a = Math.random() < 0.35 ? Math.atan2(ecy(hero) - ecy(e), ecx(hero) - ecx(e)) : rand(0, Math.PI * 2);
      e.tvx = Math.cos(a) * 75; e.tvy = Math.sin(a) * 75;
    }
    const k = Math.min(1, dt * 4);
    e.vx += (e.tvx - e.vx) * k; e.vy += (e.tvy - e.vy) * k;
    e.x += e.vx * dt; e.y += e.vy * dt;
    if (e.x < 14) { e.x = 14; e.vx = e.tvx = Math.abs(e.vx); }
    if (e.x > VW - 30) { e.x = VW - 30; e.vx = e.tvx = -Math.abs(e.vx); }
    if (e.y < 12) { e.y = 12; e.vy = e.tvy = Math.abs(e.vy); }
    if (e.y > VH - 30) { e.y = VH - 30; e.vy = e.tvy = -Math.abs(e.vy); }
    if (e.t <= 0) { e.state = 'rest'; e.t = rand(0.6, 1.4); }
  },
  goblin(e, dt) {
    e.t -= dt; e.cd -= dt;
    if (e.state === 'throw') {
      if (e.t <= 0) {
        const [fx, fy] = DIRS[e.dir];
        G.projs.push({ kind: 'rock', x: ecx(e) + fx * 6, y: ecy(e) + fy * 6, vx: fx * 135, vy: fy * 135, dmg: 1, r: 3 });
        sfx('throw');
        e.state = 'walk'; e.t = rand(0.6, 1.4); e.cd = rand(1.6, 2.8);
      }
      return;
    }
    const [fx, fy] = DIRS[e.dir];
    const blocked = moveAxis(e, fx * 36 * dt, fy * 36 * dt, 'enemy');
    if (blocked || e.t <= 0) {
      e.dir = Math.random() < 0.3 ? dirToward(e, ecx(hero), ecy(hero)) : randi(0, 3);
      e.t = rand(0.7, 1.8);
    }
    if (e.cd <= 0) {
      const dx = ecx(hero) - ecx(e), dy = ecy(hero) - ecy(e);
      if (Math.abs(dx) < 8 && Math.abs(dy) < 130) { e.dir = dy > 0 ? 0 : 1; e.state = 'throw'; e.t = 0.35; }
      else if (Math.abs(dy) < 8 && Math.abs(dx) < 130) { e.dir = dx > 0 ? 3 : 2; e.state = 'throw'; e.t = 0.35; }
    }
  },
  skeleton(e, dt) {
    e.t -= dt;
    const [fx, fy] = DIRS[e.dir];
    const blocked = moveAxis(e, fx * 42 * dt, fy * 42 * dt, 'enemy');
    if (blocked || e.t <= 0) {
      e.dir = Math.random() < 0.5 ? dirToward(e, ecx(hero), ecy(hero)) : randi(0, 3);
      e.t = rand(0.5, 1.4);
    }
  },
  golem(e, dt) {
    e.t -= dt;
    const enraged = e.hp <= ETYPES.golem.hp / 2;
    const pa = Math.atan2(ecy(hero) - ecy(e), ecx(hero) - ecx(e));
    if (e.state === 'walk') {
      const sp = enraged ? 42 : 28;
      moveAxis(e, Math.cos(pa) * sp * dt, 0, 'enemy'); moveAxis(e, 0, Math.sin(pa) * sp * dt, 'enemy');
      if (e.t <= 0) {
        if (Math.random() < 0.55) { e.state = 'charge'; e.t = 0.75; } else { e.state = 'crouch'; e.t = 0.5; }
      }
    } else if (e.state === 'charge') {
      if (e.t <= 0) {
        const n = enraged ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const a = pa + (i - (n - 1) / 2) * 0.32;
          G.projs.push({ kind: 'rock', big: true, x: ecx(e), y: ecy(e) - 4, vx: Math.cos(a) * 115, vy: Math.sin(a) * 115, dmg: 2, r: 4 });
        }
        sfx('throw');
        e.state = 'walk'; e.t = rand(1.4, 2.4);
      }
    } else if (e.state === 'crouch') {
      if (e.t <= 0) { e.state = 'air'; e.t = 0.65; }
    } else if (e.state === 'air') {
      e.z = Math.sin((1 - e.t / 0.65) * Math.PI) * 26;
      moveAxis(e, Math.cos(pa) * 70 * dt, 0, 'enemy'); moveAxis(e, 0, Math.sin(pa) * 70 * dt, 'enemy');
      if (e.t <= 0) {
        e.z = 0; e.state = 'walk'; e.t = rand(1.5, 2.5);
        G.shake = 0.4; sfx('stomp');
        addEffect('ring', ecx(e), ecy(e) + 8);
        if (Math.hypot(ecx(hero) - ecx(e), ecy(hero) - ecy(e)) < 26) hurtHero(2, ecx(e), ecy(e));
        const n = enraged ? 6 : 4;
        for (let i = 0; i < n; i++) G.projs.push({ kind: 'fall', x: rand(36, VW - 36), y: rand(36, VH - 36), t: rand(0.7, 1.2), dmg: 2 });
        G.projs.push({ kind: 'fall', x: ecx(hero), y: ecy(hero), t: 1.0, dmg: 2 });
      }
    }
  },
};
AI.slimeB = AI.slime;
function updateEnemy(e, dt) {
  e.anim += dt;
  if (e.spawn > 0) { e.spawn -= dt; return; }
  if (e.dying) {
    e.t -= dt;
    if (Math.random() < dt * 14) { addEffect('boom', e.x + rand(2, 30), e.y + rand(2, 30)); sfx('kill'); }
    if (e.t <= 0) {
      G.enemies.splice(G.enemies.indexOf(e), 1);
      for (let i = 0; i < 6; i++) addEffect('boom', e.x + rand(0, 32), e.y + rand(0, 32));
      sfx('boom'); G.shake = 0.5;
      showDialog('岩の魔人 ゴロムを たおした!');
    }
    return;
  }
  e.inv = Math.max(0, e.inv - dt);
  if (e.kbT > 0) {
    e.kbT -= dt;
    moveAxis(e, e.kbx * dt, 0, e.fly ? 'fly' : 'enemy'); moveAxis(e, 0, e.kby * dt, e.fly ? 'fly' : 'enemy');
    return;
  }
  if (e.stun > 0) { e.stun -= dt; return; }
  AI[e.type](e, dt);
  if (e.z < 6 && overlap(hbr(e), hbr(hero))) hurtHero(e.dmg, ecx(e), ecy(e));
}

// ================= 飛び道具・爆弾・ブーメラン =================
function updateProjs(dt) {
  for (let i = G.projs.length - 1; i >= 0; i--) {
    const p = G.projs[i];
    if (p.kind === 'fall') {
      p.t -= dt;
      if (p.t <= 0) {
        G.projs.splice(i, 1);
        for (let k = 0; k < 5; k++) addEffect('debris', p.x, p.y, { vx: rand(-60, 60), vy: rand(-80, -20), dur: 0.5 });
        sfx('clank');
        if (Math.hypot(ecx(hero) - p.x, ecy(hero) - p.y) < 11) hurtHero(p.dmg, p.x, p.y - 1);
      }
      continue;
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.x < -8 || p.y < -8 || p.x > VW + 8 || p.y > VH + 8) { G.projs.splice(i, 1); continue; }
    if (pointSolid(p.x, p.y, 'proj') && !(p.x < 0 || p.y < 0 || p.x >= VW || p.y >= VH)) {
      G.projs.splice(i, 1); addEffect('spark', p.x, p.y); continue;
    }
    if (circleRect(p.x, p.y, p.r, hbr(hero))) {
      G.projs.splice(i, 1);
      hurtHero(p.dmg, p.x - p.vx * 0.05, p.y - p.vy * 0.05);
    }
  }
}
function explode(b) {
  addEffect('boom', b.x, b.y, { big: true });
  for (let i = 0; i < 4; i++) addEffect('boom', b.x + rand(-12, 12), b.y + rand(-12, 12));
  sfx('boom'); G.shake = 0.3;
  for (const e of G.enemies.slice()) {
    if (e.spawn > 0 || e.dying) continue;
    if (Math.hypot(ecx(e) - b.x, ecy(e) - b.y) < 28 + (e.boss ? 10 : 0)) {
      const a = Math.atan2(ecy(e) - b.y, ecx(e) - b.x);
      hurtEnemy(e, e.boss ? 3 : 2, Math.cos(a), Math.sin(a));
    }
  }
  const tx0 = Math.floor((b.x - 30) / TS), tx1 = Math.floor((b.x + 30) / TS), ty0 = Math.floor((b.y - 30) / TS), ty1 = Math.floor((b.y + 30) / TS);
  let secret = false;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const c = tileAt(tx, ty);
    const d = Math.hypot(tx * 16 + 8 - b.x, ty * 16 + 8 - b.y);
    if (c === '%' && d < 30) { openDoorAt(tx, ty); secret = true; }
    else if (c === 'B' && d < 24) cutBush(tx, ty);
  }
  if (secret) setTimeout(() => sfx('secret'), 250);
}
function updateBombs(dt) {
  for (let i = G.bombs.length - 1; i >= 0; i--) {
    const b = G.bombs[i];
    b.t -= dt;
    if (b.t <= 0) { G.bombs.splice(i, 1); explode(b); }
  }
}
function updateBoomer(dt) {
  const b = G.boomer;
  b.t += dt; b.rot += dt * 22; b.st -= dt;
  if (b.st <= 0) { sfx('boomerang'); b.st = 0.16; }
  if (!b.back) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    const out = b.x < 0 || b.y < 0 || b.x > VW || b.y > VH;
    if (b.t > 0.4 || out || pointSolid(b.x, b.y, 'proj')) {
      if (!out && pointSolid(b.x, b.y, 'proj')) { addEffect('spark', b.x, b.y); sfx('clank'); }
      b.back = true;
    }
  } else {
    const tx = ecx(hero), ty = ecy(hero) - 2;
    const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
    if (d < 8) {
      for (const it of b.carry) if (G.pickups.indexOf(it) >= 0) collectPickup(it);
      G.boomer = null;
      return;
    }
    const sp = 240 * dt;
    b.x += dx / d * Math.min(sp, d); b.y += dy / d * Math.min(sp, d);
  }
  for (const e of G.enemies) {
    if (e.spawn > 0 || e.dying) continue;
    if (circleRect(b.x, b.y, 5, hbr(e))) {
      if (e.type === 'bat') hurtEnemy(e, 1, b.vx > 0 ? 1 : -1, 0);
      else if (e.boss) { if (!b.back) { sfx('clank'); addEffect('spark', b.x, b.y); } }
      else if (e.stun <= 0) { e.stun = 2.2; sfx('hit'); addEffect('spark', b.x, b.y); }
      b.back = true;
    }
  }
  const grab = ['gem', 'gem5', 'heart', 'bomb', 'key', 'bosskey', 'hc'];
  for (const p of G.pickups) {
    if (!p.carried && grab.indexOf(p.kind) >= 0 && Math.abs(p.x - b.x) < 8 && Math.abs(p.y - b.y) < 8) {
      p.carried = true; b.carry.push(p); b.back = true;
    }
  }
  for (const p of b.carry) { p.x = b.x; p.y = b.y; p.z = 0; }
}
function updatePickups(dt) {
  const hr = hbr(hero);
  const box = { x: hr.x - 2, y: hr.y - 3, w: hr.w + 4, h: hr.h + 5 };
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i];
    if (p.vz || p.z > 0) { p.z += p.vz * dt; p.vz -= 320 * dt; if (p.z <= 0) { p.z = 0; p.vz = 0; } }
    if (p.life > 0 && !p.carried) { p.life -= dt; if (p.life <= 0) { G.pickups.splice(i, 1); continue; } }
    if (p.carried) continue;
    if (p.kind === 'chest') {
      if (!p.open && overlap({ x: hr.x - 2, y: hr.y - 2, w: hr.w + 4, h: hr.h + 4 }, { x: p.x - 8, y: p.y - 6, w: 16, h: 13 })) openChest(p);
      continue;
    }
    const pr = { x: p.x - 5, y: p.y - 5, w: 10, h: 10 };
    if (p.kind === 'shop') {
      if (overlap(box, pr)) buy(p); else p.denied = false;
      continue;
    }
    if (p.z < 4 && overlap(box, pr)) collectPickup(p);
    if (G.state !== 'play') return;
  }
}
function updateEffects(dt) {
  for (let i = G.effects.length - 1; i >= 0; i--) {
    const f = G.effects[i];
    f.t += dt;
    if (f.vx !== undefined) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 260 * dt; }
    const dur = f.dur || (f.kind === 'boom' ? 0.45 : f.kind === 'ring' ? 0.4 : f.kind === 'spark' ? 0.18 : 0.4);
    if (f.t >= dur) G.effects.splice(i, 1);
  }
}

// ================= メインの更新 =================
function updatePlay(dt) {
  S.time += dt;
  G.msgCd = Math.max(0, G.msgCd - dt);
  if (input.menuP) { G.state = 'pause'; sfx('select'); return; }
  if (input.swapP) swapItem();
  updateHero(dt);
  if (G.state !== 'play') return;
  for (const e of G.enemies.slice()) { updateEnemy(e, dt); if (G.state !== 'play') return; }
  updateProjs(dt);
  if (G.state !== 'play') return;
  updateBombs(dt);
  if (G.boomer) updateBoomer(dt);
  if (G.state !== 'play') return;
  updatePickups(dt);
  updateEffects(dt);
  const r = G.room;
  if (r.hasG && !r.shutClosed && G.enemies.length > 0 && !heroOnShutter()) { r.shutClosed = true; sfx('shutter'); }
  if (r.hadEnemies && !r.clearedNow && G.enemies.length === 0) { r.clearedNow = true; onRoomClear(); }
}
function heroOnShutter() {
  const r = hbr(hero);
  const tx0 = Math.floor(r.x / TS), tx1 = Math.floor((r.x + r.w) / TS), ty0 = Math.floor(r.y / TS), ty1 = Math.floor((r.y + r.h) / TS);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (tileAt(tx, ty) === 'G') return true;
  return false;
}
function update(dt) {
  G.t += dt;
  G.shake = Math.max(0, G.shake - dt);
  pollInput();
  switch (G.state) {
    case 'title': updateTitle(dt); break;
    case 'play': updatePlay(dt); break;
    case 'dialog': updateDialog(dt); updateEffects(dt); break;
    case 'scroll': updateScroll(dt); break;
    case 'fade': updateFade(dt); break;
    case 'itemget': updateItemGet(dt); break;
    case 'pause':
      if (input.swapP) swapItem();
      if (input.menuP || input.aP || input.tapP) { G.state = 'play'; sfx('select'); }
      break;
    case 'gameover': updateGameOver(dt); break;
    case 'ending': updateEnding(dt); break;
  }
  updateBLabel();
  updateMusic();
}

// ================= タイトル / ゲームオーバー / エンディング =================
let hasSave = false;
function titleItems() { return hasSave ? ['つづきから', 'はじめから'] : ['はじめから']; }
function updateTitle() {
  const items = titleItems();
  if (input.upP || input.downP) { G.titleSel = (G.titleSel + (input.upP ? items.length - 1 : 1)) % items.length; sfx('select'); }
  let choose = input.aP;
  if (input.tapP) {
    for (let i = 0; i < items.length; i++) {
      const y = 138 + i * 18;
      if (input.tapY > y - 9 && input.tapY < y + 9) { G.titleSel = i; }
    }
    choose = true;
  }
  if (choose) {
    sfx('select');
    if (items[G.titleSel] === 'つづきから') continueGame(); else newGame();
  }
}
function newGame() {
  S = newSave();
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  loadRoom('world', 1, 1);
  clearEntities();
  hero.x = 7 * 16; hero.y = 6 * 16; hero.dir = 0; resetHeroActions();
  G.state = 'play';
  enterRoom();
  showDialog([
    'ここは ミドリ島。\nしずかで 緑ゆたかな 島だった。',
    'だが ある日、北東の遺跡に 岩の魔人が あらわれ、\n島をまもる『光の結晶』を うばってしまった。',
    'このままでは 島は 闇に のまれてしまう……。',
    '勇気ある 若者よ。\nまずは 近くの 洞窟を たずねるのだ。',
    '【そうさ】 左のスティックで 移動\nA: 剣 / 話す・調べる   B: アイテム',
  ]);
}
function continueGame() {
  const s = loadSave();
  if (!s) { newGame(); return; }
  S = s;
  S.hp = S.maxHp;
  respawnAtCheckpoint();
}
function respawnAtCheckpoint() {
  const cp = S.cp;
  loadRoom(cp.map, cp.rx, cp.ry);
  clearEntities();
  hero.x = cp.tx * 16; hero.y = cp.ty * 16; hero.dir = cp.dir || 0; resetHeroActions(); hero.dead = 0;
  if (G.state !== 'fade') G.state = 'play';
  enterRoom();
}
function gameOver() {
  G.state = 'gameover';
  G.go = { t: 0 };
  G.goSel = 0;
  S.deaths++;
  setMusic(null);
  sfx('gameover');
  saveGame();
}
function updateGameOver(dt) {
  G.go.t += dt;
  if (G.go.t < 1.6) return;
  if (input.upP || input.downP) { G.goSel = 1 - G.goSel; sfx('select'); }
  let choose = input.aP;
  if (input.tapP) {
    if (input.tapY > 120 && input.tapY < 140) G.goSel = 0;
    else if (input.tapY >= 140 && input.tapY < 160) G.goSel = 1;
    choose = true;
  }
  if (choose) {
    sfx('select');
    S.hp = S.maxHp;
    saveGame();
    if (G.goSel === 0) startFade(respawnAtCheckpoint, 0.25);
    else { hasSave = true; G.titleSel = 0; G.state = 'title'; setMusic('cave'); }
  }
}
function startEnding() {
  S.flags.cleared = 1; saveGame();
  startFade(() => { G.fade = null; G.state = 'ending'; G.end = { t: 0 }; setMusic('ending'); }, 0.6);
}
function updateEnding(dt) {
  G.end.t += dt;
  if (G.end.t > 8 && (input.aP || input.tapP)) { hasSave = true; G.titleSel = 0; G.state = 'title'; setMusic('cave'); sfx('select'); }
}

// ================= 描画: タイル =================
function fr(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
function grass(g, ox, oy, tx, ty) {
  fr(g, ox, oy, 16, 16, '#7dcd58');
  const h = hash(tx, ty, 1);
  for (let i = 0; i < 3; i++) {
    if (!((h >> (i + 20)) & 1)) continue;
    const x = ox + ((h >> (i * 6)) & 15) % 12, y = oy + ((h >> (i * 6 + 3)) & 15) % 13;
    fr(g, x, y + 1, 1, 2, '#5eaf45'); fr(g, x + 1, y, 1, 2, '#5eaf45'); fr(g, x + 2, y + 1, 1, 2, '#5eaf45');
  }
  if (h & 1) fr(g, ox + ((h >> 9) & 15), oy + ((h >> 13) & 15), 1, 1, '#9be07a');
}
function sand(g, ox, oy, tx, ty) {
  fr(g, ox, oy, 16, 16, '#ead696');
  const h = hash(tx, ty, 2);
  for (let i = 0; i < 4; i++) fr(g, ox + ((h >> (i * 4)) & 15), oy + ((h >> (i * 4 + 2)) & 15), 1, 1, i % 2 ? '#d4b874' : '#f6e8bc');
}
function flowers(g, ox, oy, tx, ty) {
  const h = hash(tx, ty, 3);
  const spots = [[3 + (h & 3), 3 + ((h >> 2) & 3)], [9 + ((h >> 4) & 3), 9 + ((h >> 6) & 3)]];
  spots.forEach(([x, y], i) => {
    const petal = (h >> (8 + i)) & 1 ? '#ffffff' : '#ff7a8a';
    fr(g, ox + x, oy + y - 1, 1, 1, petal); fr(g, ox + x - 1, oy + y, 1, 1, petal); fr(g, ox + x + 1, oy + y, 1, 1, petal); fr(g, ox + x, oy + y + 1, 1, 1, petal);
    fr(g, ox + x, oy + y, 1, 1, '#ffd84a');
  });
}
function bricks(g, ox, oy, base, mortar, light) {
  fr(g, ox, oy, 16, 16, mortar);
  for (let r = 0; r < 4; r++) {
    const off = r % 2 ? 4 : 0;
    for (let c = -1; c < 2; c++) {
      const bx = ox + c * 8 + off, by = oy + r * 4;
      const x0 = Math.max(ox, bx), x1 = Math.min(ox + 16, bx + 7);
      if (x1 <= x0) continue;
      fr(g, x0, by, x1 - x0, 3, base); fr(g, x0, by, x1 - x0, 1, light);
    }
  }
}
function isWallish(r, tx, ty) { const c = tileRaw(r, tx, ty); return c !== null && WALLISH.has(c); }
function dfloor(g, r, tx, ty) {
  const ox = tx * 16, oy = ty * 16;
  const border = tx === 0 || ty === 0 || tx === COLS - 1 || ty === ROWS - 1;
  if (border) { fr(g, ox, oy, 16, 16, '#3a3a58'); return; }
  fr(g, ox, oy, 16, 16, '#8e92b6');
  fr(g, ox, oy, 16, 1, '#a6aacc'); fr(g, ox, oy, 1, 16, '#a6aacc');
  fr(g, ox + 15, oy, 1, 16, '#767a9e'); fr(g, ox, oy + 15, 16, 1, '#767a9e');
  fr(g, ox + 7, oy + 7, 2, 2, '#8187ab');
  if (isWallish(r, tx, ty - 1)) fr(g, ox, oy, 16, 4, 'rgba(0,0,20,0.28)');
  if (isWallish(r, tx - 1, ty)) fr(g, ox, oy, 3, 16, 'rgba(0,0,20,0.2)');
}
function cfloor(g, r, tx, ty) {
  const ox = tx * 16, oy = ty * 16;
  fr(g, ox, oy, 16, 16, '#5b4637');
  const h = hash(tx, ty, 4);
  for (let i = 0; i < 4; i++) fr(g, ox + ((h >> (i * 4)) & 15), oy + ((h >> (i * 4 + 2)) & 15), 1, 1, i % 2 ? '#4a382b' : '#6c5545');
  if (isWallish(r, tx, ty - 1)) fr(g, ox, oy, 16, 4, 'rgba(0,0,0,0.3)');
  if (isWallish(r, tx - 1, ty)) fr(g, ox, oy, 3, 16, 'rgba(0,0,0,0.22)');
}
function ground(g, r, tx, ty) {
  const ox = tx * 16, oy = ty * 16;
  if (r.type === 'dungeon') return dfloor(g, r, tx, ty);
  if (r.type === 'cave') return cfloor(g, r, tx, ty);
  const nearSand = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([a, b]) => tileRaw(r, tx + a, ty + b) === ':');
  return nearSand ? sand(g, ox, oy, tx, ty) : grass(g, ox, oy, tx, ty);
}
function cracks(g, ox, oy) {
  const c = '#140c08';
  fr(g, ox + 7, oy + 2, 1, 3, c); fr(g, ox + 6, oy + 5, 1, 3, c); fr(g, ox + 8, oy + 7, 1, 3, c); fr(g, ox + 7, oy + 10, 1, 4, c);
  fr(g, ox + 9, oy + 5, 3, 1, c); fr(g, ox + 3, oy + 8, 3, 1, c); fr(g, ox + 9, oy + 11, 2, 1, c);
}
function isWater(c) { return c === 'W' || c === 'b'; }
function drawTile(g, r, tx, ty) {
  const c = r.tiles[ty][tx], ox = tx * 16, oy = ty * 16;
  switch (c) {
    case '.': grass(g, ox, oy, tx, ty); break;
    case ',': grass(g, ox, oy, tx, ty); flowers(g, ox, oy, tx, ty); break;
    case ':': sand(g, ox, oy, tx, ty); break;
    case 'T': ground(g, r, tx, ty); g.drawImage(TL.tree, ox, oy); break;
    case 'R': ground(g, r, tx, ty); g.drawImage(TL.rock, ox, oy); break;
    case 'B': ground(g, r, tx, ty); g.drawImage(TL.bush, ox, oy); break;
    case 'Y': sand(g, ox, oy, tx, ty); g.drawImage(TL.cactus, ox, oy); break;
    case 'I': ground(g, r, tx, ty); g.drawImage(TL.sign, ox, oy); break;
    case 'O': ground(g, r, tx, ty); g.drawImage(TL.statue, ox, oy); break;
    case 'M': g.drawImage(TL.mtn, ox, oy); break;
    case 'Q': g.drawImage(TL.cwall, ox, oy); break;
    case '%':
      if (r.type === 'dungeon') bricks(g, ox, oy, '#4a5a92', '#262e58', '#6a7ab8');
      else g.drawImage(r.type === 'cave' ? TL.cwall : TL.mtn, ox, oy);
      cracks(g, ox, oy);
      break;
    case 'C': g.drawImage(r.type === 'cave' ? TL.cwall : TL.mtn, ox, oy); g.drawImage(TL.arch, ox, oy); break;
    case 'S': bricks(g, ox, oy, '#8f8fa6', '#55556a', '#b8b8cc'); break;
    case 'D': {
      bricks(g, ox, oy, '#8f8fa6', '#55556a', '#b8b8cc');
      const leftEdge = tileRaw(r, tx - 1, ty) !== 'D', rightEdge = tileRaw(r, tx + 1, ty) !== 'D';
      const x0 = ox + (leftEdge ? 3 : 0), x1 = ox + 16 - (rightEdge ? 3 : 0);
      fr(g, x0, oy + 4, x1 - x0, 12, '#08060c');
      fr(g, x0 + (leftEdge ? 1 : 0), oy + 3, x1 - x0 - (leftEdge ? 1 : 0) - (rightEdge ? 1 : 0), 1, '#08060c');
      if (leftEdge) fr(g, ox + 2, oy + 3, 1, 13, '#d8d8e6');
      if (rightEdge) fr(g, ox + 13, oy + 3, 1, 13, '#d8d8e6');
      fr(g, ox, oy + 2, 16, 1, '#d8d8e6');
      break;
    }
    case 'W': case 'b': {
      fr(g, ox, oy, 16, 16, '#3b8fe6');
      const h = hash(tx, ty, 5);
      fr(g, ox + (h & 7) + 2, oy + ((h >> 3) & 7) + 3, 4, 1, '#2f78cc');
      fr(g, ox + ((h >> 6) & 7) + 4, oy + ((h >> 9) & 3) + 10, 3, 1, '#2f78cc');
      const foam = '#bfe4ff';
      const n = tileRaw(r, tx, ty - 1), s = tileRaw(r, tx, ty + 1), w = tileRaw(r, tx - 1, ty), e = tileRaw(r, tx + 1, ty);
      if (n !== null && !isWater(n)) fr(g, ox, oy, 16, 2, foam);
      if (s !== null && !isWater(s)) fr(g, ox, oy + 15, 16, 1, '#2a6ab8');
      if (w !== null && !isWater(w)) fr(g, ox, oy, 1, 16, foam);
      if (e !== null && !isWater(e)) fr(g, ox + 15, oy, 1, 16, foam);
      if (c === 'b') {
        fr(g, ox, oy, 16, 16, '#b9843f');
        for (let i = 3; i < 16; i += 4) fr(g, ox + i, oy, 1, 16, '#8a5a26');
        fr(g, ox, oy, 16, 1, '#d8a25a');
        if (tileRaw(r, tx, ty - 1) !== 'b') { fr(g, ox, oy, 16, 3, '#6b4019'); fr(g, ox, oy + 3, 16, 1, '#4a2a10'); }
        if (tileRaw(r, tx, ty + 1) !== 'b') { fr(g, ox, oy + 13, 16, 3, '#6b4019'); }
      }
      break;
    }
    case '#': bricks(g, ox, oy, '#4a5a92', '#262e58', '#6a7ab8'); break;
    case '_': if (r.type === 'dungeon') dfloor(g, r, tx, ty); else cfloor(g, r, tx, ty); break;
    case 'G': dfloor(g, r, tx, ty); break;
    case 't': ground(g, r, tx, ty); g.drawImage(TL.brazier, ox, oy); break;
    case 'L': case 'K': {
      bricks(g, ox, oy, '#4a5a92', '#262e58', '#6a7ab8');
      const boss = c === 'K';
      fr(g, ox + 1, oy + 1, 14, 14, '#1a100a');
      fr(g, ox + 2, oy + 2, 12, 12, boss ? '#a82838' : '#9a6430');
      fr(g, ox + 5, oy + 2, 1, 12, boss ? '#7a1a28' : '#7a4a20'); fr(g, ox + 10, oy + 2, 1, 12, boss ? '#7a1a28' : '#7a4a20');
      fr(g, ox + 2, oy + 4, 12, 1, boss ? '#ffd84a' : '#c0c0d0'); fr(g, ox + 2, oy + 11, 12, 1, boss ? '#ffd84a' : '#c0c0d0');
      fr(g, ox + 5, oy + 5, 6, 6, boss ? '#ffd84a' : '#e8c040');
      fr(g, ox + 7, oy + 6, 2, 2, '#000'); fr(g, ox + 7, oy + 8, 2, 2, '#000');
      if (boss) { fr(g, ox + 4, oy + 5, 1, 6, '#c89a20'); fr(g, ox + 11, oy + 5, 1, 6, '#c89a20'); }
      break;
    }
    default: ground(g, r, tx, ty);
  }
}
function ensureCache(r) {
  if (!r.cache) r.cache = mkCanvas(VW, VH);
  if (r.dirty) {
    const g = r.cache.getContext('2d');
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) drawTile(g, r, tx, ty);
    r.dirty = false;
    r.water = []; r.torches = []; r.shutters = [];
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      const c = r.tiles[ty][tx];
      if (c === 'W') r.water.push([tx, ty]);
      else if (c === 't') r.torches.push([tx, ty]);
      else if (c === 'G') r.shutters.push([tx, ty]);
    }
  }
  return r.cache;
}
function drawDynamicTiles(r) {
  const f = Math.floor(G.t * 2) % 2;
  ctx.fillStyle = '#9ad0ff';
  for (const [tx, ty] of r.water) {
    const h = hash(tx, ty, 6), ox = tx * 16, oy = ty * 16;
    const x1 = (h & 7) + (f ? 2 : 0), y1 = ((h >> 3) & 3) + 4;
    ctx.fillRect(ox + x1, oy + y1, 3, 1); ctx.fillRect(ox + x1 + 1, oy + y1 - 1, 1, 1);
    const x2 = ((h >> 5) & 7) + (f ? 0 : 2), y2 = ((h >> 8) & 3) + 10;
    ctx.fillRect(ox + x2, oy + y2, 3, 1);
  }
  for (const [tx, ty] of r.torches) drawFlame(tx * 16, ty * 16, tx);
  if (r.shutClosed) {
    for (const [tx, ty] of r.shutters) {
      const ox = tx * 16, oy = ty * 16;
      ctx.fillStyle = '#1a1a28'; ctx.fillRect(ox, oy, 16, 16);
      ctx.fillStyle = '#a0a0b8';
      for (let i = 1; i < 16; i += 4) ctx.fillRect(ox + i, oy, 2, 16);
      ctx.fillStyle = '#6a6a80'; ctx.fillRect(ox, oy + 6, 16, 2);
    }
  }
}
function drawFlame(ox, oy, seed) {
  const f = Math.floor(G.t * 9 + seed) % 3;
  ctx.fillStyle = '#e83a1a'; ctx.fillRect(ox + 4, oy + 3 + (f === 2 ? 1 : 0), 8, 5);
  ctx.fillRect(ox + 5 + (f === 1 ? 1 : 0), oy + 1, 5, 2);
  ctx.fillStyle = '#ff9a30'; ctx.fillRect(ox + 5, oy + 4, 6, 4); ctx.fillRect(ox + 6 + (f === 0 ? 1 : 0), oy + 2, 3, 2);
  ctx.fillStyle = '#fff2a0'; ctx.fillRect(ox + 7, oy + 5, 2, 3);
}

// ================= 描画: キャラクター =================
function drawShadow(x, y, w) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.38, 0, 0, Math.PI * 2); ctx.fill();
}
function heroFrame() {
  const fr4 = hero.anim > 0 ? Math.floor(hero.anim * 8) % 4 : 0;
  const d = hero.dir;
  if (d === 0) return { img: fr4 % 2 ? SP.pDown2 : SP.pDown1, flip: fr4 === 3 };
  if (d === 1) return { img: fr4 % 2 ? SP.pUp2 : SP.pUp1, flip: fr4 === 3 };
  return { img: fr4 % 2 ? SP.pRight2 : SP.pRight1, flip: d === 2 };
}
function drawSwordAt(dir, x, y, ext) {
  const back = ext ? 0 : 6;
  switch (dir) {
    case 0: spr(SP.swDown, x + 4, y + 11 - back); break;
    case 1: spr(SP.swUp, x + 4, y - 11 + back); break;
    case 2: spr(SP.swLeft, x - 11 + back, y + 6); break;
    default: spr(SP.swRight, x + 11 - back, y + 6);
  }
}
function drawHero(px, py) {
  const h = hero;
  if (G.state === 'gameover') {
    const spinDir = [0, 3, 1, 2][Math.floor(G.go.t * 10) % 4];
    const f = spinDir === 0 ? SP.pDown1 : spinDir === 1 ? SP.pUp1 : SP.pRight1;
    if (G.go.t < 1.2) spr(f, px, py, spinDir === 2);
    return;
  }
  if (h.inv > 0 && Math.floor(h.inv * 18) % 2 === 0 && (G.state === 'play' || G.state === 'dialog')) return;
  if (G.ig) {
    spr(SP.pDown1, px, py);
    ctx.fillStyle = PAL.k; ctx.fillRect(px + 1, py + 2, 3, 7); ctx.fillRect(px + 12, py + 2, 3, 7);
    ctx.fillStyle = PAL.s; ctx.fillRect(px + 2, py + 3, 1, 5); ctx.fillRect(px + 13, py + 3, 1, 5);
    const img = itemSprite(G.ig.kind);
    if (img) spr(img, px + 8 - img.width / 2, py - img.height - 1);
    return;
  }
  if (h.spin > 0) {
    const prog = 1 - h.spin / SPIN_T;
    const start = [Math.PI, 0, -Math.PI / 2, Math.PI / 2][h.dir];
    const a = start + prog * Math.PI * 2;
    const order = Math.floor(prog * 4) % 4;
    spr([SP.pDown1, SP.pRight1, SP.pUp1, SP.pRight1][order], px, py, order === 3);
    ctx.save(); ctx.translate(Math.round(px + 8), Math.round(py + 10)); ctx.rotate(a); ctx.drawImage(SP.swUp, -4, -24); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(px + 8, py + 10, 22, a - 1.2, a, false); ctx.arc(px + 8, py + 10, 12, a, a - 1.2, true); ctx.fill();
    return;
  }
  const attacking = h.attack > 0;
  const holding = !attacking && h.charging && h.charge > 0.12;
  const f = (attacking || holding) ? { img: h.dir === 0 ? SP.pDown1 : h.dir === 1 ? SP.pUp1 : SP.pRight1, flip: h.dir === 2 } : heroFrame();
  if (attacking || holding) {
    const ph = attacking ? 1 - h.attack / ATTACK_T : 0.5;
    const ext = ph > 0.12 && ph < 0.85;
    if (h.dir === 1) drawSwordAt(1, px, py, ext);
    spr(f.img, px, py, f.flip);
    if (h.dir !== 1) drawSwordAt(h.dir, px, py, ext);
    if (holding && h.charged && Math.floor(G.t * 12) % 2 === 0) {
      const sr = swordRect();
      const tipX = h.dir === 2 ? sr.x : h.dir === 3 ? sr.x + sr.w : sr.x + 4;
      const tipY = h.dir === 1 ? sr.y : h.dir === 0 ? sr.y + sr.h : sr.y + 4;
      drawSparkle(tipX, tipY, 4, '#fff');
    }
    return;
  }
  spr(f.img, px, py, f.flip);
}
function drawSparkle(x, y, s, col) {
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(x) - s, Math.round(y), s * 2 + 1, 1);
  ctx.fillRect(Math.round(x), Math.round(y) - s, 1, s * 2 + 1);
  ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
}
function itemSprite(kind) {
  return {
    sword: SP.sword, hc: SP.hc, bosskey: SP.bosskey, boomerang: SP.boomerang, bombs: SP.bomb, bomb: SP.bomb,
    crystal: SP.crystal, key: SP.key, gem: SP.gem, gem5: SP.gem5, heart: SP.heart, potion: SP.potion,
  }[kind];
}
function drawGolem(e) {
  const x = Math.round(e.x), y = Math.round(e.y - e.z);
  const flash = e.inv > 0 && Math.floor(e.inv * 20) % 2 === 0;
  const body = flash ? '#ffffff' : '#8d8a9c', dark = flash ? '#dddddd' : '#5c586c', light = flash ? '#ffffff' : '#bbb7cc', out = '#1c1a24';
  const sh = 13 - Math.min(6, e.z / 4);
  drawShadow(e.x + 16, e.y + 30, sh);
  const orect = (rx, ry, w, h, fill) => { ctx.fillStyle = out; ctx.fillRect(rx, ry, w, h); ctx.fillStyle = fill; ctx.fillRect(rx + 1, ry + 1, w - 2, h - 2); };
  const crouch = e.state === 'crouch' ? 3 : 0;
  const yy = y + crouch;
  orect(x + 6, y + 22, 8, 9, dark); orect(x + 18, y + 22, 8, 9, dark);
  const armUp = e.state === 'charge' ? -5 : Math.round(Math.sin(e.anim * 6));
  orect(x, yy + 10 + armUp, 8, 14, body); orect(x + 24, yy + 10 + armUp, 8, 14, body);
  ctx.fillStyle = dark; ctx.fillRect(x + 1, yy + 20 + armUp, 6, 3); ctx.fillRect(x + 25, yy + 20 + armUp, 6, 3);
  orect(x + 5, yy + 6, 22, 19, body);
  orect(x + 9, yy, 14, 10, body);
  ctx.fillStyle = light; ctx.fillRect(x + 7, yy + 8, 7, 2); ctx.fillRect(x + 11, yy + 2, 5, 1); ctx.fillRect(x + 2, yy + 12 + armUp, 2, 6);
  ctx.fillStyle = dark; ctx.fillRect(x + 20, yy + 10, 1, 5); ctx.fillRect(x + 19, yy + 15, 3, 1); ctx.fillRect(x + 9, yy + 18, 4, 1); ctx.fillRect(x + 12, yy + 19, 1, 3);
  const glowing = e.state === 'charge' || e.state === 'crouch';
  const eye = glowing ? (Math.floor(G.t * 20) % 2 ? '#ffff90' : '#ff6020') : '#ff4030';
  ctx.fillStyle = eye; ctx.fillRect(x + 12, yy + 4, 3, 2); ctx.fillRect(x + 17, yy + 4, 3, 2);
  ctx.fillStyle = out; ctx.fillRect(x + 13, yy + 12, 6, 6);
  ctx.fillStyle = glowing ? eye : '#ff7040'; ctx.fillRect(x + 14, yy + 13, 4, 4);
  ctx.fillStyle = '#ffd0a0'; ctx.fillRect(x + 14, yy + 13, 1, 1);
}
function drawEnemy(e) {
  if (e.spawn > 0) { drawPuff(ecx(e), ecy(e), 1 - e.spawn / 0.45, false); return; }
  if (e.type === 'golem') {
    drawGolem(e);
    return;
  }
  const white = e.inv > 0 && Math.floor(e.inv * 24) % 2 === 0;
  let img, flip = false;
  const x = e.x, y = e.y - e.z;
  switch (e.type) {
    case 'slime': case 'slimeB': {
      const blue = e.type === 'slimeB';
      const squash = e.state === 'idle' && Math.floor(e.anim * 3) % 2 === 1;
      img = blue ? (squash ? SP.slimeB2 : SP.slimeB1) : (squash ? SP.slime2 : SP.slime1);
      if (e.z > 0) drawShadow(e.x + 8, e.y + 14, 6);
      break;
    }
    case 'bat':
      img = e.state === 'fly' ? (Math.floor(e.anim * 12) % 2 ? SP.bat1 : SP.bat2) : SP.bat2;
      drawShadow(e.x + 8, e.y + 15, 4);
      break;
    case 'goblin':
      img = (e.state === 'walk' || e.state === 'idle') && Math.floor(e.anim * 5) % 2 ? SP.goblin2 : SP.goblin1;
      flip = e.dir === 2;
      break;
    case 'skeleton':
      img = Math.floor(e.anim * 4) % 2 ? SP.skel2 : SP.skel1;
      flip = e.dir === 2;
      break;
  }
  spr(img, x, y, flip, white);
  if (e.stun > 0) {
    for (let i = 0; i < 3; i++) {
      const a = G.t * 6 + i * 2.1;
      drawSparkle(x + 8 + Math.cos(a) * 6, y - 1 + Math.sin(a) * 2, 1, '#ffe14a');
    }
  }
}
function drawPuff(x, y, k, big) {
  const r = (big ? 4 : 3) + k * (big ? 9 : 6);
  ctx.globalAlpha = Math.max(0, 1 - k * 0.8);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + k * 2;
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.55, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawPickup(p) {
  if (p.life > 0 && p.life < 2 && Math.floor(p.life * 10) % 2 === 0) return;
  if (p.kind === 'chest') { const img = p.open ? SP.chestOpen : SP.chest; spr(img, p.x - 8, p.y - 7); return; }
  let img = itemSprite(p.kind === 'shop' ? (p.item === 'bombs' ? 'bomb' : p.item) : p.kind);
  if (!img) return;
  const bob = (p.kind === 'hc' || p.kind === 'crystal' || p.kind === 'bosskey' || p.kind === 'sword') ? Math.round(Math.sin(G.t * 3) * 1.5) : 0;
  if (p.z > 0 || bob) drawShadow(p.x, p.y + img.height / 2 - 1, img.width / 2.5);
  spr(img, p.x - img.width / 2, p.y - img.height / 2 - p.z + bob);
  if ((p.kind === 'hc' || p.kind === 'crystal') && Math.floor(G.t * 4) % 3 === 0) {
    drawSparkle(p.x + (hash(Math.floor(G.t * 4), 1) % 14) - 7, p.y - 6 + (hash(Math.floor(G.t * 4), 2) % 10) - 5, 2, '#fff');
  }
  if (p.kind === 'shop') {
    text(String(p.price), p.x, p.y + img.height / 2 + 2, { align: 'center', color: S.gems >= p.price ? '#fff' : '#ff8080', font: 'bold 7px monospace', outline: '#000' });
  }
}
function drawEffect(f) {
  const dur = f.dur || (f.kind === 'boom' ? 0.45 : f.kind === 'ring' ? 0.4 : f.kind === 'spark' ? 0.18 : 0.4);
  const k = f.t / dur;
  switch (f.kind) {
    case 'puff': drawPuff(f.x, f.y, k, f.big); break;
    case 'spark': drawSparkle(f.x, f.y, 3 + Math.round(k * 3), k < 0.5 ? '#ffffff' : '#ffe080'); break;
    case 'boom': {
      const r = (f.big ? 10 : 6) + k * (f.big ? 16 : 8);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#ff7a20'; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe060'; ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'ring':
      ctx.strokeStyle = 'rgba(255,255,255,' + (1 - k) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, 6 + k * 30, (6 + k * 30) * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'leaf': ctx.fillStyle = k < 0.5 ? '#62d050' : '#38a03a'; ctx.fillRect(Math.round(f.x), Math.round(f.y), 2, 2); break;
    case 'debris': ctx.fillStyle = '#8d8a9c'; ctx.fillRect(Math.round(f.x), Math.round(f.y), 3, 3); break;
  }
}
function drawProj(p) {
  if (p.kind === 'fall') {
    const k = 1 - p.t / 1.2;
    drawShadow(p.x, p.y, 3 + 5 * clamp(k, 0, 1));
    if (p.t < 0.35) {
      const yy = p.y - p.t * 300;
      ctx.fillStyle = '#1c1a24'; ctx.fillRect(Math.round(p.x) - 5, Math.round(yy) - 5, 10, 10);
      ctx.fillStyle = '#8d8a9c'; ctx.fillRect(Math.round(p.x) - 4, Math.round(yy) - 4, 8, 8);
      ctx.fillStyle = '#bbb7cc'; ctx.fillRect(Math.round(p.x) - 3, Math.round(yy) - 3, 3, 2);
    }
    return;
  }
  const s = p.big ? 4 : 3;
  ctx.fillStyle = '#1c1a24'; ctx.fillRect(Math.round(p.x) - s, Math.round(p.y) - s, s * 2, s * 2);
  ctx.fillStyle = p.big ? '#a8a4b8' : '#c0a080'; ctx.fillRect(Math.round(p.x) - s + 1, Math.round(p.y) - s + 1, s * 2 - 2, s * 2 - 2);
  ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(p.x) - s + 1, Math.round(p.y) - s + 1, 1, 1);
}
function drawBomb(b) {
  const blink = b.t < 0.6 && Math.floor(b.t * 16) % 2 === 0;
  drawShadow(b.x, b.y + 5, 5);
  spr(blink ? whitened(SP.bomb) : SP.bomb, b.x - 6, b.y - 8);
  if (Math.floor(G.t * 20) % 2) drawSparkle(b.x + 3, b.y - 8, 1, '#ffe040');
}
function drawBoomer(b) {
  ctx.save(); ctx.translate(Math.round(b.x), Math.round(b.y)); ctx.rotate(b.rot); ctx.drawImage(SP.boomerang, -6, -5); ctx.restore();
}
function drawNpc(n) {
  spr(n.k === 'oldman' ? SP.oldman : SP.merchant, n.x, n.y);
}

function renderRoomScene(r) {
  ctx.drawImage(ensureCache(r), 0, 0);
  drawDynamicTiles(r);
  const list = [];
  for (const p of G.pickups) list.push([p.kind === 'chest' ? p.y + 6 : p.y - 4, () => drawPickup(p)]);
  for (const b of G.bombs) list.push([b.y, () => drawBomb(b)]);
  for (const n of G.npcs) list.push([n.y + 16, () => drawNpc(n)]);
  for (const e of G.enemies) list.push([e.y + (e.boss ? 32 : 16) + (e.fly ? 8 : 0), () => drawEnemy(e)]);
  list.push([hero.y + 16, () => drawHero(hero.x, hero.y)]);
  list.sort((a, b) => a[0] - b[0]);
  for (const [, d] of list) d();
  for (const p of G.projs) drawProj(p);
  if (G.boomer) drawBoomer(G.boomer);
  for (const f of G.effects) drawEffect(f);
}
function renderScroll() {
  const s = G.scroll;
  const k = clamp(s.t / s.dur, 0, 1);
  const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  ctx.drawImage(s.oldCache, Math.round(-s.dx * e * VW), Math.round(-s.dy * e * VH));
  ctx.drawImage(ensureCache(G.room), Math.round(s.dx * (1 - e) * VW), Math.round(s.dy * (1 - e) * VH));
  const px = lerp(s.px0, s.px1 + s.dx * VW, e) - s.dx * VW * e;
  const py = lerp(s.py0, s.py1 + s.dy * VH, e) - s.dy * VH * e;
  const f = heroFrame();
  spr(f.img, px, py, f.flip);
}

// ================= 描画: HUD / UI =================
function text(str, x, y, o) {
  o = o || {};
  ctx.font = o.font || ('bold 8px ' + JFONT);
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.base || 'top';
  if (o.outline) { ctx.lineWidth = o.lw || 2; ctx.strokeStyle = o.outline; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = o.color || '#fff';
  ctx.fillText(str, x, y);
}
function drawMiniMap(x, y, cw, chh, big) {
  const r = G.room;
  let mapName = r.map, cur = { rx: r.rx, ry: r.ry };
  if (MAPS[r.map].type === 'cave') { mapName = 'world'; cur = MAPS[r.map].parent; }
  const m = MAPS[mapName];
  for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) {
    if (!m.rooms[j][i]) continue;
    const visited = S.visited[mapName + ':' + i + ',' + j];
    if (mapName === 'dungeon' && !visited) continue;
    ctx.fillStyle = visited ? (mapName === 'dungeon' ? '#5a6aa8' : '#3a7a3a') : '#2a3a2a';
    ctx.fillRect(x + i * (cw + 1), y + j * (chh + 1), cw, chh);
    if (big && mapName === 'dungeon') {
      const def = m.rooms[j][i];
      if (def.boss) text('ボス', x + i * (cw + 1) + cw / 2, y + j * (chh + 1) + chh / 2 - 4, { align: 'center', font: 'bold 7px ' + JFONT, color: '#ff9090' });
    }
  }
  if (Math.floor(G.t * 3) % 2 === 0 || big) {
    ctx.fillStyle = '#ffd84a';
    const px = x + cur.rx * (cw + 1), py = y + cur.ry * (chh + 1);
    if (big) { ctx.fillRect(px + cw / 2 - 2, py + chh / 2 - 2, 4, 4); }
    else ctx.fillRect(px, py, cw, chh);
  }
}
function renderHUD() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, HUD_H);
  const r = G.room;
  const isDungeon = MAPS[r.map].type === 'dungeon';
  ctx.fillStyle = '#1a1a26'; ctx.fillRect(3, 3, isDungeon ? 26 : 34, 18);
  drawMiniMap(5, 5, 7, 4, false);
  spr(SP.gemS, 42, 2);
  text('×' + String(S.gems).padStart(3, '0'), 49, 1, { font: 'bold 7px monospace' });
  spr(SP.keyS, 42, 9);
  text('×' + S.keys, 49, 9, { font: 'bold 7px monospace' });
  if (S.bossKey) spr(SP.keyS, 64, 9);
  spr(SP.bombS, 41, 17);
  text('×' + S.bombs, 49, 16, { font: 'bold 7px monospace', color: S.hasBombs ? '#fff' : '#666' });
  // B / A 枠
  const box = (bx, label, col) => {
    ctx.fillStyle = col; ctx.fillRect(bx, 2, 18, 20);
    ctx.fillStyle = '#000'; ctx.fillRect(bx + 1, 3, 16, 18);
    text(label, bx - 5, 8, { align: 'center', font: 'bold 7px monospace', color: col });
  };
  box(80, 'B', '#5a8aff');
  if (S.item === 'boomerang') spr(SP.boomerang, 83, 7);
  else if (S.item === 'bombs') spr(SP.bomb, 83, 5);
  if (S.item === 'bombs') text(String(S.bombs), 96, 15, { align: 'right', font: 'bold 6px monospace', outline: '#000' });
  box(110, 'A', '#ff6a5a');
  if (S.hasSword) spr(SP.sword, 115, 4);
  text('-LIFE-', 182, 1, { align: 'center', color: '#ff6060', font: 'bold 7px monospace' });
  const n = S.maxHp / 2;
  for (let i = 0; i < n; i++) {
    const v = S.hp - i * 2;
    const img = v >= 2 ? SP.heart : v === 1 ? SP.heartHalf : SP.heartEmpty;
    const row = Math.floor(i / 8), col = i % 8;
    spr(img, 150 + col * 8, 10 + row * 8 - (n > 8 ? 2 : 0));
  }
}
function renderDialog() {
  const d = G.dlg;
  const heroScreenY = hero.y + HUD_H;
  const bh = 50, bx = 8, bw = 240;
  const by = heroScreenY > 112 ? HUD_H + 6 : H - bh - 6;
  ctx.fillStyle = 'rgba(8,8,20,0.92)'; ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(bx + 1.5, by + 1.5, bw - 3, bh - 3);
  ctx.strokeStyle = '#6a6aa0'; ctx.strokeRect(bx + 3.5, by + 3.5, bw - 7, bh - 7);
  let left = Math.floor(d.shown);
  const page = d.pages[d.i];
  for (let i = 0; i < page.length && left > 0; i++) {
    const chars = Array.from(page[i]);
    const part = chars.slice(0, left).join('');
    left -= chars.length;
    text(part, bx + 9, by + 8 + i * 13, { font: DLG_FONT, color: '#fff' });
  }
  const total = page.reduce((n, l) => n + Array.from(l).length, 0);
  if (d.shown >= total && Math.floor(G.t * 3) % 2 === 0) {
    ctx.fillStyle = '#fff';
    const tx = bx + bw - 12, ty = by + bh - 10;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + 6, ty); ctx.lineTo(tx + 3, ty + 4); ctx.fill();
  }
}
function renderPause() {
  ctx.fillStyle = 'rgba(0,0,10,0.82)'; ctx.fillRect(0, HUD_H, W, VH);
  text('ポーズ', W / 2, HUD_H + 8, { align: 'center', font: 'bold 12px ' + JFONT, color: '#ffd84a' });
  const r = G.room;
  let mapName = MAPS[r.map].type === 'cave' ? 'world' : r.map;
  const m = MAPS[mapName];
  text(mapName === 'dungeon' ? '遺跡の地図' : '島の地図', 52, HUD_H + 26, { align: 'center', font: 'bold 8px ' + JFONT, color: '#aac' });
  const cw = mapName === 'dungeon' ? 22 : 18, chh = 14;
  const mw = m.w * (cw + 1);
  ctx.fillStyle = '#111'; ctx.fillRect(52 - mw / 2 - 3, HUD_H + 38, mw + 5, m.h * (chh + 1) + 5);
  drawMiniMap(52 - mw / 2, HUD_H + 41, cw, chh, true);
  text('もちもの', 176, HUD_H + 26, { align: 'center', font: 'bold 8px ' + JFONT, color: '#aac' });
  const items = [
    [S.hasSword, SP.sword, '剣'],
    [S.hasBoomerang, SP.boomerang, 'ブーメラン'],
    [S.hasBombs, SP.bomb, '爆弾'],
    [S.bossKey, SP.bosskey, 'ボスのカギ'],
  ];
  items.forEach(([has, img, name], i) => {
    const x = 116 + (i % 2) * 62, y = HUD_H + 40 + Math.floor(i / 2) * 26;
    ctx.fillStyle = '#1a1a30'; ctx.fillRect(x, y, 58, 22);
    if (has) {
      spr(img, x + 3 + (16 - img.width) / 2, y + 11 - img.height / 2);
      text(name, x + 22, y + 7, { font: 'bold 7px ' + JFONT, color: (S.item === 'boomerang' && i === 1) || (S.item === 'bombs' && i === 2) ? '#ffd84a' : '#fff' });
    } else text('???', x + 22, y + 7, { font: 'bold 7px monospace', color: '#555' });
  });
  const t = Math.floor(S.time), hh = Math.floor(t / 3600), mm = Math.floor(t / 60) % 60, ss = t % 60;
  text('プレイ時間 ' + hh + ':' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0') + '   たおした敵 ' + S.kills, W / 2, HUD_H + 108, { align: 'center', font: '8px ' + JFONT, color: '#ccd' });
  text('A: 剣 (長押しで回転斬り)   B: アイテム   ⇄: 切替', W / 2, HUD_H + 128, { align: 'center', font: '8px ' + JFONT, color: '#99a' });
  text('PC: 矢印/WASD  Z:A  X:B  C:切替  Enter:ポーズ  M:音', W / 2, HUD_H + 141, { align: 'center', font: '7px ' + JFONT, color: '#778' });
  if (Math.floor(G.t * 2) % 2 === 0) text('タップ / A で もどる', W / 2, HUD_H + 158, { align: 'center', font: 'bold 9px ' + JFONT, color: '#fff' });
}
let titleRoom = null;
function renderTitle() {
  if (!titleRoom) {
    const save = G.room;
    titleRoom = loadRoom('world', 2, 1);
    G.room = save;
  }
  ctx.drawImage(ensureCache(titleRoom), 0, HUD_H);
  ctx.save(); ctx.translate(0, HUD_H); drawDynamicTiles(titleRoom); ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, H);
  const gr = ctx.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, 'rgba(10,10,40,0.85)'); gr.addColorStop(0.5, 'rgba(10,10,40,0.2)'); gr.addColorStop(1, 'rgba(10,10,40,0.85)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  const bounce = Math.sin(G.t * 2) * 2;
  text('ミドリ島の勇者', W / 2, 30 + bounce, { align: 'center', font: 'bold 26px ' + JFONT, color: '#ffe066', outline: '#3a2008', lw: 5 });
  text('〜 光の結晶を もとめて 〜', W / 2, 64, { align: 'center', font: 'bold 9px ' + JFONT, color: '#fff', outline: '#000', lw: 3 });
  const hx = W / 2 - 8, hy = 92;
  spr(SP.pDown1, hx, hy);
  spr(SP.swUp, hx + 14, hy - 4);
  spr(SP.slime1, hx - 34, hy + 4);
  spr(SP.bat1, hx + 30, hy - 2 + Math.sin(G.t * 5) * 3);
  const items = titleItems();
  items.forEach((it, i) => {
    const y = 138 + i * 18, sel = i === G.titleSel;
    if (sel) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(W / 2 - 50, y - 8, 100, 16); }
    text((sel ? '▶ ' : '   ') + it, W / 2, y - 5, { align: 'center', font: 'bold 10px ' + JFONT, color: sel ? '#ffe066' : '#ddd', outline: '#000', lw: 3 });
  });
  text('タップ または Aボタンで スタート', W / 2, 186, { align: 'center', font: '8px ' + JFONT, color: Math.floor(G.t * 2) % 2 ? '#fff' : '#aab', outline: '#000', lw: 2 });
}
function renderGameOver() {
  const k = Math.min(1, G.go.t / 1.2);
  ctx.fillStyle = 'rgba(120,0,0,' + (k * 0.55) + ')'; ctx.fillRect(0, HUD_H, W, VH);
  if (G.go.t < 1.4) return;
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, HUD_H, W, VH);
  text('GAME OVER', W / 2, 70, { align: 'center', font: 'bold 22px monospace', color: '#ff5050', outline: '#000', lw: 4 });
  ['つづける', 'タイトルへ'].forEach((s, i) => {
    const sel = i === G.goSel;
    text((sel ? '▶ ' : '   ') + s, W / 2, 124 + i * 20, { align: 'center', font: 'bold 10px ' + JFONT, color: sel ? '#ffe066' : '#ccc' });
  });
}
function renderEnding() {
  const t = G.end.t;
  ctx.fillStyle = '#05050f'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    const sx = hash(i, 1) % W, sy = hash(i, 2) % H;
    if ((Math.floor(G.t * 3) + i) % 5) { ctx.fillStyle = i % 3 ? '#8af' : '#fff'; ctx.fillRect(sx, sy, 1, 1); }
  }
  const glow = 0.5 + Math.sin(t * 3) * 0.2;
  const gr = ctx.createRadialGradient(W / 2, 46, 2, W / 2, 46, 40);
  gr.addColorStop(0, 'rgba(116,232,255,' + glow + ')'); gr.addColorStop(1, 'rgba(116,232,255,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, 100);
  spr(SP.crystal, W / 2 - 6, 38 + Math.sin(t * 2) * 2);
  const lines = [
    [1, '光の結晶が もどり、'],
    [2, 'ミドリ島に ふたたび 光が さした。'],
    [3.5, '島の人々は 若き勇者の 名を'],
    [4.5, 'いつまでも かたりついだという……。'],
  ];
  lines.forEach(([at, s], i) => {
    if (t < at) return;
    ctx.globalAlpha = Math.min(1, (t - at) * 1.5);
    text(s, W / 2, 74 + i * 14, { align: 'center', font: '9px ' + JFONT, color: '#fff' });
    ctx.globalAlpha = 1;
  });
  if (t > 6) {
    ctx.globalAlpha = Math.min(1, (t - 6));
    text('THE END', W / 2, 136, { align: 'center', font: 'bold 16px monospace', color: '#ffe066', outline: '#3a2008', lw: 3 });
    const tt = Math.floor(S.time), hh = Math.floor(tt / 3600), mm = Math.floor(tt / 60) % 60, ss = tt % 60;
    text('プレイ時間 ' + hh + ':' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0') + '  たおした敵 ' + S.kills + '  やられた回数 ' + S.deaths, W / 2, 160, { align: 'center', font: '8px ' + JFONT, color: '#ccd' });
    text('ハート ' + (S.maxHp / 2) + ' / 7', W / 2, 172, { align: 'center', font: '8px ' + JFONT, color: '#f99' });
    ctx.globalAlpha = 1;
  }
  if (t > 8 && Math.floor(G.t * 2) % 2 === 0) text('タップで タイトルへ', W / 2, 186, { align: 'center', font: '8px ' + JFONT, color: '#aab' });
}
function render() {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (G.state === 'title') { renderTitle(); return; }
  if (G.state === 'ending') { renderEnding(); return; }
  ctx.save();
  ctx.beginPath(); ctx.rect(0, HUD_H, VW, VH); ctx.clip();
  let sx = 0, sy = 0;
  if (G.shake > 0) { sx = randi(-2, 2); sy = randi(-2, 2); }
  ctx.translate(sx, HUD_H + sy);
  if (G.state === 'scroll') renderScroll();
  else renderRoomScene(G.room);
  ctx.restore();
  renderHUD();
  if (G.state === 'dialog') renderDialog();
  if (G.state === 'pause') renderPause();
  if (G.state === 'gameover') renderGameOver();
  if (G.fade) {
    const f = G.fade;
    const a = f.t < f.dur ? f.t / f.dur : Math.max(0, 1 - (f.t - f.dur) / f.dur);
    ctx.fillStyle = 'rgba(0,0,0,' + clamp(a, 0, 1) + ')'; ctx.fillRect(0, HUD_H, W, VH);
  }
}

// ================= 起動 =================
let lastT = performance.now(), acc = 0;
function frame(now) {
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.1) dt = 0.1;
  acc += dt;
  const STEP = 1 / 60;
  let n = 0;
  while (acc >= STEP && n < 6) { update(STEP); acc -= STEP; n++; }
  if (n >= 6) acc = 0;
  render();
  requestAnimationFrame(frame);
}
function boot() {
  buildSprites();
  layout();
  hasSave = !!loadSave();
  G.room = loadRoom('world', 1, 1);
  setMusic('cave');
  requestAnimationFrame(frame);
}

// テスト・デバッグ用
window.__game = { G, hero, MAPS, get S() { return S; }, set S(v) { S = v; }, loadRoom, enterRoom, warpTo, newGame, input, keys, SOLID };

boot();
})();
