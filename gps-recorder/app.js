const apiBase = '../gps-test/api.php';
const SOUND_PREF_KEY = 'gpsRecorderSoundEnabled';
const DEFAULT_BACK_WIDTH_METERS = 25;
const DEFAULT_LIFT_WIDTH_METERS = 16;
const START_COUNTDOWN_SECONDS = 3;

const state = {
  backar: [],
  liftar: [],
  backDefs: { type: 'FeatureCollection', features: [] },
  liftDefs: { type: 'FeatureCollection', features: [] },
  backRunsGeoJson: { type: 'FeatureCollection', features: [] },
  liftRunsGeoJson: { type: 'FeatureCollection', features: [] },
  lastSavedRun: null,
  ui: { targetType: 'back' },
  recording: {
    watchId: null,
    points: [],
    rejectedCount: 0,
    paused: false,
    pausedIgnoredCount: 0,
    countdownUntilMs: 0,
    countdownLastShown: 0,
    countdownTimerId: null
  },
  map: {
    inited: false,
    map: null,
    defsLayer: null,
    runsLayer: null
  },
  audio: {
    loop: null,
    enabled: true
  }
};

const el = {
  recordToggleBtn: document.getElementById('recordToggleBtn'),
  recordPauseBtn: document.getElementById('recordPauseBtn'),
  recordSoundBtn: document.getElementById('recordSoundBtn'),
  saveTrackBtn: document.getElementById('saveTrackBtn'),
  deleteLatestBtn: document.getElementById('deleteLatestBtn'),
  recordTypeBackBtn: document.getElementById('recordTypeBackBtn'),
  recordTypeLiftBtn: document.getElementById('recordTypeLiftBtn'),
  recordTargetLabel: document.getElementById('recordTargetLabel'),
  recordBackSelect: document.getElementById('recordBackSelect'),
  recordWidthInput: document.getElementById('recordWidthInput'),
  recordStatus: document.getElementById('recordStatus'),
  recordPointCount: document.getElementById('recordPointCount'),
  recordAccuracy: document.getElementById('recordAccuracy'),
  mapStatus: document.getElementById('mapStatus'),
  runsMap: document.getElementById('runsMap')
};

function setStatus(node, message, isError = false) {
  if (!node) return;
  node.textContent = message;
  node.style.color = isError ? 'var(--status-error, #ff7b8f)' : 'var(--status, #b7c8da)';
}

function targetTypeLabel(type) {
  return type === 'lift' ? 'lift' : 'backe';
}

function updateTargetTypeSwitchUi() {
  const isBack = state.ui.targetType === 'back';
  el.recordTypeBackBtn?.classList.toggle('is-active', isBack);
  el.recordTypeBackBtn?.setAttribute('aria-pressed', isBack ? 'true' : 'false');
  el.recordTypeLiftBtn?.classList.toggle('is-active', !isBack);
  el.recordTypeLiftBtn?.setAttribute('aria-pressed', isBack ? 'false' : 'true');
  if (el.recordTargetLabel) el.recordTargetLabel.textContent = isBack ? 'Vilken backe' : 'Vilken lift';
}

async function apiGet(action, params = {}) {
  const url = new URL(apiBase, window.location.href);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });

  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API error (${res.status})`);
  return data;
}

async function apiPost(action, payload = {}) {
  const url = new URL(apiBase, window.location.href);
  url.searchParams.set('action', action);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API error (${res.status})`);
  return data;
}

function backByNummer(backNummer) {
  return state.backar.find((b) => Number(b.nummer) === Number(backNummer)) || null;
}

function liftByUid(liftUid) {
  return state.liftar.find((l) => String(l.uid) === String(liftUid)) || null;
}

function selectedTarget() {
  const raw = String(el.recordBackSelect?.value || '');
  if (!raw.includes(':')) return null;
  const [type, id] = raw.split(':');
  if (type === 'back') {
    const backNummer = Number(id);
    if (!Number.isFinite(backNummer) || backNummer <= 0) return null;
    return { type, value: backNummer, selectValue: raw };
  }
  if (type === 'lift') {
    const liftUid = String(id || '').trim();
    if (!liftUid) return null;
    return { type, value: liftUid, selectValue: raw };
  }
  return null;
}

function targetLabel(target) {
  if (!target) return 'Okänd linje';
  if (target.type === 'back') {
    const backe = backByNummer(target.value);
    return backe ? `Backe #${target.value} ${backe.namn}` : `Backe #${target.value}`;
  }
  const lift = liftByUid(target.value);
  if (!lift) return `Lift ${target.value}`;
  const id = lift.id ? ` (${lift.id})` : '';
  return `Lift ${lift.namn}${id}`;
}

