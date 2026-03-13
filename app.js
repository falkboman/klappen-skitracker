const ALL_PERSONS_VALUE = '__all_persons__';
const MAP_IMAGE_WIDTH = 1140;
const MAP_IMAGE_HEIGHT = 620;
const MAP_VIEW_SCALE_STORAGE_KEY = 'klappen.mapView.scale';
const CURRENT_GROUP_CODE_STORAGE_KEY = 'klappen.currentGroupCode';
const LATEST_RECORDED_ROUTE_STORAGE_KEY = 'klappen.latestRecordedRoute';

const state = {
  group: null,
  persons: [],
  backar: [],
  rides: [],
  stats: null,
  backZones: [],
  recordedRoute: {
    active: false,
    payload: null,
    lastAppliedBackNums: [],
    suppressManualPrompt: false
  }
};

const mapView = {
  open: false,
  scale: 1,
  minScale: 0.35,
  maxScale: 5,
  tx: 0,
  ty: 0,
  dragging: false,
  dragMoved: false,
  dragStartX: 0,
  dragStartY: 0,
  startTx: 0,
  startTy: 0,
  viewportWidth: 0,
  viewportHeight: 0,
  savedScale: loadSavedMapScale(),
  inited: false,
  adminMode: 'place'
};

const mapSelection = {
  pendingBackNums: new Set()
};

const createGroupDraft = {
  persons: []
};

const editGroupDraft = {
  persons: []
};

const isAdminMode = new URLSearchParams(window.location.search).has('adminZones');
const isFromGpsReturn = new URLSearchParams(window.location.search).has('fromGps');

const el = {
  personInput: document.getElementById('personInput'),
  backInput: document.getElementById('backInput'),
  recordedRouteSelectWrap: document.getElementById('recordedRouteSelectWrap'),
  recordedRouteBadge: document.getElementById('recordedRouteBadge'),
  recordedRouteBadgeText: document.getElementById('recordedRouteBadgeText'),
  recordedRouteClearBtn: document.getElementById('recordedRouteClearBtn'),
  dateInput: document.getElementById('dateInput'),
  rideForm: document.getElementById('rideForm'),
  statusMsg: document.getElementById('statusMsg'),
  starsBoard: document.getElementById('starsBoard'),
  personStats: document.getElementById('personStats'),
  totalStats: document.getElementById('totalStats'),
  backarList: document.getElementById('backarList'),
  overviewTabBtn: document.getElementById('overviewTabBtn'),
  backarTabBtn: document.getElementById('backarTabBtn'),
  overviewPanel: document.getElementById('overviewPanel'),
  backarPanel: document.getElementById('backarPanel'),
  openGroupSwitcherBtn: document.getElementById('openGroupSwitcherBtn'),
  groupBadgeName: document.getElementById('groupBadgeName'),
  groupBadgeCode: document.getElementById('groupBadgeCode'),
  groupModal: document.getElementById('groupModal'),
  groupModalCloseBtn: document.getElementById('groupModalCloseBtn'),
  openGroupWelcomeBtn: document.getElementById('openGroupWelcomeBtn'),
  groupEditSection: document.getElementById('groupEditSection'),
  groupEditCodeBadge: document.getElementById('groupEditCodeBadge'),
  groupEditHint: document.getElementById('groupEditHint'),
  groupEditStatus: document.getElementById('groupEditStatus'),
  groupWelcomeModal: document.getElementById('groupWelcomeModal'),
  groupWelcomeCloseBtn: document.getElementById('groupWelcomeCloseBtn'),
  welcomeShowJoinBtn: document.getElementById('welcomeShowJoinBtn'),
  welcomeShowCreateBtn: document.getElementById('welcomeShowCreateBtn'),
  welcomeJoinPanel: document.getElementById('welcomeJoinPanel'),
  welcomeCreatePanel: document.getElementById('welcomeCreatePanel'),
  groupWelcomeStatus: document.getElementById('groupWelcomeStatus'),
  editGroupPersonInput: document.getElementById('editGroupPersonInput'),
  addEditGroupPersonBtn: document.getElementById('addEditGroupPersonBtn'),
  editGroupPersonsList: document.getElementById('editGroupPersonsList'),
  saveEditGroupPersonsBtn: document.getElementById('saveEditGroupPersonsBtn'),
  joinGroupCodeInput: document.getElementById('joinGroupCodeInput'),
  joinGroupBtn: document.getElementById('joinGroupBtn'),
  createGroupNameInput: document.getElementById('createGroupNameInput'),
  createGroupPersonInput: document.getElementById('createGroupPersonInput'),
  addCreateGroupPersonBtn: document.getElementById('addCreateGroupPersonBtn'),
  createGroupPersonsList: document.getElementById('createGroupPersonsList'),
  createGroupBtn: document.getElementById('createGroupBtn'),
  renameGroupNameInput: document.getElementById('renameGroupNameInput'),
  renameGroupBtn: document.getElementById('renameGroupBtn'),
  filterColor: document.getElementById('filterColor'),
  sortBy: document.getElementById('sortBy'),
  rideStatus: document.getElementById('rideStatus'),
  statusPerson: document.getElementById('statusPerson'),
  openMapBtn: document.getElementById('openMapBtn'),
  saveRideBtn: document.getElementById('saveRideBtn'),
  saveRideBtnIcon: document.getElementById('saveRideBtnIcon'),
  saveRideBtnLabel: document.getElementById('saveRideBtnLabel'),
  mapModal: document.getElementById('mapModal'),
  closeMapBtn: document.getElementById('closeMapBtn'),
  mapZoomOutBtn: document.getElementById('mapZoomOutBtn'),
  mapZoomInBtn: document.getElementById('mapZoomInBtn'),
  mapDoneBtn: document.getElementById('mapDoneBtn'),
  mapSelectedPreview: document.getElementById('mapSelectedPreview'),
  mapViewport: document.getElementById('mapViewport'),
  mapStage: document.getElementById('mapStage'),
  mapImage: document.getElementById('mapImage'),
  mapMarkers: document.getElementById('mapMarkers'),
  mapEmptyState: document.getElementById('mapEmptyState'),
  adminZonePanel: document.getElementById('adminZonePanel'),
  adminBackSelect: document.getElementById('adminBackSelect'),
  adminModeToggleBtn: document.getElementById('adminModeToggleBtn'),
  adminRemoveZoneBtn: document.getElementById('adminRemoveZoneBtn'),
  adminSaveZonesBtn: document.getElementById('adminSaveZonesBtn'),
  adminExportZonesBtn: document.getElementById('adminExportZonesBtn'),
  adminZoneStatus: document.getElementById('adminZoneStatus')
};

let saveRideResetTimer = null;

const selectState = {
  personSelect: null,
  backSelect: null,
  filterColorSelect: null,
  sortBySelect: null,
  rideStatusSelect: null,
  statusPersonSelect: null
};

const difficultyBadgeClass = {
  grön: 'bg-green-50 border-green-300 text-green-800',
  blå: 'bg-blue-50 border-blue-300 text-blue-800',
  röd: 'bg-red-50 border-red-300 text-red-800',
  svart: 'bg-slate-100 border-slate-400 text-slate-900'
};

function getGroupPersons() {
  return Array.isArray(state.persons) ? state.persons : [];
}

function hasActiveGroup() {
  return Boolean(state.group?.code);
}

function getDifficultyLabel(color) {
  const labels = {
    grön: 'Grön',
    blå: 'Blå',
    röd: 'Röd',
    svart: 'Svart'
  };
  return labels[color] || color;
}

function getDifficultyShapeSymbol(color) {
  switch (color) {
    case 'grön':
      return '●';
    case 'blå':
      return '■';
    case 'svart':
      return '◆';
    case 'röd':
      return '▬';
    default:
      return '•';
  }
}

function getDifficultyShapeMarkup(color) {
  switch (color) {
    case 'grön':
      return '<span aria-hidden="true" class="inline-block h-3 w-3 rounded-full bg-green-600 border border-green-700"></span>';
    case 'blå':
      return '<span aria-hidden="true" class="inline-block h-3 w-3 bg-blue-600 border border-blue-700"></span>';
    case 'svart':
      return '<span aria-hidden="true" class="inline-block h-3 w-3 rotate-45 bg-slate-800 border border-slate-900"></span>';
    case 'röd':
      return '<span aria-hidden="true" class="inline-block h-2.5 w-4 bg-red-600 border border-red-700 rounded-[2px]"></span>';
    default:
      return '<span aria-hidden="true" class="inline-block h-3 w-3 rounded-full bg-slate-500 border border-slate-600"></span>';
  }
}

function formatRidesByColorWithSymbols(ridesByColor) {
  const symbolColorClass = {
    grön: 'text-green-700',
    blå: 'text-blue-700',
    röd: 'text-red-700',
    svart: 'text-slate-900'
  };

  return ['grön', 'blå', 'röd', 'svart']
    .map((color) => {
      const symbol = getDifficultyShapeSymbol(color);
      const colorClass = symbolColorClass[color] || 'text-slate-700';
      const count = ridesByColor[color] ?? 0;
      return `<span class="inline-flex items-center gap-1"><span class="${colorClass} font-bold" aria-hidden="true">${symbol}</span><span>${count}</span></span>`;
    })
    .join(', ');
}

function getPersonCoverageByColor(person) {
  const totalsByColor = { grön: 0, blå: 0, röd: 0, svart: 0 };
  const riddenByColor = { grön: 0, blå: 0, röd: 0, svart: 0 };

  const riddenBackNums = new Set(
    state.rides
      .filter((ride) => String(ride.person || '') === String(person))
      .map((ride) => Number(ride.backNummer))
      .filter((backNummer) => Number.isFinite(backNummer))
  );

  let riddenBackar = 0;

  state.backar.forEach((backe) => {
    const color = String(backe.farg || '').toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(totalsByColor, color)) return;

    totalsByColor[color]++;
    if (riddenBackNums.has(Number(backe.nummer))) {
      riddenByColor[color]++;
      riddenBackar++;
    }
  });

  return {
    totalsByColor,
    riddenByColor,
    totalBackar: state.backar.length,
    riddenBackar
  };
}

function getPersonFavoriteBackProgress(person) {
  const TARGET_RIDES = 10;
  const ridesByBack = new Map();

  state.rides.forEach((ride) => {
    if (String(ride.person || '') !== String(person)) return;
    const backNummer = Number(ride.backNummer);
    if (!Number.isFinite(backNummer)) return;
    ridesByBack.set(backNummer, (ridesByBack.get(backNummer) || 0) + 1);
  });

  let favoriteBackNummer = null;
  let favoriteCount = 0;
  ridesByBack.forEach((count, backNummer) => {
    if (count > favoriteCount || (count === favoriteCount && (favoriteBackNummer === null || backNummer < favoriteBackNummer))) {
      favoriteBackNummer = backNummer;
      favoriteCount = count;
    }
  });

  const favoriteBack = favoriteBackNummer !== null ? findBackByNummer(favoriteBackNummer) : null;
  const favoriteName = favoriteBack ? `${favoriteBack.namn}` : '-';
  const progressPercent = Math.max(0, Math.min(100, Math.round((favoriteCount / TARGET_RIDES) * 100)));

  return {
    target: TARGET_RIDES,
    count: favoriteCount,
    name: favoriteName,
    progressPercent
  };
}

function getPersonColorSummaryMarkup({ ridesByColor, totalRides, coverage }) {
  const meterBgClassByColor = {
    grön: 'bg-green-100',
    blå: 'bg-blue-100',
    röd: 'bg-red-100',
    svart: 'bg-slate-300'
  };
  const meterFillClassByColor = {
    grön: 'bg-green-600',
    blå: 'bg-blue-600',
    röd: 'bg-red-600',
    svart: 'bg-slate-800'
  };
  return ['grön', 'blå', 'röd', 'svart']
    .map((color) => {
      const riddenUnique = Number(coverage?.riddenByColor?.[color] || 0);
      const totalUnique = Number(coverage?.totalsByColor?.[color] || 0);
      const coveragePercent = totalUnique > 0 ? Math.round((riddenUnique / totalUnique) * 100) : 0;
      const isDone = totalUnique > 0 && riddenUnique >= totalUnique;
      const meterBgClass = meterBgClassByColor[color] || 'bg-slate-100';
      const meterFillClass = meterFillClassByColor[color] || 'bg-slate-600';
      return `
        <div class="border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
          <div class="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700">
            <div class="inline-flex items-center gap-1.5">
              ${getDifficultyShapeMarkup(color)}
              <span>${getDifficultyLabel(color)}</span>
            </div>
            <span class="inline-flex items-center gap-1.5">
              <span>${riddenUnique}/${totalUnique}</span>
              ${isDone ? '<span aria-label="Klar">★</span>' : ''}
            </span>
          </div>
          <div class="mt-1.5 h-2 w-full rounded-full ${meterBgClass} overflow-hidden">
            <div class="h-full rounded-full ${meterFillClass}" style="width: ${coveragePercent}%;"></div>
          </div>
        </div>
      `;
    })
    .join('');
}

