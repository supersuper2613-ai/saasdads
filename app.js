// ── OpenRouter Config ──────────────────────────────────────────────
const OR_BASE = 'https://openrouter.ai/api/v1';

// Free models available on OpenRouter (no credits needed)
const FREE_MODELS = [
  {
    id: 'meta-llama/llama-3.1-8b-instruct:free',
    name: 'Llama 3.1 8B',
    desc: 'Meta · Great all-rounder · Fast',
  },
  {
    id: 'qwen/qwen-2.5-72b-instruct:free',
    name: 'Qwen 2.5 72B',
    desc: 'Alibaba · Best math quality · Recommended',
  },
  {
    id: 'google/gemma-3-12b-it:free',
    name: 'Gemma 3 12B',
    desc: 'Google · Strong reasoning',
  },
  {
    id: 'mistralai/mistral-7b-instruct:free',
    name: 'Mistral 7B',
    desc: 'Mistral AI · Reliable JSON output',
  },
  {
    id: 'microsoft/phi-3-mini-128k-instruct:free',
    name: 'Phi-3 Mini',
    desc: 'Microsoft · Lightweight · Very fast',
  },
];

let API_KEY   = '';
let OR_MODEL  = FREE_MODELS[0].id;

// ── Topics ─────────────────────────────────────────────────────────
const TOPICS = {
  calc1: ['All', 'Limits', 'Derivatives', 'Integrals', 'Applications'],
  calc2: ['All', 'Integration Techniques', 'Series & Sequences', 'Applications', 'Polar & Parametric'],
};

// ── Game State ─────────────────────────────────────────────────────
const state = {
  mode: 'daily',
  subject: 'calc1',
  topic: 'All',
  score: 0, streak: 0, wins: 0,
  difficulty: 'medium',
  question: null,
  answered: false,
  loading: false,
  endlessRound: 0,
  seenQuestions: new Set(),
};

// ══════════════════════════════════════════════════════════════════
//  SETUP SCREEN
// ══════════════════════════════════════════════════════════════════

function initSetup() {
  // Restore saved key & model
  const savedKey   = localStorage.getItem('or_api_key')   || '';
  const savedModel = localStorage.getItem('or_model')     || FREE_MODELS[0].id;

  if (savedKey) {
    document.getElementById('api-key-input').value = savedKey;
    API_KEY = savedKey;
  }
  OR_MODEL = savedModel;

  // Render model pills
  const list = document.getElementById('model-list');
  list.innerHTML = '';
  FREE_MODELS.forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'model-pill' + (m.id === OR_MODEL ? ' selected' : '');
    btn.innerHTML = `
      <div class="model-pill-info">
        <span class="model-pill-name">${m.name}</span>
        <span class="model-pill-desc">${m.desc}</span>
      </div>`;
    btn.onclick = () => selectModel(m.id);
    list.appendChild(btn);
  });

  // Enable start if key is present
  document.getElementById('start-btn').disabled = !savedKey;

  // Key input listener
  document.getElementById('api-key-input').addEventListener('input', e => {
    const val = e.target.value.trim();
    API_KEY = val;
    document.getElementById('start-btn').disabled = val.length === 0;
    document.getElementById('key-error').style.display = 'none';
  });
}

function selectModel(id) {
  OR_MODEL = id;
  document.querySelectorAll('.model-pill').forEach((btn, i) => {
    btn.classList.toggle('selected', FREE_MODELS[i].id === id);
  });
}

function toggleKeyVisibility() {
  const inp = document.getElementById('api-key-input');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function startGame() {
  const key = document.getElementById('api-key-input').value.trim();
  if (!key) return;

  if (!key.startsWith('sk-or-')) {
    const errEl = document.getElementById('key-error');
    errEl.textContent = 'That doesn\'t look like an OpenRouter key. Keys start with "sk-or-".';
    errEl.style.display = 'block';
    return;
  }

  API_KEY = key;
  localStorage.setItem('or_api_key', key);
  localStorage.setItem('or_model', OR_MODEL);

  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('game-screen').style.display  = 'flex';

  renderTopicBar();
  loadQuestion();
}

function showSetup() {
  document.getElementById('game-screen').style.display  = 'none';
  document.getElementById('setup-screen').style.display = 'flex';
}

// ══════════════════════════════════════════════════════════════════
//  GAME LOGIC
// ══════════════════════════════════════════════════════════════════

function renderTopicBar() {
  const bar = document.getElementById('topic-bar');
  bar.innerHTML = '';
  const lbl = document.createElement('span');
  lbl.className = 'bar-label';
  lbl.textContent = 'Topic';
  bar.appendChild(lbl);
  TOPICS[state.subject].forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'pill-btn topic-btn' + (state.topic === t ? ' active' : '');
    btn.textContent = t;
    btn.onclick = () => setTopic(t);
    bar.appendChild(btn);
  });
}

