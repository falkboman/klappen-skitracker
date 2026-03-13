const apiBase = 'api.php';

const state = {
  backar: [],
  liftar: [],
  backDefs: { type: 'FeatureCollection', features: [] },
  liftDefs: { type: 'FeatureCollection', features: [] },
  replay: {
    trackGeoJson: null,
    trackFileName: null,
    savedTracks: [],
    result: null,
    selectedSegmentIndex: null,
    routeEntries: []
  },
  map: {
    inited: false,
    map: null,
    defsLayer: null,
    segmentsLayer: null,
    runLayer: null,
    focusLayer: null,
    markersLayer: null
  }
};

const el = {
  trackInput: document.getElementById('trackInput'),
  savedTrackSelect: document.getElementById('savedTrackSelect'),
  reloadTracksBtn: document.getElementById('reloadTracksBtn'),
  loadSavedBtn: document.getElementById('loadSavedBtn'),
  loadLatestBtn: document.getElementById('loadLatestBtn'),
  classifyBtn: document.getElementById('classifyBtn'),
  trackStatus: document.getElementById('trackStatus'),
  trackName: document.getElementById('trackName'),
  trackPointCount: document.getElementById('trackPointCount'),
  classifiedPointCount: document.getElementById('classifiedPointCount'),

  mapStatus: document.getElementById('mapStatus'),
  runsMap: document.getElementById('runsMap'),

  descentStat: document.getElementById('descentStat'),
  liftStat: document.getElementById('liftStat'),
  unknownStat: document.getElementById('unknownStat'),
  avgConfidenceStat: document.getElementById('avgConfidenceStat'),
  guessesText: document.getElementById('guessesText'),
  segmentsList: document.getElementById('segmentsList'),
  pointRows: document.getElementById('pointRows')
};

function setStatus(node, message, isError = false) {
  if (!node) return;
  node.textContent = message;
  node.style.color = isError ? '#9f1239' : '#4b6278';
}

async function apiGetWithParams(action, params = {}) {
  const url = new URL(apiBase, window.location.href);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API error (${res.status})`);
  return data;
}

async function apiGet(action) {
  return apiGetWithParams(action, {});
}

async function apiPost(action, payload) {
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

function backColorHex(backe) {
  const key = normalizeColorName(backe?.farg);
  const palette = {
    gron: '#22c55e',
    bla: '#3b82f6',
    rod: '#ef4444',
    svart: '#111827'
  };
  return palette[key] || '#64748b';
}

function pointsFromGeoJson(trackGeoJson) {
  if (trackGeoJson?.type !== 'FeatureCollection' || !Array.isArray(trackGeoJson.features)) return [];

  const points = [];
  trackGeoJson.features.forEach((feature) => {
    const geometry = feature?.geometry;
    const properties = feature?.properties || {};
    if (!geometry || typeof geometry !== 'object') return;

    if (geometry.type === 'Point' && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2) {
      points.push({
        lon: Number(geometry.coordinates[0]),
        lat: Number(geometry.coordinates[1]),
        timestamp: properties.timestamp ?? null,
        accuracy: properties.accuracy ?? null,
        speed: properties.speed ?? null,
        heading: properties.heading ?? null,
        altitude: properties.altitude ?? null
      });
      return;
    }

    if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) {
      geometry.coordinates.forEach((coord, idx) => {
        if (!Array.isArray(coord) || coord.length < 2) return;
        points.push({
          lon: Number(coord[0]),
          lat: Number(coord[1]),
          timestamp: Array.isArray(properties.timestamps) ? properties.timestamps[idx] || null : null,
          accuracy: null,
          speed: null,
          heading: null,
          altitude: Array.isArray(properties.altitudes) ? properties.altitudes[idx] || null : null
        });
      });
    }
  });

  return points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

function classificationPoints() {
  return Array.isArray(state.replay.result?.points) ? state.replay.result.points : [];
}

function classificationSegments() {
  return Array.isArray(state.replay.result?.segments) ? state.replay.result.segments : [];
}

function segmentByIndex(index) {
  const segments = classificationSegments();
  if (!Number.isInteger(index) || index < 0 || index >= segments.length) return null;
  return segments[index];
}

function colorForSegmentType(segmentType) {
  if (segmentType === 'descent') return '#16a34a';
  if (segmentType === 'lift') return '#0284c7';
  if (segmentType === 'idle') return '#f59e0b';
  return '#ef4444';
}

function segmentLabel(seg) {
  if (!seg) return 'Unknown';

  if (seg.matchedKind === 'back' && Number.isFinite(Number(seg.backNummer))) {
    const nr = Number(seg.backNummer);
    const back = backByNummer(nr);
    return `Backe #${nr}${back?.namn ? ` ${back.namn}` : ''}`;
  }

  if (seg.matchedKind === 'lift') {
    const liftId = seg.liftId || seg.liftUid || 'lift';
    const liftName = seg.liftUid ? liftByUid(seg.liftUid)?.namn || '' : '';
    return `Lift ${liftId}${liftName ? ` ${liftName}` : ''}`;
  }

  if (seg.segmentType === 'idle') return 'Idle';
  if (seg.segmentType === 'unknown') return 'Unknown';
  return seg.segmentType || 'Unknown';
}

