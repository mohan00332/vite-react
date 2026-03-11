const API_BASE = (window.API_BASE || '').replace(/\/$/, '');
const apiUrl = (path) => (API_BASE ? `${API_BASE}${path}` : path);
const normalizeUrl = (url) => {
  if (!url) return url;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (url.startsWith('/')) return apiUrl(url);
  return apiUrl(`/${url}`);
};
const LIVE_SUPPORTED = window.LIVE_SUPPORTED !== false;
const REPORTS_SUPPORTED = window.REPORTS_SUPPORTED !== false;
const navItems = document.querySelectorAll('.nav-item');
const panels = document.querySelectorAll('.panel');
const categoryChips = document.querySelectorAll('.chip');

const expectedInput = document.getElementById('expectedCount');
const systemStatus = document.getElementById('systemStatus');

const previewPlaceholder = document.getElementById('previewPlaceholder');
const imagePreview = document.getElementById('imagePreview');
const videoPreview = document.getElementById('videoPreview');
const liveFeed = document.getElementById('liveFeed');
const liveFeedDashboard = document.getElementById('liveFeedDashboard');
const previewDefectCount = document.getElementById('previewDefectCount');
const previewGoodCount = document.getElementById('previewGoodCount');
const previewCorner = document.getElementById('previewCorner');

const startCameraBtn = document.getElementById('startCamera');
const stopCameraBtn = document.getElementById('stopCamera');
const startCameraDashboardBtn = document.getElementById('startCameraDashboard');
const stopCameraDashboardBtn = document.getElementById('stopCameraDashboard');
const detectImageBtn = document.getElementById('detectImage');
const detectVideoBtn = document.getElementById('detectVideo');
const uploadDrop = document.getElementById('uploadDrop');
const sampleImages = document.querySelectorAll('[data-sample-url]');
const uploadFileInput = document.getElementById('uploadFileInput');
const uploadFileName = document.getElementById('uploadFileName');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const uploadStatus = document.getElementById('uploadStatus');
const detectImageUrlBtn = document.getElementById('detectImageUrl');
const imageUrlInput = document.getElementById('imageUrlInput');
const confidenceSlider = document.getElementById('confidenceSlider');
const overlapSlider = document.getElementById('overlapSlider');
const confidenceValue = document.getElementById('confidenceValue');
const overlapValue = document.getElementById('overlapValue');
const labelModeSelect = document.getElementById('labelModeSelect');
const downloadReport = document.getElementById('downloadReport');
const downloadReportSecondary = document.getElementById('downloadReportSecondary');
const downloadDailyExcel = document.getElementById('downloadDailyExcel');
const downloadDailyPdf = document.getElementById('downloadDailyPdf');
const reportDate = document.getElementById('reportDate');
const analyticsTotalDetected = document.getElementById('analyticsTotalDetected');
const analyticsTotalDefect = document.getElementById('analyticsTotalDefect');
const analyticsGoodRate = document.getElementById('analyticsGoodRate');
const trendChart = document.getElementById('trendChart');
const categoryChart = document.getElementById('categoryChart');
const liveChart = document.getElementById('liveChart');

const currentCategory = document.getElementById('currentCategory');
const currentDetected = document.getElementById('currentDetected');
const currentDefect = document.getElementById('currentDefect');
const currentGood = document.getElementById('currentGood');
const expectedLine = document.getElementById('expectedLine');
const goodRate = document.getElementById('goodRate');
const lastUpdate = document.getElementById('lastUpdate');

const nutStats = document.getElementById('nutStats');
const boltStats = document.getElementById('boltStats');
const gearStats = document.getElementById('gearStats');
const nutDetected = document.getElementById('nutDetected');
const nutDefect = document.getElementById('nutDefect');
const nutGood = document.getElementById('nutGood');
const boltDetected = document.getElementById('boltDetected');
const boltDefect = document.getElementById('boltDefect');
const boltGood = document.getElementById('boltGood');
const gearDetected = document.getElementById('gearDetected');
const gearDefect = document.getElementById('gearDefect');
const gearGood = document.getElementById('gearGood');
const resetCategoryTotals = document.getElementById('resetCategoryTotals');

