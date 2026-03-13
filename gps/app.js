const gpsApiBase = '../gps-test/api.php';
const appApiBase = '../api.php';
const SOUND_PREF_KEY = 'gpsRecorderSoundEnabled';
const MAX_ALLOWED_ACCURACY_METERS = 80;
const STOP_CONFIRM_WINDOW_MS = 4000;
const START_COUNTDOWN_SECONDS = 3;
const LATEST_RECORDED_ROUTE_STORAGE_KEY = 'klappen.latestRecordedRoute';
const DEBUG_TRACKS_BASE_PATH = '../Data/gps_tracks/';
const DEBUG_TRACK_QUERY_KEY = 'debugTrack';
const DEBUG_TRACK_FILE_RE = /^[A-Za-z0-9._-]+\.geojson$/;

const state = {
  backar: [],
  liftarByUid: new Map(),
  defs: {
    backDefs: { type: 'FeatureCollection', features: [] },
    liftDefs: { type: 'FeatureCollection', features: [] }
  },
  recording: {
    watchId: null,
    points: [],
    rejectedCount: 0,
    paused: false,
    pausedIgnoredCount: 0,
    countdownUntilMs: 0,
    countdownLastShown: 0,
    countdownTimerId: null,
    pauseArmedUntil: 0,
    pauseArmTimer: null,
    pauseArmTickTimer: null,
    stopArmedUntil: 0,
    stopArmTimer: null,
    stopArmTickTimer: null,
    startedAtMs: 0,
    durationTickTimer: null,
    lastPoint: null,
    lastRecordedTimestamp: '',
    wakeLock: null
  },
  analysis: {
    result: null,
    backSuggestions: [],
    routeEntries: [],
    selectedSuggestionIndex: null,
    isLoading: false
  },
  audio: {
    enabled: true,
    loop: null
  },
  ui: {
    scrollLockY: 0,
    safetyChecks: {
      locationOk: false,
      autolockOff: false,
      pageKeptOpen: false
    }
  },
  map: {
    inited: false,
    map: null,
    defsLayer: null,
    runLayer: null,
    focusLayer: null,
    positionLayer: null
  }
};

const el = {
  recordToggleBtn: document.getElementById('recordToggleBtn'),
  recordPauseBtn: document.getElementById('recordPauseBtn'),
  recordSoundBtn: document.getElementById('recordSoundBtn'),

  recordStatus: document.getElementById('recordStatus'),
  recordDuration: document.getElementById('recordDuration'),
  recordPointCount: document.getElementById('recordPointCount'),
  recordAccuracy: document.getElementById('recordAccuracy'),
  suggestedBackCount: document.getElementById('suggestedBackCount'),
  debugCard: document.getElementById('debugCard'),
  debugMeta: document.getElementById('debugMeta'),
  debugSampleLink: document.getElementById('debugSampleLink'),

  analysisCard: document.getElementById('analysisCard'),
  analysisMeta: document.getElementById('analysisMeta'),
  analysisLoading: document.getElementById('analysisLoading'),
  suggestionsList: document.getElementById('suggestionsList'),
  routeList: document.getElementById('routeList'),
  approveRouteBtn: document.getElementById('approveRouteBtn'),

  safetyModal: document.getElementById('safetyModal'),
  safetyActionLocationBtn: document.getElementById('safetyActionLocationBtn'),
  safetyActionAutolockBtn: document.getElementById('safetyActionAutolockBtn'),
  safetyActionScreenBtn: document.getElementById('safetyActionScreenBtn'),
  safetyLocationHint: document.getElementById('safetyLocationHint'),
  safetyConfirmBtn: document.getElementById('safetyConfirmBtn'),
  safetyCloseBtn: document.getElementById('safetyCloseBtn'),
  edgeSwipeGuardLeft: document.getElementById('edgeSwipeGuardLeft'),
  edgeSwipeGuardRight: document.getElementById('edgeSwipeGuardRight'),

  mapStatus: document.getElementById('mapStatus'),
  runsMap: document.getElementById('runsMap')
};

function isSafetyModalOpen() {
  return Boolean(el.safetyModal && !el.safetyModal.classList.contains('hidden'));
}

function shouldBlockEdgeSwipe() {
  return state.recording.watchId !== null || isSafetyModalOpen();
}

function syncEdgeSwipeGuardUi() {
  const active = shouldBlockEdgeSwipe();
  el.edgeSwipeGuardLeft?.classList.toggle('is-active', active);
  el.edgeSwipeGuardRight?.classList.toggle('is-active', active);
}

function bindEdgeSwipeGuards() {
  const swallow = (event) => {
    if (!shouldBlockEdgeSwipe()) return;
    event.preventDefault();
    event.stopPropagation();
  };

  [el.edgeSwipeGuardLeft, el.edgeSwipeGuardRight].forEach((guard) => {
    if (!guard) return;
    guard.addEventListener('touchstart', swallow, { passive: false });
    guard.addEventListener('touchmove', swallow, { passive: false });
    guard.addEventListener('pointerdown', swallow);
    guard.addEventListener('pointermove', swallow);
  });

  window.addEventListener('popstate', () => {
    if (!shouldBlockEdgeSwipe()) return;
    try {
      window.history.pushState({ gpsEdgeGuard: true }, '', window.location.href);
    } catch {
      // ignore history guard failures
    }
    setStatus('Svep bakåt är blockerat i GPS-läge. Använd knappen till startsidan när du vill lämna.', true);
  });
}

function seedEdgeSwipeHistoryGuard() {
  try {
    window.history.replaceState({ ...(window.history.state || {}), gpsEdgeGuardRoot: true }, '', window.location.href);
    window.history.pushState({ gpsEdgeGuard: true }, '', window.location.href);
  } catch {
    // ignore history guard failures
  }
}

function setStatus(message, isError = false) {
  if (!el.recordStatus) return;
  el.recordStatus.textContent = message;
  el.recordStatus.style.color = isError ? '#9f1239' : '#4f6478';
  el.recordStatus.classList.toggle('hidden', !message);
}

function getDebugTrackFileFromQuery() {
  const value = new URLSearchParams(window.location.search).get(DEBUG_TRACK_QUERY_KEY);
  const file = String(value || '').trim();
  if (!file || !DEBUG_TRACK_FILE_RE.test(file)) return '';
  return file;
}