function getDefaultWidthForTarget(target) {
  const type = target?.type || state.ui.targetType;
  return type === 'lift' ? DEFAULT_LIFT_WIDTH_METERS : DEFAULT_BACK_WIDTH_METERS;
}

function syncRecordingWidthToSelectedTarget() {
  if (!el.recordWidthInput) return;
  el.recordWidthInput.value = String(getDefaultWidthForTarget(selectedTarget()));
}

function recordedTargetKeys() {
  const keys = new Set();
  const addFeatures = (collection) => {
    for (const feature of collection?.features || []) {
      const key = featureTargetKey(feature);
      if (key) keys.add(key);
    }
  };

  addFeatures(state.backDefs);
  addFeatures(state.liftDefs);
  addFeatures(state.backRunsGeoJson);
  addFeatures(state.liftRunsGeoJson);

  return keys;
}

function availableBackar() {
  const recordedKeys = recordedTargetKeys();
  return state.backar.filter((b) => !recordedKeys.has(`back:${Number(b.nummer)}`));
}

function availableLiftar() {
  const recordedKeys = recordedTargetKeys();
  return state.liftar.filter((l) => !recordedKeys.has(`lift:${String(l.uid)}`));
}

function renderTargetSelect({ clearSelection = true } = {}) {
  const old = clearSelection ? '' : String(el.recordBackSelect?.value || '');
  const showingBacks = state.ui.targetType !== 'lift';
  const availableTargets = showingBacks ? availableBackar() : availableLiftar();

  const options = [
    `<option value="">-- ${
      availableTargets.length > 0
        ? `Välj ${showingBacks ? 'backe' : 'lift'}`
        : `Alla ${showingBacks ? 'backar' : 'liftar'} är redan inspelade`
    } --</option>`
  ];
  if (showingBacks) {
    options.push(...availableTargets.map((b) => `<option value="back:${b.nummer}">Backe #${b.nummer} ${b.namn}</option>`));
  } else {
    options.push(...availableTargets.map((l) => {
      const id = l.id ? ` (${l.id})` : '';
      return `<option value="lift:${l.uid}">Lift ${l.namn}${id}</option>`;
    }));
  }

  el.recordBackSelect.innerHTML = options.join('');
  el.recordBackSelect.disabled = availableTargets.length === 0;
  if (clearSelection) {
    el.recordBackSelect.value = '';
  } else if (old && Array.from(el.recordBackSelect.options).some((o) => o.value === old)) {
    el.recordBackSelect.value = old;
  } else {
    el.recordBackSelect.value = '';
  }
  syncRecordingWidthToSelectedTarget();
}

function setTargetType(type, { clearSelection = true } = {}) {
  const nextType = type === 'lift' ? 'lift' : 'back';
  state.ui.targetType = nextType;
  updateTargetTypeSwitchUi();
  renderTargetSelect({ clearSelection });
}

function mergeFeatureCollections(...collections) {
  const features = collections.flatMap((c) => (Array.isArray(c?.features) ? c.features : []));
  return { type: 'FeatureCollection', features };
}

function isLiftFeature(feature) {
  return String(feature?.properties?.liftUid || '').trim() !== '';
}

function featureTargetKey(feature) {
  const p = feature?.properties || {};
  if (Number.isFinite(Number(p.backNummer)) && Number(p.backNummer) > 0) return `back:${Number(p.backNummer)}`;
  if (String(p.liftUid || '').trim()) return `lift:${String(p.liftUid).trim()}`;
  return '';
}