function getSortIconMarkup(value) {
  switch (value) {
    case 'nummer':
      return '<i class="fa-solid fa-hashtag w-4 text-center" aria-hidden="true"></i>';
    case 'namn':
      return '<i class="fa-solid fa-arrow-down-a-z w-4 text-center" aria-hidden="true"></i>';
    case 'langd':
      return '<i class="fa-solid fa-ruler-horizontal w-4 text-center" aria-hidden="true"></i>';
    case 'ak_total':
      return '<i class="fa-solid fa-chart-column w-4 text-center" aria-hidden="true"></i>';
    case 'ak_idag':
      return '<i class="fa-regular fa-calendar-check w-4 text-center" aria-hidden="true"></i>';
    default:
      return '<i class="fa-solid fa-list w-4 text-center" aria-hidden="true"></i>';
  }
}

function getRideStatusIconMarkup(value) {
  switch (value) {
    case 'all':
      return '<i class="fa-solid fa-layer-group w-4 text-center" aria-hidden="true"></i>';
    case 'ridden':
      return '<i class="fa-solid fa-check w-4 text-center" aria-hidden="true"></i>';
    case 'unridden':
      return '<i class="fa-regular fa-circle w-4 text-center" aria-hidden="true"></i>';
    case 'unridden_today':
      return '<i class="fa-regular fa-calendar-xmark w-4 text-center" aria-hidden="true"></i>';
    default:
      return '<i class="fa-solid fa-filter w-4 text-center" aria-hidden="true"></i>';
  }
}

function formatAchievementLabel(key) {
  const labels = {
    alla_backar: 'Alla backar',
    alla_grona: 'Alla gröna',
    alla_bla: 'Alla blå',
    alla_roda: 'Alla röda',
    alla_svarta: 'Alla svarta',
    tio_i_samma_backe: '10x i samma backe'
  };
  return labels[key] || key;
}

function formatTeamAchievementLabel(key) {
  const labels = {
    snitt_35_backar_per_person_dag: '>35 åk per person på en dag',
    snitt_5_samma_backe_per_person_dag: '>=5 åk i samma backe per person på en dag',
    tolv_mil_samma_dag: 'Åka 4 mil per person samma dag (20 mil för 5 personer)',
    alla_backar_samma_dag: 'Alla backar i gruppen på samma dag'
  };
  return labels[key] || key;
}

function getDefaultTotalsStats() {
  return {
    totalRides: 0,
    totalDistanceMeter: 0,
    ridesByColor: {
      grön: 0,
      blå: 0,
      röd: 0,
      svart: 0
    },
    activeDaysCount: 0,
    personsCount: getGroupPersons().length,
    avgRidesPerPersonPerActiveDay: 0,
    avgSameBackPerPersonPerActiveDay: 0,
    teamAchievements: {
      snitt_35_backar_per_person_dag: false,
      snitt_5_samma_backe_per_person_dag: false,
      tolv_mil_samma_dag: false,
      alla_backar_samma_dag: false
    },
    teamStars: 0,
    teamProgressBestDay: {
      maxRidesPerPersonSingleDay: 0,
      maxSameBackPerPersonSingleDay: 0,
      maxDistanceSingleDayMeter: 0,
      maxUniqueBackarSingleDay: 0,
      targetRidesPerPersonSingleDay: 35,
      targetSameBackPerPersonSingleDay: 5,
      targetDistanceSingleDayMeter: getGroupPersons().length * 40000,
      targetUniqueBackarSingleDay: 0
    }
  };
}

function getTotalsStatsForView() {
  const defaults = getDefaultTotalsStats();
  const raw = state.stats?.totals || {};
  return {
    ...defaults,
    ...raw,
    ridesByColor: {
      ...defaults.ridesByColor,
      ...(raw.ridesByColor || {})
    },
    teamAchievements: {
      ...defaults.teamAchievements,
      ...(raw.teamAchievements || {})
    },
    teamProgressBestDay: {
      ...defaults.teamProgressBestDay,
      ...(raw.teamProgressBestDay || {})
    }
  };
}

function getTotalsStatsForDate(dateStr) {
  const totals = {
    totalRides: 0,
    totalDistanceMeter: 0,
    ridesByColor: {
      grön: 0,
      blå: 0,
      röd: 0,
      svart: 0
    }
  };

  if (!dateStr) return totals;

  const backByNumber = new Map(state.backar.map((backe) => [Number(backe.nummer), backe]));
  for (const ride of state.rides) {
    if (String(ride.datum || '') !== dateStr) continue;
    const backNummer = Number(ride.backNummer);
    const backe = backByNumber.get(backNummer);
    if (!backe) continue;

    totals.totalRides++;
    totals.totalDistanceMeter += Math.max(0, Number(backe.langdMeter || 0));

    const color = String(backe.farg || '').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(totals.ridesByColor, color)) {
      totals.ridesByColor[color]++;
    }
  }

  return totals;
}

function getUniqueBackarCountForDate(dateStr = '') {
  const uniqueBackar = new Set();

  for (const ride of state.rides) {
    if (dateStr && String(ride.datum || '') !== dateStr) continue;
    const backNummer = Number(ride.backNummer);
    if (!Number.isFinite(backNummer)) continue;
    uniqueBackar.add(backNummer);
  }

  return uniqueBackar.size;
}

function getTeamProgressForDate(dateStr) {
  const defaults = getDefaultTotalsStats().teamProgressBestDay;
  const progress = {
    ridesPerPersonSingleDay: 0,
    sameBackPerPersonSingleDay: 0,
    distanceSingleDayMeter: 0,
    uniqueBackarSingleDay: 0,
    targetRidesPerPersonSingleDay: defaults.targetRidesPerPersonSingleDay,
    targetSameBackPerPersonSingleDay: defaults.targetSameBackPerPersonSingleDay,
    targetDistanceSingleDayMeter: defaults.targetDistanceSingleDayMeter,
    targetUniqueBackarSingleDay: defaults.targetUniqueBackarSingleDay
  };

  if (!dateStr) return progress;

  const personsCount = Math.max(1, getGroupPersons().length);
  progress.targetDistanceSingleDayMeter = personsCount * 40000;
  progress.targetUniqueBackarSingleDay = state.backar.length;

  const totalRidesForDay = state.rides.filter((ride) => String(ride.datum || '') === dateStr).length;
  progress.ridesPerPersonSingleDay = Math.round((totalRidesForDay / personsCount) * 100) / 100;

  const ridesByBack = {};
  const uniqueBackNumbers = new Set();
  for (const ride of state.rides) {
    if (String(ride.datum || '') !== dateStr) continue;

    const backNummer = Number(ride.backNummer);
    if (!Number.isFinite(backNummer)) continue;

    ridesByBack[backNummer] = (ridesByBack[backNummer] || 0) + 1;
    uniqueBackNumbers.add(backNummer);
  }

  const maxSameBackCount = Math.max(0, ...Object.values(ridesByBack));
  progress.sameBackPerPersonSingleDay = Math.round((maxSameBackCount / personsCount) * 100) / 100;
  progress.uniqueBackarSingleDay = uniqueBackNumbers.size;

  const backByNumber = new Map(state.backar.map((backe) => [Number(backe.nummer), backe]));
  for (const ride of state.rides) {
    if (String(ride.datum || '') !== dateStr) continue;
    const backNummer = Number(ride.backNummer);
    const backe = backByNumber.get(backNummer);
    if (!backe) continue;
    progress.distanceSingleDayMeter += Math.max(0, Number(backe.langdMeter || 0));
  }

  return progress;
}

function clampToPercent(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

function getGoalGaugeMarkup({
  label,
  currentValue,
  bestValue,
  targetValue,
  todayDisplay,
  bestDisplay,
  targetDisplay,
  comparator = 'gte'
}) {
  const current = Number(currentValue || 0);
  const best = Number(bestValue || 0);
  const target = Math.max(0, Number(targetValue || 0));
  const reachedWith = Math.max(current, best);
  const isReached = comparator === 'gt' ? reachedWith > target : reachedWith >= target;
  const progressSource = isReached ? reachedWith : current;
  const progress = target > 0 ? (progressSource / target) * 100 : 0;
  const progressPercent = clampToPercent(progress);
  const todayLabel = todayDisplay ?? String(currentValue);
  const bestLabel = bestDisplay ?? String(bestValue);
  const targetLabel = targetDisplay ?? String(targetValue);

  return `
    <div class="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
      <div class="flex items-center justify-between gap-2">
        <p class="text-sm font-semibold text-slate-800">${label}</p>
        ${isReached ? '<span class="text-sm text-slate-700" aria-label="Klar">★</span>' : ''}
      </div>
      <p class="mt-1 text-xs text-slate-600">Idag <strong>${todayLabel}</strong> · Som bäst <strong>${bestLabel}</strong></p>
      <p class="mt-0.5 text-xs text-slate-500">Mål: ${targetLabel}</p>
      <div class="mt-2 h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
        <div class="h-full rounded-full ${isReached ? 'bg-slate-700' : 'bg-klappen-mid'}" style="width: ${progressPercent}%;"></div>
      </div>
    </div>`;
}

function formatMetersAsKm(distanceMeter) {
  const km = Number(distanceMeter || 0) / 1000;
  return `${km.toFixed(1)} km`;
}

function formatMetersAsMil(distanceMeter) {
  const mil = Number(distanceMeter || 0) / 10000;
  return `${mil.toFixed(1).replace('.', ',')} mil`;
}

function getDefaultPersonStats() {
  return {
    totalRides: 0,
    unikaBackar: 0,
    ridesByColor: {
      grön: 0,
      blå: 0,
      röd: 0,
      svart: 0
    },
    achievements: {
      alla_backar: false,
      alla_grona: false,
      alla_bla: false,
      alla_roda: false,
      alla_svarta: false,
      tio_i_samma_backe: false
    },
    stjarnor: 0
  };
}

function getPersonStatsForView(person) {
  const defaults = getDefaultPersonStats();
  const raw = state.stats?.persons?.[person] || {};
  return {
    ...defaults,
    ...raw,
    ridesByColor: {
      ...defaults.ridesByColor,
      ...(raw.ridesByColor || {})
    },
    achievements: {
      ...defaults.achievements,
      ...(raw.achievements || {})
    }
  };
}

function getPersonTotalDistanceMeter(person) {
  return state.rides.reduce((sum, ride) => {
    if (String(ride.person || '') !== String(person)) return sum;
    const backe = findBackByNummer(ride.backNummer);
    return sum + Math.max(0, Number(backe?.langdMeter || 0));
  }, 0);
}

async function apiGet(action, params = {}) {
  const url = new URL('api.php', window.location.href);
  url.searchParams.set('action', action);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });

  const res = await fetch(url.toString());
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `API GET ${action} failed`);
  return json;
}

async function apiPost(action, payload = {}) {
  const url = new URL('api.php', window.location.href);
  url.searchParams.set('action', action);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `API POST ${action} failed`);
  return json;
}

function getSavedGroupCode() {
  try {
    return String(window.localStorage.getItem(CURRENT_GROUP_CODE_STORAGE_KEY) || '').trim().toUpperCase();
  } catch {
    return '';
  }
}

function saveGroupCode(code) {
  try {
    window.localStorage.setItem(CURRENT_GROUP_CODE_STORAGE_KEY, String(code || '').toUpperCase());
  } catch {
    // Ignore storage failures.
  }
}