function updateDebugUi(message = '') {
  const debugTrackFile = getDebugTrackFileFromQuery();
  const debugActive = debugTrackFile !== '';
  if (el.debugCard) {
    el.debugCard.classList.toggle('hidden', !debugActive);
  }
  if (el.debugMeta) {
    el.debugMeta.textContent = debugActive
      ? (message || `Testspår: ${debugTrackFile}`)
      : '';
  }
  if (el.debugSampleLink) {
    const url = new URL(window.location.href);
    url.searchParams.set(DEBUG_TRACK_QUERY_KEY, 'back_7_Kl_ppen_Junior_Snowpark_20260312_112305_ddd2b8.geojson');
    el.debugSampleLink.href = `${url.pathname}${url.search}`;
  }
}

function setAnalysisLoading(isLoading) {
  state.analysis.isLoading = Boolean(isLoading);
  if (el.analysisLoading) {
    el.analysisLoading.classList.toggle('hidden', !state.analysis.isLoading);
  }
  if (el.approveRouteBtn) {
    el.approveRouteBtn.disabled = state.analysis.isLoading;
  }
}

function pointCountLabel() {
  if (el.recordPointCount) el.recordPointCount.textContent = String(state.recording.points.length);
  if (el.suggestedBackCount) el.suggestedBackCount.textContent = String(state.analysis.backSuggestions.length);
  const recording = state.recording.watchId !== null;
  syncEdgeSwipeGuardUi();

  if (el.recordPauseBtn) {
    el.recordPauseBtn.disabled = !recording;
    if (state.recording.paused) {
      el.recordPauseBtn.innerHTML = '<i class="fa-solid fa-play" aria-hidden="true"></i><span>Återuppta</span>';
    } else if (Date.now() <= state.recording.pauseArmedUntil) {
      const remaining = Math.max(0, Math.ceil((state.recording.pauseArmedUntil - Date.now()) / 1000));
      el.recordPauseBtn.innerHTML = `<i class="fa-solid fa-pause" aria-hidden="true"></i><span>Bekräfta paus (${remaining})</span>`;
    } else {
      el.recordPauseBtn.innerHTML = '<i class="fa-solid fa-pause" aria-hidden="true"></i><span>Pausa</span>';
    }
  }

  if (el.recordToggleBtn) {
    el.recordToggleBtn.classList.toggle('is-recording', recording);
    if (!recording) {
      el.recordToggleBtn.innerHTML = '<i class="fa-solid fa-location-dot gps-btn-icon" aria-hidden="true"></i> Starta GPS-spårning';
    } else if (Date.now() <= state.recording.stopArmedUntil) {
      const remaining = Math.max(0, Math.ceil((state.recording.stopArmedUntil - Date.now()) / 1000));
      el.recordToggleBtn.innerHTML = `<i class="fa-solid fa-stop gps-btn-icon" aria-hidden="true"></i> Bekräfta stopp (${remaining})`;
    } else {
      el.recordToggleBtn.innerHTML = '<i class="fa-solid fa-stop gps-btn-icon" aria-hidden="true"></i> Stoppa inspelning';
    }
  }
}