function buildRunLatLngs() {
  const points = classificationPoints();
  if (points.length >= 2) {
    return points
      .filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)))
      .map((p) => [Number(p.lat), Number(p.lon)]);
  }

  return pointsFromGeoJson(state.replay.trackGeoJson).map((p) => [p.lat, p.lon]);
}

function latLngsForSegment(seg) {
  if (!seg) return [];
  return latLngsForPointRange(Number(seg.startIndex || 0), Number(seg.endIndex || 0));
}

function latLngsForPointRange(startIndex, endIndex) {
  const points = classificationPoints();
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

function setTrack(trackGeoJson, label) {
  const points = pointsFromGeoJson(trackGeoJson);
  if (points.length < 2) {
    throw new Error('Spårfilen måste innehålla minst 2 giltiga punkter.');
  }

  state.replay.trackGeoJson = trackGeoJson;
  state.replay.trackFileName = label || null;
  state.replay.result = null;
  state.replay.selectedSegmentIndex = null;

  if (el.classifyBtn) el.classifyBtn.disabled = false;
  if (el.trackName) el.trackName.textContent = label || '(uppladdad fil)';
  if (el.trackPointCount) el.trackPointCount.textContent = String(points.length);
  if (el.classifiedPointCount) el.classifiedPointCount.textContent = '-';

  renderAnalysis(null);
  refreshMap({ fit: true });
}

function renderSavedTracksSelect() {
  if (!el.savedTrackSelect) return;
  const tracks = Array.isArray(state.replay.savedTracks) ? state.replay.savedTracks : [];
  if (tracks.length === 0) {
    el.savedTrackSelect.innerHTML = '<option value="">Inga sparade filer</option>';
    return;
  }

  const options = tracks
    .map((item) => {
      const file = String(item.file || '');
      const updatedAt = item.updatedAt ? new Date(item.updatedAt).toLocaleString('sv-SE') : '-';
      return `<option value="${escapeHtml(file)}">${escapeHtml(file)} (${escapeHtml(updatedAt)})</option>`;
    })
    .join('');
  el.savedTrackSelect.innerHTML = options;
}

async function loadSavedTracksList() {
  const res = await apiGet('tracks');
  state.replay.savedTracks = Array.isArray(res.tracks) ? res.tracks : [];
  renderSavedTracksSelect();
}

async function loadSavedTrackFile(fileName) {
  if (!fileName) {
    setStatus(el.trackStatus, 'Välj en sparad spårfil först.', true);
    return;
  }

  const res = await apiGetWithParams('trackFile', { file: fileName });
  setTrack(res.track, fileName);
  setStatus(el.trackStatus, `Spår laddat: ${fileName}`);
}

async function parseGeoJsonFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (parsed?.type !== 'FeatureCollection') {
    throw new Error('Spårfilen måste vara en GeoJSON FeatureCollection.');
  }
  return parsed;
}

