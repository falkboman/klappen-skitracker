<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

const DATA_DIR = __DIR__ . '/Data';
const BACKAR_FILE = DATA_DIR . '/backar.json';
const BACK_ZONES_FILE = DATA_DIR . '/back_zones.json';
const GROUPS_DIR = DATA_DIR . '/groups';
const GROUPS_INDEX_FILE = DATA_DIR . '/groups.json';
const LEGACY_RIDES_FILE = DATA_DIR . '/rides.json';
const LEGACY_STATS_FILE = DATA_DIR . '/stats.json';
const WRITE_LOCK_FILE = DATA_DIR . '/.write.lock';

function send_json(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function ensure_dir(string $path): void {
    if (!is_dir($path) && !mkdir($path, 0775, true) && !is_dir($path)) {
        throw new RuntimeException("Could not create directory: {$path}");
    }
}

function read_json_file(string $path): array {
    $content = @file_get_contents($path);
    if ($content === false || trim($content) === '') {
        return [];
    }

    $decoded = json_decode($content, true);
    if (!is_array($decoded)) {
        return [];
    }
    return $decoded;
}

function write_json_file(string $path, array $data): void {
    $fp = fopen($path, 'c+');
    if (!$fp) {
        throw new RuntimeException("Could not open file for writing: {$path}");
    }

    try {
        if (!flock($fp, LOCK_EX)) {
            throw new RuntimeException("Could not lock file: {$path}");
        }

        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if ($json === false) {
            throw new RuntimeException("Could not encode JSON for: {$path}");
        }

        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, $json . PHP_EOL);
        fflush($fp);
        flock($fp, LOCK_UN);
    } finally {
        fclose($fp);
    }
}