function initMapIfNeeded() {
  if (state.map.inited) return;
  if (!window.L || !el.runsMap) {
    setStatus(el.mapStatus, 'Kunde inte ladda kartbibliotek.', true);
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

  state.map.map = map;
  state.map.defsLayer = window.L.geoJSON([], {});
  state.map.runsLayer = window.L.geoJSON([], {});
  state.map.inited = true;
}

function refreshMap({ fit = false } = {}) {
  initMapIfNeeded();
  if (!state.map.inited || !state.map.map) return;

  if (state.map.defsLayer) state.map.map.removeLayer(state.map.defsLayer);
  if (state.map.runsLayer) state.map.map.removeLayer(state.map.runsLayer);

  const defsGeoJson = mergeFeatureCollections(state.backDefs, state.liftDefs);
  const runsGeoJson = mergeFeatureCollections(state.backRunsGeoJson, state.liftRunsGeoJson);

  state.map.defsLayer = window.L.geoJSON(defsGeoJson, {
    style: (feature) => {
      const key = featureTargetKey(feature);
      const isHighlighted = state.lastSavedRun && key === String(state.lastSavedRun.targetKey || '');
      if (isLiftFeature(feature)) {
        return {
          color: isHighlighted ? '#f8fafc' : '#9aa6b2',
          weight: isHighlighted ? 6 : 5,
          opacity: 0.95,
          dashArray: isHighlighted ? '5 5' : '10 7',
          lineCap: 'round'
        };
      }
      return {
        color: '#7fb1e0',
        weight: isHighlighted ? 6 : 5,
        opacity: 0.95
      };
    }
  });

  state.map.runsLayer = window.L.geoJSON(runsGeoJson, {
    style: (feature) => {
      const runId = String(feature?.properties?.runId || '');
      const isHighlighted = state.lastSavedRun && runId === String(state.lastSavedRun.runId || '');
      if (isLiftFeature(feature)) {
        return {
          color: isHighlighted ? '#f8fafc' : '#9ca3af',
          weight: isHighlighted ? 4 : 2.5,
          opacity: isHighlighted ? 0.95 : 0.5,
          dashArray: isHighlighted ? '4 4' : '6 8'
        };
      }
      return {
        color: '#60a5fa',
        weight: isHighlighted ? 4 : 2.5,
        opacity: isHighlighted ? 0.95 : 0.5
      };
    }
  });

  state.map.runsLayer.addTo(state.map.map);
  state.map.defsLayer.addTo(state.map.map);

  const bounds = window.L.latLngBounds([]);
  const defsBounds = state.map.defsLayer.getBounds();
  const runsBounds = state.map.runsLayer.getBounds();
  if (defsBounds.isValid()) bounds.extend(defsBounds);
  if (runsBounds.isValid()) bounds.extend(runsBounds);

  const defsCount = (defsGeoJson.features || []).length;
  const runsCount = (runsGeoJson.features || []).length;
  setStatus(el.mapStatus, `Linjer: ${defsCount}. Runs: ${runsCount}.`);

  if (fit && bounds.isValid()) state.map.map.fitBounds(bounds.pad(0.08));
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
  el.recordSoundBtn.textContent = state.audio.enabled ? 'Ljud: På' : 'Ljud: Av';
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
    // ignore
  }
}

function stopRecordingLoopAudio() {
  const audio = state.audio.loop;
  if (!audio) return;
  try {
    audio.pause();
    audio.currentTime = 0;
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

function updateRecordButtonUi() {
  const recording = state.recording.watchId !== null;
  const paused = recording && state.recording.paused;
  const hasTrack = state.recording.points.length >= 2;
  el.recordToggleBtn?.classList.toggle('is-recording', recording);
  if (el.recordToggleBtn) el.recordToggleBtn.textContent = recording ? '■ Stoppa inspelning' : '● Spela in';
  if (el.recordPauseBtn) {
    el.recordPauseBtn.disabled = !recording;
    el.recordPauseBtn.textContent = paused ? 'Återuppta inspelning' : 'Pausa';
  }
  if (el.saveTrackBtn) el.saveTrackBtn.disabled = recording || !hasTrack;
}

function updateDeleteLatestBtnUi() {
  if (!el.deleteLatestBtn) return;
  el.deleteLatestBtn.disabled = !state.lastSavedRun;
}

function updateRecordingMetrics() {
  if (el.recordPointCount) el.recordPointCount.textContent = String(state.recording.points.length);
  updateRecordButtonUi();
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
      setStatus(el.recordStatus, `Startar inspelning om ${remaining}...`);
      return;
    }
    state.recording.countdownUntilMs = 0;
    state.recording.countdownLastShown = 0;
    setStatus(el.recordStatus, 'Spårning aktiv. Nu loggas punkter.');
    stopCountdownTicker();
  }, 200);
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

function buildTrackFileName(target) {
  if (target?.type === 'back') {
    const backe = backByNummer(target.value);
    return backe ? `back_${backe.nummer}_${backe.namn}` : `back_${target.value}`;
  }
  if (target?.type === 'lift') {
    const lift = liftByUid(target.value);
    return lift ? `lift_${lift.uid}_${lift.namn}` : `lift_${target.value}`;
  }
  return 'track';
}