function initMapIfNeeded() {
  if (state.map.inited) return;
  if (!window.L || !el.runsMap) {
    setStatus(el.mapStatus, 'Leaflet kunde inte laddas.', true);
    return;
  }

  const map = window.L.map(el.runsMap, {
    center: [61.03, 13.36],
    zoom: 13,
    zoomControl: true
  });

  map.createPane('defsPane');
  map.getPane('defsPane').style.zIndex = 350;
  map.createPane('segmentsPane');
  map.getPane('segmentsPane').style.zIndex = 520;
  map.createPane('runTopPane');
  map.getPane('runTopPane').style.zIndex = 650;
  map.createPane('focusPane');
  map.getPane('focusPane').style.zIndex = 720;
  map.createPane('markersPane');
  map.getPane('markersPane').style.zIndex = 780;

  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  state.map.map = map;
  state.map.defsLayer = window.L.geoJSON([], {});
  state.map.segmentsLayer = window.L.layerGroup([]);
  state.map.runLayer = window.L.layerGroup([]);
  state.map.focusLayer = window.L.layerGroup([]);
  state.map.markersLayer = window.L.layerGroup([]);
  state.map.inited = true;
}

function clearMapLayers() {
  if (!state.map.inited || !state.map.map) return;
  const map = state.map.map;
  if (state.map.defsLayer) map.removeLayer(state.map.defsLayer);
  if (state.map.segmentsLayer) map.removeLayer(state.map.segmentsLayer);
  if (state.map.runLayer) map.removeLayer(state.map.runLayer);
  if (state.map.focusLayer) map.removeLayer(state.map.focusLayer);
  if (state.map.markersLayer) map.removeLayer(state.map.markersLayer);
}

function refreshMap({ fit = false } = {}) {
  initMapIfNeeded();
  if (!state.map.inited || !state.map.map) return;

  clearMapLayers();

  const defsGeoJson = {
    type: 'FeatureCollection',
    features: [
      ...(Array.isArray(state.backDefs.features) ? state.backDefs.features : []),
      ...(Array.isArray(state.liftDefs.features) ? state.liftDefs.features : [])
    ]
  };

  state.map.defsLayer = window.L.geoJSON(defsGeoJson, {
    pane: 'defsPane',
    style: (feature) => {
      const isLift = String(feature?.properties?.liftUid || '').trim() !== '';
      if (isLift) {
        return { color: '#94a3b8', weight: 4, opacity: 0.62, dashArray: '8 6' };
      }
      return { color: '#64748b', weight: 4, opacity: 0.62 };
    }
  });

  const segments = classificationSegments();
  const segmentLines = [];
  segments.forEach((seg, index) => {
    const latLngs = latLngsForSegment(seg);
    if (latLngs.length < 2) return;

    const line = window.L.polyline(latLngs, {
      pane: 'segmentsPane',
      color: colorForSegmentType(seg.segmentType),
      weight: 4,
      opacity: 0.75,
      lineCap: 'round'
    });

    line.on('click', () => {
      selectSegment(index, { fit: true, scroll: true });
    });

    segmentLines.push(line);
  });
  state.map.segmentsLayer = window.L.layerGroup(segmentLines);

  const runLatLngs = buildRunLatLngs();
  const runLayers = [];
  if (runLatLngs.length >= 2) {
    runLayers.push(
      window.L.polyline(runLatLngs, {
        pane: 'runTopPane',
        color: '#ffffff',
        weight: 10,
        opacity: 0.95,
        lineCap: 'round'
      })
    );
    runLayers.push(
      window.L.polyline(runLatLngs, {
        pane: 'runTopPane',
        color: '#d97706',
        weight: 6,
        opacity: 1,
        lineCap: 'round'
      })
    );
  }
  state.map.runLayer = window.L.layerGroup(runLayers);

  state.map.focusLayer = window.L.layerGroup([]);
  state.map.markersLayer = window.L.layerGroup([]);

  state.map.defsLayer.addTo(state.map.map);
  state.map.segmentsLayer.addTo(state.map.map);
  state.map.runLayer.addTo(state.map.map);
  state.map.focusLayer.addTo(state.map.map);
  state.map.markersLayer.addTo(state.map.map);

  renderSelectedSegmentOnMap({ fit });

  const bounds = window.L.latLngBounds([]);
  const defsBounds = state.map.defsLayer.getBounds();
  if (defsBounds.isValid()) bounds.extend(defsBounds);
  if (runLatLngs.length >= 2) {
    bounds.extend(window.L.polyline(runLatLngs).getBounds());
  }

  const defsCount = defsGeoJson.features.length;
  const classifiedCount = classificationPoints().length;
  const statusText = classifiedCount > 0
    ? `Karta: ${defsCount} linjer + run överst. Välj segment till höger för fokus.`
    : `Karta: ${defsCount} linjer + valt run överst.`;
  setStatus(el.mapStatus, statusText);

  if (fit && state.replay.selectedSegmentIndex === null && bounds.isValid()) {
    state.map.map.fitBounds(bounds.pad(0.08));
  }
}