function with_write_lock(callable $callback) {
    $fp = fopen(WRITE_LOCK_FILE, 'c+');
    if (!$fp) {
        throw new RuntimeException('Could not open write lock file');
    }

    try {
        if (!flock($fp, LOCK_EX)) {
            throw new RuntimeException('Could not acquire write lock');
        }

        return $callback();
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

function normalize_person_name(string $name): string {
    $name = trim($name);
    $name = preg_replace('/\s+/u', ' ', $name) ?? $name;
    return $name;
}

function normalize_group_code(string $code): string {
    return strtoupper(trim($code));
}

function generate_group_id(): string {
    return 'grp_' . bin2hex(random_bytes(6));
}

function generate_unique_group_code(array $existingCodes): string {
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $max = strlen($alphabet) - 1;

    for ($attempt = 0; $attempt < 5000; $attempt++) {
        $code = '';
        for ($i = 0; $i < 6; $i++) {
            $code .= $alphabet[random_int(0, $max)];
        }
        if (!isset($existingCodes[$code])) {
            return $code;
        }
    }

    throw new RuntimeException('Could not generate unique group code');
}

function group_dir(string $groupId): string {
    return GROUPS_DIR . '/' . $groupId;
}

function group_rides_file(string $groupId): string {
    return group_dir($groupId) . '/rides.json';
}

function group_stats_file(string $groupId): string {
    return group_dir($groupId) . '/stats.json';
}

function normalize_group_entry(array $group): ?array {
    if (!isset($group['id'], $group['code'], $group['name'], $group['persons']) || !is_array($group['persons'])) {
        return null;
    }

    $id = trim((string)$group['id']);
    $code = normalize_group_code((string)$group['code']);
    $name = trim((string)$group['name']);

    if ($id === '' || $name === '') {
        return null;
    }
    if (!preg_match('/^[A-Z0-9]{6}$/', $code)) {
        return null;
    }

    $persons = [];
    foreach ($group['persons'] as $person) {
        $normalized = normalize_person_name((string)$person);
        if ($normalized !== '') {
            $persons[$normalized] = true;
        }
    }

    $personsList = array_keys($persons);
    if (count($personsList) < 1 || count($personsList) > 20) {
        return null;
    }

    return [
        'id' => $id,
        'code' => $code,
        'name' => mb_substr($name, 0, 40, 'UTF-8'),
        'persons' => array_values($personsList),
        'createdAt' => isset($group['createdAt']) ? (string)$group['createdAt'] : date('c'),
        'updatedAt' => isset($group['updatedAt']) ? (string)$group['updatedAt'] : date('c')
    ];
}

function load_groups_index(): array {
    $groupsRaw = read_json_file(GROUPS_INDEX_FILE);
    $normalized = [];
    $seenCodes = [];
    $seenIds = [];

    foreach ($groupsRaw as $groupRaw) {
        if (!is_array($groupRaw)) {
            continue;
        }
        $group = normalize_group_entry($groupRaw);
        if ($group === null) {
            continue;
        }
        if (isset($seenCodes[$group['code']]) || isset($seenIds[$group['id']])) {
            continue;
        }

        $seenCodes[$group['code']] = true;
        $seenIds[$group['id']] = true;
        $normalized[] = $group;
    }

    return $normalized;
}

function find_group_by_code(array $groups, string $code): ?array {
    $normalizedCode = normalize_group_code($code);
    foreach ($groups as $group) {
        if (($group['code'] ?? '') === $normalizedCode) {
            return $group;
        }
    }
    return null;
}

function load_backar(): array {
    $backar = read_json_file(BACKAR_FILE);
    $normalized = [];
    foreach ($backar as $b) {
        if (!isset($b['nummer'], $b['namn'], $b['farg'])) {
            continue;
        }
        $normalized[] = [
            'nummer' => (int)$b['nummer'],
            'namn' => (string)$b['namn'],
            'farg' => mb_strtolower((string)$b['farg'], 'UTF-8'),
            'langdMeter' => max(0, (int)($b['langdMeter'] ?? 0))
        ];
    }
    return $normalized;
}

function load_rides_from_file(string $path): array {
    $rides = read_json_file($path);
    $normalized = [];

    foreach ($rides as $ride) {
        if (!isset($ride['person'], $ride['backNummer'], $ride['datum'])) {
            continue;
        }
        $normalized[] = [
            'person' => normalize_person_name((string)$ride['person']),
            'backNummer' => (int)$ride['backNummer'],
            'datum' => (string)$ride['datum']
        ];
    }

    return $normalized;
}

function load_back_zones(): array {
    $zones = read_json_file(BACK_ZONES_FILE);
    $normalized = [];
    foreach ($zones as $zone) {
        if (!isset($zone['backNummer'], $zone['x'], $zone['y'])) {
            continue;
        }

        $normalized[] = [
            'backNummer' => (int)$zone['backNummer'],
            'x' => (float)$zone['x'],
            'y' => (float)$zone['y'],
            'labelOffsetX' => isset($zone['labelOffsetX']) ? (float)$zone['labelOffsetX'] : 0.0,
            'labelOffsetY' => isset($zone['labelOffsetY']) ? (float)$zone['labelOffsetY'] : 0.0
        ];
    }

    return $normalized;
}

function validate_back_zones_payload(array $payload, array $backar): array {
    if (!isset($payload['zones']) || !is_array($payload['zones'])) {
        send_json(['error' => 'zones array is required'], 400);
    }

    $validBackNummer = [];
    foreach ($backar as $backe) {
        $validBackNummer[(int)$backe['nummer']] = true;
    }

    $seen = [];
    $validated = [];

    foreach ($payload['zones'] as $zone) {
        if (!is_array($zone) || !isset($zone['backNummer'], $zone['x'], $zone['y'])) {
            send_json(['error' => 'Each zone must contain backNummer, x and y'], 400);
        }

        $backNummer = (int)$zone['backNummer'];
        $x = (float)$zone['x'];
        $y = (float)$zone['y'];
        $labelOffsetX = isset($zone['labelOffsetX']) ? (float)$zone['labelOffsetX'] : 0.0;
        $labelOffsetY = isset($zone['labelOffsetY']) ? (float)$zone['labelOffsetY'] : 0.0;

        if (!isset($validBackNummer[$backNummer])) {
            send_json(['error' => "Invalid backNummer in zones: {$backNummer}"], 400);
        }
        if ($x < 0 || $x > 1 || $y < 0 || $y > 1) {
            send_json(['error' => "Zone coordinates must be between 0 and 1 for backNummer: {$backNummer}"], 400);
        }
        if (isset($seen[$backNummer])) {
            send_json(['error' => "Duplicate backNummer in zones: {$backNummer}"], 400);
        }

        $seen[$backNummer] = true;
        $validated[] = [
            'backNummer' => $backNummer,
            'x' => $x,
            'y' => $y,
            'labelOffsetX' => $labelOffsetX,
            'labelOffsetY' => $labelOffsetY
        ];
    }

    usort($validated, static fn($a, $b) => $a['backNummer'] <=> $b['backNummer']);
    return $validated;
}

function empty_person_stats(): array {
    return [
        'totalRides' => 0,
        'unikaBackar' => 0,
        'ridesByColor' => [
            'grön' => 0,
            'blå' => 0,
            'röd' => 0,
            'svart' => 0
        ],
        'achievements' => [
            'alla_backar' => false,
            'alla_grona' => false,
            'alla_bla' => false,
            'alla_roda' => false,
            'alla_svarta' => false,
            'tio_i_samma_backe' => false
        ],
        'stjarnor' => 0
    ];
}

function build_stats(array $rides, array $backar, array $persons): array {
    $backarByNummer = [];
    $allByColor = [
        'grön' => [],
        'blå' => [],
        'röd' => [],
        'svart' => []
    ];

    foreach ($backar as $backe) {
        $nr = (int)$backe['nummer'];
        $farg = mb_strtolower((string)$backe['farg'], 'UTF-8');
        $backarByNummer[$nr] = $backe;
        if (isset($allByColor[$farg])) {
            $allByColor[$farg][] = $nr;
        }
    }

    $totals = [
        'totalRides' => 0,
        'totalDistanceMeter' => 0,
        'ridesByColor' => [
            'grön' => 0,
            'blå' => 0,
            'röd' => 0,
            'svart' => 0
        ],
        'activeDaysCount' => 0,
        'personsCount' => count($persons),
        'avgRidesPerPersonPerActiveDay' => 0,
        'avgSameBackPerPersonPerActiveDay' => 0,
        'teamAchievements' => [
            'snitt_35_backar_per_person_dag' => false,
            'snitt_5_samma_backe_per_person_dag' => false,
            'tolv_mil_samma_dag' => false,
            'alla_backar_samma_dag' => false
        ],
        'teamStars' => 0,
        'teamProgressBestDay' => [
            'maxRidesPerPersonSingleDay' => 0,
            'maxSameBackPerPersonSingleDay' => 0,
            'maxDistanceSingleDayMeter' => 0,
            'maxUniqueBackarSingleDay' => 0,
            'targetRidesPerPersonSingleDay' => 35,
            'targetSameBackPerPersonSingleDay' => 5,
            'targetDistanceSingleDayMeter' => count($persons) * 40000,
            'targetUniqueBackarSingleDay' => count($backarByNummer)
        ]
    ];

    $personStats = [];
    $rideCountsByPerson = [];
    foreach ($persons as $person) {
        $personStats[$person] = empty_person_stats();
        $rideCountsByPerson[$person] = [];
    }

    $ridesPerPersonTemplate = array_fill_keys($persons, 0);
    $activeDates = [];
    $ridesPerDayTotal = [];
    $ridesPerDayBack = [];
    $distancePerDay = [];
    $uniqueBackarPerDay = [];

    $backStats = [];
    foreach ($backar as $backe) {
        $nr = (int)$backe['nummer'];
        $backStats[(string)$nr] = [
            'backNummer' => $nr,
            'namn' => $backe['namn'],
            'farg' => $backe['farg'],
            'ridesPerPerson' => $ridesPerPersonTemplate,
            'totalRides' => 0,
            'latestDate' => null,
            'personsWhoRode' => []
        ];
    }

    $allowedPersonSet = array_fill_keys($persons, true);

    foreach ($rides as $ride) {
        $person = normalize_person_name((string)$ride['person']);
        $nr = (int)$ride['backNummer'];
        $datum = (string)$ride['datum'];

        if (!isset($allowedPersonSet[$person]) || !isset($backarByNummer[$nr])) {
            continue;
        }

        $personStats[$person]['totalRides']++;
        $totals['totalRides']++;
        $totals['totalDistanceMeter'] += max(0, (int)($backarByNummer[$nr]['langdMeter'] ?? 0));
        if (!isset($rideCountsByPerson[$person][$nr])) {
            $rideCountsByPerson[$person][$nr] = 0;
        }
        $rideCountsByPerson[$person][$nr]++;

        $farg = mb_strtolower((string)$backarByNummer[$nr]['farg'], 'UTF-8');
        if (isset($personStats[$person]['ridesByColor'][$farg])) {
            $personStats[$person]['ridesByColor'][$farg]++;
        }
        if (isset($totals['ridesByColor'][$farg])) {
            $totals['ridesByColor'][$farg]++;
        }

        $key = (string)$nr;
        $backStats[$key]['totalRides']++;
        $backStats[$key]['ridesPerPerson'][$person]++;
        if ($backStats[$key]['latestDate'] === null || $datum > $backStats[$key]['latestDate']) {
            $backStats[$key]['latestDate'] = $datum;
        }

        if ($datum !== '') {
            $activeDates[$datum] = true;
            if (!isset($ridesPerDayTotal[$datum])) {
                $ridesPerDayTotal[$datum] = 0;
            }
            $ridesPerDayTotal[$datum]++;

            if (!isset($ridesPerDayBack[$datum])) {
                $ridesPerDayBack[$datum] = [];
            }
            if (!isset($ridesPerDayBack[$datum][$nr])) {
                $ridesPerDayBack[$datum][$nr] = 0;
            }
            $ridesPerDayBack[$datum][$nr]++;

            if (!isset($uniqueBackarPerDay[$datum])) {
                $uniqueBackarPerDay[$datum] = [];
            }
            $uniqueBackarPerDay[$datum][$nr] = true;

            if (!isset($distancePerDay[$datum])) {
                $distancePerDay[$datum] = 0;
            }
            $distancePerDay[$datum] += max(0, (int)($backarByNummer[$nr]['langdMeter'] ?? 0));
        }
    }

    foreach ($persons as $person) {
        $riddenNumbers = array_keys($rideCountsByPerson[$person]);
        $riddenSet = array_fill_keys(array_map('intval', $riddenNumbers), true);

        $personStats[$person]['unikaBackar'] = count($riddenNumbers);

        $hasAllBackar = count($backarByNummer) > 0 && count(array_diff(array_keys($backarByNummer), array_map('intval', $riddenNumbers))) === 0;
        $hasAllGrona = count($allByColor['grön']) > 0 && count(array_diff($allByColor['grön'], array_keys($riddenSet))) === 0;
        $hasAllBla = count($allByColor['blå']) > 0 && count(array_diff($allByColor['blå'], array_keys($riddenSet))) === 0;
        $hasAllRoda = count($allByColor['röd']) > 0 && count(array_diff($allByColor['röd'], array_keys($riddenSet))) === 0;
        $hasAllSvarta = count($allByColor['svart']) > 0 && count(array_diff($allByColor['svart'], array_keys($riddenSet))) === 0;

        $tenSame = false;
        foreach ($rideCountsByPerson[$person] as $cnt) {
            if ($cnt >= 10) {
                $tenSame = true;
                break;
            }
        }

        $personStats[$person]['achievements'] = [
            'alla_backar' => $hasAllBackar,
            'alla_grona' => $hasAllGrona,
            'alla_bla' => $hasAllBla,
            'alla_roda' => $hasAllRoda,
            'alla_svarta' => $hasAllSvarta,
            'tio_i_samma_backe' => $tenSame
        ];

        $personStats[$person]['stjarnor'] = count(array_filter($personStats[$person]['achievements']));
    }

    foreach ($backStats as $key => $backStat) {
        $people = [];
        foreach ($backStat['ridesPerPerson'] as $person => $count) {
            if ($count > 0) {
                $people[] = $person;
            }
        }
        $backStats[$key]['personsWhoRode'] = $people;
    }

    $activeDaysCount = count($activeDates);
    $personsCount = max(1, (int)$totals['personsCount']);
    $denominator = $personsCount * max(1, $activeDaysCount);

    $maxRidesPerPersonSingleDay = 0.0;
    foreach ($ridesPerDayTotal as $ridesCountOnDay) {
        $ridesPerPerson = $ridesCountOnDay / $personsCount;
        if ($ridesPerPerson > $maxRidesPerPersonSingleDay) {
            $maxRidesPerPersonSingleDay = $ridesPerPerson;
        }
    }

    $maxSameBackPerPersonSingleDay = 0.0;
    $maxSameBackSum = 0;
    foreach ($ridesPerDayBack as $backCountsOnDay) {
        if (count($backCountsOnDay) === 0) {
            continue;
        }
        $maxSameBackCountOnDay = max($backCountsOnDay);
        $maxSameBackSum += $maxSameBackCountOnDay;
        $sameBackPerPerson = $maxSameBackCountOnDay / $personsCount;
        if ($sameBackPerPerson > $maxSameBackPerPersonSingleDay) {
            $maxSameBackPerPersonSingleDay = $sameBackPerPerson;
        }
    }

    $totals['activeDaysCount'] = $activeDaysCount;
    $totals['avgRidesPerPersonPerActiveDay'] = round($totals['totalRides'] / $denominator, 2);
    $totals['avgSameBackPerPersonPerActiveDay'] = round($maxSameBackSum / $denominator, 2);

    $maxUniqueBackarSingleDay = 0;
    foreach ($uniqueBackarPerDay as $backarOnDay) {
        $uniqueCount = count($backarOnDay);
        if ($uniqueCount > $maxUniqueBackarSingleDay) {
            $maxUniqueBackarSingleDay = $uniqueCount;
        }
    }
    $targetUniqueBackarSingleDay = count($backarByNummer);

    $maxDistanceSingleDay = 0;
    foreach ($distancePerDay as $distanceOnDay) {
        if ($distanceOnDay > $maxDistanceSingleDay) {
            $maxDistanceSingleDay = $distanceOnDay;
        }
    }
    $targetDistanceSingleDay = $personsCount * 40000;

    $totals['teamAchievements'] = [
        'snitt_35_backar_per_person_dag' => $maxRidesPerPersonSingleDay > 35,
        'snitt_5_samma_backe_per_person_dag' => $maxSameBackPerPersonSingleDay >= 5,
        'tolv_mil_samma_dag' => $maxDistanceSingleDay >= $targetDistanceSingleDay,
        'alla_backar_samma_dag' => $targetUniqueBackarSingleDay > 0 && $maxUniqueBackarSingleDay >= $targetUniqueBackarSingleDay
    ];
    $totals['teamStars'] = count(array_filter($totals['teamAchievements']));
    $totals['teamProgressBestDay'] = [
        'maxRidesPerPersonSingleDay' => round($maxRidesPerPersonSingleDay, 2),
        'maxSameBackPerPersonSingleDay' => round($maxSameBackPerPersonSingleDay, 2),
        'maxDistanceSingleDayMeter' => $maxDistanceSingleDay,
        'maxUniqueBackarSingleDay' => $maxUniqueBackarSingleDay,
        'targetRidesPerPersonSingleDay' => 35,
        'targetSameBackPerPersonSingleDay' => 5,
        'targetDistanceSingleDayMeter' => $targetDistanceSingleDay,
        'targetUniqueBackarSingleDay' => $targetUniqueBackarSingleDay
    ];

    return [
        'updatedAt' => date('c'),
        'persons' => $personStats,
        'backar' => $backStats,
        'totals' => $totals
    ];
}

function is_stats_shape_valid(array $stats): bool {
    return isset($stats['totals'])
        && isset($stats['persons'])
        && isset($stats['backar'])
        && isset($stats['totals']['teamProgressBestDay'])
        && isset($stats['totals']['teamAchievements']['tolv_mil_samma_dag'])
        && isset($stats['totals']['teamAchievements']['alla_backar_samma_dag'])
        && isset($stats['totals']['teamProgressBestDay']['maxDistanceSingleDayMeter'])
        && isset($stats['totals']['teamProgressBestDay']['maxUniqueBackarSingleDay']);
}

function derive_legacy_persons(array $rides, array $legacyStats): array {
    $persons = [];

    if (isset($legacyStats['persons']) && is_array($legacyStats['persons'])) {
        foreach (array_keys($legacyStats['persons']) as $person) {
            $normalized = normalize_person_name((string)$person);
            if ($normalized !== '') {
                $persons[$normalized] = true;
            }
        }
    }

    foreach ($rides as $ride) {
        $normalized = normalize_person_name((string)($ride['person'] ?? ''));
        if ($normalized !== '') {
            $persons[$normalized] = true;
        }
    }

    $list = array_keys($persons);
    sort($list, SORT_NATURAL | SORT_FLAG_CASE);
    if (count($list) === 0) {
        $list = ['Person 1'];
    }
    return array_slice($list, 0, 20);
}

function ensure_group_files(array $group, array $backar): void {
    $dir = group_dir($group['id']);
    ensure_dir($dir);

    $ridesPath = group_rides_file($group['id']);
    $statsPath = group_stats_file($group['id']);

    if (!file_exists($ridesPath)) {
        write_json_file($ridesPath, []);
    }

    if (!file_exists($statsPath)) {
        $rides = load_rides_from_file($ridesPath);
        $stats = build_stats($rides, $backar, $group['persons']);
        write_json_file($statsPath, $stats);
    }
}

function migrate_legacy_data_if_needed(array $backar): void {
    if (file_exists(GROUPS_INDEX_FILE)) {
        return;
    }

    with_write_lock(static function () use ($backar): void {
        if (file_exists(GROUPS_INDEX_FILE)) {
            return;
        }

        $legacyRides = file_exists(LEGACY_RIDES_FILE) ? load_rides_from_file(LEGACY_RIDES_FILE) : [];
        $legacyStats = file_exists(LEGACY_STATS_FILE) ? read_json_file(LEGACY_STATS_FILE) : [];

        $persons = derive_legacy_persons($legacyRides, $legacyStats);
        $groupId = generate_group_id();
        $groupCode = generate_unique_group_code([]);
        $now = date('c');

        $group = [
            'id' => $groupId,
            'code' => $groupCode,
            'name' => 'Kläppen Original',
            'persons' => $persons,
            'createdAt' => $now,
            'updatedAt' => $now
        ];

        ensure_dir(group_dir($groupId));
        write_json_file(group_rides_file($groupId), $legacyRides);
        write_json_file(group_stats_file($groupId), build_stats($legacyRides, $backar, $persons));
        write_json_file(GROUPS_INDEX_FILE, [$group]);
    });
}

function ensure_data_files(): void {
    ensure_dir(DATA_DIR);

    if (!file_exists(BACKAR_FILE)) {
        send_json(['error' => 'Missing Data/backar.json'], 500);
    }

    if (!file_exists(BACK_ZONES_FILE)) {
        write_json_file(BACK_ZONES_FILE, []);
    }

    ensure_dir(GROUPS_DIR);

    $backar = load_backar();
    migrate_legacy_data_if_needed($backar);

    if (!file_exists(GROUPS_INDEX_FILE)) {
        write_json_file(GROUPS_INDEX_FILE, []);
    }

    $groups = load_groups_index();
    foreach ($groups as $group) {
        ensure_group_files($group, $backar);
    }
}

function require_post_json(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    if (!is_array($data)) {
        send_json(['error' => 'Invalid JSON body'], 400);
    }
    return $data;
}

function validate_date(string $date): bool {
    $d = DateTime::createFromFormat('Y-m-d', $date);
    return $d && $d->format('Y-m-d') === $date;
}

function parse_group_persons_payload(array $payload): array {
    if (!isset($payload['persons']) || !is_array($payload['persons'])) {
        send_json(['error' => 'persons array is required'], 400);
    }

    $persons = [];
    foreach ($payload['persons'] as $person) {
        $normalized = normalize_person_name((string)$person);
        if ($normalized !== '') {
            $persons[$normalized] = true;
        }
    }

    $list = array_values(array_keys($persons));
    if (count($list) < 1) {
        send_json(['error' => 'At least one person is required'], 400);
    }
    if (count($list) > 20) {
        send_json(['error' => 'Maximum 20 persons are allowed'], 400);
    }

    return $list;
}

function parse_group_name_payload(array $payload): string {
    $name = trim((string)($payload['name'] ?? ''));
    if ($name === '') {
        send_json(['error' => 'name is required'], 400);
    }

    $name = preg_replace('/\s+/u', ' ', $name) ?? $name;
    if (mb_strlen($name, 'UTF-8') > 40) {
        send_json(['error' => 'name must be at most 40 characters'], 400);
    }

    return $name;
}

function require_group_code_from_query(): string {
    $groupCode = normalize_group_code((string)($_GET['groupCode'] ?? ''));
    if (!preg_match('/^[A-Z0-9]{6}$/', $groupCode)) {
        send_json(['error' => 'groupCode is required and must be 6 alphanumeric chars'], 400);
    }
    return $groupCode;
}

function require_group_code_from_payload(array $payload): string {
    $groupCode = normalize_group_code((string)($payload['groupCode'] ?? ''));
    if (!preg_match('/^[A-Z0-9]{6}$/', $groupCode)) {
        send_json(['error' => 'groupCode is required and must be 6 alphanumeric chars'], 400);
    }
    return $groupCode;
}

function get_group_or_404(string $groupCode): array {
    $groups = load_groups_index();
    $group = find_group_by_code($groups, $groupCode);
    if ($group === null) {
        send_json(['error' => 'Group not found'], 404);
    }
    return $group;
}

function parse_persons_from_payload(array $payload, array $allowedPersons): array {
    if (isset($payload['persons']) && is_array($payload['persons'])) {
        $persons = array_map(static fn($p) => normalize_person_name((string)$p), $payload['persons']);
    } else {
        $personRaw = normalize_person_name((string)($payload['person'] ?? ''));
        $parts = preg_split('/\s*(?:&|,|\+|och)\s*/ui', $personRaw) ?: [];
        $persons = count($parts) > 0 ? array_map('normalize_person_name', $parts) : [$personRaw];
    }

    $persons = array_values(array_unique(array_filter($persons, static fn($p) => $p !== '')));

    if (count($persons) === 0) {
        send_json(['error' => 'At least one person is required'], 400);
    }

    $allowed = array_fill_keys($allowedPersons, true);
    foreach ($persons as $person) {
        if (!isset($allowed[$person])) {
            send_json(['error' => "Unknown person in this group: {$person}"], 400);
        }
    }

    return $persons;
}

function parse_back_numbers_from_payload(array $payload, array $backar): array {
    $raw = [];
    if (isset($payload['backNummerList']) && is_array($payload['backNummerList'])) {
        $raw = $payload['backNummerList'];
    } elseif (isset($payload['backNummer'])) {
        $raw = [$payload['backNummer']];
    }

    $backNums = array_values(array_map(static fn($n) => (int)$n, $raw));
    $backNums = array_values(array_filter($backNums, static fn($n) => $n > 0));

    if (count($backNums) === 0) {
        send_json(['error' => 'At least one backNummer is required'], 400);
    }

    $validBackNums = [];
    foreach ($backar as $b) {
        $validBackNums[(int)$b['nummer']] = true;
    }

    foreach ($backNums as $backNummer) {
        if (!isset($validBackNums[$backNummer])) {
            send_json(['error' => "Invalid backNummer: {$backNummer}"], 400);
        }
    }

    return $backNums;
}

try {
    ensure_data_files();

    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET' && $action === 'backar') {
        send_json(['backar' => load_backar()]);
    }

    if ($method === 'GET' && $action === 'backZones') {
        send_json(['backZones' => load_back_zones()]);
    }

    if ($method === 'GET' && $action === 'group') {
        $code = normalize_group_code((string)($_GET['code'] ?? ''));
        if (!preg_match('/^[A-Z0-9]{6}$/', $code)) {
            send_json(['error' => 'code is required and must be 6 alphanumeric chars'], 400);
        }

        $group = get_group_or_404($code);
        send_json(['group' => $group]);
    }

    if ($method === 'GET' && $action === 'rides') {
        $groupCode = require_group_code_from_query();
        $group = get_group_or_404($groupCode);
        send_json(['rides' => load_rides_from_file(group_rides_file($group['id']))]);
    }

    if ($method === 'GET' && $action === 'stats') {
        $groupCode = require_group_code_from_query();
        $group = get_group_or_404($groupCode);

        $rides = load_rides_from_file(group_rides_file($group['id']));
        $stats = read_json_file(group_stats_file($group['id']));
        if ($stats === [] || !is_stats_shape_valid($stats)) {
            $stats = build_stats($rides, load_backar(), $group['persons']);
            write_json_file(group_stats_file($group['id']), $stats);
        }

        send_json(['stats' => $stats]);
    }

    if ($method === 'POST' && $action === 'createGroup') {
        $payload = require_post_json();
        $name = parse_group_name_payload($payload);
        $persons = parse_group_persons_payload($payload);

        $createdGroup = with_write_lock(static function () use ($name, $persons): array {
            $groups = load_groups_index();
            $existingCodes = [];
            $existingIds = [];
            foreach ($groups as $g) {
                $existingCodes[$g['code']] = true;
                $existingIds[$g['id']] = true;
            }

            do {
                $groupId = generate_group_id();
            } while (isset($existingIds[$groupId]));

            $groupCode = generate_unique_group_code($existingCodes);
            $now = date('c');
            $group = [
                'id' => $groupId,
                'code' => $groupCode,
                'name' => $name,
                'persons' => $persons,
                'createdAt' => $now,
                'updatedAt' => $now
            ];

            $groups[] = $group;
            write_json_file(GROUPS_INDEX_FILE, $groups);

            ensure_dir(group_dir($groupId));
            write_json_file(group_rides_file($groupId), []);
            write_json_file(group_stats_file($groupId), build_stats([], load_backar(), $persons));

            return $group;
        });

        send_json(['ok' => true, 'group' => $createdGroup], 201);
    }

    if ($method === 'POST' && $action === 'renameGroup') {
        $payload = require_post_json();
        $groupCode = require_group_code_from_payload($payload);
        $newName = parse_group_name_payload($payload);

        $updatedGroup = with_write_lock(static function () use ($groupCode, $newName): array {
            $groups = load_groups_index();
            $targetCode = normalize_group_code($groupCode);
            $updated = null;
            $now = date('c');

            foreach ($groups as &$group) {
                if (($group['code'] ?? '') !== $targetCode) {
                    continue;
                }
                $group['name'] = $newName;
                $group['updatedAt'] = $now;
                $updated = $group;
                break;
            }
            unset($group);

            if ($updated === null) {
                send_json(['error' => 'Group not found'], 404);
            }

            write_json_file(GROUPS_INDEX_FILE, $groups);
            return $updated;
        });

        send_json(['ok' => true, 'group' => $updatedGroup]);
    }

    if ($method === 'POST' && $action === 'updateGroupPersons') {
        $payload = require_post_json();
        $groupCode = require_group_code_from_payload($payload);
        $persons = parse_group_persons_payload($payload);

        $result = with_write_lock(static function () use ($groupCode, $persons): array {
            $groups = load_groups_index();
            $targetCode = normalize_group_code($groupCode);
            $updatedGroup = null;
            $now = date('c');

            foreach ($groups as &$group) {
                if (($group['code'] ?? '') !== $targetCode) {
                    continue;
                }
                $group['persons'] = $persons;
                $group['updatedAt'] = $now;
                $updatedGroup = $group;
                break;
            }
            unset($group);

            if ($updatedGroup === null) {
                send_json(['error' => 'Group not found'], 404);
            }

            write_json_file(GROUPS_INDEX_FILE, $groups);

            $backar = load_backar();
            $rides = load_rides_from_file(group_rides_file($updatedGroup['id']));
            $stats = build_stats($rides, $backar, $persons);
            write_json_file(group_stats_file($updatedGroup['id']), $stats);

            return [
                'group' => $updatedGroup,
                'stats' => $stats
            ];
        });

        send_json(['ok' => true, 'group' => $result['group'], 'stats' => $result['stats']]);
    }

    if ($method === 'POST' && $action === 'ride') {
        $payload = require_post_json();
        $groupCode = require_group_code_from_payload($payload);
        $group = get_group_or_404($groupCode);

        $persons = parse_persons_from_payload($payload, $group['persons']);
        $datum = (string)($payload['datum'] ?? '');

        if (!validate_date($datum)) {
            send_json(['error' => 'Invalid date, expected YYYY-MM-DD'], 400);
        }

        $backar = load_backar();
        $backNummerList = parse_back_numbers_from_payload($payload, $backar);

        $result = with_write_lock(static function () use ($persons, $backNummerList, $datum, $backar, $group): array {
            $ridesPath = group_rides_file($group['id']);
            $statsPath = group_stats_file($group['id']);

            $rides = load_rides_from_file($ridesPath);
            $newRides = [];
            foreach ($persons as $person) {
                foreach ($backNummerList as $backNummer) {
                    $newRide = [
                        'person' => $person,
                        'backNummer' => $backNummer,
                        'datum' => $datum
                    ];
                    $rides[] = $newRide;
                    $newRides[] = $newRide;
                }
            }

            write_json_file($ridesPath, $rides);

            $stats = build_stats($rides, $backar, $group['persons']);
            write_json_file($statsPath, $stats);

            return [
                'newRides' => $newRides,
                'stats' => $stats
            ];
        });

        $newRides = $result['newRides'];
        $stats = $result['stats'];

        send_json([
            'ok' => true,
            'ride' => end($newRides),
            'rides' => $newRides,
            'stats' => $stats
        ]);
    }

    if ($method === 'POST' && $action === 'backZones') {
        $payload = require_post_json();
        $backar = load_backar();
        $zones = validate_back_zones_payload($payload, $backar);
        write_json_file(BACK_ZONES_FILE, $zones);
        send_json(['ok' => true, 'backZones' => $zones]);
    }

    send_json(['error' => 'Unsupported action or method'], 404);
} catch (Throwable $e) {
    send_json(['error' => $e->getMessage()], 500);
}