function formatDurationMs(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateDurationLabel() {
  if (!el.recordDuration) return;
  if (state.recording.watchId === null || !state.recording.startedAtMs) {
    el.recordDuration.textContent = '00:00';
    return;
  }
  el.recordDuration.textContent = formatDurationMs(Date.now() - state.recording.startedAtMs);
}

function stopDurationTicker() {
  if (state.recording.durationTickTimer !== null) {
    window.clearInterval(state.recording.durationTickTimer);
    state.recording.durationTickTimer = null;
  }
}

function startDurationTicker() {
  stopDurationTicker();
  updateDurationLabel();
  state.recording.durationTickTimer = window.setInterval(updateDurationLabel, 500);
}

function loadSoundPreference() {
  try {
    const raw = localStorage.getItem(SOUND_PREF_KEY);
    if (raw === '0') state.audio.enabled = false;
    if (raw === '1') state.audio.enabled = true;
  } catch {
    // ignore
  }
}

function saveSoundPreference() {
  try {
    localStorage.setItem(SOUND_PREF_KEY, state.audio.enabled ? '1' : '0');
  } catch {
    // ignore
  }
}

function updateSoundButtonUi() {
  if (!el.recordSoundBtn) return;
  el.recordSoundBtn.innerHTML = state.audio.enabled
    ? '<i class="fa-solid fa-volume-high" aria-hidden="true"></i><span>Ljud: På</span>'
    : '<i class="fa-solid fa-volume-xmark" aria-hidden="true"></i><span>Ljud: Av</span>';
  el.recordSoundBtn.setAttribute('aria-pressed', state.audio.enabled ? 'true' : 'false');
}

function getOrCreateRecordingLoopAudio() {
  if (state.audio.loop) return state.audio.loop;
  const audio = new Audio('../IMG/ping.m4a');
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0.4;
  state.audio.loop = audio;
  return audio;
}

async function startRecordingLoopAudio() {
  if (!state.audio.enabled) return;
  const audio = getOrCreateRecordingLoopAudio();
  try {
    audio.currentTime = 0;
    await audio.play();
  } catch {
    // ignore playback block
  }
}

function stopRecordingLoopAudio() {
  if (!state.audio.loop) return;
  try {
    state.audio.loop.pause();
    state.audio.loop.currentTime = 0;
  } catch {
    // ignore
  }
}

function toggleRecordingSound() {
  state.audio.enabled = !state.audio.enabled;
  saveSoundPreference();
  updateSoundButtonUi();
  if (!state.audio.enabled) {
    stopRecordingLoopAudio();
    return;
  }
  if (state.recording.watchId !== null && !state.recording.paused) {
    startRecordingLoopAudio();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeColorName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getBackDifficultyMeta(backe) {
  const key = normalizeColorName(backe?.farg);
  if (key === 'gron') return { color: '#16a34a', symbol: '●', label: 'Grön' };
  if (key === 'bla') return { color: '#2563eb', symbol: '■', label: 'Blå' };
  if (key === 'rod') return { color: '#dc2626', symbol: '▬', label: 'Röd' };
  if (key === 'svart') return { color: '#0f172a', symbol: '◆', label: 'Svart' };
  return { color: '#64748b', symbol: '•', label: 'Okänd' };
}

function backByNummer(backNummer) {
  return state.backar.find((b) => Number(b.nummer) === Number(backNummer)) || null;
}

function liftNameByPoint(point) {
  const uid = String(point?.liftUid || '').trim();
  if (uid && state.liftarByUid.has(uid)) return state.liftarByUid.get(uid).namn || '';
  return String(point?.namn || '').trim();
}

async function apiGet(base, action, params = {}) {
  const url = new URL(base, window.location.href);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  const res = await fetch(url.toString());
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `API GET ${action} failed`);
  return json;
}

async function apiPost(base, action, payload = {}) {
  const url = new URL(base, window.location.href);
  url.searchParams.set('action', action);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `API POST ${action} failed`);
  return json;
}


function showSafetyModal() {
  if (!el.safetyModal) return;
  lockBodyScroll();
  state.ui.safetyChecks.locationOk = false;
  state.ui.safetyChecks.autolockOff = false;
  state.ui.safetyChecks.pageKeptOpen = false;
  if (el.safetyLocationHint) {
    el.safetyLocationHint.textContent = 'Status: Ej testad ännu.';
    el.safetyLocationHint.style.color = '#475569';
  }
  updateSafetyModalUi();
  el.safetyModal.classList.remove('hidden');
  syncEdgeSwipeGuardUi();
}

function hideSafetyModal() {
  if (!el.safetyModal) return;
  el.safetyModal.classList.add('hidden');
  unlockBodyScroll();
  syncEdgeSwipeGuardUi();
}

function lockBodyScroll() {
  state.ui.scrollLockY = window.scrollY || window.pageYOffset || 0;
  document.body.classList.add('modal-open');
  document.body.style.top = `-${state.ui.scrollLockY}px`;
}

function unlockBodyScroll() {
  const y = state.ui.scrollLockY || 0;
  document.body.classList.remove('modal-open');
  document.body.style.top = '';
  window.scrollTo(0, y);
}

function stopCountdownTicker() {
  if (state.recording.countdownTimerId !== null) {
    window.clearInterval(state.recording.countdownTimerId);
    state.recording.countdownTimerId = null;
  }
}

function startCountdownTicker() {
  stopCountdownTicker();
  state.recording.countdownTimerId = window.setInterval(() => {
    if (state.recording.watchId === null) {
      stopCountdownTicker();
      return;
    }
    const remainingMs = state.recording.countdownUntilMs - Date.now();
    if (remainingMs > 0) {
      const remaining = Math.ceil(remainingMs / 1000);
      if (remaining !== state.recording.countdownLastShown) {
        state.recording.countdownLastShown = remaining;
      }
      setStatus(`Startar inspelning om ${remaining}...`);
      return;
    }
    state.recording.countdownUntilMs = 0;
    state.recording.countdownLastShown = 0;
    setStatus('Spårning aktiv. Nu loggas punkter.');
    tryRecordPoint(state.recording.lastPoint, { allowStatusUpdate: false });
    stopCountdownTicker();
  }, 200);
}

function updateSafetyModalUi() {
  if (el.safetyActionLocationBtn) {
    el.safetyActionLocationBtn.setAttribute('aria-pressed', state.ui.safetyChecks.locationOk ? 'true' : 'false');
  }
  if (el.safetyActionAutolockBtn) {
    el.safetyActionAutolockBtn.setAttribute('aria-pressed', state.ui.safetyChecks.autolockOff ? 'true' : 'false');
  }
  if (el.safetyActionScreenBtn) {
    el.safetyActionScreenBtn.setAttribute('aria-pressed', state.ui.safetyChecks.pageKeptOpen ? 'true' : 'false');
  }
  if (el.safetyConfirmBtn) {
    el.safetyConfirmBtn.disabled = !(state.ui.safetyChecks.locationOk && state.ui.safetyChecks.autolockOff && state.ui.safetyChecks.pageKeptOpen);
  }
}

function explainLocationError(err) {
  const code = Number(err?.code);
  if (code === 1) {
    return 'Plats åtkomst nekad. iPhone: Inställningar > Safari > Plats > Tillåt och slå på Exakt position.';
  }
  if (code === 2) {
    return 'Kunde inte läsa plats just nu. Kontrollera att platstjänster är påslagna.';
  }
  return 'Platskontroll timeout. Stå still några sekunder och testa igen.';
}

function checkExactLocationPermission() {
  if (!navigator.geolocation) {
    state.ui.safetyChecks.locationOk = false;
    if (el.safetyLocationHint) {
      el.safetyLocationHint.textContent = 'Status: Geolocation stöds inte i denna webbläsare.';
      el.safetyLocationHint.style.color = '#9f1239';
    }
    updateSafetyModalUi();
    return;
  }

  if (el.safetyLocationHint) {
    el.safetyLocationHint.textContent = 'Kontrollerar platsåtkomst...';
    el.safetyLocationHint.style.color = '#1e4f80';
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const accuracy = Number(position?.coords?.accuracy);
      const isExactEnough = Number.isFinite(accuracy) && accuracy <= 120;
      state.ui.safetyChecks.locationOk = isExactEnough;
      if (el.safetyLocationHint) {
        if (isExactEnough) {
          el.safetyLocationHint.textContent = `Status: OK (${accuracy.toFixed(1)} m). Exakt position verkar aktiv.`;
          el.safetyLocationHint.style.color = '#166534';
        } else {
          el.safetyLocationHint.textContent = `Status: För låg precision (${Number.isFinite(accuracy) ? `${accuracy.toFixed(1)} m` : 'okänd'}). Slå på Exakt position i webbläsarens platsinställning.`;
          el.safetyLocationHint.style.color = '#9f1239';
        }
      }
      updateSafetyModalUi();
    },
    (err) => {
      state.ui.safetyChecks.locationOk = false;
      if (el.safetyLocationHint) {
        el.safetyLocationHint.textContent = `Status: ${explainLocationError(err)}`;
        el.safetyLocationHint.style.color = '#9f1239';
      }
      updateSafetyModalUi();
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 12000
    }
  );
}