function makeIndexMarker(text) {
  return window.L.divIcon({
    className: '',
    html: `<div class="map-marker-pill">${escapeHtml(text)}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

function focusRangeOnMap(startIndex, endIndex, { fit = false } = {}) {
  if (!state.map.inited || !state.map.map) return;

  state.map.focusLayer.clearLayers();
  state.map.markersLayer.clearLayers();

  const latLngs = latLngsForPointRange(startIndex, endIndex);
  if (latLngs.length < 2) return;

  const selected = segmentByIndex(state.replay.selectedSegmentIndex);

  const color = colorForSegmentType(selected?.segmentType || 'unknown');

  const halo = window.L.polyline(latLngs, {
    pane: 'focusPane',
    color: '#ffffff',
    weight: 13,
    opacity: 0.95,
    lineCap: 'round'
  });
  const core = window.L.polyline(latLngs, {
    pane: 'focusPane',
    color,
    weight: 8,
    opacity: 1,
    lineCap: 'round'
  });

  const startLatLng = latLngs[0];
  const endLatLng = latLngs[latLngs.length - 1];

  const startDot = window.L.circleMarker(startLatLng, {
    pane: 'markersPane',
    radius: 7,
    color: '#ffffff',
    weight: 2,
    fillColor: color,
    fillOpacity: 1
  });
  const endDot = window.L.circleMarker(endLatLng, {
    pane: 'markersPane',
    radius: 7,
    color: '#ffffff',
    weight: 2,
    fillColor: color,
    fillOpacity: 1
  });

  const startLabel = window.L.marker(startLatLng, { pane: 'markersPane', icon: makeIndexMarker(`S${startIndex}`) });
  const endLabel = window.L.marker(endLatLng, { pane: 'markersPane', icon: makeIndexMarker(`E${endIndex}`) });

  state.map.focusLayer.addLayer(halo);
  state.map.focusLayer.addLayer(core);
  state.map.markersLayer.addLayer(startDot);
  state.map.markersLayer.addLayer(endDot);
  state.map.markersLayer.addLayer(startLabel);
  state.map.markersLayer.addLayer(endLabel);

  if (fit) {
    const b = halo.getBounds();
    if (b.isValid()) {
      state.map.map.fitBounds(b.pad(0.35));
    }
  }
}

function renderSelectedSegmentOnMap({ fit = false } = {}) {
  const selected = segmentByIndex(state.replay.selectedSegmentIndex);
  if (!selected) {
    if (state.map.inited && state.map.focusLayer && state.map.markersLayer) {
      state.map.focusLayer.clearLayers();
      state.map.markersLayer.clearLayers();
    }
    return;
  }
  focusRangeOnMap(Number(selected.startIndex || 0), Number(selected.endIndex || 0), { fit });
}

function renderAnalysis(result) {
  const points = Array.isArray(result?.points) ? result.points : [];
  const segments = Array.isArray(result?.segments) ? result.segments : [];

  if (points.length === 0) {
    if (el.descentStat) el.descentStat.textContent = '-';
    if (el.liftStat) el.liftStat.textContent = '-';
    if (el.unknownStat) el.unknownStat.textContent = '-';
    if (el.avgConfidenceStat) el.avgConfidenceStat.textContent = '-';
    if (el.guessesText) el.guessesText.innerHTML = '<p class="status">Klassificera spåret för att se scriptets gissningar.</p>';
    if (el.segmentsList) el.segmentsList.innerHTML = '<div class="point-item">Inga segment ännu.</div>';
    if (el.pointRows) el.pointRows.innerHTML = '<div class="point-item">Ingen punktklassning ännu.</div>';
    if (el.classifiedPointCount) el.classifiedPointCount.textContent = '-';
    return;
  }

  const descent = points.filter((p) => p.segmentType === 'descent');
  const lift = points.filter((p) => p.segmentType === 'lift');
  const unknown = points.length - descent.length - lift.length;
  const confidenceValues = points.map((p) => Number(p.confidence)).filter((n) => Number.isFinite(n));
  const avgConfidence = confidenceValues.length > 0
    ? confidenceValues.reduce((sum, n) => sum + n, 0) / confidenceValues.length
    : null;

  if (el.classifiedPointCount) el.classifiedPointCount.textContent = String(points.length);
  if (el.descentStat) el.descentStat.textContent = `${descent.length} (${Math.round((descent.length / points.length) * 100)}%)`;
  if (el.liftStat) el.liftStat.textContent = `${lift.length} (${Math.round((lift.length / points.length) * 100)}%)`;
  if (el.unknownStat) el.unknownStat.textContent = `${unknown} (${Math.round((unknown / points.length) * 100)}%)`;
  if (el.avgConfidenceStat) el.avgConfidenceStat.textContent = avgConfidence == null ? '-' : avgConfidence.toFixed(3);

  const backStats = new Map();
  const liftStats = new Map();
  const reasonCounts = new Map();

  points.forEach((p, pointIndex) => {
    if (p.matchedKind === 'back' && Number.isFinite(Number(p.backNummer))) {
      const nr = Number(p.backNummer);
      if (!backStats.has(nr)) {
        backStats.set(nr, { count: 0, firstIndex: pointIndex });
      }
      const entry = backStats.get(nr);
      entry.count += 1;
      if (pointIndex < entry.firstIndex) entry.firstIndex = pointIndex;
    }
    if (p.matchedKind === 'lift' && String(p.liftId || '').trim()) {
      const id = String(p.liftId).trim();
      if (!liftStats.has(id)) {
        liftStats.set(id, { count: 0, names: new Map(), firstIndex: pointIndex });
      }
      const entry = liftStats.get(id);
      entry.count += 1;
      if (pointIndex < entry.firstIndex) entry.firstIndex = pointIndex;
      const liftNameFromUid = p.liftUid ? (liftByUid(p.liftUid)?.namn || '') : '';
      const liftName = liftNameFromUid || String(p.namn || '').trim();
      if (liftName) {
        entry.names.set(liftName, (entry.names.get(liftName) || 0) + 1);
      }
    }
    if (String(p.reason || '').trim()) {
      const reason = String(p.reason).trim();
      reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    }
  });

  const backEntries = Array.from(backStats.entries())
    .sort((a, b) => a[1].firstIndex - b[1].firstIndex)
    .map(([nr, stats]) => ({
      nr,
      count: stats.count,
      firstIndex: stats.firstIndex,
      backe: backByNummer(nr)
    }));

  const liftEntries = Array.from(liftStats.entries())
    .sort((a, b) => a[1].firstIndex - b[1].firstIndex)
    .map(([id, stats]) => {
      const names = Array.from(stats.names.entries()).sort((a, b) => b[1] - a[1]);
      const bestName = names[0]?.[0] || '';
      return { id, count: stats.count, name: bestName, firstIndex: stats.firstIndex };
    });

  const routeEntries = [];
  segments.forEach((seg, segIndex) => {
    if (!seg || (seg.matchedKind !== 'back' && seg.matchedKind !== 'lift')) return;

    let kind = '';
    let key = '';
    let label = '';
    let color = '#64748b';

    if (seg.matchedKind === 'back' && Number.isFinite(Number(seg.backNummer))) {
      const nr = Number(seg.backNummer);
      const backe = backByNummer(nr);
      kind = 'back';
      key = `back:${nr}`;
      label = `Backe #${nr}${backe?.namn ? ` ${backe.namn}` : ''}`;
      color = backColorHex(backe);
    } else if (seg.matchedKind === 'lift') {
      const liftId = String(seg.liftId || seg.liftUid || '').trim();
      if (!liftId) return;
      const liftName = seg.liftUid ? liftByUid(seg.liftUid)?.namn || '' : '';
      kind = 'lift';
      key = `lift:${liftId}`;
      label = `Lift ${liftId}${liftName ? ` ${liftName}` : ''}`;
    } else {
      return;
    }

    const segmentCount = Number.isFinite(Number(seg.count))
      ? Number(seg.count)
      : Math.max(0, Number(seg.endIndex || 0) - Number(seg.startIndex || 0) + 1);
    const previous = routeEntries[routeEntries.length - 1];
    if (previous && previous.key === key) {
      previous.count += segmentCount;
      previous.endIndex = Number(seg.endIndex || previous.endIndex);
      previous.endSegmentIndex = segIndex;
      return;
    }

    routeEntries.push({
      key,
      kind,
      label,
      color,
      count: segmentCount,
      startIndex: Number(seg.startIndex || 0),
      endIndex: Number(seg.endIndex || 0),
      startSegmentIndex: segIndex,
      endSegmentIndex: segIndex
    });
  });
  state.replay.routeEntries = routeEntries;

  const reasonEntries = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  const backListHtml = backEntries.length === 0
    ? '<li class="summary-item">Inga tydliga backträffar</li>'
    : backEntries
      .map((entry) => {
        const label = `#${entry.nr}${entry.backe?.namn ? ` ${entry.backe.namn}` : ''}`;
        const color = backColorHex(entry.backe);
        return `<li class="summary-item"><span class="summary-symbol back" style="background:${color};"></span><span>${escapeHtml(label)} (${entry.count})</span></li>`;
      })
      .join('');

  const liftListHtml = liftEntries.length === 0
    ? '<li class="summary-item">Inga tydliga liftträffar</li>'
    : liftEntries
      .map((entry) => {
        const label = `${entry.id}${entry.name ? ` ${entry.name}` : ''}`;
        return `<li class="summary-item"><span class="summary-symbol lift"></span><span>${escapeHtml(label)} (${entry.count})</span></li>`;
      })
      .join('');

  const reasonListHtml = reasonEntries.length === 0
    ? '<li class="summary-item">Inga unknown-skäl</li>'
    : reasonEntries
      .map((entry) => `<li class="summary-item"><span class="summary-symbol reason"></span><span>${escapeHtml(entry.reason)} (${entry.count})</span></li>`)
      .join('');

  const routeListHtml = routeEntries.length === 0
    ? '<li class="summary-item">Ingen tydlig rutt ännu.</li>'
    : routeEntries
      .map((entry, index) => {
        const symbol = entry.kind === 'back'
          ? `<span class="summary-symbol back" style="background:${entry.color};"></span>`
          : '<span class="summary-symbol lift"></span>';
        return `<li><button type="button" class="route-item-btn" data-route-index="${index}"><span class="route-index">${index + 1}.</span>${symbol}<span>${escapeHtml(entry.label)} (${entry.count})</span></button></li>`;
      })
      .join('');

  el.guessesText.innerHTML = `
    <section class="summary-block">
      <h3 class="summary-title">Rutt i tidsordning</h3>
      <ul class="summary-list">${routeListHtml}</ul>
    </section>
    <section class="summary-block">
      <h3 class="summary-title">Åkta Backar</h3>
      <ul class="summary-list">${backListHtml}</ul>
    </section>
    <section class="summary-block">
      <h3 class="summary-title">Åkta Liftar</h3>
      <ul class="summary-list">${liftListHtml}</ul>
    </section>
    <section class="summary-block">
      <h3 class="summary-title">Unknown-skäl</h3>
      <ul class="summary-list">${reasonListHtml}</ul>
    </section>
  `;

  el.segmentsList.innerHTML = segments.length === 0
    ? '<div class="point-item">Inga segment hittades.</div>'
    : segments
      .map((seg, index) => {
        const selectedClass = state.replay.selectedSegmentIndex === index ? ' is-selected' : '';
        const label = segmentLabel(seg);
        const color = colorForSegmentType(seg.segmentType);
        return `<button type="button" class="segment-item${selectedClass}" data-segment-index="${index}" style="border-left: 5px solid ${color};">${escapeHtml(label)} | typ ${escapeHtml(seg.segmentType || 'unknown')} | punkt ${seg.startIndex}-${seg.endIndex} | antal ${seg.count}</button>`;
      })
      .join('');

  const maxRows = 240;
  const visibleRows = points.slice(0, maxRows);
  const rows = visibleRows
    .map((p) => {
      const confidence = Number.isFinite(Number(p.confidence)) ? Number(p.confidence).toFixed(3) : '-';
      const distance = Number.isFinite(Number(p.distanceMeters)) ? `${Number(p.distanceMeters).toFixed(1)} m` : '-';
      const speed = Number.isFinite(Number(p.speedMps)) ? `${Number(p.speedMps).toFixed(2)} m/s` : '-';
      return `<div class="point-item">#${p.index} | ${escapeHtml(p.segmentType || 'unknown')} | conf ${confidence} | dist ${distance} | speed ${speed} | reason ${escapeHtml(p.reason || '-')}</div>`;
    })
    .join('');

  const hidden = points.length - visibleRows.length;
  const tail = hidden > 0 ? `<div class="point-item">... ${hidden} fler punkter dolda.</div>` : '';
  el.pointRows.innerHTML = rows + tail;
}