async function saveRecordedTrackFile() {
  if (state.recording.points.length < 2) {
    setStatus(el.recordStatus, 'Spåret måste innehålla minst 2 punkter.', true);
    return;
  }

  try {
    const target = selectedTarget();
    const res = await apiPost('saveTrack', {
      name: buildTrackFileName(target),
      track: pointsToFeatureCollection(state.recording.points)
    });
    setStatus(el.recordStatus, `Åk-fil sparad: ${res.file}`);
  } catch (err) {
    setStatus(el.recordStatus, `Kunde inte spara åk-fil: ${err.message}`, true);
  }
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

function getCurrentRecordingWidthMeters() {
  const fallbackWidth = getDefaultWidthForTarget(selectedTarget());
  const raw = Number(el.recordWidthInput?.value || fallbackWidth);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return fallbackWidth;
}

function togglePauseRecording() {
  if (state.recording.watchId === null) return;
  state.recording.paused = !state.recording.paused;
  updateRecordButtonUi();
  if (state.recording.paused) {
    stopRecordingLoopAudio();
    setStatus(el.recordStatus, `Inspelning pausad. Ignorerade i paus: ${state.recording.pausedIgnoredCount}.`);
    return;
  }
  if (state.audio.enabled) startRecordingLoopAudio();
  setStatus(el.recordStatus, `Inspelning återupptagen. Punkter: ${state.recording.points.length}.`);
}

function startRecording() {
  if (!navigator.geolocation) {
    setStatus(el.recordStatus, 'Geolocation stöds inte i denna webbläsare.', true);
    return;
  }

  const target = selectedTarget();
  if (!target) {
    setStatus(el.recordStatus, `Välj aktiv ${targetTypeLabel(state.ui.targetType)} innan inspelning.`, true);
    return;
  }

  state.recording.points = [];
  state.recording.rejectedCount = 0;
  state.recording.paused = false;
  state.recording.pausedIgnoredCount = 0;
  state.recording.countdownUntilMs = Date.now() + (START_COUNTDOWN_SECONDS * 1000);
  state.recording.countdownLastShown = START_COUNTDOWN_SECONDS;
  startCountdownTicker();
  updateRecordingMetrics();

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      const point = positionToPoint(position);
      const widthMeters = getCurrentRecordingWidthMeters();
      const tooInaccurate = Number.isFinite(point.accuracy) && point.accuracy > widthMeters;

      if (el.recordAccuracy) {
        el.recordAccuracy.textContent = point.accuracy != null ? `${point.accuracy.toFixed(1)} m` : '-';
      }

      if (state.recording.paused) {
        state.recording.pausedIgnoredCount += 1;
        setStatus(el.recordStatus, `Pausad... ignorerar punkt (${state.recording.pausedIgnoredCount}).`);
        return;
      }

      const countdownRemainingMs = state.recording.countdownUntilMs - Date.now();
      if (countdownRemainingMs > 0) {
        return;
      }
      if (state.recording.countdownUntilMs > 0) {
        state.recording.countdownUntilMs = 0;
        state.recording.countdownLastShown = 0;
        setStatus(el.recordStatus, 'Spårning aktiv. Nu loggas punkter.');
      }

      if (tooInaccurate) {
        state.recording.rejectedCount += 1;
        setStatus(el.recordStatus, `Ignorerad punkt (accuracy ${point.accuracy.toFixed(1)} m > bredd ${widthMeters.toFixed(1)} m).`);
        return;
      }

      state.recording.points.push(point);
      updateRecordingMetrics();
      setStatus(el.recordStatus, `Spelar in... ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}. Ignorerade: ${state.recording.rejectedCount}`);
    },
    (error) => {
      setStatus(el.recordStatus, `Kunde inte läsa GPS: ${error.message}`, true);
      stopRecording(false);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000
    }
  );

  state.recording.watchId = watchId;
  startRecordingLoopAudio();
  updateRecordButtonUi();
  setStatus(el.recordStatus, `Startar inspelning om ${START_COUNTDOWN_SECONDS}...`);
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
  stopRecordingLoopAudio();
  updateRecordButtonUi();
}