function initMapIfNeeded() {
  if (state.map.inited) return;
  if (!window.L || !el.runsMap) {
    if (el.mapStatus) el.mapStatus.textContent = 'Kunde inte ladda kartbibliotek.';
    return;
  }

  const map = window.L.map(el.runsMap, {
    center: [61.03, 13.36],
    zoom: 13
  });

  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  map.createPane('defsPane');
  map.getPane('defsPane').style.zIndex = 430;
  map.createPane('runPane');
  map.getPane('runPane').style.zIndex = 520;
  map.createPane('focusPane');
  map.getPane('focusPane').style.zIndex = 650;

  state.map.map = map;
  state.map.defsLayer = window.L.layerGroup([]).addTo(map);
  state.map.runLayer = window.L.layerGroup([]).addTo(map);
  state.map.focusLayer = window.L.layerGroup([]).addTo(map);
  state.map.positionLayer = window.L.layerGroup([]).addTo(map);
  state.map.inited = true;
}

function mergeFeatureCollections(...collections) {
  return {
    type: 'FeatureCollection',
    features: collections.flatMap((c) => (Array.isArray(c?.features) ? c.features : []))
  };
}

function isLiftFeature(feature) {
  return String(feature?.properties?.liftUid || '').trim() !== '';
}

function pointsForMap() {
  const fromClassification = Array.isArray(state.analysis.result?.points) ? state.analysis.result.points : [];
  if (fromClassification.length > 0) {
    return fromClassification
      .filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)))
      .map((p) => [Number(p.lat), Number(p.lon)]);
  }
  return state.recording.points
    .filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)))
    .map((p) => [Number(p.lat), Number(p.lon)]);
}

function currentPositionForMap() {
  const p = state.recording.lastPoint;
  if (!p) return null;
  if (!Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lon))) return null;
  return [Number(p.lat), Number(p.lon)];
}

function latLngsForRange(startIndex, endIndex) {
  const points = Array.isArray(state.analysis.result?.points) ? state.analysis.result.points : [];
  if (points.length === 0) return [];

  const start = Math.max(0, Number(startIndex || 0));
  const end = Math.min(points.length - 1, Number(endIndex || 0));
  if (end <= start) return [];

  const latLngs = [];
  for (let i = start; i <= end; i += 1) {
    const p = points[i];
    if (!Number.isFinite(Number(p?.lat)) || !Number.isFinite(Number(p?.lon))) continue;
    latLngs.push([Number(p.lat), Number(p.lon)]);
  }
  return latLngs;
}

function refreshMap({ fit = false } = {}) {
  initMapIfNeeded();
  if (!state.map.inited || !state.map.map) return;

  state.map.defsLayer.clearLayers();
  state.map.runLayer.clearLayers();
  state.map.positionLayer.clearLayers();

  const defsGeoJson = mergeFeatureCollections(state.defs.backDefs, state.defs.liftDefs);
  const defsLayer = window.L.geoJSON(defsGeoJson, {
    pane: 'defsPane',
    style: (feature) => {
      if (isLiftFeature(feature)) {
        return { color: '#94a3b8', weight: 4, opacity: 0.65, dashArray: '8 6' };
      }
      return { color: '#64748b', weight: 4, opacity: 0.65 };
    }
  });
  state.map.defsLayer.addLayer(defsLayer);

  const runLatLngs = pointsForMap();
  if (runLatLngs.length >= 2) {
    state.map.runLayer.addLayer(
      window.L.polyline(runLatLngs, {
        pane: 'runPane',
        color: '#ffffff',
        weight: 10,
        opacity: 0.95,
        lineCap: 'round'
      })
    );
    state.map.runLayer.addLayer(
      window.L.polyline(runLatLngs, {
        pane: 'runPane',
        color: '#103D69',
        weight: 6,
        opacity: 1,
        lineCap: 'round'
      })
    );
  }

  const currentPos = currentPositionForMap();
  if (currentPos) {
    state.map.positionLayer.addLayer(
      window.L.circleMarker(currentPos, {
        pane: 'runPane',
        radius: 7,
        color: '#ffffff',
        weight: 3,
        fillColor: '#1E4F80',
        fillOpacity: 1
      })
    );
  }

  const suggestion = state.analysis.backSuggestions[state.analysis.selectedSuggestionIndex ?? -1] || null;
  if (suggestion) {
    focusSuggestionRange(suggestion, { fit: false });
  } else {
    state.map.focusLayer.clearLayers();
  }

  const defsCount = Array.isArray(defsGeoJson.features) ? defsGeoJson.features.length : 0;
  const statusText = runLatLngs.length >= 2
    ? `Karta: ${defsCount} linjer + inspelat spår i mörkblått.`
    : `Karta: ${defsCount} linjer.`;
  if (el.mapStatus) el.mapStatus.textContent = statusText;

  if (fit) {
    const bounds = window.L.latLngBounds([]);
    const defsBounds = defsLayer.getBounds();
    if (defsBounds.isValid()) bounds.extend(defsBounds);
    if (runLatLngs.length >= 2) bounds.extend(window.L.polyline(runLatLngs).getBounds());
    if (bounds.isValid()) state.map.map.fitBounds(bounds.pad(0.08));
  }
}