const CLIENT_INFERENCE = window.CLIENT_INFERENCE === true;
const MODEL_INPUT_SIZE = 640;
const MODEL_DIR = '/models';
const MODEL_PATHS = {
  Nut: `${MODEL_DIR}/Nut.onnx`,
  Bolt: `${MODEL_DIR}/Bolt.onnx`,
  Gear: `${MODEL_DIR}/Gear.onnx`
};
const LABELS_URL = `${MODEL_DIR}/model_labels.json`;
const LOCAL_STATS_KEY = 'md_stats_v1';
const LOCAL_LOG_KEY = 'md_log_v1';
let localStats = {
  Nut: { detected: 0, defect: 0, good: 0 },
  Bolt: { detected: 0, defect: 0, good: 0 },
  Gear: { detected: 0, defect: 0, good: 0 }
};
let localMeta = { last_reset: null };
let localLog = [];
let labelsCache = null;
const sessionCache = {};
let liveStream = null;
let liveVideo = null;
let liveTimer = null;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function loadLocalState() {
  try {
    const statsRaw = localStorage.getItem(LOCAL_STATS_KEY);
    if (statsRaw) {
      const parsed = JSON.parse(statsRaw);
      if (parsed && parsed.stats) {
        localStats = parsed.stats;
        localMeta = parsed.meta || localMeta;
      }
    }
    const logRaw = localStorage.getItem(LOCAL_LOG_KEY);
    if (logRaw) {
      const parsedLog = JSON.parse(logRaw);
      if (Array.isArray(parsedLog)) localLog = parsedLog;
    }
  } catch {
    // ignore
  }
  maybeResetLocalStats();
}

function saveLocalState() {
  try {
    localStorage.setItem(LOCAL_STATS_KEY, JSON.stringify({ stats: localStats, meta: localMeta }));
    localStorage.setItem(LOCAL_LOG_KEY, JSON.stringify(localLog.slice(-500)));
  } catch {
    // ignore
  }
}

function maybeResetLocalStats() {
  const today = todayIso();
  if (localMeta.last_reset === today) return;
  Object.keys(localStats).forEach(key => {
    localStats[key] = { detected: 0, defect: 0, good: 0 };
  });
  localMeta.last_reset = today;
  saveLocalState();
}

loadLocalState();

function updateLocalStats(category, detected, defect, good) {
  maybeResetLocalStats();
  if (!localStats[category]) return;
  localStats[category].detected += detected;
  localStats[category].defect += defect;
  localStats[category].good += good;
  saveLocalState();
}

function updateLocalStatsMany(perCategory) {
  Object.entries(perCategory).forEach(([cat, vals]) => {
    updateLocalStats(cat, vals.detected, vals.defect, vals.good);
  });
}

function appendLocalLog(entry) {
  localLog.push(entry);
  saveLocalState();
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = src;
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(tag);
  });
}

async function ensureOrt() {
  if (window.ort) return window.ort;
  await loadScript('https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js');
  return window.ort;
}

async function loadLabels() {
  if (labelsCache) return labelsCache;
  try {
    const res = await fetch(LABELS_URL);
    if (!res.ok) return null;
    labelsCache = await res.json();
  } catch {
    labelsCache = null;
  }
  return labelsCache;
}

async function getSession(category) {
  if (sessionCache[category]) return sessionCache[category];
  const ort = await ensureOrt();
  const path = MODEL_PATHS[category];
  const session = await ort.InferenceSession.create(path, { executionProviders: ['wasm'] });
  sessionCache[category] = session;
  return session;
}

function isDefectLabel(label) {
  if (!label) return true;
  const name = String(label).toLowerCase().trim();
  if (name.includes('non_defect') || name.includes('non-defect') || name.includes('nondefect')) {
    return false;
  }
  if (name.includes('gear_defect')) return true;
  return name.includes('defect') || name.includes('bad') || name.includes('fault');
}

function prepareInput(image) {
  const canvas = document.createElement('canvas');
  canvas.width = MODEL_INPUT_SIZE;
  canvas.height = MODEL_INPUT_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const imgData = ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const { data } = imgData;
  const floatData = new Float32Array(3 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE);
  let p = 0;
  for (let i = 0; i < data.length; i += 4) {
    floatData[p++] = data[i] / 255.0;
  }
  for (let i = 0; i < data.length; i += 4) {
    floatData[p++] = data[i + 1] / 255.0;
  }
  for (let i = 0; i < data.length; i += 4) {
    floatData[p++] = data[i + 2] / 255.0;
  }
  return { canvas, input: floatData };
}