function clearSavedGroupCode() {
  try {
    window.localStorage.removeItem(CURRENT_GROUP_CODE_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function setGroupEditStatus(message, ok = true) {
  if (!el.groupEditStatus) return;
  el.groupEditStatus.textContent = message;
  el.groupEditStatus.className = `text-sm ${ok ? 'text-green-700' : 'text-red-700'}`;
}

function setGroupWelcomeStatus(message, ok = true) {
  if (!el.groupWelcomeStatus) return;
  el.groupWelcomeStatus.textContent = message;
  el.groupWelcomeStatus.className = `text-sm ${ok ? 'text-green-700' : 'text-red-700'}`;
}

function updateGroupBadge() {
  if (!el.groupBadgeName || !el.groupBadgeCode) return;
  if (!hasActiveGroup()) {
    el.groupBadgeName.textContent = 'Välj sällskap';
    el.groupBadgeCode.textContent = '------';
    return;
  }

  el.groupBadgeName.textContent = state.group.name || 'Sällskap';
  el.groupBadgeCode.textContent = state.group.code || '------';
}

function refreshGroupModalSections() {
  const active = hasActiveGroup();

  if (el.groupEditSection) {
    el.groupEditSection.classList.toggle('hidden', !active);
  }

  if (el.renameGroupBtn) {
    el.renameGroupBtn.disabled = !active;
    el.renameGroupBtn.classList.toggle('opacity-60', !active);
    el.renameGroupBtn.classList.toggle('cursor-not-allowed', !active);
  }

  if (el.groupEditCodeBadge) {
    el.groupEditCodeBadge.textContent = active ? state.group.code : '------';
  }

  if (el.groupEditHint) {
    el.groupEditHint.textContent = active
      ? `Aktivt sällskap: ${state.group.name}`
      : 'Välj först ett sällskap för att kunna redigera.';
  }

  [el.editGroupPersonInput, el.addEditGroupPersonBtn, el.saveEditGroupPersonsBtn].forEach((node) => {
    if (!node) return;
    node.disabled = !active;
    node.classList.toggle('opacity-60', !active);
    node.classList.toggle('cursor-not-allowed', !active);
  });
}

function setRideFormEnabled(enabled) {
  if (!el.rideForm) return;
  const fields = el.rideForm.querySelectorAll('input, select, button');
  fields.forEach((field) => {
    if (field.id === 'openGroupSwitcherBtn') return;
    field.disabled = !enabled;
  });
}

function openGroupModal() {
  if (!el.groupModal || !hasActiveGroup()) return;
  if (el.groupWelcomeModal) {
    el.groupWelcomeModal.classList.add('hidden');
  }
  el.groupModal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
  if (el.renameGroupNameInput) {
    el.renameGroupNameInput.value = state.group?.name || '';
  }
  seedEditGroupDraftFromState();
  refreshGroupModalSections();
  setGroupEditStatus('');
}

function closeGroupModal() {
  if (!el.groupModal) return;
  el.groupModal.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
  setGroupEditStatus('');
}

function showWelcomePanel(mode) {
  const showCreate = mode === 'create';
  if (el.welcomeCreatePanel) {
    el.welcomeCreatePanel.classList.toggle('hidden', !showCreate);
  }
  if (el.welcomeJoinPanel) {
    el.welcomeJoinPanel.classList.toggle('hidden', showCreate);
  }
}

function openGroupWelcomeModal(mode = 'join') {
  if (!el.groupWelcomeModal) return;
  if (el.groupModal) {
    el.groupModal.classList.add('hidden');
  }
  el.groupWelcomeModal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');

  if (el.groupWelcomeCloseBtn) {
    el.groupWelcomeCloseBtn.classList.toggle('hidden', !hasActiveGroup());
  }

  if (el.joinGroupCodeInput) {
    el.joinGroupCodeInput.value = state.group?.code || '';
  }

  renderCreateGroupPersonsList();
  showWelcomePanel(mode);
  setGroupWelcomeStatus('');
}

function closeGroupWelcomeModal() {
  if (!el.groupWelcomeModal || !hasActiveGroup()) return;
  el.groupWelcomeModal.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
  setGroupWelcomeStatus('');
}

function normalizePersonNameInput(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function renderCreateGroupPersonsList() {
  if (!el.createGroupPersonsList) return;

  if (!createGroupDraft.persons.length) {
    el.createGroupPersonsList.innerHTML = '<p class="text-xs text-slate-500">Inga personer tillagda ännu.</p>';
    return;
  }

  el.createGroupPersonsList.innerHTML = createGroupDraft.persons
    .map(
      (person) => `
        <span class="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900">
          <i class="fa-solid fa-user" aria-hidden="true"></i>
          <span>${escapeHtml(person)}</span>
          <button type="button" class="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-400 bg-white text-emerald-700 hover:bg-emerald-50" data-remove-create-person="${escapeHtml(person)}" aria-label="Ta bort ${escapeHtml(person)}" title="Ta bort">
            <i class="fa-solid fa-xmark text-[10px]" aria-hidden="true"></i>
          </button>
        </span>
      `
    )
    .join('');
}

function addDraftPerson() {
  const normalized = normalizePersonNameInput(el.createGroupPersonInput?.value || '');
  if (!normalized) {
    setGroupWelcomeStatus('Skriv ett namn innan du lägger till.', false);
    return;
  }

  if (normalized.length > 40) {
    setGroupWelcomeStatus('Namn får vara max 40 tecken.', false);
    return;
  }

  if (createGroupDraft.persons.includes(normalized)) {
    setGroupWelcomeStatus('Personen finns redan i listan.', false);
    return;
  }

  createGroupDraft.persons.push(normalized);
  if (el.createGroupPersonInput) {
    el.createGroupPersonInput.value = '';
    el.createGroupPersonInput.focus();
  }
  setGroupWelcomeStatus('');
  renderCreateGroupPersonsList();
}

function removeDraftPerson(person) {
  createGroupDraft.persons = createGroupDraft.persons.filter((item) => item !== person);
  renderCreateGroupPersonsList();
}

function resetCreateGroupDraft() {
  createGroupDraft.persons = [];
  if (el.createGroupPersonInput) {
    el.createGroupPersonInput.value = '';
  }
  renderCreateGroupPersonsList();
}

function renderEditGroupPersonsList() {
  if (!el.editGroupPersonsList) return;

  if (!editGroupDraft.persons.length) {
    el.editGroupPersonsList.innerHTML = '<p class="text-xs text-slate-500">Inga personer i sällskapet ännu.</p>';
    return;
  }

  el.editGroupPersonsList.innerHTML = editGroupDraft.persons
    .map(
      (person) => `
        <span class="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-100 px-2.5 py-1 text-xs font-semibold text-klappen-dark">
          <i class="fa-solid fa-user" aria-hidden="true"></i>
          <span>${escapeHtml(person)}</span>
          <button type="button" class="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-blue-400 bg-white text-klappen-dark hover:bg-blue-50" data-remove-edit-person="${escapeHtml(person)}" aria-label="Ta bort ${escapeHtml(person)}" title="Ta bort">
            <i class="fa-solid fa-xmark text-[10px]" aria-hidden="true"></i>
          </button>
        </span>
      `
    )
    .join('');
}

function seedEditGroupDraftFromState() {
  editGroupDraft.persons = [...(state.group?.persons || [])];
  if (el.editGroupPersonInput) {
    el.editGroupPersonInput.value = '';
  }
  renderEditGroupPersonsList();
}

function addEditDraftPerson() {
  const normalized = normalizePersonNameInput(el.editGroupPersonInput?.value || '');
  if (!normalized) {
    setGroupEditStatus('Skriv ett namn innan du lägger till.', false);
    return;
  }
  if (normalized.length > 40) {
    setGroupEditStatus('Namn får vara max 40 tecken.', false);
    return;
  }
  if (editGroupDraft.persons.includes(normalized)) {
    setGroupEditStatus('Personen finns redan i sällskapet.', false);
    return;
  }

  editGroupDraft.persons.push(normalized);
  if (el.editGroupPersonInput) {
    el.editGroupPersonInput.value = '';
    el.editGroupPersonInput.focus();
  }
  setGroupEditStatus('');
  renderEditGroupPersonsList();
}

function removeEditDraftPerson(person) {
  editGroupDraft.persons = editGroupDraft.persons.filter((item) => item !== person);
  renderEditGroupPersonsList();
}

async function activateGroupByCode(code, { closeModalOnSuccess = true } = {}) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(normalized)) {
    throw new Error('Ange en giltig kod med 6 tecken.');
  }

  const groupRes = await apiGet('group', { code: normalized });
  const group = groupRes.group;
  if (!group) {
    throw new Error('Sällskap kunde inte laddas.');
  }

  state.group = group;
  state.persons = Array.isArray(group.persons) ? group.persons : [];
  saveGroupCode(group.code);
  updateGroupBadge();
  seedEditGroupDraftFromState();
  refreshGroupModalSections();

  await loadAllData();
  setRideFormEnabled(true);
  if (closeModalOnSuccess) {
    closeGroupWelcomeModal();
    closeGroupModal();
  }
}

function setStatus(message, ok = true) {
  el.statusMsg.textContent = message;
  el.statusMsg.className = `text-sm mt-3 ${ok ? 'text-green-700' : 'text-red-700'}`;
}

function waitMs(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function triggerSaveSnowConfetti() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const confettiFn = window.confetti;
  if (typeof confettiFn !== 'function') return;

  const snowShape =
    typeof confettiFn.shapeFromText === 'function' ? confettiFn.shapeFromText({ text: '❄', scalar: 1 }) : null;
  const shapes = snowShape ? [snowShape] : ['circle'];

  const buttonRect = el.saveRideBtn?.getBoundingClientRect?.();
  const defaultOrigin = { x: 0.5, y: 0.8 };
  const origin = buttonRect
    ? {
        x: (buttonRect.left + buttonRect.width / 2) / window.innerWidth,
        y: Math.max(0, (buttonRect.top + buttonRect.height * 0.15) / window.innerHeight)
      }
    : defaultOrigin;

  const fire = (particleCount, spread, startVelocity, drift = 0, scalar = 1.2) => {
    confettiFn({
      particleCount,
      spread,
      startVelocity,
      scalar,
      gravity: 0.82,
      ticks: 240,
      drift,
      colors: ['#103D69', '#1E4F80', '#2E6EA8', '#4F8FC3'],
      origin,
      shapes
    });
  };

  fire(70, 48, 45, -0.2, 1.25);
  fire(50, 70, 38, 0.15, 1.1);
  window.setTimeout(() => fire(40, 85, 34, 0, 1.05), 120);
}

function setSaveRideButtonState(stateName) {
  if (!el.saveRideBtn || !el.saveRideBtnIcon || !el.saveRideBtnLabel) return;
  const baseClassName =
    'rounded-xl text-white font-semibold py-3 transition inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-80';
  const idleLabel = state.recordedRoute.active ? 'Spara GPS-rutt' : 'Spara åk';

  if (stateName === 'loading') {
    el.saveRideBtn.className = `${baseClassName} bg-klappen-mid`;
    el.saveRideBtn.disabled = true;
    el.saveRideBtnIcon.className = 'fa-solid fa-circle-notch fa-spin';
    el.saveRideBtnLabel.textContent = 'Sparar...';
    return;
  }

  if (stateName === 'saved') {
    el.saveRideBtn.className = `${baseClassName} bg-emerald-600`;
    el.saveRideBtn.disabled = true;
    el.saveRideBtnIcon.className = 'fa-solid fa-check';
    el.saveRideBtnLabel.textContent = 'Sparad';
    triggerSaveSnowConfetti();
    return;
  }

  const idleAccentClass = state.recordedRoute.active
    ? 'gps-save-pulse'
    : 'bg-klappen-mid hover:bg-klappen-dark';
  el.saveRideBtn.className = `${baseClassName} ${idleAccentClass}`;
  el.saveRideBtn.disabled = false;
  el.saveRideBtnIcon.className = 'fa-solid fa-person-skiing';
  el.saveRideBtnLabel.textContent = idleLabel;
}

function setAdminStatus(message, ok = true) {
  if (!isAdminMode) return;
  el.adminZoneStatus.textContent = message;
  el.adminZoneStatus.className = `mt-2 text-xs ${ok ? 'text-amber-900' : 'text-red-700'}`;
}

function getSelectedPersons() {
  const selected = selectState.personSelect
    ? selectState.personSelect.items.map((value) => String(value))
    : Array.from(el.personInput.selectedOptions).map((option) => option.value);

  if (selected.includes(ALL_PERSONS_VALUE)) {
    return [...getGroupPersons()];
  }

  return selected.filter((person) => getGroupPersons().includes(person));
}

function selectDefaultPersonOption() {
  const defaultIndex = el.personInput.options.length > 1 ? 1 : 0;
  if (defaultIndex >= 0 && el.personInput.options[defaultIndex]) {
    el.personInput.options[defaultIndex].selected = true;
  }
}

function getSelectedBackNumbers() {
  if (selectState.backSelect) {
    return selectState.backSelect.items.map((value) => Number(value)).filter((n) => Number.isFinite(n));
  }
  return Array.from(el.backInput.selectedOptions).map((option) => Number(option.value)).filter((n) => Number.isFinite(n));
}

function setSelectedBackNumbers(backNums) {
  const selected = new Set(backNums.map((n) => Number(n)));
  if (selectState.backSelect) {
    const values = Array.from(selected).map((n) => String(n));
    selectState.backSelect.setValue(values, true);
    return;
  }
  Array.from(el.backInput.options).forEach((option) => {
    option.selected = selected.has(Number(option.value));
  });
}

function setSelectedBackNumbersSilently(backNums) {
  state.recordedRoute.suppressManualPrompt = true;
  setSelectedBackNumbers(backNums);
  window.setTimeout(() => {
    state.recordedRoute.suppressManualPrompt = false;
  }, 0);
}

function readLatestRecordedRouteFromStorage() {
  try {
    const raw = window.localStorage.getItem(LATEST_RECORDED_ROUTE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const source = String(parsed.source || '').trim();
    if (source !== 'gps') return null;

    const backNummerList = Array.isArray(parsed.backNummerList)
      ? parsed.backNummerList
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n > 0)
      : [];

    const backNummerListUnique = Array.isArray(parsed.backNummerListUnique)
      ? parsed.backNummerListUnique
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n > 0)
      : [];

    const effectiveBackList = backNummerList.length > 0 ? backNummerList : backNummerListUnique;
    if (effectiveBackList.length === 0) return null;

    const backSegmentCount = Number(parsed.backSegmentCount);
    const routeEntries = Array.isArray(parsed.routeEntries) ? parsed.routeEntries : [];
    const trackMeta = parsed.trackMeta && typeof parsed.trackMeta === 'object' ? parsed.trackMeta : {};

    return {
      createdAt: String(parsed.createdAt || ''),
      source: 'gps',
      backSegmentCount: Number.isFinite(backSegmentCount) && backSegmentCount > 0 ? Math.round(backSegmentCount) : effectiveBackList.length,
      backNummerList: effectiveBackList,
      backNummerListUnique: Array.from(new Set(effectiveBackList)),
      routeEntries,
      trackMeta
    };
  } catch {
    return null;
  }
}

function clearLatestRecordedRouteStorage() {
  try {
    window.localStorage.removeItem(LATEST_RECORDED_ROUTE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function updateRecordedRouteLockUi() {
  const active = Boolean(state.recordedRoute.active && state.recordedRoute.payload);

  el.recordedRouteSelectWrap?.classList.toggle('is-locked', active);

  if (selectState.backSelect) {
    if (active) {
      selectState.backSelect.disable();
    } else {
      selectState.backSelect.enable();
    }
  } else if (el.backInput) {
    el.backInput.disabled = active;
  }

  if (el.openMapBtn) {
    el.openMapBtn.disabled = active;
    el.openMapBtn.classList.toggle('opacity-60', active);
    el.openMapBtn.classList.toggle('cursor-not-allowed', active);
    el.openMapBtn.title = active ? 'GPS-rutt aktiv. Spara hela rutten i ett steg.' : '';
  }
}

function updateRecordedRouteBadgeUi() {
  if (!el.recordedRouteBadge || !el.recordedRouteBadgeText) return;
  if (!state.recordedRoute.active || !state.recordedRoute.payload) {
    el.recordedRouteBadge.classList.add('hidden');
    updateRecordedRouteLockUi();
    setSaveRideButtonState('idle');
    return;
  }

  const payload = state.recordedRoute.payload;
  const backSegments = Number(payload.backSegmentCount || 0);
  el.recordedRouteBadgeText.textContent = `Inspelad rutt (${backSegments} backar)`;
  el.recordedRouteBadge.classList.remove('hidden');
  updateRecordedRouteLockUi();
  setSaveRideButtonState('idle');
}

function deactivateRecordedRoute({ clearStorage = false } = {}) {
  state.recordedRoute.active = false;
  state.recordedRoute.payload = null;
  state.recordedRoute.lastAppliedBackNums = [];
  if (clearStorage) {
    clearLatestRecordedRouteStorage();
  }
  updateRecordedRouteBadgeUi();
}

function confirmLeavingRecordedRoute() {
  return window.confirm('Du lämnar inspelad rutt och går över till manuellt val. Fortsätt?');
}

function clearRecordedRouteSelection() {
  if (!state.recordedRoute.active) return;
  if (!confirmLeavingRecordedRoute()) return;

  deactivateRecordedRoute({ clearStorage: true });
  setSelectedBackNumbersSilently([]);
  mapSelection.pendingBackNums.clear();
  setStatus('Inspelad GPS-rutt borttagen.', false);
}

function setDashboardTab(tabName) {
  const showOverview = tabName !== 'backar';

  el.overviewPanel?.toggleAttribute('hidden', !showOverview);
  el.backarPanel?.toggleAttribute('hidden', showOverview);

  if (el.overviewTabBtn) {
    el.overviewTabBtn.classList.toggle('is-active', showOverview);
    el.overviewTabBtn.setAttribute('aria-selected', showOverview ? 'true' : 'false');
  }

  if (el.backarTabBtn) {
    el.backarTabBtn.classList.toggle('is-active', !showOverview);
    el.backarTabBtn.setAttribute('aria-selected', showOverview ? 'false' : 'true');
  }
}

function handleManualBackSelectionAttempt(nextSelectedBackNums) {
  if (!state.recordedRoute.active) return true;
  if (state.recordedRoute.suppressManualPrompt) return true;
  const prev = [...state.recordedRoute.lastAppliedBackNums].sort((a, b) => a - b).join(',');
  const next = [...nextSelectedBackNums].sort((a, b) => a - b).join(',');
  if (prev === next) return true;

  if (!confirmLeavingRecordedRoute()) {
    setSelectedBackNumbersSilently(state.recordedRoute.lastAppliedBackNums);
    return false;
  }

  deactivateRecordedRoute({ clearStorage: true });
  return true;
}

function applyLatestRecordedRouteFromStorage() {
  const payload = readLatestRecordedRouteFromStorage();
  if (!payload) {
    deactivateRecordedRoute();
    return;
  }

  const validBackNumbers = new Set(state.backar.map((b) => Number(b.nummer)));
  const filtered = payload.backNummerListUnique.filter((n) => validBackNumbers.has(Number(n)));

  if (filtered.length === 0) {
    deactivateRecordedRoute({ clearStorage: true });
    return;
  }

  state.recordedRoute.active = true;
  state.recordedRoute.payload = {
    ...payload,
    backNummerList: payload.backNummerList.filter((n) => validBackNumbers.has(Number(n))),
    backNummerListUnique: filtered
  };
  state.recordedRoute.lastAppliedBackNums = [];
  setSelectedBackNumbersSilently([]);
  updateRecordedRouteBadgeUi();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createSelectOptions(selectEl, options, formatter = (x) => x) {
  selectEl.innerHTML = options
    .map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(formatter(item))}</option>`)
    .join('');
}

function findBackByNummer(backNummer) {
  return state.backar.find((b) => b.nummer === Number(backNummer)) || null;
}

function hasTomSelect() {
  return typeof window.TomSelect === 'function';
}

function syncTomSelectFromNative(selectInstance, nativeSelectEl) {
  if (!selectInstance) return;

  const options = Array.from(nativeSelectEl.options).map((option) => ({
    value: option.value,
    text: option.textContent || ''
  }));
  const selected = Array.from(nativeSelectEl.selectedOptions).map((option) => option.value);

  selectInstance.clear(true);
  selectInstance.clearOptions();
  selectInstance.addOptions(options);
  if (selected.length > 0) {
    selectInstance.setValue(selected, true);
  }
}

function initEnhancedMultiSelects() {
  if (!hasTomSelect()) return;

  const clearSearchAfterSelect = function clearSearchAfterSelect() {
    this.setTextboxValue('');
    this.refreshOptions(false);
  };

  if (!selectState.personSelect) {
    selectState.personSelect = new window.TomSelect(el.personInput, {
      plugins: ['remove_button'],
      create: false,
      maxOptions: 200,
      hideSelected: false,
      closeAfterSelect: false,
      placeholder: 'Sök och välj personer',
      searchField: ['text'],
      onItemAdd: clearSearchAfterSelect,
      render: {
        no_results: () => '<div class="no-results p-3 text-sm">Ingen träff hittades.</div>'
      }
    });
  }

  if (!selectState.backSelect) {
    selectState.backSelect = new window.TomSelect(el.backInput, {
      plugins: ['remove_button'],
      create: false,
      maxOptions: 500,
      hideSelected: false,
      closeAfterSelect: false,
      placeholder: 'Sök på #nummer eller namn',
      searchField: ['text'],
      onItemAdd: clearSearchAfterSelect,
      render: {
        no_results: () => '<div class="no-results p-3 text-sm">Ingen backe matchar sökningen.</div>'
      }
    });
    updateRecordedRouteLockUi();
  }

  if (!selectState.filterColorSelect) {
    selectState.filterColorSelect = new window.TomSelect(el.filterColor, {
      create: false,
      maxItems: 1,
      allowEmptyOption: false,
      searchField: [],
      controlInput: null,
      render: {
        option: (data, escape) =>
          `<div class="ts-color-row">${getDifficultyShapeMarkup(data.value)}<span>${escape(data.text)}</span></div>`,
        item: (data, escape) =>
          `<div class="ts-color-row">${getDifficultyShapeMarkup(data.value)}<span>${escape(data.text)}</span></div>`
      }
    });
  }

  if (!selectState.sortBySelect) {
    selectState.sortBySelect = new window.TomSelect(el.sortBy, {
      create: false,
      maxItems: 1,
      allowEmptyOption: false,
      searchField: [],
      controlInput: null,
      render: {
        option: (data, escape) =>
          `<div class="ts-color-row">${getSortIconMarkup(data.value)}<span>${escape(data.text)}</span></div>`,
        item: (data, escape) =>
          `<div class="ts-color-row">${getSortIconMarkup(data.value)}<span>${escape(data.text)}</span></div>`
      }
    });
  }

  if (!selectState.rideStatusSelect) {
    selectState.rideStatusSelect = new window.TomSelect(el.rideStatus, {
      create: false,
      maxItems: 1,
      allowEmptyOption: false,
      searchField: [],
      controlInput: null,
      render: {
        option: (data, escape) =>
          `<div class="ts-color-row">${getRideStatusIconMarkup(data.value)}<span>${escape(data.text)}</span></div>`,
        item: (data, escape) =>
          `<div class="ts-color-row">${getRideStatusIconMarkup(data.value)}<span>${escape(data.text)}</span></div>`
      }
    });
  }

  if (!selectState.statusPersonSelect) {
    selectState.statusPersonSelect = new window.TomSelect(el.statusPerson, {
      create: false,
      maxItems: 1,
      allowEmptyOption: false,
      searchField: ['text'],
      placeholder: 'Välj person',
      render: {
        no_results: () => '<div class="no-results p-3 text-sm">Ingen träff hittades.</div>'
      }
    });
  }
}

function normalizeBackZones(zonesRaw) {
  const validBackar = new Set(state.backar.map((b) => b.nummer));
  const normalized = [];

  (zonesRaw || []).forEach((zone) => {
    const backNummer = Number(zone.backNummer);
    const x = Number(zone.x);
    const y = Number(zone.y);

    if (!validBackar.has(backNummer)) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;

    normalized.push({
      backNummer,
      x,
      y,
      labelOffsetX: Number.isFinite(Number(zone.labelOffsetX)) ? Number(zone.labelOffsetX) : 0,
      labelOffsetY: Number.isFinite(Number(zone.labelOffsetY)) ? Number(zone.labelOffsetY) : 0
    });
  });

  normalized.sort((a, b) => a.backNummer - b.backNummer);
  return normalized;
}

function fillFormOptions() {
  createSelectOptions(el.personInput, [ALL_PERSONS_VALUE, ...getGroupPersons()], (value) =>
    value === ALL_PERSONS_VALUE ? 'Alla' : value
  );
  selectDefaultPersonOption();
  createSelectOptions(el.statusPerson, ['alla', ...getGroupPersons()], (value) => (value === 'alla' ? 'Alla' : value));

  const backOptions = [...state.backar]
    .sort((a, b) => a.nummer - b.nummer)
    .map((b) => ({ value: b.nummer, label: `#${b.nummer} ${b.namn}` }));

  el.backInput.innerHTML = backOptions.map((o) => `<option value="${o.value}">${o.label}</option>`).join('');
  if (el.backInput.options.length > 0) {
    el.backInput.options[0].selected = true;
  }

  if (selectState.personSelect) {
    syncTomSelectFromNative(selectState.personSelect, el.personInput);
  }

  if (selectState.backSelect) {
    syncTomSelectFromNative(selectState.backSelect, el.backInput);
  }

  if (selectState.statusPersonSelect) {
    syncTomSelectFromNative(selectState.statusPersonSelect, el.statusPerson);
  }

  if (isAdminMode) {
    el.adminBackSelect.innerHTML = backOptions.map((o) => `<option value="${o.value}">${o.label}</option>`).join('');
  }

  const colors = ['alla', ...new Set(state.backar.map((b) => b.farg))];
  el.filterColor.innerHTML = colors
    .map((c) => {
      if (c === 'alla') return '<option value="alla">Alla färger</option>';
      const label = getDifficultyLabel(c);
      return `<option value="${c}">${label}</option>`;
    })
    .join('');

  if (selectState.filterColorSelect) {
    syncTomSelectFromNative(selectState.filterColorSelect, el.filterColor);
  }

  updateRecordedRouteBadgeUi();
}

function isBackRiddenByPerson(backNummer, person) {
  const backStats = state.stats?.backar?.[String(backNummer)];
  return (backStats?.ridesPerPerson?.[person] || 0) > 0;
}

function isBackRiddenByAnyone(backNummer) {
  const backStats = state.stats?.backar?.[String(backNummer)];
  const ridesPerPerson = backStats?.ridesPerPerson || {};
  return Object.values(ridesPerPerson).some((count) => Number(count || 0) > 0);
}

function isBackRiddenByPersonOnDate(backNummer, person, dateStr) {
  if (!dateStr) return false;
  return state.rides.some(
    (ride) =>
      Number(ride.backNummer) === Number(backNummer) &&
      String(ride.person) === String(person) &&
      String(ride.datum || '') === String(dateStr)
  );
}

function isBackRiddenByAnyoneOnDate(backNummer, dateStr) {
  if (!dateStr) return false;
  return state.rides.some(
    (ride) => Number(ride.backNummer) === Number(backNummer) && String(ride.datum || '') === String(dateStr)
  );
}

function getPersonAchievementDefinitions(person, coverage, favoriteBack) {
  return [
    {
      key: 'alla_backar',
      label: 'Alla backar',
      description: `${coverage.riddenBackar}/${coverage.totalBackar} unika backar`,
      done: Boolean(person.achievements?.alla_backar)
    },
    {
      key: 'alla_grona',
      label: 'Alla gröna',
      description: `${coverage.riddenByColor?.grön || 0}/${coverage.totalsByColor?.grön || 0} gröna`,
      done: Boolean(person.achievements?.alla_grona)
    },
    {
      key: 'alla_bla',
      label: 'Alla blå',
      description: `${coverage.riddenByColor?.blå || 0}/${coverage.totalsByColor?.blå || 0} blå`,
      done: Boolean(person.achievements?.alla_bla)
    },
    {
      key: 'alla_roda',
      label: 'Alla röda',
      description: `${coverage.riddenByColor?.röd || 0}/${coverage.totalsByColor?.röd || 0} röda`,
      done: Boolean(person.achievements?.alla_roda)
    },
    {
      key: 'alla_svarta',
      label: 'Alla svarta',
      description: `${coverage.riddenByColor?.svart || 0}/${coverage.totalsByColor?.svart || 0} svarta`,
      done: Boolean(person.achievements?.alla_svarta)
    },
    {
      key: 'tio_i_samma_backe',
      label: '10 i samma backe',
      description: `${favoriteBack.count}/${favoriteBack.target} i ${escapeHtml(favoriteBack.name)}`,
      done: Boolean(person.achievements?.tio_i_samma_backe)
    }
  ];
}

function getAchievementRuleDefinitions() {
  return [
    { key: 'alla_backar', description: 'Åk alla backar i systemet.' },
    { key: 'alla_grona', description: 'Åk alla gröna backar.' },
    { key: 'alla_bla', description: 'Åk alla blå backar.' },
    { key: 'alla_roda', description: 'Åk alla röda backar.' },
    { key: 'alla_svarta', description: 'Åk alla svarta backar.' },
    { key: 'tio_i_samma_backe', description: 'Åk 10 gånger i samma backe.' }
  ];
}

function renderStarsBoard() {
  if (!state.stats || !el.starsBoard) return;
  const totals = getTotalsStatsForView();
  const teamProgress = totals.teamProgressBestDay;
  const today = todayDate();
  const todayProgress = getTeamProgressForDate(today);
  const teamMaxStars = Object.keys(totals.teamAchievements || {}).length;
  const todayGoalGauges = [
    getGoalGaugeMarkup({
      label: 'Åk per person',
      currentValue: todayProgress.ridesPerPersonSingleDay,
      bestValue: teamProgress.maxRidesPerPersonSingleDay,
      targetValue: todayProgress.targetRidesPerPersonSingleDay,
      todayDisplay: todayProgress.ridesPerPersonSingleDay,
      bestDisplay: teamProgress.maxRidesPerPersonSingleDay,
      targetDisplay: `> ${todayProgress.targetRidesPerPersonSingleDay}`,
      comparator: 'gt'
    }),
    getGoalGaugeMarkup({
      label: 'Samma backe per person',
      currentValue: todayProgress.sameBackPerPersonSingleDay,
      bestValue: teamProgress.maxSameBackPerPersonSingleDay,
      targetValue: todayProgress.targetSameBackPerPersonSingleDay,
      todayDisplay: todayProgress.sameBackPerPersonSingleDay,
      bestDisplay: teamProgress.maxSameBackPerPersonSingleDay,
      targetDisplay: `>= ${todayProgress.targetSameBackPerPersonSingleDay}`
    }),
    getGoalGaugeMarkup({
      label: 'Distans',
      currentValue: todayProgress.distanceSingleDayMeter,
      bestValue: teamProgress.maxDistanceSingleDayMeter,
      targetValue: todayProgress.targetDistanceSingleDayMeter,
      todayDisplay: formatMetersAsKm(todayProgress.distanceSingleDayMeter),
      bestDisplay: formatMetersAsKm(teamProgress.maxDistanceSingleDayMeter),
      targetDisplay: formatMetersAsKm(todayProgress.targetDistanceSingleDayMeter)
    }),
    getGoalGaugeMarkup({
      label: 'Alla backar',
      currentValue: todayProgress.uniqueBackarSingleDay,
      bestValue: teamProgress.maxUniqueBackarSingleDay,
      targetValue: todayProgress.targetUniqueBackarSingleDay,
      todayDisplay: todayProgress.uniqueBackarSingleDay,
      bestDisplay: teamProgress.maxUniqueBackarSingleDay,
      targetDisplay: todayProgress.targetUniqueBackarSingleDay
    })
  ].join('');

  const personCards = getGroupPersons().map((person) => {
    const p = getPersonStatsForView(person);
    const coverage = getPersonCoverageByColor(person);
    const favoriteBack = getPersonFavoriteBackProgress(person);
    const allBackarPercent = coverage.totalBackar > 0 ? Math.round((coverage.riddenBackar / coverage.totalBackar) * 100) : 0;
    const favoriteDone = favoriteBack.count >= favoriteBack.target;

    return `
      <article class="rounded-3xl bg-white border border-slate-100 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <div>
            <p class="text-lg font-bold text-slate-800">${escapeHtml(person)}</p>
            <p class="mt-3 text-3xl font-bold text-amber-500">${'★'.repeat(p.stjarnor)}<span class="text-slate-300">${'☆'.repeat(Math.max(0, 6 - p.stjarnor))}</span></p>
            <p class="mt-1 text-sm text-slate-600">${p.stjarnor} av 6 stjärnor</p>
        </div>
        <details class="person-stats-details mt-4 border-t border-slate-100 pt-4">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3">
            <div>
              <p class="text-base font-bold text-klappen-dark">Mer info</p>
            </div>
            <i class="person-stats-chevron fa-solid fa-chevron-down text-[12px] text-slate-500" aria-hidden="true"></i>
          </summary>
          <div class="pt-5">
            <section>
              <div class="flex items-center justify-between gap-2 text-sm font-semibold text-slate-700">
                <span>Alla backar</span>
                <span class="inline-flex items-center gap-1.5">
                  <span>${coverage.riddenBackar}/${coverage.totalBackar}</span>
                  ${p.achievements.alla_backar ? '<span aria-label="Klar">★</span>' : ''}
                </span>
              </div>
              <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-sky-100">
                <div class="h-full rounded-full bg-sky-600" style="width: ${allBackarPercent}%;"></div>
              </div>
            </section>
            <section class="mt-5 border-t border-slate-100 pt-5">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Färgstatus</p>
              <div class="mt-2 grid grid-cols-2 gap-2">
                ${getPersonColorSummaryMarkup({
                  ridesByColor: p.ridesByColor,
                  totalRides: p.totalRides,
                  coverage
                })}
              </div>
            </section>
            <section class="mt-5 border-t border-slate-100 pt-5">
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-semibold ${favoriteDone ? 'text-emerald-800' : 'text-slate-700'}">Favvobacke</p>
                <p class="text-sm ${favoriteDone ? 'text-emerald-800' : 'text-slate-500'} inline-flex items-center gap-1.5">
                  <span>${escapeHtml(favoriteBack.name)} ${favoriteBack.count}/${favoriteBack.target}</span>
                  ${favoriteDone ? '<span aria-label="Klar">★</span>' : ''}
                </p>
              </div>
              <div class="mt-2 h-2 w-full overflow-hidden rounded-full ${favoriteDone ? 'bg-emerald-100' : 'bg-slate-200'}">
                <div class="h-full rounded-full ${favoriteDone ? 'bg-emerald-600' : 'bg-klappen-mid'}" style="width: ${favoriteBack.progressPercent}%;"></div>
              </div>
            </section>
          </div>
        </details>
      </article>`;
  }).join('');
  const starRules = getAchievementRuleDefinitions();
  const starRulesCard = `
    <article class="rounded-2xl bg-slate-100/80 p-3 sm:p-4 xl:col-span-3">
      <div class="rounded-3xl bg-white border border-slate-100 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <h3 class="text-lg font-bold text-klappen-dark">Hur får man stjärnor?</h3>
        <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        ${starRules.map((rule) => `
          <div class="border-l-4 border-amber-400 pl-3">
            <p class="text-sm font-semibold text-slate-800">${formatAchievementLabel(rule.key)}</p>
            <p class="mt-1 text-sm text-slate-600">${rule.description}</p>
          </div>
        `).join('')}
        </div>
      </div>
    </article>`;
  const teamCard = `
    <article class="rounded-2xl bg-slate-100/80 p-3 sm:p-4 sm:col-span-2 xl:col-span-3">
      <div class="rounded-3xl bg-white border border-slate-100 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <h3 class="text-lg font-bold text-klappen-dark">Gemensamma mål</h3>
        <p class="mt-3 text-3xl font-bold text-amber-500">${'★'.repeat(totals.teamStars)}<span class="text-slate-300">${'☆'.repeat(Math.max(0, teamMaxStars - totals.teamStars))}</span></p>
        <p class="mt-1 text-sm text-slate-600">${totals.teamStars} av ${teamMaxStars} gruppstjärnor</p>
        <p class="mt-4 text-sm text-slate-700">Gruppmål låses upp på <strong>bästa dag hittills</strong> och försvinner inte.</p>
        <div class="mt-5 border-t border-slate-100 pt-5">
          <div class="flex items-center justify-between gap-3">
            <p class="text-base font-bold text-klappen-dark">Dagens mätare</p>
            <p class="text-xs text-slate-500">${today}</p>
          </div>
          <div class="mt-4 space-y-3">${todayGoalGauges}</div>
        </div>
        <div class="mt-5 border-t border-slate-100 pt-5">
          <p class="text-sm text-slate-600">Aktiva dagar: <strong class="text-slate-800">${totals.activeDaysCount}</strong></p>
        </div>
      </div>
    </article>`;

  el.starsBoard.innerHTML = `${personCards}${starRulesCard}${teamCard}`;
}

function renderPersonStats() {
  if (el.personStats) {
    el.personStats.innerHTML = '';
  }
}

function renderTotalStats() {
  if (!state.stats || !el.totalStats) return;
  const totals = getTotalsStatsForView();
  const today = todayDate();
  const todayTotals = getTotalsStatsForDate(today);
  const todayUniqueBackar = getUniqueBackarCountForDate(today);
  const totalUniqueBackar = getUniqueBackarCountForDate();
  const avgRidesPerPerson = Number(totals.avgRidesPerPersonPerActiveDay || 0);

  el.totalStats.innerHTML = `
    <article class="rounded-2xl bg-slate-100/80 p-3 sm:p-4 space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <section class="rounded-3xl bg-white border border-slate-100 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <div class="flex items-center gap-2 text-klappen-dark">
            <i class="fa-solid fa-calendar-day text-sm"></i>
            <p class="text-lg font-bold">Idag</p>
          </div>
          <p class="mt-1 text-xs text-slate-500">${today}</p>
          <p class="mt-3 text-5xl leading-none font-black text-klappen-dark">${todayUniqueBackar}</p>
          <p class="mt-1 text-sm font-semibold text-slate-500">åkta backar</p>
          <div class="mt-4 space-y-1 text-sm text-slate-600">
            <p>Längd: <strong class="text-klappen-dark">${formatMetersAsKm(todayTotals.totalDistanceMeter)}</strong></p>
            <p>Färger: <span class="text-slate-700">${formatRidesByColorWithSymbols(todayTotals.ridesByColor)}</span></p>
          </div>
        </section>
        <section class="rounded-3xl bg-white border border-slate-100 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <div class="flex items-center gap-2 text-klappen-dark">
            <i class="fa-solid fa-chart-line text-sm"></i>
            <p class="text-lg font-bold">Total</p>
          </div>
          <p class="mt-1 text-xs text-slate-500">Hela perioden</p>
          <p class="mt-3 text-5xl leading-none font-black text-klappen-dark">${totalUniqueBackar}</p>
          <p class="mt-1 text-sm font-semibold text-slate-500">åkta backar</p>
          <div class="mt-4 space-y-1 text-sm text-slate-600">
            <p>Längd: <strong class="text-klappen-dark">${formatMetersAsKm(totals.totalDistanceMeter)}</strong></p>
            <p>Färger: <span class="text-slate-700">${formatRidesByColorWithSymbols(totals.ridesByColor)}</span></p>
          </div>
        </section>
      </div>
      <section class="rounded-3xl bg-white border border-slate-100 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <div class="flex items-center gap-2 text-klappen-dark">
          <i class="fa-solid fa-snowflake text-sm"></i>
          <p class="text-lg font-bold">Översikt</p>
        </div>
        <div class="mt-3 grid grid-cols-3 gap-3 text-center">
          <div>
            <p class="text-sm text-slate-500">Aktiva dagar</p>
            <p class="text-3xl leading-tight font-black text-klappen-dark">${totals.activeDaysCount}</p>
          </div>
          <div>
            <p class="text-sm text-slate-500">Total längd</p>
            <p class="text-3xl leading-tight font-black text-klappen-dark">${formatMetersAsKm(totals.totalDistanceMeter)}</p>
          </div>
          <div>
            <p class="text-sm text-slate-500">Snitt åk/person/dag</p>
            <p class="text-3xl leading-tight font-black text-klappen-dark">${avgRidesPerPerson.toFixed(1)}</p>
          </div>
        </div>
      </section>
    </article>`;
}

function getTodayRidesByBack() {
  const today = todayDate();
  const todayRidesByBack = {};

  for (const ride of state.rides) {
    if (String(ride.datum || '') !== today) continue;
    const backNummer = Number(ride.backNummer);
    if (!Number.isFinite(backNummer)) continue;
    todayRidesByBack[backNummer] = (todayRidesByBack[backNummer] || 0) + 1;
  }

  return todayRidesByBack;
}

function getFilteredAndSortedBackar() {
  const colorFilter = el.filterColor.value;
  const sortBy = el.sortBy.value;
  const rideStatus = el.rideStatus.value;
  const person = el.statusPerson.value;

  let list = [...state.backar];

  if (colorFilter !== 'alla') {
    list = list.filter((b) => b.farg === colorFilter);
  }

  if (rideStatus !== 'all') {
    list = list.filter((b) => {
      if (person === 'alla') {
        if (rideStatus === 'unridden_today') {
          return !isBackRiddenByAnyoneOnDate(b.nummer, todayDate());
        }
        const riddenByAnyone = isBackRiddenByAnyone(b.nummer);
        return rideStatus === 'ridden' ? riddenByAnyone : !riddenByAnyone;
      }

      if (rideStatus === 'unridden_today') {
        return !isBackRiddenByPersonOnDate(b.nummer, person, todayDate());
      }
      const ridden = isBackRiddenByPerson(b.nummer, person);
      return rideStatus === 'ridden' ? ridden : !ridden;
    });
  }

  const todayRidesByBack = sortBy === 'ak_idag' ? getTodayRidesByBack() : null;

  list.sort((a, b) => {
    if (sortBy === 'namn') return a.namn.localeCompare(b.namn, 'sv') || a.nummer - b.nummer;
    if (sortBy === 'langd') return Number(b.langdMeter || 0) - Number(a.langdMeter || 0) || a.nummer - b.nummer;
    if (sortBy === 'ak_total') {
      const ridesA = Number(state.stats?.backar?.[String(a.nummer)]?.totalRides || 0);
      const ridesB = Number(state.stats?.backar?.[String(b.nummer)]?.totalRides || 0);
      return ridesB - ridesA || a.nummer - b.nummer;
    }
    if (sortBy === 'ak_idag') {
      const ridesA = Number(todayRidesByBack?.[a.nummer] || 0);
      const ridesB = Number(todayRidesByBack?.[b.nummer] || 0);
      return ridesB - ridesA || a.nummer - b.nummer;
    }
    return a.nummer - b.nummer;
  });

  return list;
}

function renderBackarList() {
  if (!state.stats) return;
  const list = getFilteredAndSortedBackar();
  const todayRidesByBack = getTodayRidesByBack();

  el.backarList.innerHTML = list.map((backe) => {
    const defaultRidesPerPerson = Object.fromEntries(getGroupPersons().map((person) => [person, 0]));
    const stats = state.stats.backar[String(backe.nummer)] || {
      ridesPerPerson: defaultRidesPerPerson,
      totalRides: 0,
      latestDate: null,
      personsWhoRode: []
    };
    const ridesPerPerson = {
      ...defaultRidesPerPerson,
      ...(stats.ridesPerPerson || {})
    };
    const ridesPerPersonLines = getGroupPersons()
      .map((person) => {
        const personRideCount = Number(ridesPerPerson[person] || 0);
        const personStateClass = personRideCount > 0
          ? 'border-blue-200 bg-blue-50 text-klappen-dark'
          : 'border-slate-200 bg-white text-slate-600';
        return `
          <div class="rounded-xl border px-3 py-2 ${personStateClass}">
            <p class="text-xs font-semibold uppercase tracking-wide">${person}</p>
            <p class="mt-1 text-xl leading-none font-black">${personRideCount}</p>
          </div>
        `;
      })
      .join('');
    const ridersMarkup = stats.personsWhoRode.length
      ? stats.personsWhoRode.map((person) => (
        `<span class="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-klappen-dark">${person}</span>`
      )).join('')
      : '<span class="text-sm text-slate-500">-</span>';
    const todayRides = todayRidesByBack[backe.nummer] || 0;
    const slopeLengthMeter = Math.max(0, Number(backe.langdMeter || 0));
    const totalDistanceMeter = (Number(stats.totalRides) || 0) * slopeLengthMeter;

    const badgeClass = difficultyBadgeClass[backe.farg] || 'bg-slate-100 text-slate-700 border-slate-200';
    const difficultyLabel = getDifficultyLabel(backe.farg);
    const difficultyShape = getDifficultyShapeMarkup(backe.farg);

    return `
      <details class="rounded-xl border border-slate-200 bg-white p-3">
        <summary class="flex items-center justify-between gap-2 cursor-pointer list-none">
          <div>
            <p class="font-semibold text-slate-900">#${backe.nummer} ${backe.namn}</p>
            <p class="text-xs text-slate-500">Idag: ${todayRides} · Totalt: ${stats.totalRides}</p>
          </div>
          <span class="px-2 py-1 rounded-full border text-xs font-semibold inline-flex items-center gap-1.5 ${badgeClass}" aria-label="Svårighetsgrad ${difficultyLabel}" title="${difficultyLabel}">
            ${difficultyShape}
            <span class="sr-only">${difficultyLabel}</span>
          </span>
        </summary>
        <div class="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <section class="rounded-2xl border border-slate-100 bg-white px-3 py-2 shadow-[0_6px_16px_rgba(15,23,42,0.05)]">
              <p class="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <i class="fa-solid fa-calendar-day text-[10px]" aria-hidden="true"></i>
                <span>Åk idag</span>
              </p>
              <p class="mt-1 text-2xl leading-none font-black text-klappen-dark">${todayRides}</p>
            </section>
            <section class="rounded-2xl border border-slate-100 bg-white px-3 py-2 shadow-[0_6px_16px_rgba(15,23,42,0.05)]">
              <p class="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <i class="fa-solid fa-chart-line text-[10px]" aria-hidden="true"></i>
                <span>Totalt åk</span>
              </p>
              <p class="mt-1 text-2xl leading-none font-black text-klappen-dark">${stats.totalRides}</p>
            </section>
            <section class="rounded-2xl border border-slate-100 bg-white px-3 py-2 shadow-[0_6px_16px_rgba(15,23,42,0.05)]">
              <p class="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <i class="fa-solid fa-ruler text-[10px]" aria-hidden="true"></i>
                <span>Backlängd</span>
              </p>
              <p class="mt-1 text-2xl leading-none font-black text-klappen-dark">${slopeLengthMeter} m</p>
            </section>
            <section class="rounded-2xl border border-slate-100 bg-white px-3 py-2 shadow-[0_6px_16px_rgba(15,23,42,0.05)]">
              <p class="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <i class="fa-solid fa-route text-[10px]" aria-hidden="true"></i>
                <span>Åkta meter</span>
              </p>
              <p class="mt-1 text-2xl leading-none font-black text-klappen-dark">${totalDistanceMeter} m</p>
            </section>
          </div>
          <section class="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
            <p class="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <i class="fa-solid fa-users text-[11px]" aria-hidden="true"></i>
              <span>Per åkare</span>
            </p>
            <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              ${ridesPerPersonLines}
            </div>
          </section>
          <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <section class="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p class="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <i class="fa-regular fa-clock text-[10px]" aria-hidden="true"></i>
                <span>Senaste datum</span>
              </p>
              <p class="mt-1 text-sm font-semibold text-slate-700">${stats.latestDate || '-'}</p>
            </section>
            <section class="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p class="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <i class="fa-solid fa-user-group text-[10px]" aria-hidden="true"></i>
                <span>Åkare</span>
              </p>
              <div class="mt-1 flex flex-wrap gap-1.5">
                ${ridersMarkup}
              </div>
            </section>
          </div>
        </div>
      </details>`;
  }).join('');

  if (!list.length) {
    el.backarList.innerHTML = '<p class="text-sm text-slate-500">Inga backar matchar filtreringen.</p>';
  }
}

function renderAll() {
  renderStarsBoard();
  renderPersonStats();
  renderTotalStats();
  renderBackarList();
}

function getZoneMapByBackNummer() {
  const zoneMap = new Map();
  state.backZones.forEach((zone) => zoneMap.set(zone.backNummer, zone));
  return zoneMap;
}

function togglePendingMapBack(backNummer) {
  if (mapSelection.pendingBackNums.has(backNummer)) {
    mapSelection.pendingBackNums.delete(backNummer);
  } else {
    mapSelection.pendingBackNums.add(backNummer);
  }
}

function refreshMapDoneButton() {
  if (isAdminMode) {
    el.mapDoneBtn.classList.add('hidden');
    if (el.mapSelectedPreview) {
      el.mapSelectedPreview.classList.add('hidden');
    }
    return;
  }
  const count = mapSelection.pendingBackNums.size;
  el.mapDoneBtn.classList.remove('hidden');
  if (el.mapSelectedPreview) {
    el.mapSelectedPreview.classList.remove('hidden');
  }
  el.mapDoneBtn.textContent = count > 0 ? `Klar (${count})` : 'Klar';
}

function refreshMapSelectionPreview() {
  if (!el.mapSelectedPreview || isAdminMode) return;

  const selectedBackNums = Array.from(mapSelection.pendingBackNums).sort((a, b) => a - b);
  if (selectedBackNums.length === 0) {
    el.mapSelectedPreview.innerHTML = '<span class="text-xs text-slate-500">Inga valda backar ännu.</span>';
    return;
  }

  const backByNumber = new Map(state.backar.map((backe) => [backe.nummer, backe]));
  el.mapSelectedPreview.innerHTML = selectedBackNums
    .map((backNummer) => {
      const backe = backByNumber.get(backNummer);
      if (!backe) {
        return `<span class="inline-flex items-center rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">#${backNummer}</span>`;
      }

      return `
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full border border-[#9ec0e2] bg-[#eaf2fb] px-2.5 py-1 text-xs font-semibold text-[#103d69] hover:bg-[#dcecff]"
          title="Ta bort #${backe.nummer} ${backe.namn} från valda"
          aria-label="Ta bort #${backe.nummer} ${backe.namn} från valda"
          data-remove-selected-back="${backe.nummer}"
        >
          ${getDifficultyShapeMarkup(backe.farg)}
          <span>#${backe.nummer} ${backe.namn}</span>
          <span aria-hidden="true" class="text-[11px] leading-none">✕</span>
        </button>
      `;
    })
    .join('');
}

function isAdminPanMode() {
  return isAdminMode && mapView.adminMode === 'pan';
}

function updateMapCursor() {
  el.mapStage.classList.remove('cursor-grab', 'cursor-grabbing', 'cursor-crosshair');

  if (mapView.dragging) {
    el.mapStage.classList.add('cursor-grabbing');
    return;
  }

  if (isAdminMode && !isAdminPanMode()) {
    el.mapStage.classList.add('cursor-crosshair');
    return;
  }

  el.mapStage.classList.add('cursor-grab');
}

function updateAdminModeUI() {
  if (!isAdminMode) return;
  const isPan = isAdminPanMode();
  el.adminModeToggleBtn.textContent = isPan ? 'Läge: Panorera' : 'Läge: Placera';
  el.adminModeToggleBtn.className = isPan
    ? 'rounded-xl border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50'
    : 'rounded-xl border border-amber-400 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100';
  updateMapCursor();
}

function renderMapMarkers() {
  const zoneMap = getZoneMapByBackNummer();
  const selectedBackSet = isAdminMode
    ? new Set([Number(el.adminBackSelect.value || 0)])
    : mapView.open
      ? mapSelection.pendingBackNums
      : new Set(getSelectedBackNumbers());

  const markers = state.backar
    .map((backe) => {
      const zone = zoneMap.get(backe.nummer);
      if (!zone) return '';

      const isSelected = selectedBackSet.has(backe.nummer);
      const difficultyShape = getDifficultyShapeMarkup(backe.farg);
      const difficultyLabel = getDifficultyLabel(backe.farg);

      const classes = [
        'absolute',
        '-translate-x-1/2',
        '-translate-y-1/2',
        'rounded-full',
        'border',
        'font-bold',
        'text-[10px]',
        'sm:text-xs',
        'leading-none',
        'px-2',
        'py-1',
        'cursor-pointer',
        'shadow'
      ];

      if (isSelected) {
        classes.push('bg-klappen-dark', 'text-white', 'border-klappen-dark', 'ring-2', 'ring-blue-300');
      } else {
        classes.push('bg-white', 'text-slate-800', 'border-slate-300', 'hover:bg-blue-100');
      }

      const left = `${zone.x * 100}%`;
      const top = `${zone.y * 100}%`;
      const labelOffsetX = Number(zone.labelOffsetX || 0);
      const labelOffsetY = Number(zone.labelOffsetY || 0);

      return `
        <button
          type="button"
          class="${classes.join(' ')}"
          style="left: ${left}; top: ${top}; margin-left: ${labelOffsetX}px; margin-top: ${labelOffsetY}px"
          data-zone-back="${backe.nummer}"
          title="#${backe.nummer} ${backe.namn} (${difficultyLabel})"
          aria-label="#${backe.nummer} ${backe.namn}, ${difficultyLabel}"
        >
          <span class="inline-flex items-center gap-1">
            ${difficultyShape}
            <span>#${backe.nummer}</span>
          </span>
        </button>
      `;
    })
    .join('');

  el.mapMarkers.innerHTML = markers;
  el.mapEmptyState.classList.toggle('hidden', markers.trim().length > 0);
}

function applyMapTransform() {
  el.mapStage.style.transform = `translate(${mapView.tx}px, ${mapView.ty}px) scale(${mapView.scale})`;
}

function loadSavedMapScale() {
  try {
    const raw = window.localStorage.getItem(MAP_VIEW_SCALE_STORAGE_KEY);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function saveMapScale(scale) {
  if (!Number.isFinite(scale) || scale <= 0) return;
  mapView.savedScale = scale;
  try {
    window.localStorage.setItem(MAP_VIEW_SCALE_STORAGE_KEY, String(scale));
  } catch {
    // Ignore storage failures (private mode / quota, etc.)
  }
}

function rememberViewportSize(width, height) {
  mapView.viewportWidth = width;
  mapView.viewportHeight = height;
}

function fitMapToViewport(preferredScale = null) {
  const viewportRect = el.mapViewport.getBoundingClientRect();
  if (!viewportRect.width || !viewportRect.height) return;

  const fitScale = Math.min(viewportRect.width / MAP_IMAGE_WIDTH, viewportRect.height / MAP_IMAGE_HEIGHT);
  const targetScale = Number.isFinite(preferredScale) ? preferredScale : Math.max(fitScale, 0.6);
  mapView.scale = clampScale(targetScale);
  mapView.tx = (viewportRect.width - MAP_IMAGE_WIDTH * mapView.scale) / 2;
  mapView.ty = (viewportRect.height - MAP_IMAGE_HEIGHT * mapView.scale) / 2;
  rememberViewportSize(viewportRect.width, viewportRect.height);
  saveMapScale(mapView.scale);
  applyMapTransform();
}

function clampScale(value) {
  return Math.max(mapView.minScale, Math.min(value, mapView.maxScale));
}

function zoomAt(clientX, clientY, factor) {
  const viewportRect = el.mapViewport.getBoundingClientRect();
  const px = clientX - viewportRect.left;
  const py = clientY - viewportRect.top;

  const oldScale = mapView.scale;
  const newScale = clampScale(oldScale * factor);
  if (newScale === oldScale) return;

  const wx = (px - mapView.tx) / oldScale;
  const wy = (py - mapView.ty) / oldScale;

  mapView.scale = newScale;
  mapView.tx = px - wx * newScale;
  mapView.ty = py - wy * newScale;

  saveMapScale(mapView.scale);
  applyMapTransform();
}

function preserveMapCenterForViewport() {
  const viewportRect = el.mapViewport.getBoundingClientRect();
  if (!viewportRect.width || !viewportRect.height) return;

  if (!mapView.viewportWidth || !mapView.viewportHeight) {
    fitMapToViewport(mapView.savedScale);
    return;
  }

  const worldCenterX = (mapView.viewportWidth / 2 - mapView.tx) / mapView.scale;
  const worldCenterY = (mapView.viewportHeight / 2 - mapView.ty) / mapView.scale;

  mapView.scale = clampScale(mapView.scale);
  mapView.tx = viewportRect.width / 2 - worldCenterX * mapView.scale;
  mapView.ty = viewportRect.height / 2 - worldCenterY * mapView.scale;
  rememberViewportSize(viewportRect.width, viewportRect.height);
  applyMapTransform();
}

function centerOnBack(backNummer) {
  const zone = getZoneMapByBackNummer().get(Number(backNummer));
  if (!zone) return;

  const viewportRect = el.mapViewport.getBoundingClientRect();
  const px = zone.x * MAP_IMAGE_WIDTH * mapView.scale;
  const py = zone.y * MAP_IMAGE_HEIGHT * mapView.scale;

  mapView.tx = viewportRect.width / 2 - px;
  mapView.ty = viewportRect.height / 2 - py;
  applyMapTransform();
}

function openMapModal() {
  mapView.open = true;
  if (!isAdminMode) {
    mapSelection.pendingBackNums = new Set(getSelectedBackNumbers());
  }
  el.mapModal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');

  if (!mapView.inited) {
    mapView.inited = true;
    fitMapToViewport(mapView.savedScale);
  } else {
    preserveMapCenterForViewport();
  }

  updateMapCursor();
  refreshMapDoneButton();
  refreshMapSelectionPreview();
  renderMapMarkers();
}

function closeMapModal() {
  saveMapScale(mapView.scale);
  mapView.open = false;
  el.mapModal.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
}

function replaceOrInsertZone(backNummer, x, y) {
  const index = state.backZones.findIndex((zone) => zone.backNummer === backNummer);
  const next = {
    backNummer,
    x,
    y,
    labelOffsetX: 0,
    labelOffsetY: 0
  };

  if (index >= 0) {
    state.backZones[index] = { ...state.backZones[index], ...next };
  } else {
    state.backZones.push(next);
    state.backZones.sort((a, b) => a.backNummer - b.backNummer);
  }
}

function removeZoneForBack(backNummer) {
  const before = state.backZones.length;
  state.backZones = state.backZones.filter((zone) => zone.backNummer !== backNummer);
  return before !== state.backZones.length;
}

function exportZonesJson() {
  const exportData = state.backZones
    .map((zone) => ({
      backNummer: zone.backNummer,
      x: Number(zone.x.toFixed(6)),
      y: Number(zone.y.toFixed(6)),
      labelOffsetX: Number(zone.labelOffsetX || 0),
      labelOffsetY: Number(zone.labelOffsetY || 0)
    }))
    .sort((a, b) => a.backNummer - b.backNummer);

  const blob = new Blob([`${JSON.stringify(exportData, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'back_zones.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getMapNormalizedCoordsFromEvent(event) {
  const viewportRect = el.mapViewport.getBoundingClientRect();
  const px = event.clientX - viewportRect.left;
  const py = event.clientY - viewportRect.top;

  const x = (px - mapView.tx) / (MAP_IMAGE_WIDTH * mapView.scale);
  const y = (py - mapView.ty) / (MAP_IMAGE_HEIGHT * mapView.scale);

  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y))
  };
}

function validateZoneCoverage() {
  const allBackNums = state.backar.map((b) => b.nummer);
  const zoneNums = new Set(state.backZones.map((z) => z.backNummer));
  const missing = allBackNums.filter((nr) => !zoneNums.has(nr));
  return {
    missing,
    total: allBackNums.length,
    placed: allBackNums.length - missing.length
  };
}

async function saveZones() {
  const zonesPayload = state.backZones.map((zone) => ({
    backNummer: zone.backNummer,
    x: Number(zone.x.toFixed(6)),
    y: Number(zone.y.toFixed(6)),
    labelOffsetX: Number(zone.labelOffsetX || 0),
    labelOffsetY: Number(zone.labelOffsetY || 0)
  }));

  const result = await apiPost('backZones', { zones: zonesPayload });
  state.backZones = normalizeBackZones(result.backZones || []);
  const coverage = validateZoneCoverage();
  setAdminStatus(`Zoner sparade. ${coverage.placed}/${coverage.total} backar har zon.`);
  renderMapMarkers();
}

async function loadAllData() {
  if (!hasActiveGroup()) {
    throw new Error('Inget aktivt sällskap valt.');
  }

  const groupCode = state.group.code;
  const [backarRes, ridesRes, statsRes, backZonesRes] = await Promise.all([
    apiGet('backar'),
    apiGet('rides', { groupCode }),
    apiGet('stats', { groupCode }),
    apiGet('backZones')
  ]);

  state.backar = backarRes.backar || [];
  state.rides = ridesRes.rides || [];
  state.stats = statsRes.stats || null;
  state.backZones = normalizeBackZones(backZonesRes.backZones || []);

  fillFormOptions();
  applyLatestRecordedRouteFromStorage();
  renderAll();
  renderMapMarkers();

  if (isAdminMode) {
    const coverage = validateZoneCoverage();
    setAdminStatus(`Adminläge aktivt. ${coverage.placed}/${coverage.total} backar har zon.`);
  }
}

function todayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function bindPreventViewportZoom() {
  let lastTouchEnd = 0;

  document.addEventListener(
    'touchend',
    (event) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );

  ['gesturestart', 'gesturechange', 'gestureend'].forEach((eventName) => {
    document.addEventListener(
      eventName,
      (event) => {
        event.preventDefault();
      },
      { passive: false }
    );
  });
}

function bindMapEvents() {
  el.openMapBtn.addEventListener('click', () => {
    if (state.recordedRoute.active) {
      setStatus('GPS-rutt aktiv. Spara hela rutten i ett steg.', false);
      return;
    }
    openMapModal();
  });

  el.closeMapBtn.addEventListener('click', closeMapModal);

  el.mapModal.addEventListener('click', (event) => {
    if (event.target === el.mapModal) {
      closeMapModal();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mapView.open) {
      closeMapModal();
    }
  });

  el.mapZoomInBtn.addEventListener('click', () => {
    const rect = el.mapViewport.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.2);
  });

  el.mapZoomOutBtn.addEventListener('click', () => {
    const rect = el.mapViewport.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.2);
  });

  el.mapViewport.addEventListener(
    'wheel',
    (event) => {
      if (!mapView.open) return;
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(event.clientX, event.clientY, factor);
    },
    { passive: false }
  );

  el.mapViewport.addEventListener('pointerdown', (event) => {
    if (!mapView.open) return;
    if (event.button !== 0) return;
    if (isAdminMode && !isAdminPanMode()) return;

    mapView.dragging = true;
    mapView.dragMoved = false;
    mapView.dragStartX = event.clientX;
    mapView.dragStartY = event.clientY;
    mapView.startTx = mapView.tx;
    mapView.startTy = mapView.ty;
    updateMapCursor();
    el.mapViewport.setPointerCapture(event.pointerId);
  });

  el.mapViewport.addEventListener('pointermove', (event) => {
    if (!mapView.dragging) return;
    const dx = event.clientX - mapView.dragStartX;
    const dy = event.clientY - mapView.dragStartY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      mapView.dragMoved = true;
    }

    mapView.tx = mapView.startTx + dx;
    mapView.ty = mapView.startTy + dy;
    applyMapTransform();
  });

  const endDrag = (event) => {
    if (!mapView.dragging) return;
    mapView.dragging = false;
    mapView.dragMoved = false;
    updateMapCursor();
    if (event?.pointerId !== undefined && el.mapViewport.hasPointerCapture(event.pointerId)) {
      el.mapViewport.releasePointerCapture(event.pointerId);
    }
  };

  el.mapViewport.addEventListener('pointerup', endDrag);
  el.mapViewport.addEventListener('pointercancel', endDrag);

  el.mapMarkers.addEventListener('click', (event) => {
    const target = event.target.closest('[data-zone-back]');
    if (!target) return;
    event.stopPropagation();

    const backNummer = Number(target.dataset.zoneBack);
    if (!Number.isFinite(backNummer)) return;

    if (isAdminMode) {
      el.adminBackSelect.value = String(backNummer);
      renderMapMarkers();
      centerOnBack(backNummer);
      return;
    }

    togglePendingMapBack(backNummer);
    refreshMapDoneButton();
    refreshMapSelectionPreview();
    renderMapMarkers();
  });

  el.mapSelectedPreview.addEventListener('click', (event) => {
    if (isAdminMode) return;
    const removeBtn = event.target.closest('[data-remove-selected-back]');
    if (!removeBtn) return;
    const backNummer = Number(removeBtn.dataset.removeSelectedBack);
    if (!Number.isFinite(backNummer)) return;
    mapSelection.pendingBackNums.delete(backNummer);
    refreshMapDoneButton();
    refreshMapSelectionPreview();
    renderMapMarkers();
  });

  el.mapDoneBtn.addEventListener('click', () => {
    if (isAdminMode) return;
    const selected = Array.from(mapSelection.pendingBackNums).sort((a, b) => a - b);
    if (!handleManualBackSelectionAttempt(selected)) return;
    setSelectedBackNumbersSilently(selected);
    closeMapModal();
    setStatus('');
  });

  window.addEventListener('resize', () => {
    if (mapView.open) {
      preserveMapCenterForViewport();
    }
  });

  if (isAdminMode) {
    el.adminZonePanel.classList.remove('hidden');
    updateAdminModeUI();

    el.adminBackSelect.addEventListener('change', () => {
      renderMapMarkers();
      centerOnBack(Number(el.adminBackSelect.value));
    });

    el.adminModeToggleBtn.addEventListener('click', () => {
      mapView.adminMode = mapView.adminMode === 'place' ? 'pan' : 'place';
      updateAdminModeUI();
      setAdminStatus(
        mapView.adminMode === 'place'
          ? 'Läge Placera: klick i kartan sätter zon.'
          : 'Läge Panorera: dra kartan för att flytta.'
      );
    });

    el.adminRemoveZoneBtn.addEventListener('click', () => {
      const backNummer = Number(el.adminBackSelect.value || 0);
      if (!backNummer) return;
      const removed = removeZoneForBack(backNummer);
      renderMapMarkers();
      if (removed) {
        setAdminStatus(`Tog bort zon för backe #${backNummer}. Klicka Spara zoner för att skriva till fil.`);
      } else {
        setAdminStatus(`Ingen zon fanns för backe #${backNummer}.`, false);
      }
    });

    el.mapViewport.addEventListener('click', (event) => {
      if (!mapView.open || mapView.dragMoved) return;
      if (mapView.adminMode !== 'place') return;
      if (event.target.closest('[data-zone-back]')) return;

      const backNummer = Number(el.adminBackSelect.value || 0);
      if (!backNummer) return;

      const { x, y } = getMapNormalizedCoordsFromEvent(event);
      replaceOrInsertZone(backNummer, x, y);
      renderMapMarkers();
      setSelectedBackNumbersSilently([backNummer]);
      setAdminStatus(`Zon satt för backe #${backNummer}: x=${x.toFixed(4)}, y=${y.toFixed(4)}`);
    });

    el.adminSaveZonesBtn.addEventListener('click', async () => {
      try {
        await saveZones();
      } catch (err) {
        setAdminStatus(`Kunde inte spara zoner: ${err.message}`, false);
      }
    });

    el.adminExportZonesBtn.addEventListener('click', () => {
      exportZonesJson();
      setAdminStatus('Exporterade back_zones.json.');
    });
  }
}

function bindEvents() {
  el.dateInput.value = todayDate();
  selectDefaultPersonOption();
  setDashboardTab('overview');

  el.recordedRouteClearBtn?.addEventListener('click', clearRecordedRouteSelection);
  el.overviewTabBtn?.addEventListener('click', () => setDashboardTab('overview'));
  el.backarTabBtn?.addEventListener('click', () => setDashboardTab('backar'));

  el.backInput.addEventListener('change', () => {
    const nextSelected = getSelectedBackNumbers();
    handleManualBackSelectionAttempt(nextSelected);
  });

  el.rideForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (el.saveRideBtn?.disabled) return;

    const persons = getSelectedPersons();
    const manualBackNummerList = getSelectedBackNumbers();
    const backNummerList = state.recordedRoute.active && Array.isArray(state.recordedRoute.payload?.backNummerList)
      ? state.recordedRoute.payload.backNummerList
      : manualBackNummerList;
    const payload = {
      groupCode: state.group?.code,
      persons,
      backNummerList,
      datum: el.dateInput.value
    };

    if (!payload.persons.length) {
      setStatus('Välj minst en person.', false);
      return;
    }
    if (!payload.backNummerList.length) {
      setStatus('Välj minst en backe.', false);
      return;
    }

    setSaveRideButtonState('loading');

    try {
      const result = await apiPost('ride', payload);
      state.stats = result.stats;
      if (Array.isArray(result.rides) && result.rides.length) {
        state.rides.push(...result.rides);
      } else if (result.ride) {
        state.rides.push(result.ride);
      }
      setSelectedBackNumbersSilently([]);
      mapSelection.pendingBackNums.clear();
      deactivateRecordedRoute({ clearStorage: true });
      if (mapView.open && !isAdminMode) {
        refreshMapDoneButton();
        refreshMapSelectionPreview();
        renderMapMarkers();
      }
      setStatus('');
      renderAll();
      await waitMs(500);
      setSaveRideButtonState('saved');
      if (saveRideResetTimer) {
        window.clearTimeout(saveRideResetTimer);
      }
      saveRideResetTimer = window.setTimeout(() => {
        setSaveRideButtonState('idle');
      }, 900);
    } catch (err) {
      setSaveRideButtonState('idle');
      setStatus(err.message, false);
    }
  });

  [el.filterColor, el.sortBy, el.rideStatus, el.statusPerson].forEach((node) => {
    node.addEventListener('change', renderBackarList);
  });

  bindMapEvents();
}

function bindGroupEvents() {
  el.openGroupSwitcherBtn?.addEventListener('click', () => {
    if (hasActiveGroup()) {
      setGroupEditStatus('');
      openGroupModal();
      return;
    }

    setGroupWelcomeStatus('');
    openGroupWelcomeModal('join');
  });

  el.groupModalCloseBtn?.addEventListener('click', () => {
    closeGroupModal();
  });

  el.groupModal?.addEventListener('click', (event) => {
    if (event.target === el.groupModal) {
      closeGroupModal();
    }
  });

  el.openGroupWelcomeBtn?.addEventListener('click', () => {
    closeGroupModal();
    openGroupWelcomeModal('join');
  });

  el.groupWelcomeCloseBtn?.addEventListener('click', () => {
    closeGroupWelcomeModal();
  });

  el.groupWelcomeModal?.addEventListener('click', (event) => {
    if (event.target === el.groupWelcomeModal) {
      closeGroupWelcomeModal();
    }
  });

  el.welcomeShowJoinBtn?.addEventListener('click', () => {
    showWelcomePanel('join');
    setGroupWelcomeStatus('');
  });

  el.welcomeShowCreateBtn?.addEventListener('click', () => {
    showWelcomePanel('create');
    setGroupWelcomeStatus('');
  });

  el.addCreateGroupPersonBtn?.addEventListener('click', () => {
    addDraftPerson();
  });

  el.createGroupPersonInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addDraftPerson();
    }
  });

  el.createGroupPersonsList?.addEventListener('click', (event) => {
    const removeBtn = event.target.closest('[data-remove-create-person]');
    if (!removeBtn) return;
    const person = String(removeBtn.dataset.removeCreatePerson || '').trim();
    if (!person) return;
    removeDraftPerson(person);
    setGroupWelcomeStatus('');
  });

  el.addEditGroupPersonBtn?.addEventListener('click', () => {
    addEditDraftPerson();
  });

  el.editGroupPersonInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addEditDraftPerson();
    }
  });

  el.editGroupPersonsList?.addEventListener('click', (event) => {
    const removeBtn = event.target.closest('[data-remove-edit-person]');
    if (!removeBtn) return;
    const person = String(removeBtn.dataset.removeEditPerson || '').trim();
    if (!person) return;
    removeEditDraftPerson(person);
    setGroupEditStatus('');
  });

  el.joinGroupCodeInput?.addEventListener('input', () => {
    el.joinGroupCodeInput.value = String(el.joinGroupCodeInput.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  });

  el.joinGroupBtn?.addEventListener('click', async () => {
    setGroupWelcomeStatus('');
    try {
      await activateGroupByCode(el.joinGroupCodeInput?.value || '');
      setGroupWelcomeStatus('');
      setStatus('');
    } catch (err) {
      setGroupWelcomeStatus(err.message, false);
    }
  });

  el.createGroupBtn?.addEventListener('click', async () => {
    setGroupWelcomeStatus('');
    const name = String(el.createGroupNameInput?.value || '').trim();
    const persons = [...createGroupDraft.persons];

    if (!name) {
      setGroupWelcomeStatus('Ange sällskapets namn.', false);
      return;
    }
    if (!persons.length) {
      setGroupWelcomeStatus('Ange minst en person.', false);
      return;
    }

    try {
      const res = await apiPost('createGroup', { name, persons });
      const createdGroupCode = res?.group?.code;
      if (!createdGroupCode) {
        throw new Error('Kunde inte skapa sällskap.');
      }

      await activateGroupByCode(createdGroupCode);
      setStatus(`Sällskap skapat. Kod: ${createdGroupCode}`);
      if (el.createGroupNameInput) el.createGroupNameInput.value = '';
      resetCreateGroupDraft();
      if (el.joinGroupCodeInput) el.joinGroupCodeInput.value = createdGroupCode;
      setGroupWelcomeStatus('');
    } catch (err) {
      setGroupWelcomeStatus(err.message, false);
    }
  });

  el.renameGroupBtn?.addEventListener('click', async () => {
    setGroupEditStatus('');
    if (!hasActiveGroup()) {
      setGroupEditStatus('Välj först ett sällskap.', false);
      return;
    }

    const name = String(el.renameGroupNameInput?.value || '').trim();
    if (!name) {
      setGroupEditStatus('Ange ett nytt namn.', false);
      return;
    }

    try {
      const res = await apiPost('renameGroup', {
        groupCode: state.group.code,
        name
      });
      const updatedGroup = res?.group;
      if (!updatedGroup) {
        throw new Error('Kunde inte byta namn på sällskap.');
      }

      state.group = updatedGroup;
      updateGroupBadge();
      refreshGroupModalSections();
      if (el.renameGroupNameInput) {
        el.renameGroupNameInput.value = updatedGroup.name || '';
      }
      setGroupEditStatus('Sällskapsnamn uppdaterat.');
    } catch (err) {
      setGroupEditStatus(err.message, false);
    }
  });

  el.saveEditGroupPersonsBtn?.addEventListener('click', async () => {
    setGroupEditStatus('');
    if (!hasActiveGroup()) {
      setGroupEditStatus('Välj först ett sällskap.', false);
      return;
    }
    if (!editGroupDraft.persons.length) {
      setGroupEditStatus('Ett sällskap måste ha minst en person.', false);
      return;
    }

    try {
      const res = await apiPost('updateGroupPersons', {
        groupCode: state.group.code,
        persons: editGroupDraft.persons
      });
      const updatedGroup = res?.group;
      if (!updatedGroup) {
        throw new Error('Kunde inte spara personer.');
      }

      state.group = updatedGroup;
      state.persons = Array.isArray(updatedGroup.persons) ? updatedGroup.persons : [];
      updateGroupBadge();
      seedEditGroupDraftFromState();
      refreshGroupModalSections();
      await loadAllData();
      setGroupEditStatus('Personer uppdaterade.');
    } catch (err) {
      setGroupEditStatus(err.message, false);
    }
  });
}

async function init() {
  try {
    bindPreventViewportZoom();
    initEnhancedMultiSelects();
    bindEvents();
    bindGroupEvents();
    setSaveRideButtonState('idle');
    updateGroupBadge();
    refreshGroupModalSections();
    setRideFormEnabled(false);

    const savedCode = getSavedGroupCode();
    if (savedCode) {
      try {
        await activateGroupByCode(savedCode, { closeModalOnSuccess: false });
      } catch {
        clearSavedGroupCode();
      }
    }

    if (!hasActiveGroup()) {
      openGroupWelcomeModal('join');
      setStatus('Välj eller skapa ett sällskap för att börja logga åk.', false);
    } else {
      closeGroupModal();
      closeGroupWelcomeModal();
    }
  } catch (err) {
    setStatus(`Kunde inte ladda data: ${err.message}`, false);
  }
}

init();