function makeIndexMarker(text) {
  return window.L.divIcon({
    className: '',
    html: `<div style="border:2px solid #fff;background:#0f172a;color:#fff;border-radius:999px;min-width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${escapeHtml(text)}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

function focusSuggestionRange(suggestion, { fit = true } = {}) {
  if (!state.map.inited || !suggestion) return;
  state.map.focusLayer.clearLayers();

  const latLngs = latLngsForRange(suggestion.firstIndex, suggestion.lastIndex);
  if (latLngs.length < 2) return;

  const halo = window.L.polyline(latLngs, {
    pane: 'focusPane',
    color: '#ffffff',
    weight: 13,
    opacity: 0.95,
    lineCap: 'round'
  });

  const core = window.L.polyline(latLngs, {
    pane: 'focusPane',
    color: '#16a34a',
    weight: 8,
    opacity: 1,
    lineCap: 'round'
  });

  const start = latLngs[0];
  const end = latLngs[latLngs.length - 1];
  const startLabel = window.L.marker(start, { pane: 'focusPane', icon: makeIndexMarker(`S${suggestion.firstIndex}`) });
  const endLabel = window.L.marker(end, { pane: 'focusPane', icon: makeIndexMarker(`E${suggestion.lastIndex}`) });

  state.map.focusLayer.addLayer(halo);
  state.map.focusLayer.addLayer(core);
  state.map.focusLayer.addLayer(startLabel);
  state.map.focusLayer.addLayer(endLabel);

  if (fit) {
    const b = halo.getBounds();
    if (b.isValid()) {
      state.map.map.fitBounds(b.pad(0.35));
    }
  }
}

function renderAnalysis() {
  const suggestions = state.analysis.backSuggestions;
  const route = state.analysis.routeEntries;

  if (el.analysisCard) {
    const shouldHide = !state.analysis.isLoading && suggestions.length === 0 && route.length === 0;
    el.analysisCard.classList.toggle('is-hidden', shouldHide);
    el.analysisCard.classList.toggle('hidden', shouldHide);
  }

  if (el.analysisMeta) {
    el.analysisMeta.textContent = '';
  }

  if (el.suggestionsList) {
    if (state.analysis.isLoading) {
      el.suggestionsList.innerHTML = '';
    } else if (suggestions.length === 0) {
      el.suggestionsList.innerHTML = '<p class="muted">Inga tydliga backar hittades i spåret.</p>';
    } else {
      el.suggestionsList.innerHTML = suggestions
        .map((entry, index) => {
          const backe = backByNummer(entry.backNummer);
          const difficulty = getBackDifficultyMeta(backe);
          return `
            <div class="suggestion-item ${state.analysis.selectedSuggestionIndex === index ? 'is-active' : ''}" data-suggestion-index="${index}">
              <label class="suggestion-main">
                <span class="suggestion-switch">
                  <input type="checkbox" class="suggestion-switch-input" data-suggestion-toggle="${index}" ${entry.selected ? 'checked' : ''} />
                  <span class="suggestion-switch-track" aria-hidden="true">
                    <span class="suggestion-switch-thumb"></span>
                  </span>
                </span>
                <span class="suggestion-label-wrap">
                  <span class="suggestion-badge" style="--badge-color: ${escapeHtml(difficulty.color)}">
                    <span class="suggestion-badge-symbol" aria-hidden="true">${escapeHtml(difficulty.symbol)}</span>
                    <span>${escapeHtml(difficulty.label)}</span>
                  </span>
                  <span class="suggestion-label">#${entry.backNummer} ${escapeHtml(entry.name)}</span>
                </span>
              </label>
              <button type="button" class="soft-btn" data-suggestion-focus="${index}" aria-label="Visa på karta">
                <i class="fa-regular fa-map" aria-hidden="true"></i>
              </button>
            </div>
          `;
        })
        .join('');
    }
  }

  if (el.routeList) {
    if (route.length === 0) {
      el.routeList.innerHTML = '<li>Ingen tydlig rutt hittades.</li>';
    } else {
      el.routeList.innerHTML = route
        .map((entry) => `<li>${escapeHtml(entry.label)} (${entry.count})</li>`)
        .join('');
    }
  }

  pointCountLabel();
}

function pointsToFeatureCollection(points) {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      properties: {
        timestamp: point.timestamp,
        accuracy: point.accuracy,
        speed: point.speed,
        heading: point.heading
      },
      geometry: {
        type: 'Point',
        coordinates: [point.lon, point.lat]
      }
    }))
  };
}

function trackGeoJsonToPoints(trackGeoJson) {
  if (trackGeoJson?.type !== 'FeatureCollection' || !Array.isArray(trackGeoJson.features)) return [];

  return trackGeoJson.features
    .map((feature) => {
      const coords = feature?.geometry?.coordinates;
      if (feature?.geometry?.type !== 'Point' || !Array.isArray(coords) || coords.length < 2) return null;
      const props = feature?.properties || {};
      return {
        lat: Number(coords[1]),
        lon: Number(coords[0]),
        accuracy: Number.isFinite(Number(props.accuracy)) ? Number(props.accuracy) : null,
        speed: Number.isFinite(Number(props.speed)) ? Number(props.speed) : null,
        heading: Number.isFinite(Number(props.heading)) ? Number(props.heading) : null,
        timestamp: props.timestamp ? String(props.timestamp) : null
      };
    })
    .filter((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lon));
}

function estimateDurationFromPoints(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  const firstTs = Date.parse(points[0]?.timestamp || '');
  const lastTs = Date.parse(points[points.length - 1]?.timestamp || '');
  if (!Number.isFinite(firstTs) || !Number.isFinite(lastTs) || lastTs <= firstTs) return 0;
  return lastTs - firstTs;
}

function positionToPoint(position) {
  const c = position.coords;
  return {
    lat: c.latitude,
    lon: c.longitude,
    accuracy: Number.isFinite(c.accuracy) ? c.accuracy : null,
    speed: Number.isFinite(c.speed) ? c.speed : null,
    heading: Number.isFinite(c.heading) ? c.heading : null,
    timestamp: new Date(position.timestamp || Date.now()).toISOString()
  };
}

function resetStopArm() {
  state.recording.stopArmedUntil = 0;
  if (state.recording.stopArmTimer) {
    window.clearTimeout(state.recording.stopArmTimer);
    state.recording.stopArmTimer = null;
  }
  if (state.recording.stopArmTickTimer) {
    window.clearInterval(state.recording.stopArmTickTimer);
    state.recording.stopArmTickTimer = null;
  }
}

function resetPauseArm() {
  state.recording.pauseArmedUntil = 0;
  if (state.recording.pauseArmTimer) {
    window.clearTimeout(state.recording.pauseArmTimer);
    state.recording.pauseArmTimer = null;
  }
  if (state.recording.pauseArmTickTimer) {
    window.clearInterval(state.recording.pauseArmTickTimer);
    state.recording.pauseArmTickTimer = null;
  }
}

function armPauseRecording() {
  resetPauseArm();
  state.recording.pauseArmedUntil = Date.now() + STOP_CONFIRM_WINDOW_MS;
  state.recording.pauseArmTimer = window.setTimeout(() => {
    resetPauseArm();
    pointCountLabel();
  }, STOP_CONFIRM_WINDOW_MS + 20);
  state.recording.pauseArmTickTimer = window.setInterval(() => {
    if (Date.now() > state.recording.pauseArmedUntil) return;
    pointCountLabel();
  }, 200);
  pointCountLabel();
}

function armStopRecording() {
  resetStopArm();
  state.recording.stopArmedUntil = Date.now() + STOP_CONFIRM_WINDOW_MS;
  state.recording.stopArmTimer = window.setTimeout(() => {
    resetStopArm();
    pointCountLabel();
  }, STOP_CONFIRM_WINDOW_MS + 20);
  state.recording.stopArmTickTimer = window.setInterval(() => {
    if (Date.now() > state.recording.stopArmedUntil) return;
    pointCountLabel();
  }, 200);
  pointCountLabel();
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    state.recording.wakeLock = await navigator.wakeLock.request('screen');
    state.recording.wakeLock.addEventListener('release', () => {
      state.recording.wakeLock = null;
    });
  } catch {
    // ignore
  }
}

async function ensureWakeLock() {
  if (document.visibilityState !== 'visible') return;
  if (state.recording.watchId === null) return;
  if (state.recording.wakeLock) return;
  await requestWakeLock();
}

async function releaseWakeLock() {
  if (!state.recording.wakeLock) return;
  try {
    await state.recording.wakeLock.release();
  } catch {
    // ignore
  }
  state.recording.wakeLock = null;
}

function togglePauseRecording() {
  if (state.recording.watchId === null) return;
  if (!state.recording.paused) {
    if (Date.now() > state.recording.pauseArmedUntil) {
      armPauseRecording();
      return;
    }
    resetPauseArm();
  }
  state.recording.paused = !state.recording.paused;
  pointCountLabel();

  if (state.recording.paused) {
    stopRecordingLoopAudio();
    setStatus(`Inspelning pausad. Ignorerade i paus: ${state.recording.pausedIgnoredCount}.`);
    return;
  }

  if (state.audio.enabled) {
    startRecordingLoopAudio();
  }
  setStatus(`Inspelning återupptagen. Punkter: ${state.recording.points.length}.`);
}

function clearAnalysis() {
  state.analysis.result = null;
  state.analysis.backSuggestions = [];
  state.analysis.routeEntries = [];
  state.analysis.selectedSuggestionIndex = null;
  setAnalysisLoading(false);
  renderAnalysis();
}

function tryRecordPoint(point, { allowStatusUpdate = true } = {}) {
  if (!point) return false;
  if (!Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lon))) return false;
  const ts = String(point.timestamp || '');
  if (ts && ts === state.recording.lastRecordedTimestamp) return false;

  const tooInaccurate = Number.isFinite(point.accuracy) && point.accuracy > MAX_ALLOWED_ACCURACY_METERS;
  if (tooInaccurate) {
    state.recording.rejectedCount += 1;
    if (allowStatusUpdate) {
      setStatus(`Ignorerad punkt (accuracy ${point.accuracy.toFixed(1)} m > ${MAX_ALLOWED_ACCURACY_METERS} m).`);
    }
    return false;
  }

  state.recording.points.push(point);
  state.recording.lastRecordedTimestamp = ts;
  pointCountLabel();

  refreshMap({ fit: false });

  if (allowStatusUpdate) {
    setStatus(`Spelar in... ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}. Ignorerade: ${state.recording.rejectedCount}`);
  }
  return true;
}

function startRecording() {
  if (!navigator.geolocation) {
    setStatus('Geolocation stöds inte i denna webbläsare.', true);
    return;
  }

  state.recording.points = [];
  state.recording.rejectedCount = 0;
  state.recording.paused = false;
  state.recording.pausedIgnoredCount = 0;
  state.recording.countdownUntilMs = Date.now() + (START_COUNTDOWN_SECONDS * 1000);
  state.recording.countdownLastShown = START_COUNTDOWN_SECONDS;
  state.recording.startedAtMs = Date.now();
  state.recording.lastPoint = null;
  state.recording.lastRecordedTimestamp = '';
  startCountdownTicker();
  startDurationTicker();
  resetPauseArm();
  resetStopArm();
  clearAnalysis();
  pointCountLabel();

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      const point = positionToPoint(position);
      state.recording.lastPoint = point;
      if (el.recordAccuracy) {
        el.recordAccuracy.textContent = point.accuracy != null ? `${point.accuracy.toFixed(1)} m` : '-';
      }

      if (state.recording.paused) {
        state.recording.pausedIgnoredCount += 1;
        setStatus(`Pausad... ignorerar punkt (${state.recording.pausedIgnoredCount}).`);
        return;
      }

      const countdownRemainingMs = state.recording.countdownUntilMs - Date.now();
      if (countdownRemainingMs > 0) {
        return;
      }
      if (state.recording.countdownUntilMs > 0) {
        state.recording.countdownUntilMs = 0;
        state.recording.countdownLastShown = 0;
        setStatus('Spårning aktiv. Nu loggas punkter.');
      }
      tryRecordPoint(point);
    },
    (error) => {
      setStatus(`Kunde inte läsa GPS: ${explainLocationError(error)}`, true);
      stopWatchOnly();
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000
    }
  );

  state.recording.watchId = watchId;
  requestWakeLock();
  startRecordingLoopAudio();
  pointCountLabel();
  refreshMap({ fit: false });
  setStatus(`Startar inspelning om ${START_COUNTDOWN_SECONDS}...`);
}

function stopWatchOnly() {
  if (state.recording.watchId !== null) {
    navigator.geolocation.clearWatch(state.recording.watchId);
    state.recording.watchId = null;
  }
  state.recording.paused = false;
  state.recording.countdownUntilMs = 0;
  state.recording.countdownLastShown = 0;
  stopCountdownTicker();
  stopDurationTicker();
  resetPauseArm();
  resetStopArm();
  stopRecordingLoopAudio();
  releaseWakeLock();
  updateDurationLabel();
  pointCountLabel();
}

function buildBackSuggestions(result) {
  const segments = Array.isArray(result?.segments) ? result.segments : [];
  const entries = [];

  segments
    .filter((seg) => seg?.matchedKind === 'back' && Number.isFinite(Number(seg.backNummer)))
    .forEach((seg, index) => {
      const backNummer = Number(seg.backNummer);
      const backe = backByNummer(backNummer);
      const firstIndex = Number(seg.startIndex);
      const lastIndex = Number(seg.endIndex);
      const count = Number(seg.count);
      const normalizedCount = Number.isFinite(count) && count > 0 ? count : Math.max(0, lastIndex - firstIndex + 1);
      const prev = entries[entries.length - 1];

      if (prev && Number(prev.backNummer) === backNummer) {
        prev.count += normalizedCount;
        prev.lastIndex = lastIndex;
        return;
      }

      entries.push({
        id: `back-${backNummer}-${firstIndex}-${index}`,
        backNummer,
        name: backe?.namn || `Backe ${backNummer}`,
        count: normalizedCount,
        firstIndex,
        lastIndex,
        selected: true
      });
    });

  return entries;
}

function buildRouteEntries(result) {
  const segments = Array.isArray(result?.segments) ? result.segments : [];
  const entries = [];

  segments.forEach((seg) => {
    if (!seg || (seg.matchedKind !== 'back' && seg.matchedKind !== 'lift')) return;

    let key = '';
    let label = '';

    if (seg.matchedKind === 'back' && Number.isFinite(Number(seg.backNummer))) {
      const nr = Number(seg.backNummer);
      const backe = backByNummer(nr);
      key = `back:${nr}`;
      label = `Backe #${nr}${backe?.namn ? ` ${backe.namn}` : ''}`;
    } else if (seg.matchedKind === 'lift') {
      const liftId = String(seg.liftId || seg.liftUid || '').trim();
      if (!liftId) return;
      const firstPoint = (Array.isArray(result?.points) ? result.points : [])[Number(seg.startIndex || 0)] || null;
      const liftName = liftNameByPoint(firstPoint);
      key = `lift:${liftId}`;
      label = `Lift ${liftId}${liftName ? ` ${liftName}` : ''}`;
    }

    if (!key || !label) return;

    const count = Number.isFinite(Number(seg.count))
      ? Number(seg.count)
      : Math.max(0, Number(seg.endIndex || 0) - Number(seg.startIndex || 0) + 1);

    const prev = entries[entries.length - 1];
    if (prev && prev.key === key) {
      prev.count += count;
      return;
    }

    entries.push({ key, label, count });
  });

  return entries;
}