function selectSegment(index, { fit = true, scroll = true } = {}) {
  const seg = segmentByIndex(index);
  state.replay.selectedSegmentIndex = seg ? index : null;
  renderAnalysis(state.replay.result);
  renderSelectedSegmentOnMap({ fit });

  if (scroll && state.replay.selectedSegmentIndex !== null) {
    const node = el.segmentsList?.querySelector(`[data-segment-index="${state.replay.selectedSegmentIndex}"]`);
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function selectRouteEntry(routeIndex) {
  const entry = Array.isArray(state.replay.routeEntries) ? state.replay.routeEntries[routeIndex] : null;
  if (!entry) return;

  state.replay.selectedSegmentIndex = Number.isInteger(entry.startSegmentIndex) ? entry.startSegmentIndex : null;
  renderAnalysis(state.replay.result);
  focusRangeOnMap(Number(entry.startIndex || 0), Number(entry.endIndex || 0), { fit: true });

  const node = el.guessesText?.querySelector(`[data-route-index="${routeIndex}"]`);
  node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

async function classifyCurrentTrack() {
  if (!state.replay.trackGeoJson) {
    setStatus(el.trackStatus, 'Ladda en spårfil först.', true);
    return;
  }

  try {
    const res = await apiPost('classifyTrack', { track: state.replay.trackGeoJson });
    state.replay.result = res;
    state.replay.selectedSegmentIndex = (Array.isArray(res.segments) && res.segments.length > 0) ? 0 : null;
    renderAnalysis(res);
    refreshMap({ fit: true });
    setStatus(el.trackStatus, `Klassning klar: ${res.points.length} punkter, ${res.segments.length} segment.`);
  } catch (err) {
    setStatus(el.trackStatus, `Klassning misslyckades: ${err.message}`, true);
  }
}

async function loadBaseData() {
  const [backarRes, liftarRes, backDefsRes, liftDefsRes] = await Promise.all([
    apiGet('backar'),
    apiGet('liftar'),
    apiGet('backDefs'),
    apiGet('liftDefs')
  ]);

  state.backar = Array.isArray(backarRes.backar) ? backarRes.backar : [];
  state.liftar = Array.isArray(liftarRes.liftar) ? liftarRes.liftar : [];
  state.backDefs = backDefsRes.backDefs || { type: 'FeatureCollection', features: [] };
  state.liftDefs = liftDefsRes.liftDefs || { type: 'FeatureCollection', features: [] };
}

async function init() {
  renderAnalysis(null);

  try {
    await loadBaseData();
    await loadSavedTracksList();
    refreshMap({ fit: true });
    setStatus(el.trackStatus, 'Redo: ladda ett run och kör klassificering.');
  } catch (err) {
    setStatus(el.trackStatus, `Init misslyckades: ${err.message}`, true);
  }

  el.reloadTracksBtn?.addEventListener('click', async () => {
    try {
      await loadSavedTracksList();
      setStatus(el.trackStatus, 'Lista med sparade spår uppdaterad.');
    } catch (err) {
      setStatus(el.trackStatus, `Kunde inte hämta listan: ${err.message}`, true);
    }
  });

  el.loadSavedBtn?.addEventListener('click', async () => {
    try {
      await loadSavedTrackFile(el.savedTrackSelect?.value || '');
    } catch (err) {
      setStatus(el.trackStatus, `Kunde inte ladda fil: ${err.message}`, true);
    }
  });

  el.loadLatestBtn?.addEventListener('click', async () => {
    try {
      if (!Array.isArray(state.replay.savedTracks) || state.replay.savedTracks.length === 0) {
        await loadSavedTracksList();
      }
      const latest = state.replay.savedTracks[0] || null;
      if (!latest?.file) {
        setStatus(el.trackStatus, 'Inga sparade spårfiler hittades.', true);
        return;
      }
      if (el.savedTrackSelect) el.savedTrackSelect.value = String(latest.file);
      await loadSavedTrackFile(String(latest.file));
    } catch (err) {
      setStatus(el.trackStatus, `Kunde inte ladda senaste fil: ${err.message}`, true);
    }
  });

  el.trackInput?.addEventListener('change', async () => {
    const file = el.trackInput.files?.[0] || null;
    if (!file) return;

    try {
      const track = await parseGeoJsonFile(file);
      setTrack(track, file.name);
      setStatus(el.trackStatus, `Spår laddat: ${file.name}`);
    } catch (err) {
      state.replay.trackGeoJson = null;
      state.replay.trackFileName = null;
      state.replay.result = null;
      state.replay.selectedSegmentIndex = null;
      if (el.classifyBtn) el.classifyBtn.disabled = true;
      if (el.trackName) el.trackName.textContent = '-';
      if (el.trackPointCount) el.trackPointCount.textContent = '-';
      if (el.classifiedPointCount) el.classifiedPointCount.textContent = '-';
      renderAnalysis(null);
      refreshMap();
      setStatus(el.trackStatus, `Ogiltig spårfil: ${err.message}`, true);
    }
    el.trackInput.value = '';
  });

  el.classifyBtn?.addEventListener('click', classifyCurrentTrack);

  el.segmentsList?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-segment-index]');
    if (!btn) return;
    const index = Number(btn.getAttribute('data-segment-index'));
    if (!Number.isInteger(index)) return;
    selectSegment(index, { fit: true, scroll: false });
  });

  el.guessesText?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-route-index]');
    if (!btn) return;
    const routeIndex = Number(btn.getAttribute('data-route-index'));
    if (!Number.isInteger(routeIndex)) return;
    selectRouteEntry(routeIndex);
  });
}

init();