function parseOutput(output, conf) {
  const { data, dims } = output;
  if (!dims || dims.length !== 3) return [];
  const channelsFirst = dims[1] < dims[2];
  const channels = channelsFirst ? dims[1] : dims[2];
  const num = channelsFirst ? dims[2] : dims[1];
  const boxes = [];
  for (let i = 0; i < num; i++) {
    let x, y, w, h, score;
    if (channelsFirst) {
      x = data[i];
      y = data[i + num];
      w = data[i + num * 2];
      h = data[i + num * 3];
      score = data[i + num * 4];
    } else {
      const off = i * channels;
      x = data[off];
      y = data[off + 1];
      w = data[off + 2];
      h = data[off + 3];
      score = data[off + 4];
    }
    if (score < conf) continue;
    const x1 = x - w / 2;
    const y1 = y - h / 2;
    const x2 = x + w / 2;
    const y2 = y + h / 2;
    boxes.push({ x1, y1, x2, y2, score });
  }
  return boxes;
}

function iou(a, b) {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  return inter / (areaA + areaB - inter + 1e-6);
}

function nms(boxes, iouThresh) {
  const sorted = boxes.slice().sort((a, b) => b.score - a.score);
  const keep = [];
  while (sorted.length) {
    const current = sorted.shift();
    keep.push(current);
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (iou(current, sorted[i]) > iouThresh) {
        sorted.splice(i, 1);
      }
    }
  }
  return keep;
}

async function runSession(session, inputTensor, conf, iouThresh) {
  const feeds = { [session.inputNames[0]]: inputTensor };
  const results = await session.run(feeds);
  const outputName = session.outputNames[0];
  const output = results[outputName];
  const raw = parseOutput(output, conf);
  return nms(raw, iouThresh);
}

async function runDetectionOnImage(image, category, conf, iouThresh) {
  const ort = await ensureOrt();
  const { canvas, input } = prepareInput(image);
  const inputTensor = new ort.Tensor('float32', input, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
  const labels = await loadLabels();
  const ctx = canvas.getContext('2d');
  const results = {
    detected: 0,
    defect: 0,
    good: 0,
    perCategory: null,
    outputUrl: null
  };

  const drawBoxes = (boxes, label, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.fillStyle = color;
    ctx.font = '14px sans-serif';
    boxes.forEach(box => {
      ctx.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
      const text = label ? `${label} ${(box.score * 100).toFixed(1)}%` : `${(box.score * 100).toFixed(1)}%`;
      ctx.fillText(text, box.x1, Math.max(12, box.y1 - 4));
    });
  };

  if (category === 'All') {
    const perCategory = {};
    for (const cat of Object.keys(MODEL_PATHS)) {
      const session = await getSession(cat);
      const boxes = await runSession(session, inputTensor, conf, iouThresh);
      const label = labels && labels[cat] ? labels[cat][0] : 'defect';
      drawBoxes(boxes, label, cat === 'Nut' ? '#ff6b6b' : cat === 'Bolt' ? '#3b82f6' : '#22c55e');
      perCategory[cat] = { detected: boxes.length, defect: boxes.length, good: 0 };
      results.detected += boxes.length;
      results.defect += boxes.length;
    }
    results.perCategory = perCategory;
  } else {
    const session = await getSession(category);
    const boxes = await runSession(session, inputTensor, conf, iouThresh);
    const label = labels && labels[category] ? labels[category][0] : 'defect';
    drawBoxes(boxes, label, '#ff6b6b');
    results.detected = boxes.length;
    results.defect = boxes.length;
  }

  results.outputUrl = canvas.toDataURL('image/jpeg', 0.92);
  return results;
}

async function applyDetectionResult(result, category, expected) {
  const defect = result.defect;
  const detected = result.detected;
  const good = expected > 0 ? Math.max(expected - defect, 0) : Math.max(detected - defect, 0);
  if (result.perCategory) {
    const perCategory = {};
    Object.entries(result.perCategory).forEach(([cat, vals]) => {
      const catGood = expected > 0 ? Math.max(expected - vals.defect, 0) : Math.max(vals.detected - vals.defect, 0);
      perCategory[cat] = { detected: vals.detected, defect: vals.defect, good: catGood };
    });
    updateLocalStatsMany(perCategory);
  } else {
    updateLocalStats(category, detected, defect, good);
  }
  const now = new Date();
  appendLocalLog({
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 8),
    category,
    expected_count: expected,
    detected,
    defect,
    good
  });
  await logSupabase({
    timestamp: now.toISOString(),
    category,
    expected_count: expected,
    detected,
    defect,
    good
  });
  if (result.outputUrl) {
    showPreviewImage(result.outputUrl);
  }
  updateCurrentStats(category, detected, defect, good, expected);
  await refreshTotals();
  setActivePanel('dashboard');
}