async function analyzeRecordedTrack() {
  if (state.recording.points.length < 2) {
    setStatus('För få punkter för analys.');
    return;
  }

  const track = pointsToFeatureCollection(state.recording.points);
  setAnalysisLoading(true);
  renderAnalysis();

  try {
    const res = await apiPost(gpsApiBase, 'classifyTrack', { track });
    state.analysis.result = res;
    state.analysis.backSuggestions = buildBackSuggestions(res);
    state.analysis.routeEntries = buildRouteEntries(res);
    state.analysis.selectedSuggestionIndex = state.analysis.backSuggestions.length > 0 ? 0 : null;
  } finally {
    setAnalysisLoading(false);
  }

  renderAnalysis();
  refreshMap({ fit: true });
}

async function loadDebugTrackFromQuery() {
  const debugTrackFile = getDebugTrackFileFromQuery();
  if (!debugTrackFile) {
    updateDebugUi();
    return;
  }

  updateDebugUi(`Laddar testspår: ${debugTrackFile}`);

  try {
    const res = await fetch(new URL(`${DEBUG_TRACKS_BASE_PATH}${debugTrackFile}`, window.location.href).toString());
    const trackGeoJson = await res.json().catch(() => null);
    if (!res.ok || !trackGeoJson) {
      throw new Error(`kunde inte läsa ${debugTrackFile}`);
    }
    const points = trackGeoJsonToPoints(trackGeoJson);
    if (points.length < 2) {
      throw new Error('spårfilen innehåller för få giltiga punkter');
    }

    stopWatchOnly();
    clearAnalysis();
    state.recording.points = points;
    state.recording.rejectedCount = 0;
    state.recording.paused = false;
    state.recording.pausedIgnoredCount = 0;
    state.recording.lastPoint = points[points.length - 1] || null;
    state.recording.lastRecordedTimestamp = String(points[points.length - 1]?.timestamp || '');
    const estimatedDurationMs = estimateDurationFromPoints(points);
    state.recording.startedAtMs = estimatedDurationMs > 0
      ? Date.now() - estimatedDurationMs
      : 0;

    if (el.recordAccuracy) {
      const accuracy = points[points.length - 1]?.accuracy;
      el.recordAccuracy.textContent = Number.isFinite(accuracy) ? `${accuracy.toFixed(1)} m` : '-';
    }

    pointCountLabel();
    updateDurationLabel();
    refreshMap({ fit: false });
    await analyzeRecordedTrack();
    updateDebugUi(`Testspår laddat: ${debugTrackFile}. Godkänn rutten för att gå vidare till startsidan.`);
  } catch (err) {
    updateDebugUi(`Debugläge aktivt men testspåret kunde inte laddas: ${err.message}`);
    setStatus(`Kunde inte ladda testspår: ${err.message}`, true);
  }
}