function setTopic(t) {
  state.topic = t;
  state.endlessRound = 0;
  renderTopicBar();
  loadQuestion();
}

function getDifficulty() {
  if (state.mode === 'daily') return 'medium';
  const block = Math.floor(state.endlessRound / 5);
  return block === 0 ? 'easy' : block === 1 ? 'medium' : 'hard';
}

// ── Loading messages ───────────────────────────────────────────────
const LOADING_MSGS = [
  'Generating question…',
  'Consulting the calculus gods…',
  'Integrating creativity…',
  'Deriving a challenge for you…',
  'Summoning a theorem…',
  'Epsilon-delta thinking…',
  'Checking convergence…',
  'Applying the chain rule…',
];
function pickLoadingMsg() {
  return LOADING_MSGS[Math.floor(Math.random() * LOADING_MSGS.length)];
}

// ── Prompt ─────────────────────────────────────────────────────────
function buildPrompt(subject, difficulty, topic) {
  const subjectName = subject === 'calc1' ? 'Calculus 1' : 'Calculus 2';
  const topicLine   = topic !== 'All' ? `Topic: ${topic}` : `Topic: any standard ${subjectName} topic`;
  const diffGuide   = {
    easy:   'straightforward, single-concept question for a student just learning the material',
    medium: 'moderately challenging, requiring application of one or two concepts',
    hard:   'challenging, requiring deeper understanding or multi-step reasoning',
  }[difficulty];
  const seenList  = [...state.seenQuestions].slice(-20).join(' | ');
  const avoidLine = seenList ? `\n\nDo NOT repeat or closely resemble: ${seenList}` : '';

  return `You are a ${subjectName} professor creating a quiz question.

Generate ONE multiple-choice calculus question:
- Course: ${subjectName}
- ${topicLine}
- Difficulty: ${difficulty} — ${diffGuide}
- 4 answer choices (plain text, no A/B/C/D)
- Exactly one correct answer${avoidLine}

Respond ONLY with a JSON object, no markdown, no explanation:
{"question":"...","topic":"...","choices":["...","...","...","..."],"answer":"...","explanation":"..."}

Rules:
- Unicode math only: x², ∫, →, ∞, √, π, · (no LaTeX)
- answer must exactly match one of the choices strings
- Make wrong choices plausible`;
}