async function initSupabaseClient() {
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return;
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
    window.supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
      auth: { persistSession: false }
    });
  } catch {
    // ignore
  }
}

async function logSupabase(entry) {
  if (!window.supabase) return;
  try {
    await window.supabase.from('detections').insert([entry]);
  } catch {
    // ignore
  }
}

document.addEventListener('click', (event) => {
  const clickable = event.target.closest('button, .chip, .nav-item, .upload-btn, .stack-link');
  if (!clickable) return;
  clickable.classList.remove('click-glow');
  void clickable.offsetWidth;
  clickable.classList.add('click-glow');
});

if (!LIVE_SUPPORTED) {
  [startCameraBtn, startCameraDashboardBtn, stopCameraBtn, stopCameraDashboardBtn].forEach(btn => {
    if (!btn) return;
    btn.disabled = true;
    btn.classList.add('disabled');
    btn.title = 'Live camera not supported in this backend';
  });
}

if (!REPORTS_SUPPORTED) {
  [downloadReport, downloadReportSecondary, downloadDailyExcel, downloadDailyPdf].forEach(btn => {
    if (!btn) return;
    btn.disabled = true;
    btn.classList.add('disabled');
    btn.title = 'Reports not supported in this backend';
  });
}

let selectedCategory = 'Nut';
let livePolling = null;
let isLive = false;
const liveSeries = [];