async function stopRecordingAndAnalyze() {
  stopWatchOnly();

  if (state.recording.points.length < 2) {
    setStatus('Inspelningen stoppad, men för få punkter för analys.', true);
    refreshMap({ fit: false });
    return;
  }

  try {
    await analyzeRecordedTrack();
  } catch (err) {
    setStatus(`Kunde inte analysera spåret: ${err.message}`, true);
  }
}

function buildTrackFileName() {
  const ts = new Date().toISOString().replaceAll(':', '').replaceAll('-', '').slice(0, 15);
  return `gps_run_${ts}`;
}

function buildLatestRecordedRoutePayload() {
  const selectedSuggestions = state.analysis.backSuggestions
    .filter((s) => s.selected)
    .filter((s) => Number.isFinite(Number(s.backNummer)) && Number(s.backNummer) > 0);

  const selectedBackNummerList = selectedSuggestions
    .map((s) => Number(s.backNummer));

  const selectedSet = new Set(selectedBackNummerList);
  const backSegmentCount = selectedSuggestions.length;

  const routeEntries = state.analysis.routeEntries.map((entry) => ({
    key: String(entry.key || ''),
    label: String(entry.label || ''),
    count: Number(entry.count || 0)
  }));

  const pointsCount = Array.isArray(state.analysis.result?.points) ? state.analysis.result.points.length : 0;
  const totalSegments = Array.isArray(state.analysis.result?.segments) ? state.analysis.result.segments.length : 0;
  const selectedPointCount = state.analysis.backSuggestions
    .filter((s) => s.selected)
    .reduce((sum, s) => sum + Number(s.count || 0), 0);

  return {
    createdAt: new Date().toISOString(),
    source: 'gps',
    backSegmentCount,
    backNummerList: selectedBackNummerList,
    backNummerListUnique: Array.from(selectedSet),
    routeEntries,
    trackMeta: {
      pointsCount,
      segmentsCount: totalSegments,
      selectedPointsCount: selectedPointCount
    }
  };
}

