/* ==========================================================
   Snake — game logic
   Sections:
     1. Config & DOM references
     2. Game state
     3. Sound effects (Web Audio, no files needed)
     4. Game logic (reset, step, food, collisions)
     5. Rendering (canvas drawing, smooth movement, particles)
     6. Main loop
     7. UI helpers (overlay, buttons, score)
     8. Input (keyboard, swipe, on-screen pad)
   ========================================================== */

(() => {
  'use strict';

  /* ------------------------------------------------------
     1. CONFIG & DOM REFERENCES
     ------------------------------------------------------ */
  const COLS = 20;                // grid width in cells
  const ROWS = 20;                // grid height in cells
  // Difficulty levels. base = starting ms per move, min = fastest allowed,
  // speedup = ms shaved off per food eaten (lower ms = faster snake).
  const LEVELS = {
    easy:   { label: 'Easy',   base: 190, min: 110, speedup: 2 },
    medium: { label: 'Medium', base: 150, min: 65,  speedup: 3 },
    hard:   { label: 'Hard',   base: 105, min: 45,  speedup: 4 },
  };
  const SCORE_KEY_PREFIX = 'snakeHighScore_';   // + level name, e.g. snakeHighScore_hard
  const LEVEL_KEY = 'snakeLevel';               // remembers the last chosen level
  const SWIPE_MIN = 24;           // px a finger must travel to count as a swipe

  const DIRS = {
    up:    { x: 0,  y: -1 },
    down:  { x: 0,  y: 1 },
    left:  { x: -1, y: 0 },
    right: { x: 1,  y: 0 },
  };

  const COLORS = {
    boardA: '#12342d',
    boardB: '#153a32',
    headA:  '#ffd36b',
    tailA:  '#e0701d',
    food:   '#ee4d7b',
    foodGlow: 'rgba(238, 77, 123, 0.35)',
  };

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const CELL = canvas.width / COLS;

  const boardWrap   = document.getElementById('boardWrap');
  const scoreEl     = document.getElementById('score');
  const highScoreEl = document.getElementById('highScore');
  const bestLabel   = document.getElementById('bestLabel');
  const levelBtns   = document.querySelectorAll('.level-btn');
  const overlay     = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayText = document.getElementById('overlayText');
  const overlayFinal = document.getElementById('overlayFinal');
  const finalScoreEl = document.getElementById('finalScore');
  const startBtn    = document.getElementById('startBtn');
  const pauseBtn    = document.getElementById('pauseBtn');
  const restartBtn  = document.getElementById('restartBtn');
  const soundBtn    = document.getElementById('soundBtn');

  /* ------------------------------------------------------
     2. GAME STATE
     ------------------------------------------------------ */
  let state = 'idle';             // 'idle' | 'running' | 'paused' | 'over'
  let snake = [];                 // array of {x, y}; index 0 is the head
  let prevSnake = [];             // snake before the last move (for smooth animation)
  let dir = DIRS.right;           // direction used for the last move
  let dirQueue = [];              // buffered turns so quick key presses are not lost
  let food = null;
  let score = 0;
  let level = loadLevel();        // 'easy' | 'medium' | 'hard'
  let highScore = loadHighScore(level);   // best score for the current level
  let delay = LEVELS[level].base;         // current ms per move
  let acc = 0;                    // time accumulated since the last move
  let lastTs = 0;                 // timestamp of the previous animation frame
  let dt = 0;                     // ms since the previous frame
  let particles = [];
  let soundOn = true;

  /* ------------------------------------------------------
     3. SOUND EFFECTS
     ------------------------------------------------------ */
  let audioCtx = null;

  // Browsers only allow audio after a user gesture, so create it lazily.
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  // Play one short tone. `slideTo` glides the pitch for a "bloop" feel.
  function tone(freq, duration, { type = 'square', volume = 0.05, slideTo = null, delay: wait = 0 } = {}) {
    if (!soundOn || !audioCtx) return;
    const t0 = audioCtx.currentTime + wait;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + duration);
  }

  const sfx = {
    start()  { tone(330, 0.1); tone(495, 0.14, { delay: 0.09 }); },
    eat()    { tone(620, 0.09, { slideTo: 980 }); tone(1040, 0.08, { delay: 0.07 }); },
    pause()  { tone(260, 0.08, { type: 'triangle' }); },
    resume() { tone(390, 0.08, { type: 'triangle' }); },
    over()   { tone(300, 0.45, { type: 'sawtooth', slideTo: 70, volume: 0.07 }); },
  };

  /* ------------------------------------------------------
     4. GAME LOGIC
     ------------------------------------------------------ */
  function resetGame() {
    // Start in the middle, 3 segments long, heading right.
    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);
    snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    prevSnake = snake.map(s => ({ ...s }));
    dir = DIRS.right;
    dirQueue = [];
    score = 0;
    delay = LEVELS[level].base;
    acc = 0;
    particles = [];
    food = placeFood();
    updateScore(false);
  }

  // Pick a random empty cell. Returns null if the board is completely full.
  function placeFood() {
    const free = [];
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        if (!snake.some(s => s.x === x && s.y === y)) free.push({ x, y });
      }
    }
    return free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  // Queue a turn. Reversing straight into yourself is ignored.
  function setDirection(name) {
    const next = DIRS[name];
    const last = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir;
    const isReverse = last.x + next.x === 0 && last.y + next.y === 0;
    const isSame = last.x === next.x && last.y === next.y;
    if (isReverse || isSame || dirQueue.length >= 3) return;
    dirQueue.push(next);
  }

  // Advance the snake by one cell.
  function step() {
    prevSnake = snake.map(s => ({ ...s }));
    if (dirQueue.length) dir = dirQueue.shift();

    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // Wall collision
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      return endGame();
    }

    const ate = food && head.x === food.x && head.y === food.y;

    // Self collision. When not eating, the tail moves away, so ignore it.
    const body = ate ? snake : snake.slice(0, -1);
    if (body.some(s => s.x === head.x && s.y === head.y)) {
      return endGame();
    }

    snake.unshift(head);

    if (ate) {
      score++;
      delay = Math.max(LEVELS[level].min, delay - LEVELS[level].speedup);
      spawnParticles(food.x, food.y);
      sfx.eat();
      updateScore(true);
      food = placeFood();
      if (!food) endGame(true);   // board full: the player wins
    } else {
      snake.pop();
    }
  }

  function startGame() {
    ensureAudio();
    resetGame();
    state = 'running';
    boardWrap.classList.remove('crash');
    hideOverlay();
    sfx.start();
    refreshButtons();
  }

  function togglePause() {
    ensureAudio();
    if (state === 'running') {
      state = 'paused';
      sfx.pause();
      showOverlay('Paused', 'Press Resume, Space or P to keep going.');
    } else if (state === 'paused') {
      state = 'running';
      sfx.resume();
      hideOverlay();
    }
    refreshButtons();
  }

  function endGame(won = false) {
    state = 'over';
    const isNewBest = newBestThisRun;
    sfx.over();
    boardWrap.classList.remove('crash');
    void boardWrap.offsetWidth;                 // restart the CSS animation
    boardWrap.classList.add('crash');

    showOverlay(
      won ? 'You filled the board!' : 'Game over',
      isNewBest ? 'New best score!' : (won ? 'Nothing left to eat.' : 'Press Start or Restart to try again.'),
      { over: true, final: score }
    );
    refreshButtons();
  }

  /* ------------------------------------------------------
     5. RENDERING
     ------------------------------------------------------ */
  const lerp = (a, b, t) => a + (b - a) * t;

  // Blend two #rrggbb colors; t = 0 gives a, t = 1 gives b.
  function mix(a, b, t) {
    const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
    const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
    const c = pa.map((v, i) => Math.round(lerp(v, pb[i], t)));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBoard() {
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.boardA : COLORS.boardB;
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
  }

  function drawFood(ts) {
    if (!food) return;
    const pulse = 1 + Math.sin(ts / 180) * 0.08;          // gentle breathing
    const cx = food.x * CELL + CELL / 2;
    const cy = food.y * CELL + CELL / 2;
    const r = CELL * 0.34 * pulse;

    ctx.fillStyle = COLORS.foodGlow;                       // soft glow
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.food;                           // berry
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';           // highlight
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSnake(t) {
    const pad = 2;
    const size = CELL - pad * 2;

    // Draw tail first so the head ends up on top.
    for (let i = snake.length - 1; i >= 0; i--) {
      const to = snake[i];
      const from = prevSnake[i] || prevSnake[prevSnake.length - 1] || to;
      const gx = lerp(from.x, to.x, t);                    // smooth position between cells
      const gy = lerp(from.y, to.y, t);

      const shade = snake.length > 1 ? i / (snake.length - 1) : 0;
      ctx.fillStyle = mix(COLORS.headA, COLORS.tailA, shade);
      roundRect(gx * CELL + pad, gy * CELL + pad, size, size, CELL * 0.3);
      ctx.fill();

      if (i === 0) drawEyes(gx * CELL + CELL / 2, gy * CELL + CELL / 2);
    }
  }

  // Two eyes that look in the direction of travel.
  function drawEyes(cx, cy) {
    const px = -dir.y, py = dir.x;                         // perpendicular to travel
    const forward = CELL * 0.14, side = CELL * 0.2, r = CELL * 0.1;
    for (const s of [-1, 1]) {
      const ex = cx + dir.x * forward + px * side * s;
      const ey = cy + dir.y * forward + py * side * s;
      ctx.fillStyle = '#10241f';
      ctx.beginPath();
      ctx.arc(ex, ey, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex + dir.x * r * 0.35, ey + dir.y * r * 0.35, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Little burst when food is eaten.
  function spawnParticles(gx, gy) {
    const cx = gx * CELL + CELL / 2;
    const cy = gy * CELL + CELL / 2;
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 140;              // px per second
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        size: 3 + Math.random() * 4,
      });
    }
  }

  function drawParticles() {
    const seconds = dt / 1000;
    particles = particles.filter(p => p.life > 0);
    for (const p of particles) {
      p.x += p.vx * seconds;
      p.y += p.vy * seconds;
      p.life -= seconds * 2.2;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = COLORS.food;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * Math.max(0.2, p.life), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function render(ts) {
    // t = how far we are between the previous move and the next one (0..1)
    const moving = state === 'running' || state === 'paused';
    const t = moving ? Math.min(1, acc / delay) : 1;

    drawBoard();
    drawFood(ts);
    drawSnake(t);
    drawParticles();
  }

  /* ------------------------------------------------------
     6. MAIN LOOP
     ------------------------------------------------------ */
  function frame(ts) {
    dt = Math.min(ts - lastTs, 100);   // cap so a background tab can't cause a huge jump
    lastTs = ts;

    if (state === 'running') {
      acc += dt;
      while (acc >= delay && state === 'running') {
        acc -= delay;
        step();
      }
    }

    render(ts);
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------
     7. UI HELPERS
     ------------------------------------------------------ */
  let newBestThisRun = false;

  // Each level keeps its own best score in localStorage.
  function loadHighScore(lvl) {
    try {
      let saved = localStorage.getItem(SCORE_KEY_PREFIX + lvl);
      // Carry over a score saved by the older single-level version as "medium".
      if (saved === null && lvl === 'medium') saved = localStorage.getItem('snakeHighScore');
      return parseInt(saved, 10) || 0;
    } catch (e) {
      return 0;                        // storage may be blocked; the game still works
    }
  }

  function saveHighScore() {
    try {
      localStorage.setItem(SCORE_KEY_PREFIX + level, String(highScore));
    } catch (e) { /* ignore */ }
  }

  function loadLevel() {
    try {
      const saved = localStorage.getItem(LEVEL_KEY);
      return LEVELS[saved] ? saved : 'medium';
    } catch (e) {
      return 'medium';
    }
  }

  // Switch difficulty (only allowed between games).
  function setLevel(next) {
    if (!LEVELS[next] || state === 'running' || state === 'paused') return;
    level = next;
    try { localStorage.setItem(LEVEL_KEY, level); } catch (e) { /* ignore */ }
    highScore = loadHighScore(level);
    resetGame();                       // fresh board with this level's starting speed
    newBestThisRun = false;
    updateLevelUI();
    if (state === 'over') {            // return to the start screen
      state = 'idle';
      showOverlay('Ready?', 'Level: ' + LEVELS[level].label + '. Steer with the arrow keys or W A S D, or swipe.');
    }
    refreshButtons();
  }

  // Reflect the current level in the selector and the "Best" label.
  function updateLevelUI() {
    bestLabel.textContent = 'Best · ' + LEVELS[level].label;
    highScoreEl.textContent = highScore;
    levelBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === level)));
  }

  function updateScore(animate) {
    scoreEl.textContent = score;
    if (score === 0) newBestThisRun = false;

    if (score > highScore) {
      highScore = score;
      newBestThisRun = true;
      saveHighScore();
    }
    highScoreEl.textContent = highScore;

    if (animate) {
      for (const el of [scoreEl, highScoreEl]) {
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
      }
    }
  }

  function showOverlay(title, text, { over = false, final = null } = {}) {
    overlayTitle.textContent = title;
    overlayTitle.classList.toggle('over', over);
    overlayText.textContent = text;
    overlayFinal.hidden = final === null;
    if (final !== null) finalScoreEl.textContent = final;
    overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  // Enable/disable buttons according to the current state.
  function refreshButtons() {
    startBtn.disabled = state === 'running' || state === 'paused';
    pauseBtn.disabled = state === 'idle' || state === 'over';
    pauseBtn.textContent = state === 'paused' ? 'Resume' : 'Pause';
    // Difficulty is locked while a game is in progress
    levelBtns.forEach(b => { b.disabled = state === 'running' || state === 'paused'; });
  }

  /* ------------------------------------------------------
     8. INPUT
     ------------------------------------------------------ */
  // Mouse clicks leave the button focused, which would make Space/Enter
  // trigger it again. Blur after a mouse click (keyboard clicks have detail 0).
  function onButton(btn, handler) {
    btn.addEventListener('click', e => {
      handler();
      if (e.detail) btn.blur();
    });
  }

  onButton(startBtn, startGame);
  onButton(restartBtn, startGame);
  onButton(pauseBtn, togglePause);
  onButton(soundBtn, () => {
    soundOn = !soundOn;
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.setAttribute('aria-label', soundOn ? 'Sound on' : 'Sound off');
    ensureAudio();
    if (soundOn) sfx.resume();
  });

  levelBtns.forEach(b => onButton(b, () => setLevel(b.dataset.level)));

  // Keyboard
  const KEY_TO_DIR = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
  };

  document.addEventListener('keydown', e => {
    const dirName = KEY_TO_DIR[e.key];

    if (dirName) {
      e.preventDefault();              // stop arrow keys from scrolling the page
      ensureAudio();
      // Pressing a direction on the start screen begins the game.
      if (state === 'idle') startGame();
      if (state === 'running') setDirection(dirName);
      return;
    }

    // Let a focused button handle its own Space/Enter activation.
    const onFocusedButton = document.activeElement && document.activeElement.tagName === 'BUTTON';

    if ((e.key === ' ' || e.key === 'p' || e.key === 'P') && !e.repeat) {
      if (e.key === ' ' && onFocusedButton) return;
      e.preventDefault();
      togglePause();
    } else if (e.key === 'Enter' && !e.repeat && !onFocusedButton) {
      if (state === 'idle' || state === 'over') startGame();
    }
  });

  // Swipe controls on the board (touch)
  let touchStart = null;

  boardWrap.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });

  boardWrap.addEventListener('touchmove', e => {
    e.preventDefault();                // keep the page from scrolling while swiping
    if (!touchStart || state !== 'running') return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;

    if (Math.abs(dx) > Math.abs(dy)) setDirection(dx > 0 ? 'right' : 'left');
    else setDirection(dy > 0 ? 'down' : 'up');

    touchStart = { x: t.clientX, y: t.clientY };   // allow chained swipes without lifting
  }, { passive: false });

  boardWrap.addEventListener('touchend', () => { touchStart = null; }, { passive: true });

  // Tapping the board while an overlay is showing starts / resumes the game.
  boardWrap.addEventListener('click', () => {
    if (state === 'idle' || state === 'over') startGame();
    else if (state === 'paused') togglePause();
  });

  // On-screen direction pad
  document.querySelectorAll('.dpad-btn').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();              // react instantly and avoid ghost clicks
      ensureAudio();
      if (state === 'idle') startGame();
      if (state === 'running') setDirection(btn.dataset.dir);
    });
  });

  // Auto-pause if the tab or app goes to the background.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'running') togglePause();
  });

  /* ------------------------------------------------------
     INIT
     ------------------------------------------------------ */
  resetGame();
  updateLevelUI();
  showOverlay('Ready?', 'Steer with the arrow keys or W A S D. On a phone, swipe or use the pad below.');
  refreshButtons();
  requestAnimationFrame(ts => { lastTs = ts; frame(ts); });
})();