// ── OpenRouter fetch (question) ────────────────────────────────────
async function fetchAIQuestion() {
  const response = await fetch(`${OR_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'HTTP-Referer': window.location.href,
      'X-Title': 'CALCLE',
    },
    body: JSON.stringify({
      model: OR_MODEL,
      messages: [{ role: 'user', content: buildPrompt(state.subject, state.difficulty, state.topic) }],
      temperature: 0.8,
      max_tokens: 600,
    }),
  });

  if (response.status === 401) throw new Error('Invalid API key. Go to Settings and check your OpenRouter key.');
  if (response.status === 429) throw new Error('Rate limit hit. Wait a moment and try again.');
  if (!response.ok) {
    const txt = await response.text().catch(() => '');
    throw new Error(`OpenRouter error ${response.status}: ${txt}`);
  }

  const data = await response.json();
  const raw  = data.choices?.[0]?.message?.content || '';
  const clean = raw.replace(/```json|```/gi, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No valid JSON in response');
    parsed = JSON.parse(match[0]);
  }

  if (!parsed.question || !Array.isArray(parsed.choices) || !parsed.answer || !parsed.explanation)
    throw new Error('Invalid question format');
  if (!parsed.choices.includes(parsed.answer))
    throw new Error('Answer not found in choices');

  return parsed;
}

// ── Load question ──────────────────────────────────────────────────
async function loadQuestion() {
  if (state.loading) return;
  state.loading = true;
  state.answered = false;
  state.difficulty = getDifficulty();

  setLoadingUI(true);
  hideError();
  document.getElementById('end-card').style.display = 'none';
  document.getElementById('choices-grid').style.display = 'none';
  document.getElementById('loading-text').textContent = pickLoadingMsg();
  lockControls(true);
  updateProgressBar();

  let question = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const q = await fetchAIQuestion();
      if (state.seenQuestions.has(q.question)) continue;
      question = q;
      state.seenQuestions.add(q.question);
      break;
    } catch (err) {
      console.error(`Attempt ${attempt} failed:`, err);
      if (attempt === 3) {
        showError(err.message);
        setLoadingUI(false);
        state.loading = false;
        lockControls(false);
        return;
      }
    }
  }

  state.question = question;
  state.loading  = false;
  lockControls(false);
  renderQuestion();
}

function setLoadingUI(loading) {
  document.getElementById('loading-state').style.display  = loading ? 'flex'  : 'none';
  document.getElementById('question-body').style.display  = loading ? 'none'  : 'block';
}
function lockControls(lock) {
  document.querySelectorAll('.pill-btn').forEach(b => b.disabled = lock);
}

// ── Render question ────────────────────────────────────────────────
function renderQuestion() {
  const q = state.question;
  if (!q) return;
  setLoadingUI(false);

  document.getElementById('question-text').textContent = q.question;
  document.getElementById('topic-tag').textContent     = q.topic || state.topic;

  const diffMap = { easy:['diff-easy','Easy'], medium:['diff-medium','Medium'], hard:['diff-hard','Hard'] };
  const [cls, lbl] = diffMap[state.difficulty];
  document.getElementById('diff-badge').innerHTML = `<span class="difficulty-badge ${cls}">${lbl}</span>`;

  const modelName = FREE_MODELS.find(m => m.id === OR_MODEL)?.name || OR_MODEL;
  document.getElementById('ai-dot').className   = 'ai-dot static';
  document.getElementById('ai-label').textContent = `OpenRouter · ${modelName}`;

  const grid = document.getElementById('choices-grid');
  grid.innerHTML = '';
  grid.style.display = 'grid';
  [...q.choices].sort(() => Math.random() - 0.5).forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = c;
    btn.onclick = () => handleChoice(c, btn);
    grid.appendChild(btn);
  });
}

// ── Handle answer ──────────────────────────────────────────────────
function handleChoice(selected, btn) {
  if (state.answered || !state.question || state.loading) return;
  state.answered = true;
  const correct = selected === state.question.answer;

  document.querySelectorAll('.choice-btn').forEach(b => {
    b.disabled = true;
    if (b.textContent === state.question.answer) b.classList.add('reveal-correct');
  });

  if (correct) {
    btn.classList.add('selected-correct');
    const pts = { easy:100, medium:200, hard:350 }[state.difficulty];
    state.score += pts; state.streak++; state.wins++;
    showToast(`✓ Correct! +${pts} pts`);
  } else {
    btn.classList.add('selected-wrong');
    state.streak = 0;
    showToast('✗ Not quite…');
  }
  updateStats();
  setTimeout(() => showEndCard(correct), 600);
}

// ── End card ───────────────────────────────────────────────────────
function showEndCard(correct) {
  solutionOpen = false; solutionLoaded = false; solutionStreaming = false;
  document.getElementById('solution-panel').classList.remove('visible');
  document.getElementById('solution-toggle').classList.remove('open');
  document.getElementById('solution-toggle-label').textContent = 'Show Full Solution';
  document.getElementById('solution-body').innerHTML =
    '<div class="solution-loading" id="solution-loading"><div class="mini-spin"></div>Generating solution…</div>';

  const card = document.getElementById('end-card');
  card.style.display = 'block';
  document.getElementById('end-title').textContent       = correct ? '🎓 Correct!' : '📖 Keep Studying';
  document.getElementById('end-answer').textContent      = state.question.answer;
  document.getElementById('end-explanation').textContent = state.question.explanation;

  const nb = document.getElementById('next-btn');
  nb.disabled = false;
  if (state.mode === 'daily') {
    nb.textContent = 'Play Endless →';
    nb.onclick = () => setMode('endless');
  } else {
    nb.textContent = 'Next Question →';
    nb.onclick = nextRound;
  }
  card.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function nextRound() { state.endlessRound++; loadQuestion(); }

// ── Progress bar ───────────────────────────────────────────────────
function updateProgressBar() {
  if (state.mode === 'endless') {
    document.getElementById('endless-info').style.display = 'block';
    const block  = Math.floor(state.endlessRound / 5);
    const within = (state.endlessRound % 5) + 1;
    const dl     = ['Easy','Medium','Hard'][Math.min(block, 2)];
    document.getElementById('round-info-text').textContent =
      `Round ${state.endlessRound + 1} · ${dl} (${within}/5)`;
    document.getElementById('progress-fill').style.width =
      `${((state.endlessRound % 5) / 5) * 100}%`;
  } else {
    document.getElementById('endless-info').style.display = 'none';
  }
}

// ── Stats ──────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stat-streak').textContent = state.streak;
  document.getElementById('stat-score').textContent  = state.score;
  document.getElementById('stat-wins').textContent   = state.wins;
}

// ── Mode / Course / Topic ──────────────────────────────────────────
function setMode(mode) {
  state.mode = mode;
  state.endlessRound = 0;
  document.getElementById('btn-daily').classList.toggle('active',   mode === 'daily');
  document.getElementById('btn-endless').classList.toggle('active', mode === 'endless');
  loadQuestion();
}
function setCalc(subject) {
  state.subject = subject;
  state.topic = 'All';
  state.endlessRound = 0;
  document.getElementById('btn-calc1').classList.toggle('active', subject === 'calc1');
  document.getElementById('btn-calc2').classList.toggle('active', subject === 'calc2');
  renderTopicBar();
  loadQuestion();
}

// ── Error ──────────────────────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById('error-banner');
  el.textContent = msg + ' — click to retry.';
  el.style.display = 'block';
  el.onclick = () => { hideError(); loadQuestion(); };
  setLoadingUI(false);
  document.getElementById('question-text').textContent = '⚠ Could not generate question';
  document.getElementById('question-body').style.display = 'block';
}
function hideError() { document.getElementById('error-banner').style.display = 'none'; }

// ── Toast ──────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

// ── Solution panel ─────────────────────────────────────────────────
let solutionOpen = false, solutionLoaded = false, solutionStreaming = false;

function toggleSolution() {
  const panel = document.getElementById('solution-panel');
  const btn   = document.getElementById('solution-toggle');
  const label = document.getElementById('solution-toggle-label');
  solutionOpen = !solutionOpen;
  panel.classList.toggle('visible', solutionOpen);
  btn.classList.toggle('open', solutionOpen);
  label.textContent = solutionOpen ? 'Hide Solution' : 'Show Full Solution';
  if (solutionOpen && !solutionLoaded && !solutionStreaming) fetchStreamingSolution();
}

// ── OpenRouter streaming solution ─────────────────────────────────
async function fetchStreamingSolution() {
  if (!state.question || solutionStreaming) return;
  solutionStreaming = true;

  const q           = state.question;
  const subjectName = state.subject === 'calc1' ? 'Calculus 1' : 'Calculus 2';
  const prompt      =
    `You are a ${subjectName} tutor. Give a clear numbered step-by-step solution.\n\n` +
    `Question: ${q.question}\nCorrect Answer: ${q.answer}\n\n` +
    `Write 3-6 steps. Each starts with "Step N:" on its own line and explains the math using ` +
    `plain Unicode (x², ∫, →, ∞, √, π, ·, ÷, ≈). End with "Key Insight:" summarising the concept.\n` +
    `Plain text only. No LaTeX. No markdown.`;

  const bodyEl = document.getElementById('solution-body');
  const loadEl = document.getElementById('solution-loading');
  bodyEl.innerHTML = ''; bodyEl.appendChild(loadEl); loadEl.style.display = 'flex';

  try {
    const response = await fetch(`${OR_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': window.location.href,
        'X-Title': 'CALCLE',
      },
      body: JSON.stringify({
        model: OR_MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        temperature: 0.5,
        max_tokens: 800,
      }),
    });

    if (!response.ok) throw new Error(`OpenRouter ${response.status}`);

    loadEl.style.display = 'none';
    const textEl = document.createElement('div');
    textEl.className = 'cursor-blink';
    bodyEl.appendChild(textEl);

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '', buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const evt   = JSON.parse(data);
          const delta = evt.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            textEl.textContent = fullText;
            document.getElementById('solution-panel')
              .scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        } catch {}
      }
    }

    textEl.className = ''; textEl.textContent = fullText; solutionLoaded = true;

  } catch (err) {
    console.error('Solution stream failed:', err);
    loadEl.style.display = 'none';
    const errEl = document.createElement('div');
    errEl.style.cssText = 'color:#c97a7a;font-size:0.75rem;';
    errEl.textContent = '⚠ Could not generate solution. Click "Show Full Solution" to retry.';
    bodyEl.appendChild(errEl);
    solutionLoaded = false;
  }
  solutionStreaming = false;
}

// ── Init ───────────────────────────────────────────────────────────
initSetup();