function persistLatestRecordedRoute(payload) {
  window.localStorage.setItem(LATEST_RECORDED_ROUTE_STORAGE_KEY, JSON.stringify(payload));
}

function approveRouteForMainView() {
  const hasAnalysis = Array.isArray(state.analysis.backSuggestions) && state.analysis.backSuggestions.length > 0;
  if (!hasAnalysis) {
    setStatus('Ingen analyserad rutt att godkänna ännu.', true);
    return;
  }

  const selectedCount = state.analysis.backSuggestions.filter((s) => s.selected).length;
  if (selectedCount === 0) {
    setStatus('Välj minst en backe innan du godkänner rutten.', true);
    return;
  }

  try {
    if (el.approveRouteBtn) el.approveRouteBtn.disabled = true;
    const payload = buildLatestRecordedRoutePayload();
    persistLatestRecordedRoute(payload);
    setStatus(`Rutt godkänd (${payload.backSegmentCount} backsegment). Till startsidan...`);
    window.setTimeout(() => {
      window.location.href = '../index.html?fromGps=1';
    }, 400);
  } catch (err) {
    setStatus(`Kunde inte spara senaste rutt: ${err.message}`, true);
    if (el.approveRouteBtn) el.approveRouteBtn.disabled = false;
  }
}

async function loadInitialData() {
  const [backarRes, liftarRes, backDefsRes, liftDefsRes] = await Promise.all([
    apiGet(appApiBase, 'backar'),
    apiGet(gpsApiBase, 'liftar'),
    apiGet(gpsApiBase, 'backDefs'),
    apiGet(gpsApiBase, 'liftDefs')
  ]);

  state.backar = Array.isArray(backarRes.backar) ? backarRes.backar : [];
  const liftar = Array.isArray(liftarRes.liftar) ? liftarRes.liftar : [];
  state.liftarByUid = new Map(liftar.map((lift) => [String(lift.uid), lift]));
  state.defs.backDefs = backDefsRes.backDefs || { type: 'FeatureCollection', features: [] };
  state.defs.liftDefs = liftDefsRes.liftDefs || { type: 'FeatureCollection', features: [] };
}

function handleSuggestionToggleChange(event) {
  const toggle = event.target.closest('[data-suggestion-toggle]');
  if (!toggle) return;
  const index = Number(toggle.getAttribute('data-suggestion-toggle'));
  if (!Number.isInteger(index) || !state.analysis.backSuggestions[index]) return;
  state.analysis.backSuggestions[index].selected = Boolean(toggle.checked);
  renderAnalysis();
}

function handleSuggestionInteraction(event) {
  if (event.target.closest('[data-suggestion-toggle]') || event.target.closest('.suggestion-main')) {
    return;
  }

  const focus = event.target.closest('[data-suggestion-focus]');
  if (focus) {
    const index = Number(focus.getAttribute('data-suggestion-focus'));
    if (!Number.isInteger(index) || !state.analysis.backSuggestions[index]) return;
    state.analysis.selectedSuggestionIndex = index;
    renderAnalysis();
    focusSuggestionRange(state.analysis.backSuggestions[index], { fit: true });
    return;
  }

  const item = event.target.closest('[data-suggestion-index]');
  if (item) {
    const index = Number(item.getAttribute('data-suggestion-index'));
    if (!Number.isInteger(index) || !state.analysis.backSuggestions[index]) return;
    state.analysis.selectedSuggestionIndex = index;
    renderAnalysis();
    focusSuggestionRange(state.analysis.backSuggestions[index], { fit: true });
  }
}

function beforeUnloadHandler(event) {
  if (state.recording.watchId === null) return;
  event.preventDefault();
  event.returnValue = '';
}

async function init() {
  seedEdgeSwipeHistoryGuard();
  bindEdgeSwipeGuards();
  loadSoundPreference();
  updateSoundButtonUi();
  updateDebugUi();
  pointCountLabel();
  renderAnalysis();

  try {
    await loadInitialData();
    refreshMap({ fit: true });
    setStatus('');
    await loadDebugTrackFromQuery();
  } catch (err) {
    setStatus(`Kunde inte ladda data: ${err.message}`, true);
  }

  el.recordToggleBtn?.addEventListener('click', async () => {
    if (state.recording.watchId === null) {
      showSafetyModal();
      return;
    }

    if (Date.now() > state.recording.stopArmedUntil) {
      armStopRecording();
      return;
    }

    await stopRecordingAndAnalyze();
  });

  el.recordPauseBtn?.addEventListener('click', togglePauseRecording);
  el.recordSoundBtn?.addEventListener('click', toggleRecordingSound);

  el.approveRouteBtn?.addEventListener('click', approveRouteForMainView);

  el.suggestionsList?.addEventListener('change', handleSuggestionToggleChange);
  el.suggestionsList?.addEventListener('click', handleSuggestionInteraction);
  el.safetyActionLocationBtn?.addEventListener('click', () => {
    checkExactLocationPermission();
  });
  el.safetyActionAutolockBtn?.addEventListener('click', () => {
    state.ui.safetyChecks.autolockOff = !state.ui.safetyChecks.autolockOff;
    updateSafetyModalUi();
  });
  el.safetyActionScreenBtn?.addEventListener('click', () => {
    state.ui.safetyChecks.pageKeptOpen = !state.ui.safetyChecks.pageKeptOpen;
    updateSafetyModalUi();
  });
  el.safetyCloseBtn?.addEventListener('click', () => {
    hideSafetyModal();
  });
  el.safetyConfirmBtn?.addEventListener('click', () => {
    hideSafetyModal();
    startRecording();
  });
  el.safetyModal?.addEventListener('click', (event) => {
    if (event.target === el.safetyModal) hideSafetyModal();
  });
  document.addEventListener('visibilitychange', ensureWakeLock);
  window.addEventListener('beforeunload', beforeUnloadHandler);
}

init();