function setActivePanel(panelName) {
  panels.forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${panelName}`);
  });
  navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.panel === panelName);
  });
}

function setCategory(category) {
  selectedCategory = category;
  categoryChips.forEach(chip => {
    chip.classList.toggle('active', chip.dataset.category === category);
  });
  if (isLive) {
    startLive();
  }
}

function showPreviewImage(url) {
  if (!imagePreview) return;
  if (previewPlaceholder) previewPlaceholder.classList.add('hidden');
  if (liveFeedDashboard) liveFeedDashboard.classList.add('hidden');
  if (videoPreview) videoPreview.classList.add('hidden');
  imagePreview.classList.remove('hidden');
  imagePreview.src = normalizeUrl(url);
}

function showPreviewVideo(url) {
  if (!videoPreview) return;
  if (previewPlaceholder) previewPlaceholder.classList.add('hidden');
  if (liveFeedDashboard) liveFeedDashboard.classList.add('hidden');
  if (imagePreview) imagePreview.classList.add('hidden');
  videoPreview.classList.remove('hidden');
  videoPreview.src = normalizeUrl(url);
}

function showLivePreview() {
  if (!liveFeedDashboard) return;
  if (previewPlaceholder) previewPlaceholder.classList.add('hidden');
  if (imagePreview) imagePreview.classList.add('hidden');
  if (videoPreview) videoPreview.classList.add('hidden');
  liveFeedDashboard.classList.remove('hidden');
}

function attachStreamToPreview(stream) {
  [liveFeed, liveFeedDashboard].forEach(el => {
    if (!el) return;
    if (el instanceof HTMLVideoElement) {
      el.srcObject = stream;
      el.muted = true;
      el.play().catch(() => {});
    }
  });
}

function clearLivePreview() {
  [liveFeed, liveFeedDashboard].forEach(el => {
    if (!el) return;
    if (el instanceof HTMLVideoElement) {
      el.pause();
      el.srcObject = null;
      el.removeAttribute('src');
    } else {
      el.src = '';
    }
  });
}

function renderLiveChart() {
  if (!liveChart) return;
  liveChart.innerHTML = '';
  const maxVal = Math.max(1, ...liveSeries.map(item => item.defect));
  liveSeries.forEach(item => {
    const group = document.createElement('div');
    group.className = 'bar-group';

    const defectBar = document.createElement('div');
    defectBar.className = 'bar defect';
    defectBar.style.height = `${(item.defect / maxVal) * 100}%`;

    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = item.label;

    group.appendChild(defectBar);
    group.appendChild(label);
    liveChart.appendChild(group);
  });
}

function getThresholdSettings() {
  const conf = confidenceSlider ? Number(confidenceSlider.value || 50) / 100 : null;
  const iou = overlapSlider ? Number(overlapSlider.value || 50) / 100 : null;
  const labelMode = labelModeSelect ? labelModeSelect.value : 'confidence';
  return { conf, iou, labelMode };
}

function updateCurrentStats(category, detected, defect, good, expected) {
  currentCategory.textContent = `Category: ${category}`;
  currentDetected.textContent = `Detected Count: ${detected}`;
  currentDefect.textContent = `Defect Count: ${defect}`;
  currentGood.textContent = `Non-Defect Count: ${good}`;
  if (previewDefectCount) previewDefectCount.textContent = defect;
  if (previewGoodCount) previewGoodCount.textContent = good;
  if (previewCorner) {
    const isDefect = defect > 0;
    previewCorner.textContent = isDefect ? 'Defect' : 'Non-Defect';
    previewCorner.classList.toggle('defect', isDefect);
    previewCorner.classList.toggle('good', !isDefect);
  }
  if (expectedLine) expectedLine.textContent = `Expected Count: ${expected}`;

  if (expected > 0) {
    const rate = ((good / expected) * 100).toFixed(1);
    if (goodRate) goodRate.textContent = `Good Rate: ${rate}%`;
  } else {
    if (goodRate) goodRate.textContent = 'Good Rate: -';
  }

  lastUpdate.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
}

async function refreshTotals() {
  maybeResetLocalStats();
  if (nutDetected) nutDetected.textContent = localStats.Nut.detected;
  if (nutDefect) nutDefect.textContent = localStats.Nut.defect;
  if (nutGood) nutGood.textContent = localStats.Nut.good;
  if (boltDetected) boltDetected.textContent = localStats.Bolt.detected;
  if (boltDefect) boltDefect.textContent = localStats.Bolt.defect;
  if (boltGood) boltGood.textContent = localStats.Bolt.good;
  if (gearDetected) gearDetected.textContent = localStats.Gear.detected;
  if (gearDefect) gearDefect.textContent = localStats.Gear.defect;
  if (gearGood) gearGood.textContent = localStats.Gear.good;
  refreshAnalytics();
}

async function resetTotals() {
  Object.keys(localStats).forEach(key => {
    localStats[key] = { detected: 0, defect: 0, good: 0 };
  });
  localMeta.last_reset = todayIso();
  saveLocalState();
  await refreshTotals();
}

if (resetCategoryTotals) {
  resetCategoryTotals.addEventListener('click', () => {
    resetTotals();
  });
}

function clearChart(container) {
  if (!container) return;
  container.innerHTML = '';
}

function renderTrendChart(data) {
  if (!trendChart) return;
  clearChart(trendChart);
  const maxVal = Math.max(1, ...data.map(d => Math.max(d.defect, d.good)));
  data.forEach(item => {
    const group = document.createElement('div');
    group.className = 'bar-group';

    const defectBar = document.createElement('div');
    defectBar.className = 'bar defect';
    defectBar.style.height = `${(item.defect / maxVal) * 100}%`;

    const goodBar = document.createElement('div');
    goodBar.className = 'bar good';
    goodBar.style.height = `${(item.good / maxVal) * 100}%`;

    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = item.date.slice(5);

    group.appendChild(defectBar);
    group.appendChild(goodBar);
    group.appendChild(label);
    trendChart.appendChild(group);
  });
}

function renderCategoryChart(categories) {
  if (!categoryChart) return;
  clearChart(categoryChart);
  const items = Object.keys(categories).map(key => ({
    name: key,
    defect: categories[key].defect || 0
  }));
  const maxVal = Math.max(1, ...items.map(i => i.defect));
  items.forEach(item => {
    const group = document.createElement('div');
    group.className = 'bar-group';

    const defectBar = document.createElement('div');
    defectBar.className = 'bar defect';
    defectBar.style.height = `${(item.defect / maxVal) * 100}%`;

    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = item.name;

    group.appendChild(defectBar);
    group.appendChild(label);
    categoryChart.appendChild(group);
  });
}

async function refreshAnalytics() {
  if (!trendChart && !categoryChart) return;
  const categories = localStats;
  const totals = {
    detected: Object.values(categories).reduce((a, v) => a + v.detected, 0),
    defect: Object.values(categories).reduce((a, v) => a + v.defect, 0),
    good: Object.values(categories).reduce((a, v) => a + v.good, 0)
  };
  if (analyticsTotalDetected) analyticsTotalDetected.textContent = totals.detected;
  if (analyticsTotalDefect) analyticsTotalDefect.textContent = totals.defect;
  if (analyticsGoodRate) {
    const rate = totals.detected > 0 ? ((totals.good / totals.detected) * 100).toFixed(1) : '-';
    analyticsGoodRate.textContent = rate === '-' ? '-' : `${rate}%`;
  }

  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const trendMap = {};
  days.forEach(d => {
    trendMap[d] = { defect: 0, good: 0, detected: 0 };
  });
  localLog.forEach(row => {
    if (!row.date || !trendMap[row.date]) return;
    trendMap[row.date].defect += Number(row.defect || 0);
    trendMap[row.date].good += Number(row.good || 0);
    trendMap[row.date].detected += Number(row.detected || 0);
  });
  const trend = days.map(d => ({ date: d, ...trendMap[d] }));

  renderTrendChart(trend);
  renderCategoryChart(categories);
}

navItems.forEach(item => {
  item.addEventListener('click', () => setActivePanel(item.dataset.panel));
});

categoryChips.forEach(chip => {
  chip.addEventListener('click', () => setCategory(chip.dataset.category));
});

async function startLive() {
  if (!LIVE_SUPPORTED || !CLIENT_INFERENCE) {
    alert('Live camera is not supported in this build.');
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Camera API is not available in this browser.');
    return;
  }
  systemStatus.textContent = 'Live';
  liveSeries.length = 0;
  renderLiveChart();
  const thresholds = getThresholdSettings();
  if (liveTimer) clearInterval(liveTimer);
  if (liveStream) {
    liveStream.getTracks().forEach(t => t.stop());
  }
  try {
    liveStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch (err) {
    systemStatus.textContent = 'Idle';
    alert('Camera access was blocked. Please allow camera permission in the browser.');
    return;
  }
  liveVideo = document.createElement('video');
  liveVideo.srcObject = liveStream;
  await liveVideo.play();
  attachStreamToPreview(liveStream);
  showLivePreview();
  liveTimer = setInterval(async () => {
    if (!liveVideo) return;
    let result;
    try {
      result = await runDetectionOnImage(liveVideo, selectedCategory, thresholds.conf || 0.35, thresholds.iou || 0.45);
    } catch (err) {
      console.warn('Live detection failed:', err);
      return;
    }
    const expected = Number(expectedInput.value || 0);
    const defect = result.defect;
    const detected = result.detected;
    const good = expected > 0 ? Math.max(expected - defect, 0) : Math.max(detected - defect, 0);
    if (result.perCategory) {
      const perCategory = {};
      Object.entries(result.perCategory).forEach(([cat, vals]) => {
        const catGood = expected > 0 ? Math.max(expected - vals.defect, 0) : Math.max(vals.detected - vals.defect, 0);
        perCategory[cat] = { detected: vals.detected, defect: vals.defect, good: catGood };
      });
      updateLocalStatsMany(perCategory);
    } else {
      updateLocalStats(selectedCategory, detected, defect, good);
    }
    const now = new Date();
    appendLocalLog({
      date: now.toISOString().slice(0, 10),
      time: now.toTimeString().slice(0, 8),
      category: selectedCategory,
      expected_count: expected,
      detected,
      defect,
      good
    });
    logSupabase({
      timestamp: now.toISOString(),
      category: selectedCategory,
      expected_count: expected,
      detected,
      defect,
      good
    });
    updateCurrentStats(selectedCategory, detected, defect, good, expected);
    liveSeries.push({
      defect: Number(defect || 0),
      label: now.toLocaleTimeString().slice(3, 8)
    });
    if (liveSeries.length > 60) liveSeries.shift();
    renderLiveChart();
    if (result.outputUrl) {
      if (liveFeed && liveFeed.tagName === 'IMG') liveFeed.src = result.outputUrl;
      if (liveFeedDashboard && liveFeedDashboard.tagName === 'IMG') liveFeedDashboard.src = result.outputUrl;
    }
  }, 900);
  isLive = true;
}

async function stopLive() {
  systemStatus.textContent = 'Idle';
  if (liveTimer) {
    clearInterval(liveTimer);
    liveTimer = null;
  }
  if (liveStream) {
    liveStream.getTracks().forEach(t => t.stop());
    liveStream = null;
  }
  if (liveVideo) {
    liveVideo.pause();
    liveVideo.srcObject = null;
    liveVideo = null;
  }
  clearLivePreview();
  if (liveFeedDashboard) liveFeedDashboard.classList.add('hidden');
  isLive = false;
  await refreshTotals();
}

startCameraBtn.addEventListener('click', async () => {
  await startLive();
  setActivePanel('live');
});

stopCameraBtn.addEventListener('click', async () => {
  await stopLive();
});

startCameraDashboardBtn.addEventListener('click', async () => {
  await startLive();
  setActivePanel('dashboard');
});

stopCameraDashboardBtn.addEventListener('click', async () => {
  await stopLive();
});

detectImageBtn.addEventListener('click', async () => {
  const fileInput = document.getElementById('imageFile');
  if (!fileInput.files.length) return;
  if (!CLIENT_INFERENCE) return;
  systemStatus.textContent = 'Processing';
  const expected = Number(expectedInput.value || 0);
  const thresholds = getThresholdSettings();
  const file = fileInput.files[0];
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();
  const result = await runDetectionOnImage(img, selectedCategory, thresholds.conf || 0.35, thresholds.iou || 0.45);
  systemStatus.textContent = 'Idle';
  await applyDetectionResult(result, selectedCategory, expected);
});

detectVideoBtn.addEventListener('click', async () => {
  const fileInput = document.getElementById('videoFile');
  if (!fileInput.files.length) return;
  if (!CLIENT_INFERENCE) return;
  systemStatus.textContent = 'Processing';
  const expected = Number(expectedInput.value || 0);
  const thresholds = getThresholdSettings();
  const file = fileInput.files[0];
  const video = document.createElement('video');
  video.src = URL.createObjectURL(file);
  await new Promise(resolve => {
    video.onloadeddata = () => resolve();
  });
  video.currentTime = 0;
  await new Promise(resolve => {
    video.onseeked = () => resolve();
  });
  const result = await runDetectionOnImage(video, selectedCategory, thresholds.conf || 0.35, thresholds.iou || 0.45);
  systemStatus.textContent = 'Idle';
  await applyDetectionResult(result, selectedCategory, expected);
});

function handleUploadFile(file) {
  if (!file) return;
  if (!CLIENT_INFERENCE) return;
  uploadFileName.textContent = file.name;
  uploadProgressBar.style.width = '100%';
  uploadStatus.textContent = 'Processing...';
  systemStatus.textContent = 'Processing';
  const expected = Number(expectedInput.value || 0);
  const thresholds = getThresholdSettings();
  const img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = async () => {
    const result = await runDetectionOnImage(img, selectedCategory, thresholds.conf || 0.35, thresholds.iou || 0.45);
    systemStatus.textContent = 'Idle';
    uploadStatus.textContent = 'Done';
    await applyDetectionResult(result, selectedCategory, expected);
  };
  img.onerror = () => {
    systemStatus.textContent = 'Idle';
    uploadStatus.textContent = 'Failed to load image';
  };
}

async function handleSampleClick(url) {
  if (!url) return;
  uploadStatus.textContent = 'Loading sample...';
  try {
    const res = await fetch(normalizeUrl(url));
    if (!res.ok) {
      uploadStatus.textContent = 'Failed to load sample';
      return;
    }
    const blob = await res.blob();
    const name = url.split('/').pop() || 'sample.jpg';
    const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
    handleUploadFile(file);
  } catch {
    uploadStatus.textContent = 'Failed to load sample';
  }
}

uploadFileInput.addEventListener('change', () => {
  handleUploadFile(uploadFileInput.files[0]);
});

['dragenter', 'dragover'].forEach(eventName => {
  uploadDrop.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    uploadDrop.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  uploadDrop.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    uploadDrop.classList.remove('dragover');
  });
});

uploadDrop.addEventListener('drop', (event) => {
  const file = event.dataTransfer.files[0];
  handleUploadFile(file);
});

detectImageUrlBtn.addEventListener('click', async () => {
  const url = imageUrlInput.value.trim();
  if (!url) return;
  if (!CLIENT_INFERENCE) return;
  systemStatus.textContent = 'Processing';
  const expected = Number(expectedInput.value || 0);
  const thresholds = getThresholdSettings();
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load image');
    const blob = await res.blob();
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await img.decode();
    const result = await runDetectionOnImage(img, selectedCategory, thresholds.conf || 0.35, thresholds.iou || 0.45);
    systemStatus.textContent = 'Idle';
    await applyDetectionResult(result, selectedCategory, expected);
  } catch {
    systemStatus.textContent = 'Idle';
    uploadStatus.textContent = 'Failed to load image URL (CORS?)';
  }
});

const sampleRow = document.querySelector('.sample-row');
const bindSampleImageClicks = (images) => {
  images.forEach(img => {
    img.addEventListener('click', () => handleSampleClick(img.dataset.sampleUrl || img.src));
  });
};

if (sampleImages.length) {
  bindSampleImageClicks(Array.from(sampleImages));
} else if (sampleRow) {
  fetch('/images/index.json')
    .then(res => res.json())
    .then(images => {
      if (!Array.isArray(images) || images.length === 0) {
        sampleRow.innerHTML = '<div class="sample-empty">No samples found in images/</div>';
        return;
      }
      sampleRow.innerHTML = '';
      images.slice(0, 10).forEach(item => {
        const img = document.createElement('img');
        img.src = normalizeUrl(item.url);
        img.alt = item.name || 'sample';
        img.dataset.sampleUrl = item.url;
        sampleRow.appendChild(img);
      });
      bindSampleImageClicks(Array.from(sampleRow.querySelectorAll('img')));
    })
    .catch(() => {
      sampleRow.innerHTML = '<div class="sample-empty">No samples found in images/</div>';
    });
}

if (downloadReport) {
  downloadReport.addEventListener('click', () => {
    if (!localLog.length) {
      alert('No detections logged yet. Run a detection first.');
      return;
    }
    downloadCsv(localLog, `defect-report-${todayIso()}.csv`);
  });
}

if (downloadReportSecondary) {
  downloadReportSecondary.addEventListener('click', () => {
    if (!localLog.length) {
      alert('No detections logged yet. Run a detection first.');
      return;
    }
    downloadCsv(localLog, `defect-report-${todayIso()}.csv`);
  });
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(rows) {
  const header = ['timestamp', 'date', 'time', 'category', 'expected_count', 'detected', 'defect', 'good'];
  const lines = [header.join(',')];
  rows.forEach(row => {
    const timestamp = row.timestamp || (row.date && row.time ? `${row.date}T${row.time}` : row.date || '');
    const line = [
      timestamp,
      row.date || '',
      row.time || '',
      row.category || '',
      row.expected_count ?? '',
      row.detected ?? '',
      row.defect ?? '',
      row.good ?? ''
    ].map(escapeCsvValue).join(',');
    lines.push(line);
  });
  return lines.join('\n');
}

function downloadCsv(rows, filename) {
  const csv = buildCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getReportDate() {
  return reportDate && reportDate.value ? reportDate.value : todayIso();
}

function filterLogByDate(date) {
  return localLog.filter(row => row.date === date);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[char] || char;
  });
}

function openPrintableReport(rows, dateLabel) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Popup blocked. Please allow popups to print the report.');
    return;
  }
  const tableRows = rows.map(row => `
    <tr>
      <td>${escapeHtml(row.timestamp || '')}</td>
      <td>${escapeHtml(row.date || '')}</td>
      <td>${escapeHtml(row.time || '')}</td>
      <td>${escapeHtml(row.category || '')}</td>
      <td>${escapeHtml(row.expected_count ?? '')}</td>
      <td>${escapeHtml(row.detected ?? '')}</td>
      <td>${escapeHtml(row.defect ?? '')}</td>
      <td>${escapeHtml(row.good ?? '')}</td>
    </tr>
  `).join('');
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Defect Report ${escapeHtml(dateLabel)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; }
          h1 { font-size: 20px; margin: 0 0 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background: #f4f4f4; }
        </style>
      </head>
      <body>
        <h1>Defect Report - ${escapeHtml(dateLabel)}</h1>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Date</th>
              <th>Time</th>
              <th>Category</th>
              <th>Expected</th>
              <th>Detected</th>
              <th>Defect</th>
              <th>Good</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

if (downloadDailyExcel) {
  downloadDailyExcel.addEventListener('click', () => {
    const date = getReportDate();
    const rows = filterLogByDate(date);
    if (!rows.length) {
      alert(`No detections found for ${date}.`);
      return;
    }
    downloadCsv(rows, `defect-report-${date}.csv`);
  });
}

if (downloadDailyPdf) {
  downloadDailyPdf.addEventListener('click', () => {
    const date = getReportDate();
    const rows = filterLogByDate(date);
    if (!rows.length) {
      alert(`No detections found for ${date}.`);
      return;
    }
    openPrintableReport(rows, date);
  });
}

if (reportDate && !reportDate.value) {
  reportDate.value = todayIso();
}

setActivePanel('dashboard');
refreshTotals();
initSupabaseClient();

if (confidenceSlider && confidenceValue) {
  confidenceSlider.addEventListener('input', () => {
    confidenceValue.textContent = `${confidenceSlider.value}%`;
  });
  confidenceValue.textContent = `${confidenceSlider.value}%`;
}

if (overlapSlider && overlapValue) {
  overlapSlider.addEventListener('input', () => {
    overlapValue.textContent = `${overlapSlider.value}%`;
  });
  overlapValue.textContent = `${overlapSlider.value}%`;
}

const urlParams = new URLSearchParams(window.location.search);
const sampleParam = urlParams.get('sample');
if (sampleParam) {
  handleSampleClick(sampleParam);
}


