(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const canvas = $("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const stage = $("stage");
  const STORE_KEY = "ljubim-da-pukne-v1";
  const TOTAL_ROUNDS = 3;
  const HEART_KISS = 34;
  const HEART_RAIN = -4;
  const HEART_LEMON = -5;
  const PTS = { kiss: 10, gift: 25, candy: 15 };

  const store = { muted: false };
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (raw && typeof raw === "object") store.muted = !!raw.muted;
  } catch (e) { /* ignore */ }
  function saveStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
  }

  const audio = { ctx: null, master: null, sfx: null, music: null, muted: store.muted, playing: false };
  const NOTE = (() => {
    const map = {};
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    for (let oct = 2; oct <= 7; oct++) {
      for (let i = 0; i < 12; i++) {
        map[names[i] + oct] = 440 * Math.pow(2, ((oct - 4) * 12 + (i - 9)) / 12);
      }
    }
    return map;
  })();

  // Original festive hook in F major — not a transcription of any recording.
  const LEAD = [
    ["F5", 0.5], ["A5", 0.5], ["C6", 0.5], ["A5", 0.5],
    ["Bb5", 0.5], ["A5", 0.5], ["G5", 0.5], ["A5", 0.5],
    ["F5", 0.5], ["A5", 0.5], ["C6", 0.5], ["D6", 0.5],
    ["C6", 0.75], ["A5", 0.75], ["F5", 0.5],
    ["G5", 0.5], ["Bb5", 0.5], ["D6", 0.5], ["Bb5", 0.5],
    ["C6", 0.5], ["Bb5", 0.5], ["A5", 0.5], ["G5", 0.5],
    ["A5", 0.5], ["C6", 0.5], ["F6", 0.5], ["C6", 0.5],
    ["D6", 0.5], ["C6", 0.5], ["A5", 0.5], ["F5", 0.5]
  ];
  const BASS = [
    ["F3", 1], ["C3", 1], ["F3", 1], ["C3", 1],
    ["Bb2", 1], ["F3", 1], ["C3", 1], ["C3", 1],
    ["G3", 1], ["D3", 1], ["Bb2", 1], ["F3", 1],
    ["F3", 1], ["C3", 1], ["F3", 0.5], ["C3", 0.5], ["F3", 1]
  ];
  const BPM = 138;
  const LOOP_BEATS = 16;
  let musicCursor = 0;
  let musicLeadI = 0;
  let musicBassI = 0;
  let musicLeadB = 0;
  let musicBassB = 0;

  function ensureAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audio.ctx) {
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = audio.muted ? 0 : 0.85;
      audio.master.connect(audio.ctx.destination);
      audio.sfx = audio.ctx.createGain();
      audio.sfx.gain.value = 0.9;
      audio.sfx.connect(audio.master);
      audio.music = audio.ctx.createGain();
      audio.music.gain.value = 0.22;
      audio.music.connect(audio.master);
    }
    if (audio.ctx.state === "suspended") audio.ctx.resume();
    return audio.ctx;
  }

  function envGain(g, t, vol, dur, a) {
    const at = a || 0.012;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + at);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function tone(freq, dur, type, vol, dest, slide) {
    const ac = audio.ctx;
    if (!ac || audio.muted) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(Math.max(20, freq), t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    envGain(g, t, vol || 0.08, dur);
    o.connect(g);
    g.connect(dest || audio.sfx);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  function noiseBurst(dur, vol, freq) {
    const ac = audio.ctx;
    if (!ac || audio.muted) return;
    const n = 2 * ac.sampleRate * dur;
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq || 800;
    f.Q.value = 0.7;
    const g = ac.createGain();
    const t = ac.currentTime;
    envGain(g, t, vol || 0.08, dur, 0.008);
    src.connect(f);
    f.connect(g);
    g.connect(audio.sfx);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function sfxKiss() { tone(880, 0.09, "triangle", 0.09); tone(1320, 0.07, "sine", 0.04); }
  function sfxGift() { tone(784, 0.1, "square", 0.07); tone(1046, 0.14, "square", 0.07); }
  function sfxCandy() { tone(1174, 0.08, "triangle", 0.08); tone(1568, 0.1, "sine", 0.05); }
  function sfxBad() { tone(180, 0.16, "sawtooth", 0.07, audio.sfx, 80); noiseBurst(0.08, 0.05, 300); }
  function sfxMwah() {
    tone(640, 0.2, "sine", 0.12, audio.sfx, 240);
    tone(420, 0.16, "triangle", 0.07, audio.sfx, 180);
    noiseBurst(0.07, 0.06, 1200);
    setTimeout(() => { tone(520, 0.07, "sine", 0.08); }, 160);
  }
  function sfxBurst() {
    sfxMwah();
    tone(523, 0.18, "square", 0.06);
    tone(659, 0.22, "square", 0.06);
    tone(784, 0.28, "square", 0.07);
    tone(1046, 0.35, "triangle", 0.08);
    noiseBurst(0.2, 0.07, 2000);
  }
  function sfxBlow() { noiseBurst(0.18, 0.07, 900); }
  function sfxCandle() { noiseBurst(0.12, 0.05, 500); tone(320, 0.2, "sine", 0.05, audio.sfx, 90); }
  function sfxFanfare() {
    const seq = [523, 659, 784, 1046, 1318];
    seq.forEach((f, i) => setTimeout(() => tone(f, 0.28, "square", 0.08), i * 90));
    setTimeout(() => { tone(784, 0.5, "triangle", 0.05); tone(1046, 0.5, "sine", 0.05); }, 400);
  }

  function scheduleVoice(note, durBeats, kind, when) {
    const ac = audio.ctx;
    if (!ac || audio.muted) return;
    const freq = NOTE[note];
    if (!freq) return;
    const dur = durBeats * (60 / BPM) * 0.92;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = kind === "bass" ? "square" : "triangle";
    o.frequency.setValueAtTime(freq, when);
    const vol = kind === "bass" ? 0.07 : 0.09;
    envGain(g, when, vol, dur, 0.02);
    o.connect(g);
    g.connect(audio.music);
    o.start(when);
    o.stop(when + dur + 0.03);
  }

  function resetMusic() {
    musicCursor = 0;
    musicLeadI = 0;
    musicBassI = 0;
    musicLeadB = 0;
    musicBassB = 0;
  }

  function tickMusic() {
    const ac = audio.ctx;
    if (!ac || audio.muted || !audio.playing) return;
    const beatLen = 60 / BPM;
    const now = ac.currentTime;
    if (!tickMusic.start) tickMusic.start = now;
    const elapsed = (now - tickMusic.start) / beatLen + musicCursor;
    const ahead = elapsed + 0.4;
    while (musicLeadB < ahead) {
      const [note, dur] = LEAD[musicLeadI];
      const when = tickMusic.start + (musicLeadB - musicCursor) * beatLen;
      if (when > now - 0.05) scheduleVoice(note, dur, "lead", Math.max(now, when));
      musicLeadB += dur;
      musicLeadI = (musicLeadI + 1) % LEAD.length;
    }
    while (musicBassB < ahead) {
      const [note, dur] = BASS[musicBassI];
      const when = tickMusic.start + (musicBassB - musicCursor) * beatLen;
      if (when > now - 0.05) scheduleVoice(note, dur, "bass", Math.max(now, when));
      musicBassB += dur;
      musicBassI = (musicBassI + 1) % BASS.length;
    }
    if (musicLeadB > LOOP_BEATS * 8) {
      musicCursor += LOOP_BEATS * 4;
    }
  }

  function startMusic() {
    if (!ensureAudio() || audio.muted) return;
    audio.playing = true;
    tickMusic.start = audio.ctx.currentTime + 0.05;
    musicCursor = 0;
    musicLeadI = musicBassI = 0;
    musicLeadB = musicBassB = 0;
  }

  function stopMusic() { audio.playing = false; }

  function syncMuteUi() {
    $("icon-on").hidden = audio.muted;
    $("icon-off").hidden = !audio.muted;
    $("btn-mute").setAttribute("aria-pressed", audio.muted ? "true" : "false");
    $("btn-mute").setAttribute("aria-label", audio.muted ? "Uključi zvuk" : "Utišaj zvuk");
    if (audio.master) {
      const t = audio.ctx.currentTime;
      audio.master.gain.cancelScheduledValues(t);
      audio.master.gain.setTargetAtTime(audio.muted ? 0 : 0.85, t, 0.04);
    }
  }

  let W = 420, H = 780, dpr = 1, S = 1;
  function resize() {
    const r = stage.getBoundingClientRect();
    W = Math.max(280, Math.floor(r.width));
    H = Math.max(400, Math.floor(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = Math.min(W / 420, H / 740);
  }

  const keys = { left: false, right: false };
  const pointer = { down: false, x: 210, y: 0, follow: false, id: null };
  let timeScale = 1;
  let autoPlay = false;
  let time = 0;

  const state = {
    mode: "title",
    round: 1,
    score: 0,
    gifts: 0,
    candies: 0,
    heart: 0,
    introT: 0,
    burstT: 0,
    cakeT: 0,
    endT: 0,
    spawnT: 0,
    shake: 0,
    heartPulse: 0,
    blow: 0,
    blowHeld: false,
    blowAcc: 0,
    candle4: true,
    candle0: true,
    blowSfxT: 0,
    pausedFrom: "play"
  };

  const catcher = { x: 210, y: 0, squash: 0, flash: 0 };
  const items = [];
  const parts = [];
  const popups = [];
  const decor = [];

  function resetDecor() {
    decor.length = 0;
    for (let i = 0; i < 22; i++) {
      decor.push({
        x: Math.random() * W,
        y: Math.random() * H,
        s: 6 + Math.random() * 14,
        sp: 8 + Math.random() * 18,
        phase: Math.random() * Math.PI * 2,
        kind: Math.random() < 0.55 ? "heart" : "spark"
      });
    }
  }

  function showScreen(id) {
    ["screen-title", "screen-pause", "screen-cake", "screen-end"].forEach((sid) => {
      const el = $(sid);
      const on = sid === id;
      el.hidden = !on;
      el.classList.toggle("active", on);
    });
  }

  function hideScreens() {
    ["screen-title", "screen-pause", "screen-cake", "screen-end"].forEach((sid) => {
      $(sid).hidden = true;
      $(sid).classList.remove("active");
    });
  }

  function updateHud() {
    $("hud-round").textContent = "Kolo " + state.round;
    $("hud-loot").textContent = "🎁 " + state.gifts + "   🍬 " + state.candies;
    $("hud-score").textContent = String(state.score);
  }

  function hardReset() {
    state.round = 1;
    state.score = 0;
    state.gifts = 0;
    state.candies = 0;
    state.heart = 0;
    state.introT = 0;
    state.burstT = 0;
    state.cakeT = 0;
    state.endT = 0;
    state.spawnT = 0;
    state.shake = 0;
    state.heartPulse = 0;
    state.blow = 0;
    state.blowHeld = false;
    state.blowAcc = 0;
    state.candle4 = true;
    state.candle0 = true;
    state.blowSfxT = 0;
    items.length = 0;
    parts.length = 0;
    popups.length = 0;
    catcher.x = W / 2;
    catcher.squash = 0;
    catcher.flash = 0;
    updateHud();
  }

  function startGame() {
    ensureAudio();
    startMusic();
    hardReset();
    state.mode = "intro";
    state.introT = 0;
    $("hud").hidden = false;
    hideScreens();
  }

  function goTitle() {
    state.mode = "title";
    $("hud").hidden = true;
    showScreen("screen-title");
    items.length = 0;
  }

  function goPause() {
    if (state.mode !== "play" && state.mode !== "intro") return;
    state.pausedFrom = state.mode;
    state.mode = "pause";
    showScreen("screen-pause");
  }

  function resume() {
    if (state.mode !== "pause") return;
    hideScreens();
    state.mode = state.pausedFrom || "play";
    $("hud").hidden = false;
  }

  function addPopup(x, y, text, color) {
    popups.push({ x, y, text, color, life: 0.8 });
  }

  function spawnPart(p) { parts.push(p); }

  function explode(x, y, n, colors, speed) {
    const sp = speed || 220;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.3 + Math.random()) * sp;
      spawnPart({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 40,
        life: 0.7 + Math.random() * 0.7,
        max: 1.2,
        size: 3 + Math.random() * 6,
        color: colors[i % colors.length],
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 10,
        kind: Math.random() < 0.35 ? "heart" : (Math.random() < 0.5 ? "rect" : "circle")
      });
    }
  }

  function spawnItem() {
    const r = state.round;
    const roll = Math.random();
    const bad = 0.04 + r * 0.015;
    let type = "kiss";
    if (roll < 0.09) type = "gift";
    else if (roll < 0.20) type = "candy";
    else if (roll < 0.20 + bad * 0.5) type = "rain";
    else if (roll < 0.20 + bad) type = "lemon";
    const pad = 36 * S;
    items.push({
      type,
      x: pad + Math.random() * (W - pad * 2),
      y: -30 * S,
      vy: (150 + r * 38 + Math.random() * 30) * S,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 3,
      wob: Math.random() * 6,
      amp: 12 + Math.random() * 16,
      r: (type === "gift" ? 22 : 18) * S
    });
  }

  function shockwave() {
    const hx = W / 2;
    const hy = 88 * S + 20;
    for (const it of items) {
      const dx = it.x - hx;
      const dy = it.y - hy;
      const d = Math.max(40, Math.hypot(dx, dy));
      it.vx = (it.vx || 0) + (dx / d) * 280;
      it.vy -= 180;
      it.flying = true;
    }
  }

  function fillHeart(delta) {
    state.heart = Math.max(0, Math.min(100, state.heart + delta));
    state.heartPulse = 1;
    if (state.heart >= 100 && state.mode === "play") triggerBurst();
  }

  function triggerBurst() {
    state.mode = "burst";
    state.burstT = 0;
    state.heart = 100;
    state.shake = 14;
    sfxBurst();
    const hx = W / 2;
    const hy = 88 * S + 20;
    explode(hx, hy, 70, ["#FF5A7A", "#F0C75E", "#FBF3E8", "#FF8FAB", "#E23D62", "#7EC8E3"], 340);
    shockwave();
    addPopup(hx, hy + 50 * S, "PUKNE!", "#FBF3E8");
  }

  function goCake() {
    state.mode = "cake";
    state.cakeT = 0;
    state.blow = 0;
    state.blowAcc = 0;
    state.blowHeld = false;
    state.candle4 = true;
    state.candle0 = true;
    items.length = 0;
    $("hud").hidden = true;
    $("cake-msg").textContent = "Drži prst ili tapkaj da ugasiš 40.";
    showScreen("screen-cake");
  }

  function goEnd() {
    state.mode = "end";
    state.endT = 0;
    sfxFanfare();
    explode(W / 2, H * 0.42, 90, ["#FF5A7A", "#F0C75E", "#FBF3E8", "#FF8FAB", "#7EC8E3", "#E23D62"], 300);
    $("end-msg").textContent = "Srce je puklo, svećice su se ugasile, a slatkiši su na broju.";
    $("end-stats").innerHTML = "Poeni: " + state.score + "<br>Poklončići: " + state.gifts + "<br>Bombone: " + state.candies;
    showScreen("screen-end");
  }

  function catchItem(it) {
    catcher.squash = 1;
    if (it.type === "kiss") {
      state.score += PTS.kiss * state.round;
      fillHeart(HEART_KISS);
      sfxKiss();
      addPopup(it.x, it.y, "Mwah + " + (PTS.kiss * state.round), "#FF8FAB");
      explode(it.x, it.y, 8, ["#FF5A7A", "#FBF3E8"], 140);
    } else if (it.type === "gift") {
      state.gifts += 1;
      state.score += PTS.gift;
      sfxGift();
      addPopup(it.x, it.y, "+ " + PTS.gift + " 🎁", "#F0C75E");
      explode(it.x, it.y, 8, ["#F0C75E", "#E23D62"], 140);
    } else if (it.type === "candy") {
      state.candies += 1;
      state.score += PTS.candy;
      sfxCandy();
      addPopup(it.x, it.y, "+ " + PTS.candy + " 🍬", "#C9F0C0");
      explode(it.x, it.y, 7, ["#A6E3A1", "#F0C75E"], 130);
    } else {
      fillHeart(it.type === "lemon" ? HEART_LEMON : HEART_RAIN);
      catcher.flash = 1;
      state.shake = 7;
      sfxBad();
      addPopup(it.x, it.y, it.type === "lemon" ? "Limun!" : "Kiša!", "#9AD0E8");
    }
    updateHud();
  }

  function worldFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (W / r.width),
      y: (e.clientY - r.top) * (H / r.height)
    };
  }

  function onPointerDown(e) {
    if (e.target.closest("button, a, input")) return;
    if (state.mode === "pause") return;
    pointer.down = true;
    pointer.id = e.pointerId;
    const p = worldFromEvent(e);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.follow = true;
    if (state.mode === "cake") {
      state.blowHeld = true;
      state.blowAcc += 0.34;
      if (state.blowSfxT <= 0) { sfxBlow(); state.blowSfxT = 0.18; }
    }
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    e.preventDefault();
  }
  function onPointerMove(e) {
    const p = worldFromEvent(e);
    if (e.pointerType !== "touch" || pointer.down) {
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.follow = true;
    }
  }
  function onPointerUp(e) {
    pointer.down = false;
    state.blowHeld = false;
    if (e.pointerType === "touch") pointer.follow = false;
  }

  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerup", onPointerUp);
  stage.addEventListener("pointercancel", onPointerUp);
  stage.addEventListener("contextmenu", (e) => e.preventDefault());

  window.addEventListener("keydown", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = true;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = true;
    if (e.code === "Escape" || e.code === "KeyP") {
      if (state.mode === "play" || state.mode === "intro") goPause();
      else if (state.mode === "pause") resume();
    }
    if ((e.code === "Space" || e.code === "Enter") && state.mode === "cake") {
      state.blowHeld = true;
      state.blowAcc += 0.34;
      if (state.blowSfxT <= 0) { sfxBlow(); state.blowSfxT = 0.18; }
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
    if (e.code === "Space" || e.code === "Enter") state.blowHeld = false;
  });

  $("btn-play").addEventListener("click", () => { ensureAudio(); startGame(); });
  $("btn-resume").addEventListener("click", () => { ensureAudio(); resume(); });
  $("btn-restart").addEventListener("click", () => { ensureAudio(); startGame(); });
  $("btn-pause-home").addEventListener("click", goTitle);
  $("btn-menu").addEventListener("click", goPause);
  function skipToCake() {
    if (state.mode === "cake" || state.mode === "end" || state.mode === "title") return;
    ensureAudio();
    items.length = 0;
    parts.length = 0;
    popups.length = 0;
    goCake();
  }
  $("btn-skip").addEventListener("click", (e) => { e.stopPropagation(); skipToCake(); });
  $("btn-skip-pause").addEventListener("click", (e) => { e.stopPropagation(); skipToCake(); });
  $("btn-end-again").addEventListener("click", () => { ensureAudio(); startGame(); });
  $("btn-mute").addEventListener("click", () => {
    ensureAudio();
    audio.muted = !audio.muted;
    store.muted = audio.muted;
    saveStore();
    syncMuteUi();
    if (!audio.muted && (state.mode === "play" || state.mode === "intro" || state.mode === "cake" || state.mode === "end" || state.mode === "burst")) {
      startMusic();
    }
  });

  function pathHeart(c, x, y, s) {
    c.beginPath();
    c.moveTo(x, y + s * 0.35);
    c.bezierCurveTo(x + s, y - s * 0.32, x + s * 0.55, y - s * 0.98, x, y - s * 0.42);
    c.bezierCurveTo(x - s * 0.55, y - s * 0.98, x - s, y - s * 0.32, x, y + s * 0.35);
    c.closePath();
  }

  function drawHeartIcon(c, x, y, s, fill, stroke) {
    pathHeart(c, x, y, s);
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = Math.max(1, s * 0.06);
      c.stroke();
    }
  }

  function drawMeter(c) {
    const x = W / 2;
    const y = 78 * S;
    const s = 46 * S * (1 + state.heartPulse * 0.12);
    c.save();
    if (state.mode === "burst") {
      const k = Math.min(1, state.burstT / 0.35);
      c.translate(x, y);
      c.scale(1 + k * 1.6, 1 + k * 1.6);
      c.globalAlpha = 1 - k;
      c.translate(-x, -y);
    }
    c.shadowColor = "rgba(255,90,122,0.55)";
    c.shadowBlur = 18 * S;
    pathHeart(c, x, y, s);
    c.fillStyle = "#3A1522";
    c.fill();
    c.save();
    pathHeart(c, x, y, s);
    c.clip();
    const top = y - s * 0.95;
    const bot = y + s * 0.4;
    const hgt = bot - top;
    const fillY = bot - (state.heart / 100) * hgt;
    const grd = c.createLinearGradient(x, fillY, x, bot);
    grd.addColorStop(0, "#FF8FAB");
    grd.addColorStop(1, "#E23D62");
    c.fillStyle = grd;
    const wave = Math.sin(time * 6) * 3 * S;
    c.beginPath();
    c.moveTo(x - s, fillY + wave);
    c.quadraticCurveTo(x, fillY - wave, x + s, fillY + wave);
    c.lineTo(x + s, bot + 10);
    c.lineTo(x - s, bot + 10);
    c.closePath();
    c.fill();
    c.restore();
    pathHeart(c, x, y, s);
    c.strokeStyle = "#F0C75E";
    c.lineWidth = 2.4 * S;
    c.stroke();
    c.restore();
  }

  function drawLips(c, x, y, w, squash, flash) {
    const h = w * 0.5;
    c.save();
    c.translate(x, y);
    c.scale(1 + squash * 0.22, 1 - squash * 0.18);
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.beginPath();
    c.ellipse(0, h * 0.62, w * 0.48, h * 0.18, 0, 0, Math.PI * 2);
    c.fill();
    const lip = flash > 0 ? "#8E3A6B" : "#E23D62";
    const lip2 = flash > 0 ? "#5C2748" : "#B81E45";
    c.fillStyle = lip2;
    c.beginPath();
    c.ellipse(0, h * 0.16, w * 0.48, h * 0.34, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = lip;
    c.beginPath();
    c.moveTo(-w * 0.48, 0);
    c.bezierCurveTo(-w * 0.3, -h * 0.55, -w * 0.08, -h * 0.22, 0, -h * 0.08);
    c.bezierCurveTo(w * 0.08, -h * 0.22, w * 0.3, -h * 0.55, w * 0.48, 0);
    c.bezierCurveTo(w * 0.3, h * 0.08, w * 0.1, h * 0.06, 0, h * 0.04);
    c.bezierCurveTo(-w * 0.1, h * 0.06, -w * 0.3, h * 0.08, -w * 0.48, 0);
    c.closePath();
    c.fill();
    c.fillStyle = "rgba(255,230,236,0.45)";
    c.beginPath();
    c.ellipse(-w * 0.14, -h * 0.1, w * 0.12, h * 0.07, -0.4, 0, Math.PI * 2);
    c.fill();
    if (flash <= 0) {
      c.fillStyle = "rgba(255,255,255,0.8)";
      c.beginPath();
      c.moveTo(-w * 0.22, h * 0.04);
      c.quadraticCurveTo(0, h * 0.16, w * 0.22, h * 0.04);
      c.quadraticCurveTo(0, h * 0.1, -w * 0.22, h * 0.04);
      c.fill();
    }
    c.restore();
  }

  function drawKiss(c, x, y, r, rot) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    drawLips(c, 0, 0, r * 2.1, 0, 0);
    drawHeartIcon(c, r * 0.7, -r * 0.7, r * 0.35, "#FF8FAB");
    c.restore();
  }

  function drawGift(c, x, y, r, rot) {
    c.save();
    c.translate(x, y);
    c.rotate(rot * 0.4);
    const s = r * 1.6;
    c.fillStyle = "rgba(0,0,0,0.2)";
    c.fillRect(-s * 0.5, s * 0.35, s, s * 0.15);
    c.fillStyle = "#E23D62";
    c.fillRect(-s * 0.46, -s * 0.3, s * 0.92, s * 0.72);
    c.fillStyle = "#C81E42";
    c.fillRect(-s * 0.46, -s * 0.3, s * 0.92, s * 0.12);
    c.fillStyle = "#F0C75E";
    c.fillRect(-s * 0.07, -s * 0.3, s * 0.14, s * 0.72);
    c.fillRect(-s * 0.46, 0.02 * s, s * 0.92, s * 0.12);
    c.fillStyle = "#F0C75E";
    c.beginPath();
    c.ellipse(-s * 0.12, -s * 0.42, s * 0.16, s * 0.16, 0, 0, Math.PI * 2);
    c.ellipse(s * 0.12, -s * 0.42, s * 0.16, s * 0.16, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawCandy(c, x, y, r, rot) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.fillStyle = "#F0C75E";
    c.beginPath();
    c.moveTo(-r * 1.15, 0);
    c.lineTo(-r * 0.55, -r * 0.45);
    c.lineTo(-r * 0.55, r * 0.45);
    c.closePath();
    c.fill();
    c.fillStyle = "#FF8FAB";
    c.beginPath();
    c.moveTo(r * 1.15, 0);
    c.lineTo(r * 0.55, -r * 0.45);
    c.lineTo(r * 0.55, r * 0.45);
    c.closePath();
    c.fill();
    const g = c.createLinearGradient(-r, 0, r, 0);
    g.addColorStop(0, "#FF5A7A");
    g.addColorStop(0.5, "#FBF3E8");
    g.addColorStop(1, "#7EC8E3");
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, 0, r * 0.62, r * 0.48, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawLemon(c, x, y, r, rot) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.fillStyle = "#F0C75E";
    c.beginPath();
    c.ellipse(0, 0, r * 0.85, r * 0.65, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#D6A83A";
    c.beginPath();
    c.ellipse(r * 0.72, 0, r * 0.12, r * 0.16, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#5BA85A";
    c.beginPath();
    c.ellipse(-r * 0.15, -r * 0.72, r * 0.22, r * 0.14, -0.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.4)";
    c.beginPath();
    c.ellipse(-r * 0.25, -r * 0.15, r * 0.22, r * 0.12, -0.5, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawRain(c, x, y, r, rot) {
    c.save();
    c.translate(x, y);
    c.rotate(rot * 0.15);
    const g = c.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, "#D6F3FF");
    g.addColorStop(1, "#4EA4D0");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, -r);
    c.bezierCurveTo(r * 0.75, -r * 0.15, r * 0.7, r * 0.7, 0, r * 0.85);
    c.bezierCurveTo(-r * 0.7, r * 0.7, -r * 0.75, -r * 0.15, 0, -r);
    c.fill();
    c.restore();
  }

  function drawItem(c, it) {
    if (it.type === "kiss") drawKiss(c, it.x, it.y, it.r, it.rot);
    else if (it.type === "gift") drawGift(c, it.x, it.y, it.r, it.rot);
    else if (it.type === "candy") drawCandy(c, it.x, it.y, it.r, it.rot);
    else if (it.type === "lemon") drawLemon(c, it.x, it.y, it.r, it.rot);
    else drawRain(c, it.x, it.y, it.r, it.rot);
  }

  function strokeWaxDigit(c, draw, cx, cy, h, lit) {
    const layers = [
      { w: h * 0.26, col: "#8A5A28" },
      { w: h * 0.2, col: lit ? "#F7E2A8" : "#C9B48A" },
      { w: h * 0.1, col: lit ? "rgba(255,255,240,0.55)" : "rgba(255,255,240,0.2)" }
    ];
    layers.forEach((L, i) => {
      c.save();
      c.lineCap = "round";
      c.lineJoin = "round";
      c.strokeStyle = L.col;
      c.lineWidth = L.w;
      c.translate(i === 2 ? -h * 0.04 : 0, i === 2 ? -h * 0.03 : 0);
      draw(c, cx, cy, h);
      c.restore();
    });
  }

  function pathFour(c, cx, cy, h) {
    const w = h * 0.62;
    c.beginPath();
    c.moveTo(cx - w * 0.32, cy - h * 0.38);
    c.lineTo(cx - w * 0.32, cy + h * 0.02);
    c.lineTo(cx + w * 0.36, cy + h * 0.02);
    c.stroke();
    c.beginPath();
    c.moveTo(cx + w * 0.2, cy - h * 0.48);
    c.lineTo(cx + w * 0.2, cy + h * 0.48);
    c.stroke();
  }

  function pathZero(c, cx, cy, h) {
    c.beginPath();
    c.ellipse(cx, cy, h * 0.28, h * 0.46, 0, 0, Math.PI * 2);
    c.stroke();
  }

  function drawFlame(c, x, y, s, lean, lit) {
    if (!lit) {
      c.save();
      c.globalAlpha = 0.35;
      c.fillStyle = "#9AA3A8";
      for (let i = 0; i < 3; i++) {
        const yy = y - i * s * 0.55 - (time * 30 + i * 8) % (s * 2);
        c.beginPath();
        c.ellipse(x + Math.sin(time * 2 + i) * 3, yy, s * 0.22, s * 0.4, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
      return;
    }
    const flicker = 0.85 + Math.sin(time * 22 + x) * 0.1 + Math.random() * 0.04;
    c.save();
    c.translate(x, y);
    c.rotate(lean);
    c.scale(flicker, flicker);
    c.fillStyle = "rgba(255,160,40,0.35)";
    c.beginPath();
    c.ellipse(0, -s * 0.15, s * 0.7, s * 1.15, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#FF9A2E";
    c.beginPath();
    c.moveTo(0, -s * 1.35);
    c.bezierCurveTo(s * 0.7, -s * 0.3, s * 0.45, s * 0.7, 0, s * 0.55);
    c.bezierCurveTo(-s * 0.45, s * 0.7, -s * 0.7, -s * 0.3, 0, -s * 1.35);
    c.fill();
    c.fillStyle = "#FFE28A";
    c.beginPath();
    c.moveTo(0, -s * 0.7);
    c.bezierCurveTo(s * 0.32, -s * 0.1, s * 0.2, s * 0.4, 0, s * 0.28);
    c.bezierCurveTo(-s * 0.2, s * 0.4, -s * 0.32, -s * 0.1, 0, -s * 0.7);
    c.fill();
    c.fillStyle = "#FFFDF4";
    c.beginPath();
    c.ellipse(0, 0, s * 0.14, s * 0.28, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawCake(c) {
    const cx = W / 2;
    const baseY = H * 0.82;
    const u = Math.min(W * 0.42, 200 * S);

    c.fillStyle = "rgba(0,0,0,0.22)";
    c.beginPath();
    c.ellipse(cx, baseY + 18 * S, u * 1.05, 16 * S, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#F0C75E";
    c.beginPath();
    c.ellipse(cx, baseY, u * 0.98, 14 * S, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#FBF3E8";
    c.beginPath();
    c.ellipse(cx, baseY - 6 * S, u * 0.86, 11 * S, 0, 0, Math.PI * 2);
    c.fill();

    const tiers = [
      { y: baseY - 16 * S, w: u * 0.82, h: 44 * S, col: "#FF8FAB", top: "#FFD0DA" },
      { y: baseY - 16 * S - 44 * S, w: u * 0.62, h: 36 * S, col: "#FBF3E8", top: "#FFF" },
      { y: baseY - 16 * S - 80 * S, w: u * 0.42, h: 28 * S, col: "#FF5A7A", top: "#FFB0C0" }
    ];
    tiers.forEach((t) => {
      c.fillStyle = t.col;
      c.beginPath();
      c.roundRect(cx - t.w, t.y - t.h, t.w * 2, t.h + 8 * S, 10 * S);
      c.fill();
      c.fillStyle = t.top;
      c.beginPath();
      c.ellipse(cx, t.y - t.h, t.w, 10 * S, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = t.col;
      c.beginPath();
      c.ellipse(cx, t.y + 4 * S, t.w, 10 * S, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#F0C75E";
      for (let i = -3; i <= 3; i++) {
        c.beginPath();
        c.arc(cx + (t.w * i) / 3.6, t.y - 2 * S, 3.2 * S, 0, Math.PI * 2);
        c.fill();
      }
    });

    const topY = tiers[2].y - tiers[2].h;
    const h = 74 * S;
    const fourX = cx - 36 * S;
    const zeroX = cx + 36 * S;
    const cy = topY - h * 0.28;
    strokeWaxDigit(c, pathFour, fourX, cy, h, state.candle4);
    strokeWaxDigit(c, pathZero, zeroX, cy, h, state.candle0);
    const lean = state.blow * 0.55;
    drawFlame(c, fourX + 14 * S, cy - h * 0.55, 16 * S, -lean, state.candle4);
    drawFlame(c, zeroX, cy - h * 0.58, 16 * S, lean, state.candle0);

    if ((state.candle4 || state.candle0) && (state.blowHeld || state.blow > 0.1)) {
      c.save();
      c.strokeStyle = "rgba(220,240,255,0.45)";
      c.lineWidth = 2 * S;
      const srcY = H * 0.92;
      for (let i = 0; i < 6; i++) {
        const ph = time * 8 + i;
        c.globalAlpha = 0.25 + (Math.sin(ph) * 0.5 + 0.5) * 0.4 * state.blow;
        c.beginPath();
        const tx = i < 3 ? fourX + 14 * S : zeroX;
        c.moveTo(cx + (i - 2.5) * 10 * S, srcY);
        c.quadraticCurveTo(cx + (i - 2.5) * 16 * S, (srcY + cy - h * 0.5) / 2, tx + Math.sin(ph) * 8, cy - h * 0.4);
        c.stroke();
      }
      c.restore();
    }
  }

  function drawBackground(c) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1A0A14");
    g.addColorStop(0.45, "#3B1230");
    g.addColorStop(0.78, "#7A2A46");
    g.addColorStop(1, "#C45C5C");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    const glow = c.createRadialGradient(W / 2, H * 0.92, 10, W / 2, H * 0.92, W * 0.7);
    glow.addColorStop(0, "rgba(240,199,94,0.18)");
    glow.addColorStop(1, "rgba(240,199,94,0)");
    c.fillStyle = glow;
    c.fillRect(0, 0, W, H);
    decor.forEach((d) => {
      const x = d.x + Math.sin(time * 0.6 + d.phase) * 10;
      const y = (d.y + time * d.sp) % (H + 40) - 20;
      c.globalAlpha = 0.18 + Math.sin(time + d.phase) * 0.08;
      if (d.kind === "heart") drawHeartIcon(c, x, y, d.s * S, "#FF8FAB");
      else {
        c.fillStyle = "#F0C75E";
        c.beginPath();
        c.arc(x, y, d.s * 0.18 * S, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    });
  }

  function drawParts(c) {
    for (const p of parts) {
      const a = Math.max(0, p.life / (p.max || 1));
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot || 0);
      c.globalAlpha = Math.min(1, a * 1.4);
      c.fillStyle = p.color;
      if (p.kind === "heart") drawHeartIcon(c, 0, 0, p.size * 1.4, p.color);
      else if (p.kind === "rect") {
        c.fillRect(-p.size * 0.6, -p.size * 0.3, p.size * 1.2, p.size * 0.6);
      } else {
        c.beginPath();
        c.arc(0, 0, p.size * 0.55, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }
  }

  function drawPopups(c) {
    c.save();
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (const p of popups) {
      const a = Math.max(0, p.life / 0.8);
      c.globalAlpha = a;
      c.fillStyle = p.color;
      c.font = "700 " + (p.text.indexOf("PUKNE") >= 0 ? 42 * S : 18 * S) + "px Jost, sans-serif";
      if (p.text.indexOf("PUKNE") >= 0) {
        c.font = "600 " + 54 * S + "px 'Playfair Display', Georgia, serif";
      }
      c.fillText(p.text, p.x, p.y);
    }
    c.restore();
  }

  function drawIntro(c) {
    if (state.mode !== "intro") return;
    const a = state.introT < 0.15 ? state.introT / 0.15 : (state.introT > 0.5 ? (0.75 - state.introT) / 0.25 : 1);
    c.save();
    c.globalAlpha = Math.max(0, a);
    c.textAlign = "center";
    c.fillStyle = "#FBF3E8";
    c.font = "600 " + 42 * S + "px 'Playfair Display', Georgia, serif";
    c.fillText("Kolo " + state.round, W / 2, H * 0.42);
    c.font = "600 " + 18 * S + "px Jost, sans-serif";
    c.fillStyle = "#F0C75E";
    c.fillText(state.round === 1 ? "Skupljaj poljupce!" : "Malo brže!", W / 2, H * 0.42 + 40 * S);
    c.restore();
  }

  function update(dt) {
    time += dt;
    state.shake = Math.max(0, state.shake - dt * 28);
    state.heartPulse = Math.max(0, state.heartPulse - dt * 3);
    catcher.squash = Math.max(0, catcher.squash - dt * 4);
    catcher.flash = Math.max(0, catcher.flash - dt * 2.2);
    state.blowSfxT = Math.max(0, state.blowSfxT - dt);

    catcher.y = H - 64 * S;
    const speed = 520 * S;
    if (state.mode === "play" || state.mode === "intro" || state.mode === "burst") {
      if (keys.left) catcher.x -= speed * dt;
      if (keys.right) catcher.x += speed * dt;
      if (pointer.follow) catcher.x += (pointer.x - catcher.x) * Math.min(1, dt * 14);
      const hw = 50 * S;
      catcher.x = Math.max(hw, Math.min(W - hw, catcher.x));
    }

    if (state.mode === "intro") {
      state.introT += dt;
      if (state.introT >= 0.7) {
        state.mode = "play";
        state.spawnT = 0.15;
      }
    }

    if (autoPlay && state.mode === "play") {
      const good = items.filter((it) => it.type === "kiss" || it.type === "gift" || it.type === "candy");
      if (good.length) {
        good.sort((a, b) => (b.y - a.y));
        catcher.x = good[0].x;
        pointer.follow = true;
        pointer.x = good[0].x;
      }
    }
    if (autoPlay && state.mode === "cake") {
      state.blowHeld = true;
      state.blowAcc += dt * 2.2;
    }

    if (state.mode === "play") {
      const interval = Math.max(0.22, 0.48 - state.round * 0.06);
      state.spawnT -= dt;
      if (state.spawnT <= 0) {
        spawnItem();
        state.spawnT = interval * (0.7 + Math.random() * 0.5);
      }
    }

    if (state.mode === "play" || state.mode === "burst") {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.y += it.vy * dt;
        if (it.flying) {
          it.x += (it.vx || 0) * dt;
          it.vy += 420 * dt;
        } else {
          it.x += Math.sin(time * 2 + it.wob) * it.amp * dt;
        }
        it.rot += it.vr * dt;
        const cw = 96 * S;
        const ch = 36 * S;
        const hit = !it.flying && state.mode === "play" &&
          it.y + it.r * 0.3 > catcher.y - ch * 0.7 &&
          it.y - it.r < catcher.y + ch * 0.5 &&
          Math.abs(it.x - catcher.x) < cw * 0.5 + it.r * 0.3;
        if (hit) {
          catchItem(it);
          items.splice(i, 1);
        } else if (it.y > H + 60 || it.x < -80 || it.x > W + 80) {
          items.splice(i, 1);
        }
      }
    }

    if (state.mode === "burst") {
      state.burstT += dt;
      if (state.burstT > 0.95) {
        state.heart = 0;
        items.length = 0;
        if (state.round >= TOTAL_ROUNDS) goCake();
        else {
          state.round += 1;
          updateHud();
          state.mode = "intro";
          state.introT = 0;
        }
      }
    }

    if (state.mode === "cake") {
      state.cakeT += dt;
      if (state.blowHeld) state.blowAcc += dt * 0.95;
      state.blow = Math.max(0, Math.min(1, state.blowHeld ? state.blow + dt * 1.8 : state.blow - dt * 1.1));
      if (state.candle4 && state.blowAcc >= 0.85) {
        state.candle4 = false;
        sfxCandle();
        $("cake-msg").textContent = "Još jednom — ugasi 0!";
        explode(W / 2 - 36 * S, H * 0.42, 16, ["#F0C75E", "#9AA3A8"], 120);
      }
      if (!state.candle4 && state.candle0 && state.blowAcc >= 1.7) {
        state.candle0 = false;
        sfxCandle();
        $("cake-msg").textContent = "Srećan rođendan!";
        explode(W / 2 + 36 * S, H * 0.42, 16, ["#F0C75E", "#9AA3A8"], 120);
      }
      if (!state.candle4 && !state.candle0 && state.cakeT > 0) {
        if (!state._cakeDoneAt) state._cakeDoneAt = state.cakeT;
        if (state.cakeT - state._cakeDoneAt > 0.85) {
          state._cakeDoneAt = 0;
          goEnd();
        }
      }
    } else {
      state._cakeDoneAt = 0;
    }

    if (state.mode === "end") {
      state.endT += dt;
      if (state.endT < 2.5 || Math.random() < dt * 6) {
        if (Math.random() < dt * 14) {
          explode(Math.random() * W, 40 + Math.random() * H * 0.3, 3, ["#FF5A7A", "#F0C75E", "#FBF3E8", "#FF8FAB"], 160);
        }
      }
    }

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy += 280 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
      if (p.life <= 0) parts.splice(i, 1);
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      popups[i].y -= 40 * dt;
      popups[i].life -= dt;
      if (popups[i].life <= 0) popups.splice(i, 1);
    }

    tickMusic();
  }

  function draw() {
    const c = ctx;
    c.save();
    if (state.shake > 0) {
      c.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawBackground(c);
    if (state.mode === "cake" || state.mode === "end" || (state.mode === "title" && false)) {
      drawCake(c);
    }
    if (state.mode === "title") {
      // soft floating kisses already in decor; no cake on title
    }
    if (state.mode === "play" || state.mode === "intro" || state.mode === "burst" || state.mode === "pause") {
      drawMeter(c);
      items.forEach((it) => drawItem(c, it));
      drawLips(c, catcher.x, catcher.y, 108 * S, catcher.squash, catcher.flash);
    }
    if (state.mode === "cake" || state.mode === "end") {
      // cake already drawn
    }
    drawParts(c);
    drawPopups(c);
    drawIntro(c);
    c.restore();
  }

  let last = performance.now();
  function loop(now) {
    const raw = Math.min(0.05, (now - last) / 1000);
    last = now;
    const dt = raw * timeScale;
    if (state.mode !== "pause") update(dt);
    else tickMusic();
    draw();
    requestAnimationFrame(loop);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && (state.mode === "play" || state.mode === "intro")) goPause();
  });

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 80));
  resize();
  resetDecor();
  syncMuteUi();
  showScreen("screen-title");
  requestAnimationFrame(loop);

  window.__LJUBIM = {
    getState() {
      return {
        mode: state.mode,
        round: state.round,
        score: state.score,
        gifts: state.gifts,
        candies: state.candies,
        heart: state.heart,
        candle4: state.candle4,
        candle0: state.candle0,
        itemCount: items.length,
        items: items.map((it) => ({ type: it.type, x: it.x, y: it.y, r: it.r })),
        catcherX: catcher.x,
        catcherY: catcher.y,
        timeScale
      };
    },
    setTimeScale(v) { timeScale = Math.max(0.2, Math.min(10, Number(v) || 1)); },
    setAutoPlay(v) { autoPlay = !!v; },
    moveTo(x) { pointer.follow = true; pointer.x = x; catcher.x = x; },
    blow() { if (state.mode === "cake") { state.blowHeld = true; state.blowAcc += 0.5; } },
    start: startGame,
    skipToCake
  };
})();