async function saveCurrentRun() {
  const target = selectedTarget();
  const widthMeters = Number(el.recordWidthInput.value || getDefaultWidthForTarget(target));

  if (!target) {
    setStatus(el.recordStatus, `Välj ${targetTypeLabel(state.ui.targetType)} innan du spelar in.`, true);
    return;
  }
  if (state.recording.points.length < 2) {
    setStatus(el.recordStatus, 'För få punkter. Testa längre inspelning.', true);
    return;
  }

  const track = pointsToFeatureCollection(state.recording.points);
  const payload = target.type === 'back'
    ? { backNummer: target.value, widthMeters, track }
    : { liftUid: target.value, widthMeters, track };
  const action = target.type === 'back' ? 'saveBackRun' : 'saveLiftRun';

  const res = await apiPost(action, payload);

  state.lastSavedRun = {
    runId: String(res?.run?.runId || ''),
    targetKey: target.selectValue,
    targetType: target.type,
    backNummer: target.type === 'back' ? target.value : null,
    liftUid: target.type === 'lift' ? target.value : null
  };
  updateDeleteLatestBtnUi();

  setStatus(el.recordStatus, `${targetLabel(target)} sparad.`);
}

async function stopRecording(saveRun = true) {
  stopWatchOnly();
  if (!saveRun) return;

  try {
    await saveCurrentRun();
    await loadData();
    refreshMap({ fit: true });
  } catch (err) {
    setStatus(el.recordStatus, `Kunde inte spara run: ${err.message}`, true);
  }
}

async function deleteLatestRun() {
  if (!state.lastSavedRun) return;

  const runId = String(state.lastSavedRun.runId || '');
  if (!runId) return;

  const isBack = state.lastSavedRun.targetType === 'back';
  const target = isBack
    ? { type: 'back', value: Number(state.lastSavedRun.backNummer || 0) }
    : { type: 'lift', value: String(state.lastSavedRun.liftUid || '') };

  if ((isBack && !target.value) || (!isBack && !target.value)) return;

  const label = targetLabel(target);
  if (!window.confirm(`Ta bort senaste inspelning (${label})?`)) return;

  try {
    if (isBack) {
      await apiPost('deleteBackRun', { backNummer: target.value, runId });
    } else {
      await apiPost('deleteLiftRun', { liftUid: target.value, runId });
    }
    state.lastSavedRun = null;
    updateDeleteLatestBtnUi();
    await loadData();
    refreshMap({ fit: true });
    setStatus(el.recordStatus, `Senaste inspelning borttagen för ${label}.`);
  } catch (err) {
    setStatus(el.recordStatus, `Kunde inte ta bort senaste inspelning: ${err.message}`, true);
  }
}

async function loadData() {
  const [backarRes, liftarRes, backDefsRes, liftDefsRes, backRunsRes, liftRunsRes] = await Promise.all([
    apiGet('backar'),
    apiGet('liftar'),
    apiGet('backDefs'),
    apiGet('liftDefs'),
    apiGet('backRuns', { geojson: 1 }),
    apiGet('liftRuns', { geojson: 1 })
  ]);

  state.backar = Array.isArray(backarRes.backar) ? backarRes.backar : [];
  state.liftar = Array.isArray(liftarRes.liftar) ? liftarRes.liftar : [];
  state.backDefs = backDefsRes.backDefs || { type: 'FeatureCollection', features: [] };
  state.liftDefs = liftDefsRes.liftDefs || { type: 'FeatureCollection', features: [] };
  state.backRunsGeoJson = backRunsRes.runsGeoJson || { type: 'FeatureCollection', features: [] };
  state.liftRunsGeoJson = liftRunsRes.runsGeoJson || { type: 'FeatureCollection', features: [] };

  renderTargetSelect({ clearSelection: false });
}

async function init() {
  loadSoundPreference();
  updateTargetTypeSwitchUi();
  updateRecordButtonUi();
  updateSoundButtonUi();
  updateRecordingMetrics();
  updateDeleteLatestBtnUi();

  try {
    await loadData();
    refreshMap({ fit: true });
    setStatus(el.recordStatus, 'Redo att spela in.');
  } catch (err) {
    setStatus(el.recordStatus, `Kunde inte ladda data: ${err.message}`, true);
  }

  el.recordToggleBtn?.addEventListener('click', async () => {
    if (state.recording.watchId === null) {
      startRecording();
      return;
    }
    await stopRecording(true);
  });

  el.recordPauseBtn?.addEventListener('click', togglePauseRecording);
  el.recordSoundBtn?.addEventListener('click', toggleRecordingSound);
  el.saveTrackBtn?.addEventListener('click', saveRecordedTrackFile);
  el.deleteLatestBtn?.addEventListener('click', deleteLatestRun);
  el.recordTypeBackBtn?.addEventListener('click', () => setTargetType('back'));
  el.recordTypeLiftBtn?.addEventListener('click', () => setTargetType('lift'));
  el.recordBackSelect?.addEventListener('change', syncRecordingWidthToSelectedTarget);
}

init();
