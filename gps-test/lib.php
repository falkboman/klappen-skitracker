<?php
declare(strict_types=1);

const GPS_TEST_DATA_DIR = __DIR__ . '/../Data';
const GPS_TEST_BACKAR_FILE = GPS_TEST_DATA_DIR . '/backar.json';
const GPS_TEST_LIFTAR_FILE = GPS_TEST_DATA_DIR . '/liftar.json';
const GPS_TEST_BACK_DEFS_FILE = GPS_TEST_DATA_DIR . '/gps_back_defs.geojson';
const GPS_TEST_LIFT_DEFS_FILE = GPS_TEST_DATA_DIR . '/gps_lift_defs.geojson';
const GPS_TEST_BACK_RUNS_FILE = GPS_TEST_DATA_DIR . '/gps_back_runs.json';
const GPS_TEST_LIFT_RUNS_FILE = GPS_TEST_DATA_DIR . '/gps_lift_runs.json';
const GPS_TEST_TRACKS_DIR = GPS_TEST_DATA_DIR . '/gps_tracks';

function gps_test_read_json_file(string $path): array {
    $content = @file_get_contents($path);
    if ($content === false || trim($content) === '') {
        return [];
    }

    $decoded = json_decode($content, true);
    return is_array($decoded) ? $decoded : [];
}

function gps_test_write_json_file(string $path, array $data): void {
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
            throw new RuntimeException("Could not encode json: {$path}");
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

function gps_test_empty_feature_collection(): array {
    return [
        'type' => 'FeatureCollection',
        'features' => []
    ];
}

function gps_test_ensure_data_files(): void {
    if (!is_dir(GPS_TEST_DATA_DIR)) {
        mkdir(GPS_TEST_DATA_DIR, 0775, true);
    }
    if (!file_exists(GPS_TEST_BACK_DEFS_FILE)) {
        gps_test_write_json_file(GPS_TEST_BACK_DEFS_FILE, gps_test_empty_feature_collection());
    }
    if (!file_exists(GPS_TEST_LIFT_DEFS_FILE)) {
        gps_test_write_json_file(GPS_TEST_LIFT_DEFS_FILE, gps_test_empty_feature_collection());
    }
    if (!file_exists(GPS_TEST_BACK_RUNS_FILE)) {
        gps_test_write_json_file(GPS_TEST_BACK_RUNS_FILE, gps_test_empty_back_runs_store());
    }
    if (!file_exists(GPS_TEST_LIFT_RUNS_FILE)) {
        gps_test_write_json_file(GPS_TEST_LIFT_RUNS_FILE, gps_test_empty_lift_runs_store());
    }
    if (!is_dir(GPS_TEST_TRACKS_DIR)) {
        mkdir(GPS_TEST_TRACKS_DIR, 0775, true);
    }
}

function gps_test_load_backar(): array {
    $raw = gps_test_read_json_file(GPS_TEST_BACKAR_FILE);
    $normalized = [];

    foreach ($raw as $item) {
        if (!isset($item['nummer'], $item['namn'])) {
            continue;
        }

        $nr = (int)$item['nummer'];
        if ($nr <= 0) {
            continue;
        }

        $normalized[] = [
            'nummer' => $nr,
            'namn' => (string)$item['namn'],
            'farg' => isset($item['farg']) ? mb_strtolower((string)$item['farg'], 'UTF-8') : '',
            'langdMeter' => isset($item['langdMeter']) ? max(0, (int)$item['langdMeter']) : 0
        ];
    }

    return $normalized;
}

function gps_test_backar_by_nummer(array $backar): array {
    $map = [];
    foreach ($backar as $backe) {
        $map[(int)$backe['nummer']] = $backe;
    }
    return $map;
}

function gps_test_load_liftar(): array {
    $raw = gps_test_read_json_file(GPS_TEST_LIFTAR_FILE);
    $normalized = [];
    $seenUid = [];

    foreach ($raw as $item) {
        if (!is_array($item)) {
            continue;
        }

        $uid = trim((string)($item['uid'] ?? ''));
        $id = trim((string)($item['id'] ?? ''));
        $namn = trim((string)($item['namn'] ?? ''));
        if ($uid === '' || $id === '' || $namn === '') {
            continue;
        }
        if (isset($seenUid[$uid])) {
            continue;
        }
        $seenUid[$uid] = true;

        $normalized[] = [
            'uid' => $uid,
            'id' => $id,
            'gpsKey' => isset($item['gpsKey']) ? trim((string)$item['gpsKey']) : $id,
            'namn' => $namn,
            'langdMeter' => isset($item['langdMeter']) ? max(0, (int)$item['langdMeter']) : 0
        ];
    }

    usort($normalized, static fn($a, $b) => strcmp((string)$a['uid'], (string)$b['uid']));
    return $normalized;
}

function gps_test_liftar_by_uid(array $liftar): array {
    $map = [];
    foreach ($liftar as $lift) {
        $uid = trim((string)($lift['uid'] ?? ''));
        if ($uid === '') {
            continue;
        }
        $map[$uid] = $lift;
    }
    return $map;
}

function gps_test_validate_linestring_coordinates(mixed $coordinates): array {
    if (!is_array($coordinates) || count($coordinates) < 2) {
        throw new InvalidArgumentException('LineString must contain at least 2 coordinates');
    }

    $normalized = [];
    foreach ($coordinates as $coord) {
        if (!is_array($coord) || count($coord) < 2) {
            throw new InvalidArgumentException('Each coordinate must be [lon, lat]');
        }

        $lon = (float)$coord[0];
        $lat = (float)$coord[1];

        if (!is_finite($lon) || !is_finite($lat) || $lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
            throw new InvalidArgumentException('Invalid coordinate in LineString');
        }

        $normalized[] = [
            round($lon, 7),
            round($lat, 7)
        ];
    }

    return $normalized;
}

function gps_test_validate_back_defs_geojson(array $geojson, array $backarByNummer): array {
    if (($geojson['type'] ?? '') !== 'FeatureCollection' || !isset($geojson['features']) || !is_array($geojson['features'])) {
        throw new InvalidArgumentException('GeoJSON must be a FeatureCollection with a features array');
    }

    $seenBackNums = [];
    $normalizedFeatures = [];

    foreach ($geojson['features'] as $feature) {
        if (!is_array($feature) || ($feature['type'] ?? '') !== 'Feature') {
            throw new InvalidArgumentException('Each item in features must be a Feature');
        }

        $geometry = $feature['geometry'] ?? null;
        $properties = $feature['properties'] ?? null;

        if (!is_array($geometry) || ($geometry['type'] ?? '') !== 'LineString') {
            throw new InvalidArgumentException('Each feature must have a LineString geometry');
        }
        if (!is_array($properties)) {
            throw new InvalidArgumentException('Each feature must have properties');
        }

        $backNummer = (int)($properties['backNummer'] ?? 0);
        if ($backNummer <= 0 || !isset($backarByNummer[$backNummer])) {
            throw new InvalidArgumentException("Unknown or invalid backNummer: {$backNummer}");
        }
        if (isset($seenBackNums[$backNummer])) {
            throw new InvalidArgumentException("Duplicate backNummer in backDefs: {$backNummer}");
        }
        $seenBackNums[$backNummer] = true;

        $name = trim((string)($properties['namn'] ?? $backarByNummer[$backNummer]['namn']));
        if ($name === '') {
            $name = (string)$backarByNummer[$backNummer]['namn'];
        }

        $widthMeters = (float)($properties['widthMeters'] ?? 25.0);
        if (!is_finite($widthMeters) || $widthMeters <= 0) {
            $widthMeters = 25.0;
        }
        $widthMeters = max(5.0, min($widthMeters, 80.0));

        $source = strtolower(trim((string)($properties['source'] ?? 'imported')));
        if (!in_array($source, ['recorded', 'imported', 'single_run', 'median'], true)) {
            $source = 'imported';
        }

        $updatedAt = (string)($properties['updatedAt'] ?? date('c'));

        $coordinates = gps_test_validate_linestring_coordinates($geometry['coordinates'] ?? null);

        $normalizedFeatures[] = [
            'type' => 'Feature',
            'properties' => [
                'backNummer' => $backNummer,
                'namn' => $name,
                'widthMeters' => round($widthMeters, 2),
                'source' => $source,
                'updatedAt' => $updatedAt
            ],
            'geometry' => [
                'type' => 'LineString',
                'coordinates' => $coordinates
            ]
        ];
    }

    usort($normalizedFeatures, static fn($a, $b) => (int)$a['properties']['backNummer'] <=> (int)$b['properties']['backNummer']);

    return [
        'type' => 'FeatureCollection',
        'features' => $normalizedFeatures
    ];
}

function gps_test_load_back_defs(array $backarByNummer): array {
    $raw = gps_test_read_json_file(GPS_TEST_BACK_DEFS_FILE);
    if ($raw === []) {
        return gps_test_empty_feature_collection();
    }

    try {
        return gps_test_validate_back_defs_geojson($raw, $backarByNummer);
    } catch (Throwable $e) {
        return gps_test_empty_feature_collection();
    }
}

function gps_test_empty_back_runs_store(): array {
    return [
        'version' => 1,
        'backRuns' => []
    ];
}

function gps_test_clamp(float $value, float $min, float $max): float {
    return max($min, min($max, $value));
}

function gps_test_generate_run_id(): string {
    return 'run_' . bin2hex(random_bytes(6));
}

function gps_test_median(array $values): float {
    if (count($values) === 0) {
        return 0.0;
    }

    sort($values, SORT_NUMERIC);
    $count = count($values);
    $middle = intdiv($count, 2);

    if ($count % 2 === 1) {
        return (float)$values[$middle];
    }

    return ((float)$values[$middle - 1] + (float)$values[$middle]) / 2.0;
}

function gps_test_percentile(array $values, float $p): float {
    if (count($values) === 0) {
        return 0.0;
    }

    sort($values, SORT_NUMERIC);
    $p = gps_test_clamp($p, 0.0, 1.0);
    $pos = $p * (count($values) - 1);
    $low = (int)floor($pos);
    $high = (int)ceil($pos);

    if ($low === $high) {
        return (float)$values[$low];
    }

    $weight = $pos - $low;
    return (float)$values[$low] * (1.0 - $weight) + (float)$values[$high] * $weight;
}

function gps_test_point_distance_meters(array $a, array $b): float {
    $latA = (float)$a[1];
    $lonA = (float)$a[0];
    $latB = (float)$b[1];
    $lonB = (float)$b[0];
    $latRef = ($latA + $latB) / 2.0;

    [$ax, $ay] = gps_test_latlon_to_xy_meters($latA, $lonA, $latRef);
    [$bx, $by] = gps_test_latlon_to_xy_meters($latB, $lonB, $latRef);

    $dx = $bx - $ax;
    $dy = $by - $ay;
    return sqrt($dx * $dx + $dy * $dy);
}

function gps_test_normalize_run_coordinates(array $coordinates): array {
    $coordinates = gps_test_validate_linestring_coordinates($coordinates);
    $normalized = [];
    $prev = null;

    foreach ($coordinates as $coord) {
        if ($prev !== null && abs($coord[0] - $prev[0]) < 1e-7 && abs($coord[1] - $prev[1]) < 1e-7) {
            continue;
        }
        $normalized[] = $coord;
        $prev = $coord;
    }

    if (count($normalized) < 2) {
        throw new InvalidArgumentException('Run must contain at least 2 unique points');
    }

    return gps_test_trim_startup_outlier_points($normalized);
}

function gps_test_trim_startup_outlier_points(array $coordinates): array {
    $minLookaheadSegments = 3;
    $maxStartupJumpMeters = 80.0;
    $startupJumpRatio = 6.0;
    $maxTrimmedPoints = 3;
    $trimmed = $coordinates;
    $trimCount = 0;

    while (count($trimmed) >= ($minLookaheadSegments + 2) && $trimCount < $maxTrimmedPoints) {
        $firstJump = gps_test_point_distance_meters($trimmed[0], $trimmed[1]);
        if ($firstJump < $maxStartupJumpMeters) {
            break;
        }

        $lookahead = [];
        $lookaheadLimit = min(count($trimmed) - 1, $minLookaheadSegments + 1);
        for ($i = 1; $i < $lookaheadLimit; $i++) {
            $lookahead[] = gps_test_point_distance_meters($trimmed[$i], $trimmed[$i + 1]);
        }

        if (count($lookahead) < $minLookaheadSegments) {
            break;
        }

        sort($lookahead);
        $medianJump = $lookahead[intdiv(count($lookahead), 2)];
        if ($medianJump <= 0.0) {
            $medianJump = 0.01;
        }

        if ($firstJump < ($medianJump * $startupJumpRatio)) {
            break;
        }

        array_shift($trimmed);
        $trimCount++;
    }

    return $trimmed;
}

function gps_test_resample_run_coordinates(array $coordinates, int $targetPoints = 120): array {
    if (count($coordinates) < 2) {
        throw new InvalidArgumentException('Need at least 2 coordinates to resample');
    }
    $targetPoints = max(2, $targetPoints);

    $distances = [0.0];
    for ($i = 1; $i < count($coordinates); $i++) {
        $segment = gps_test_point_distance_meters($coordinates[$i - 1], $coordinates[$i]);
        $distances[] = $distances[$i - 1] + $segment;
    }

    $total = (float)$distances[count($distances) - 1];
    if ($total <= 0.001) {
        return array_fill(0, $targetPoints, $coordinates[0]);
    }

    $resampled = [];
    for ($i = 0; $i < $targetPoints; $i++) {
        $targetDistance = ($total * $i) / ($targetPoints - 1);
        $segmentIndex = 1;
        while ($segmentIndex < count($distances) && $distances[$segmentIndex] < $targetDistance) {
            $segmentIndex++;
        }

        if ($segmentIndex >= count($distances)) {
            $resampled[] = $coordinates[count($coordinates) - 1];
            continue;
        }

        $fromIndex = max(0, $segmentIndex - 1);
        $toIndex = $segmentIndex;
        $fromDist = $distances[$fromIndex];
        $toDist = $distances[$toIndex];
        $span = max(1e-9, $toDist - $fromDist);
        $t = ($targetDistance - $fromDist) / $span;
        $t = gps_test_clamp($t, 0.0, 1.0);

        $from = $coordinates[$fromIndex];
        $to = $coordinates[$toIndex];
        $resampled[] = [
            round((float)$from[0] + ((float)$to[0] - (float)$from[0]) * $t, 7),
            round((float)$from[1] + ((float)$to[1] - (float)$from[1]) * $t, 7)
        ];
    }

    return $resampled;
}

function gps_test_load_back_runs_store(array $backarByNummer): array {
    $raw = gps_test_read_json_file(GPS_TEST_BACK_RUNS_FILE);
    if ($raw === []) {
        return gps_test_empty_back_runs_store();
    }

    $store = gps_test_empty_back_runs_store();
    $rawBackRuns = $raw['backRuns'] ?? [];
    if (!is_array($rawBackRuns)) {
        return $store;
    }

    foreach ($rawBackRuns as $backNummerRaw => $runsRaw) {
        $backNummer = (int)$backNummerRaw;
        if ($backNummer <= 0 || !isset($backarByNummer[$backNummer]) || !is_array($runsRaw)) {
            continue;
        }

        $normalizedRuns = [];
        foreach ($runsRaw as $runRaw) {
            if (!is_array($runRaw) || !isset($runRaw['points']) || !is_array($runRaw['points'])) {
                continue;
            }

            try {
                $points = gps_test_normalize_run_coordinates($runRaw['points']);
            } catch (Throwable $e) {
                continue;
            }

            $createdAt = isset($runRaw['createdAt']) ? (string)$runRaw['createdAt'] : date('c');
            $runId = isset($runRaw['runId']) && trim((string)$runRaw['runId']) !== ''
                ? trim((string)$runRaw['runId'])
                : gps_test_generate_run_id();
            $widthInput = isset($runRaw['widthInput']) && is_numeric($runRaw['widthInput'])
                ? gps_test_clamp((float)$runRaw['widthInput'], 5.0, 80.0)
                : 25.0;

            $normalizedRuns[] = [
                'runId' => $runId,
                'backNummer' => $backNummer,
                'createdAt' => $createdAt,
                'widthInput' => round($widthInput, 2),
                'pointCount' => count($points),
                'metadata' => is_array($runRaw['metadata'] ?? null) ? $runRaw['metadata'] : [],
                'points' => $points
            ];
        }

        if (count($normalizedRuns) > 0) {
            usort($normalizedRuns, static fn($a, $b) => strcmp((string)$a['createdAt'], (string)$b['createdAt']));
            $store['backRuns'][(string)$backNummer] = $normalizedRuns;
        }
    }

    return $store;
}

function gps_test_save_back_runs_store(array $store): void {
    gps_test_write_json_file(GPS_TEST_BACK_RUNS_FILE, $store);
}

function gps_test_back_feature_from_coordinates(
    int $backNummer,
    string $namn,
    array $coordinates,
    float $widthMeters,
    string $source,
    int $runCount,
    array $extraProperties = []
): array {
    $properties = [
        'backNummer' => $backNummer,
        'namn' => $namn,
        'widthMeters' => round(gps_test_clamp($widthMeters, 5.0, 80.0), 2),
        'source' => $source,
        'runCount' => $runCount,
        'updatedAt' => date('c')
    ];

    foreach ($extraProperties as $key => $value) {
        $properties[(string)$key] = $value;
    }

    return [
        'type' => 'Feature',
        'properties' => $properties,
        'geometry' => [
            'type' => 'LineString',
            'coordinates' => gps_test_validate_linestring_coordinates($coordinates)
        ]
    ];
}

function gps_test_build_active_feature_from_runs(int $backNummer, string $namn, array $runs): array {
    if (count($runs) === 0) {
        throw new InvalidArgumentException("No runs found for backNummer {$backNummer}");
    }

    $latestRun = $runs[count($runs) - 1];
    $width = isset($latestRun['widthInput']) && is_numeric($latestRun['widthInput'])
        ? (float)$latestRun['widthInput']
        : 25.0;

    return gps_test_back_feature_from_coordinates(
        $backNummer,
        $namn,
        $latestRun['points'],
        $width,
        'single_run',
        count($runs),
        ['activeRunId' => (string)$latestRun['runId']]
    );
}

function gps_test_upsert_feature_in_defs(array $backDefs, array $feature): array {
    $features = is_array($backDefs['features'] ?? null) ? $backDefs['features'] : [];
    $targetBackNummer = (int)($feature['properties']['backNummer'] ?? 0);
    $next = [];

    foreach ($features as $f) {
        $nr = (int)($f['properties']['backNummer'] ?? 0);
        if ($nr === $targetBackNummer) {
            continue;
        }
        $next[] = $f;
    }

    $next[] = $feature;
    usort($next, static fn($a, $b) => (int)$a['properties']['backNummer'] <=> (int)$b['properties']['backNummer']);

    return [
        'type' => 'FeatureCollection',
        'features' => $next
    ];
}

function gps_test_save_back_run(
    int $backNummer,
    array $trackGeoJson,
    ?float $widthInput,
    array $store,
    array $backDefs,
    array $backarByNummer
): array {
    if (!isset($backarByNummer[$backNummer])) {
        throw new InvalidArgumentException("Unknown backNummer: {$backNummer}");
    }

    $trackPoints = gps_test_points_from_geojson($trackGeoJson);
    $coordinates = [];
    foreach ($trackPoints as $point) {
        $coordinates[] = [round((float)$point['lon'], 7), round((float)$point['lat'], 7)];
    }
    $coordinates = gps_test_normalize_run_coordinates($coordinates);

    $run = [
        'runId' => gps_test_generate_run_id(),
        'backNummer' => $backNummer,
        'createdAt' => date('c'),
        'widthInput' => round(gps_test_clamp((float)($widthInput ?? 25.0), 5.0, 80.0), 2),
        'pointCount' => count($coordinates),
        'metadata' => [
            'ingestedPoints' => count($trackPoints)
        ],
        'points' => $coordinates
    ];

    $key = (string)$backNummer;
    if (!isset($store['backRuns']) || !is_array($store['backRuns'])) {
        $store['backRuns'] = [];
    }
    if (!isset($store['backRuns'][$key]) || !is_array($store['backRuns'][$key])) {
        $store['backRuns'][$key] = [];
    }
    $store['backRuns'][$key][] = $run;
    usort($store['backRuns'][$key], static fn($a, $b) => strcmp((string)$a['createdAt'], (string)$b['createdAt']));

    $activeFeature = gps_test_build_active_feature_from_runs(
        $backNummer,
        (string)$backarByNummer[$backNummer]['namn'],
        $store['backRuns'][$key]
    );
    $nextBackDefs = gps_test_upsert_feature_in_defs($backDefs, $activeFeature);

    return [
        'store' => $store,
        'backDefs' => $nextBackDefs,
        'activeFeature' => $activeFeature,
        'run' => $run,
        'runCount' => count($store['backRuns'][$key])
    ];
}

function gps_test_rebuild_back_defs_from_runs(array $store, array $backDefs, array $backarByNummer): array {
    $result = $backDefs;
    $backRuns = is_array($store['backRuns'] ?? null) ? $store['backRuns'] : [];

    foreach ($backRuns as $backNummerRaw => $runs) {
        $backNummer = (int)$backNummerRaw;
        if ($backNummer <= 0 || !isset($backarByNummer[$backNummer]) || !is_array($runs) || count($runs) === 0) {
            continue;
        }

        $feature = gps_test_build_active_feature_from_runs($backNummer, (string)$backarByNummer[$backNummer]['namn'], $runs);
        $result = gps_test_upsert_feature_in_defs($result, $feature);
    }

    return $result;
}

function gps_test_back_runs_summary(array $store): array {
    $summary = [];
    $backRuns = is_array($store['backRuns'] ?? null) ? $store['backRuns'] : [];

    foreach ($backRuns as $backNummerRaw => $runs) {
        if (!is_array($runs) || count($runs) === 0) {
            continue;
        }

        $backNummer = (int)$backNummerRaw;
        $latest = $runs[count($runs) - 1];
        $summary[] = [
            'backNummer' => $backNummer,
            'runCount' => count($runs),
            'latestRunAt' => $latest['createdAt'] ?? null,
            'mode' => 'single_run'
        ];
    }

    usort($summary, static fn($a, $b) => (int)$a['backNummer'] <=> (int)$b['backNummer']);
    return $summary;
}

function gps_test_back_runs_to_feature_collection(array $store, ?int $filterBackNummer = null): array {
    $features = [];
    $backRuns = is_array($store['backRuns'] ?? null) ? $store['backRuns'] : [];

    foreach ($backRuns as $backNummerRaw => $runs) {
        $backNummer = (int)$backNummerRaw;
        if ($backNummer <= 0 || !is_array($runs)) {
            continue;
        }
        if ($filterBackNummer !== null && $filterBackNummer > 0 && $backNummer !== $filterBackNummer) {
            continue;
        }

        foreach ($runs as $run) {
            if (!is_array($run) || !is_array($run['points'] ?? null) || count($run['points']) < 2) {
                continue;
            }

            $features[] = [
                'type' => 'Feature',
                'properties' => [
                    'runId' => (string)($run['runId'] ?? ''),
                    'backNummer' => $backNummer,
                    'createdAt' => (string)($run['createdAt'] ?? ''),
                    'widthInput' => isset($run['widthInput']) ? (float)$run['widthInput'] : 25.0,
                    'pointCount' => isset($run['pointCount']) ? (int)$run['pointCount'] : count($run['points'])
                ],
                'geometry' => [
                    'type' => 'LineString',
                    'coordinates' => $run['points']
                ]
            ];
        }
    }

    return [
        'type' => 'FeatureCollection',
        'features' => $features
    ];
}

function gps_test_validate_lift_defs_geojson(array $geojson, array $liftarByUid): array {
    if (($geojson['type'] ?? '') !== 'FeatureCollection' || !isset($geojson['features']) || !is_array($geojson['features'])) {
        throw new InvalidArgumentException('GeoJSON must be a FeatureCollection with a features array');
    }

    $seenLiftUids = [];
    $normalizedFeatures = [];

    foreach ($geojson['features'] as $feature) {
        if (!is_array($feature) || ($feature['type'] ?? '') !== 'Feature') {
            throw new InvalidArgumentException('Each item in features must be a Feature');
        }

        $geometry = $feature['geometry'] ?? null;
        $properties = $feature['properties'] ?? null;
        if (!is_array($geometry) || ($geometry['type'] ?? '') !== 'LineString') {
            throw new InvalidArgumentException('Each feature must have a LineString geometry');
        }
        if (!is_array($properties)) {
            throw new InvalidArgumentException('Each feature must have properties');
        }

        $liftUid = trim((string)($properties['liftUid'] ?? ''));
        if ($liftUid === '' || !isset($liftarByUid[$liftUid])) {
            throw new InvalidArgumentException("Unknown or invalid liftUid: {$liftUid}");
        }
        if (isset($seenLiftUids[$liftUid])) {
            throw new InvalidArgumentException("Duplicate liftUid in liftDefs: {$liftUid}");
        }
        $seenLiftUids[$liftUid] = true;

        $lift = $liftarByUid[$liftUid];
        $liftId = trim((string)($properties['liftId'] ?? ($lift['id'] ?? '')));
        if ($liftId === '') {
            $liftId = (string)($lift['id'] ?? '');
        }

        $name = trim((string)($properties['namn'] ?? ($lift['namn'] ?? '')));
        if ($name === '') {
            $name = (string)($lift['namn'] ?? $liftUid);
        }

        $widthMeters = (float)($properties['widthMeters'] ?? 25.0);
        if (!is_finite($widthMeters) || $widthMeters <= 0) {
            $widthMeters = 25.0;
        }
        $widthMeters = max(5.0, min($widthMeters, 80.0));

        $source = strtolower(trim((string)($properties['source'] ?? 'imported')));
        if (!in_array($source, ['recorded', 'imported', 'single_run', 'median'], true)) {
            $source = 'imported';
        }

        $updatedAt = (string)($properties['updatedAt'] ?? date('c'));
        $coordinates = gps_test_validate_linestring_coordinates($geometry['coordinates'] ?? null);

        $normalizedFeatures[] = [
            'type' => 'Feature',
            'properties' => [
                'liftUid' => $liftUid,
                'liftId' => $liftId,
                'namn' => $name,
                'widthMeters' => round($widthMeters, 2),
                'source' => $source,
                'updatedAt' => $updatedAt
            ],
            'geometry' => [
                'type' => 'LineString',
                'coordinates' => $coordinates
            ]
        ];
    }

    usort($normalizedFeatures, static fn($a, $b) => strcmp((string)$a['properties']['liftUid'], (string)$b['properties']['liftUid']));
    return [
        'type' => 'FeatureCollection',
        'features' => $normalizedFeatures
    ];
}

function gps_test_load_lift_defs(array $liftarByUid): array {
    $raw = gps_test_read_json_file(GPS_TEST_LIFT_DEFS_FILE);
    if ($raw === []) {
        return gps_test_empty_feature_collection();
    }

    try {
        return gps_test_validate_lift_defs_geojson($raw, $liftarByUid);
    } catch (Throwable $e) {
        return gps_test_empty_feature_collection();
    }
}

function gps_test_empty_lift_runs_store(): array {
    return [
        'version' => 1,
        'liftRuns' => []
    ];
}

function gps_test_load_lift_runs_store(array $liftarByUid): array {
    $raw = gps_test_read_json_file(GPS_TEST_LIFT_RUNS_FILE);
    if ($raw === []) {
        return gps_test_empty_lift_runs_store();
    }

    $store = gps_test_empty_lift_runs_store();
    $rawLiftRuns = $raw['liftRuns'] ?? [];
    if (!is_array($rawLiftRuns)) {
        return $store;
    }

    foreach ($rawLiftRuns as $liftUidRaw => $runsRaw) {
        $liftUid = trim((string)$liftUidRaw);
        if ($liftUid === '' || !isset($liftarByUid[$liftUid]) || !is_array($runsRaw)) {
            continue;
        }

        $normalizedRuns = [];
        foreach ($runsRaw as $runRaw) {
            if (!is_array($runRaw) || !isset($runRaw['points']) || !is_array($runRaw['points'])) {
                continue;
            }

            try {
                $points = gps_test_normalize_run_coordinates($runRaw['points']);
            } catch (Throwable $e) {
                continue;
            }

            $createdAt = isset($runRaw['createdAt']) ? (string)$runRaw['createdAt'] : date('c');
            $runId = isset($runRaw['runId']) && trim((string)$runRaw['runId']) !== ''
                ? trim((string)$runRaw['runId'])
                : gps_test_generate_run_id();
            $widthInput = isset($runRaw['widthInput']) && is_numeric($runRaw['widthInput'])
                ? gps_test_clamp((float)$runRaw['widthInput'], 5.0, 80.0)
                : 25.0;

            $normalizedRuns[] = [
                'runId' => $runId,
                'liftUid' => $liftUid,
                'liftId' => (string)($liftarByUid[$liftUid]['id'] ?? ''),
                'createdAt' => $createdAt,
                'widthInput' => round($widthInput, 2),
                'pointCount' => count($points),
                'metadata' => is_array($runRaw['metadata'] ?? null) ? $runRaw['metadata'] : [],
                'points' => $points
            ];
        }

        if (count($normalizedRuns) > 0) {
            usort($normalizedRuns, static fn($a, $b) => strcmp((string)$a['createdAt'], (string)$b['createdAt']));
            $store['liftRuns'][$liftUid] = $normalizedRuns;
        }
    }

    return $store;
}

function gps_test_save_lift_runs_store(array $store): void {
    gps_test_write_json_file(GPS_TEST_LIFT_RUNS_FILE, $store);
}

function gps_test_lift_feature_from_coordinates(
    string $liftUid,
    string $liftId,
    string $namn,
    array $coordinates,
    float $widthMeters,
    string $source,
    int $runCount,
    array $extraProperties = []
): array {
    $properties = [
        'liftUid' => $liftUid,
        'liftId' => $liftId,
        'namn' => $namn,
        'widthMeters' => round(gps_test_clamp($widthMeters, 5.0, 80.0), 2),
        'source' => $source,
        'runCount' => $runCount,
        'updatedAt' => date('c')
    ];

    foreach ($extraProperties as $key => $value) {
        $properties[(string)$key] = $value;
    }

    return [
        'type' => 'Feature',
        'properties' => $properties,
        'geometry' => [
            'type' => 'LineString',
            'coordinates' => gps_test_validate_linestring_coordinates($coordinates)
        ]
    ];
}

function gps_test_build_active_lift_feature_from_runs(string $liftUid, array $lift, array $runs): array {
    if (count($runs) === 0) {
        throw new InvalidArgumentException("No runs found for liftUid {$liftUid}");
    }

    $latestRun = $runs[count($runs) - 1];
    $width = isset($latestRun['widthInput']) && is_numeric($latestRun['widthInput'])
        ? (float)$latestRun['widthInput']
        : 25.0;

    return gps_test_lift_feature_from_coordinates(
        $liftUid,
        (string)($lift['id'] ?? ''),
        (string)($lift['namn'] ?? $liftUid),
        $latestRun['points'],
        $width,
        'single_run',
        count($runs),
        ['activeRunId' => (string)$latestRun['runId']]
    );
}

function gps_test_upsert_feature_in_lift_defs(array $liftDefs, array $feature): array {
    $features = is_array($liftDefs['features'] ?? null) ? $liftDefs['features'] : [];
    $targetLiftUid = trim((string)($feature['properties']['liftUid'] ?? ''));
    $next = [];

    foreach ($features as $f) {
        $uid = trim((string)($f['properties']['liftUid'] ?? ''));
        if ($uid !== '' && $uid === $targetLiftUid) {
            continue;
        }
        $next[] = $f;
    }

    $next[] = $feature;
    usort($next, static fn($a, $b) => strcmp((string)$a['properties']['liftUid'], (string)$b['properties']['liftUid']));

    return [
        'type' => 'FeatureCollection',
        'features' => $next
    ];
}

function gps_test_save_lift_run(
    string $liftUid,
    array $trackGeoJson,
    ?float $widthInput,
    array $store,
    array $liftDefs,
    array $liftarByUid
): array {
    if (!isset($liftarByUid[$liftUid])) {
        throw new InvalidArgumentException("Unknown liftUid: {$liftUid}");
    }

    $trackPoints = gps_test_points_from_geojson($trackGeoJson);
    $coordinates = [];
    foreach ($trackPoints as $point) {
        $coordinates[] = [round((float)$point['lon'], 7), round((float)$point['lat'], 7)];
    }
    $coordinates = gps_test_normalize_run_coordinates($coordinates);

    $lift = $liftarByUid[$liftUid];
    $run = [
        'runId' => gps_test_generate_run_id(),
        'liftUid' => $liftUid,
        'liftId' => (string)($lift['id'] ?? ''),
        'createdAt' => date('c'),
        'widthInput' => round(gps_test_clamp((float)($widthInput ?? 25.0), 5.0, 80.0), 2),
        'pointCount' => count($coordinates),
        'metadata' => [
            'ingestedPoints' => count($trackPoints)
        ],
        'points' => $coordinates
    ];

    if (!isset($store['liftRuns']) || !is_array($store['liftRuns'])) {
        $store['liftRuns'] = [];
    }
    if (!isset($store['liftRuns'][$liftUid]) || !is_array($store['liftRuns'][$liftUid])) {
        $store['liftRuns'][$liftUid] = [];
    }
    $store['liftRuns'][$liftUid][] = $run;
    usort($store['liftRuns'][$liftUid], static fn($a, $b) => strcmp((string)$a['createdAt'], (string)$b['createdAt']));

    $activeFeature = gps_test_build_active_lift_feature_from_runs($liftUid, $lift, $store['liftRuns'][$liftUid]);
    $nextLiftDefs = gps_test_upsert_feature_in_lift_defs($liftDefs, $activeFeature);

    return [
        'store' => $store,
        'liftDefs' => $nextLiftDefs,
        'activeFeature' => $activeFeature,
        'run' => $run,
        'runCount' => count($store['liftRuns'][$liftUid])
    ];
}

function gps_test_lift_runs_summary(array $store): array {
    $summary = [];
    $liftRuns = is_array($store['liftRuns'] ?? null) ? $store['liftRuns'] : [];

    foreach ($liftRuns as $liftUid => $runs) {
        if (!is_array($runs) || count($runs) === 0) {
            continue;
        }

        $latest = $runs[count($runs) - 1];
        $summary[] = [
            'liftUid' => (string)$liftUid,
            'liftId' => (string)($latest['liftId'] ?? ''),
            'runCount' => count($runs),
            'latestRunAt' => $latest['createdAt'] ?? null,
            'mode' => 'single_run'
        ];
    }

    usort($summary, static fn($a, $b) => strcmp((string)$a['liftUid'], (string)$b['liftUid']));
    return $summary;
}

function gps_test_lift_runs_to_feature_collection(array $store, ?string $filterLiftUid = null): array {
    $features = [];
    $liftRuns = is_array($store['liftRuns'] ?? null) ? $store['liftRuns'] : [];

    foreach ($liftRuns as $liftUid => $runs) {
        $uid = trim((string)$liftUid);
        if ($uid === '' || !is_array($runs)) {
            continue;
        }
        if ($filterLiftUid !== null && $filterLiftUid !== '' && $uid !== $filterLiftUid) {
            continue;
        }

        foreach ($runs as $run) {
            if (!is_array($run) || !is_array($run['points'] ?? null) || count($run['points']) < 2) {
                continue;
            }

            $features[] = [
                'type' => 'Feature',
                'properties' => [
                    'runId' => (string)($run['runId'] ?? ''),
                    'liftUid' => $uid,
                    'liftId' => (string)($run['liftId'] ?? ''),
                    'createdAt' => (string)($run['createdAt'] ?? ''),
                    'widthInput' => isset($run['widthInput']) ? (float)$run['widthInput'] : 25.0,
                    'pointCount' => isset($run['pointCount']) ? (int)$run['pointCount'] : count($run['points'])
                ],
                'geometry' => [
                    'type' => 'LineString',
                    'coordinates' => $run['points']
                ]
            ];
        }
    }

    return [
        'type' => 'FeatureCollection',
        'features' => $features
    ];
}

function gps_test_latlon_to_xy_meters(float $lat, float $lon, float $latRef): array {
    $rad = pi() / 180.0;
    $metersPerDegLat = 110540.0;
    $metersPerDegLon = 111320.0 * cos($latRef * $rad);

    return [
        $lon * $metersPerDegLon,
        $lat * $metersPerDegLat
    ];
}

function gps_test_bearing_degrees(float $lat1, float $lon1, float $lat2, float $lon2): ?float {
    if ($lat1 === $lat2 && $lon1 === $lon2) {
        return null;
    }

    $rad = pi() / 180.0;
    $phi1 = $lat1 * $rad;
    $phi2 = $lat2 * $rad;
    $lambda1 = $lon1 * $rad;
    $lambda2 = $lon2 * $rad;

    $y = sin($lambda2 - $lambda1) * cos($phi2);
    $x = cos($phi1) * sin($phi2) - sin($phi1) * cos($phi2) * cos($lambda2 - $lambda1);
    $theta = atan2($y, $x);

    $deg = fmod((($theta * 180.0 / pi()) + 360.0), 360.0);
    return $deg;
}

function gps_test_angle_diff_degrees(float $a, float $b): float {
    $diff = abs($a - $b);
    return min($diff, 360.0 - $diff);
}

function gps_test_nearest_distance_to_linestring(float $lat, float $lon, array $coordinates): array {
    $latRef = $lat;
    [$px, $py] = gps_test_latlon_to_xy_meters($lat, $lon, $latRef);

    $bestDistance = INF;
    $bestBearing = null;

    for ($i = 0; $i < count($coordinates) - 1; $i++) {
        $aLon = (float)$coordinates[$i][0];
        $aLat = (float)$coordinates[$i][1];
        $bLon = (float)$coordinates[$i + 1][0];
        $bLat = (float)$coordinates[$i + 1][1];

        [$ax, $ay] = gps_test_latlon_to_xy_meters($aLat, $aLon, $latRef);
        [$bx, $by] = gps_test_latlon_to_xy_meters($bLat, $bLon, $latRef);

        $abx = $bx - $ax;
        $aby = $by - $ay;
        $apx = $px - $ax;
        $apy = $py - $ay;
        $abLenSq = $abx * $abx + $aby * $aby;

        if ($abLenSq <= 1e-9) {
            $dx = $px - $ax;
            $dy = $py - $ay;
            $distance = sqrt($dx * $dx + $dy * $dy);
        } else {
            $t = ($apx * $abx + $apy * $aby) / $abLenSq;
            $t = max(0.0, min(1.0, $t));

            $qx = $ax + $t * $abx;
            $qy = $ay + $t * $aby;

            $dx = $px - $qx;
            $dy = $py - $qy;
            $distance = sqrt($dx * $dx + $dy * $dy);
        }

        if ($distance < $bestDistance) {
            $bestDistance = $distance;
            $bestBearing = gps_test_bearing_degrees($aLat, $aLon, $bLat, $bLon);
        }
    }

    return [
        'distanceMeters' => is_finite($bestDistance) ? $bestDistance : INF,
        'segmentBearing' => $bestBearing
    ];
}

function gps_test_parse_point_payload(array $payload): array {
    $lat = (float)($payload['lat'] ?? NAN);
    $lon = (float)($payload['lon'] ?? NAN);
    if (!is_finite($lat) || !is_finite($lon) || $lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
        throw new InvalidArgumentException('lat/lon are required and must be valid coordinates');
    }

    $point = [
        'lat' => $lat,
        'lon' => $lon,
        'timestamp' => isset($payload['timestamp']) ? (string)$payload['timestamp'] : null,
        'heading' => isset($payload['heading']) && is_numeric($payload['heading']) ? (float)$payload['heading'] : null,
        'speed' => isset($payload['speed']) && is_numeric($payload['speed']) ? (float)$payload['speed'] : null,
        'accuracy' => isset($payload['accuracy']) && is_numeric($payload['accuracy']) ? (float)$payload['accuracy'] : null,
        'altitude' => isset($payload['altitude']) && is_numeric($payload['altitude']) ? (float)$payload['altitude'] : null
    ];

    if ($point['heading'] !== null) {
        $point['heading'] = fmod(($point['heading'] + 360.0), 360.0);
    }

    return $point;
}

function gps_test_confidence_from_score(float $score, float $distanceMeters, float $maxDistanceMeters, ?float $accuracyMeters): float {
    $distanceComponent = 1.0 - min(1.0, $distanceMeters / max(1.0, $maxDistanceMeters * 1.25));
    $scoreComponent = 1.0 - min(1.0, $score / max(1.0, $maxDistanceMeters * 1.6 + 25.0));

    $confidence = $distanceComponent * 0.65 + $scoreComponent * 0.35;

    if ($accuracyMeters !== null && is_finite($accuracyMeters)) {
        $accuracyFactor = max(0.25, 1.0 - ($accuracyMeters / 120.0));
        $confidence *= $accuracyFactor;
    }

    return max(0.0, min(1.0, $confidence));
}

function gps_test_classify_point(array $point, array $backDefs, array $context = []): array {
    $accuracy = isset($point['accuracy']) && is_finite((float)$point['accuracy']) ? (float)$point['accuracy'] : null;
    if ($accuracy !== null && $accuracy > 80.0) {
        return [
            'status' => 'unknown',
            'backNummer' => null,
            'confidence' => 0.0,
            'distanceMeters' => null,
            'reason' => 'gps_accuracy_too_low'
        ];
    }

    $prevBackNummer = isset($context['prevBackNummer']) && is_numeric($context['prevBackNummer'])
        ? (int)$context['prevBackNummer']
        : null;

    $candidates = [];
    foreach ($backDefs['features'] ?? [] as $feature) {
        $properties = $feature['properties'] ?? [];
        $geometry = $feature['geometry'] ?? [];
        if (($geometry['type'] ?? '') !== 'LineString') {
            continue;
        }

        $backNummer = (int)($properties['backNummer'] ?? 0);
        if ($backNummer <= 0) {
            continue;
        }

        $widthMeters = (float)($properties['widthMeters'] ?? 25.0);
        $widthMeters = max(5.0, min($widthMeters, 80.0));
        $distanceData = gps_test_nearest_distance_to_linestring((float)$point['lat'], (float)$point['lon'], $geometry['coordinates'] ?? []);
        $distanceMeters = (float)$distanceData['distanceMeters'];
        $segmentBearing = isset($distanceData['segmentBearing']) && is_finite((float)$distanceData['segmentBearing'])
            ? (float)$distanceData['segmentBearing']
            : null;

        $headingPenalty = 0.0;
        if (isset($point['heading']) && $point['heading'] !== null && $segmentBearing !== null) {
            $headingDiff = gps_test_angle_diff_degrees((float)$point['heading'], $segmentBearing);
            $headingPenalty = ($headingDiff / 180.0) * 20.0;
        }

        $score = $distanceMeters + $headingPenalty;

        if ($prevBackNummer !== null) {
            if ($backNummer === $prevBackNummer) {
                $score -= 8.0;
            } else {
                $score += 6.0;
            }
        }

        $candidates[] = [
            'backNummer' => $backNummer,
            'namn' => (string)($properties['namn'] ?? ''),
            'widthMeters' => $widthMeters,
            'distanceMeters' => $distanceMeters,
            'headingPenalty' => $headingPenalty,
            'score' => $score
        ];
    }

    if (count($candidates) === 0) {
        return [
            'status' => 'unknown',
            'backNummer' => null,
            'confidence' => 0.0,
            'distanceMeters' => null,
            'reason' => 'no_back_definitions'
        ];
    }

    usort($candidates, static fn($a, $b) => $a['score'] <=> $b['score']);
    $selected = $candidates[0];

    if ($prevBackNummer !== null && $selected['backNummer'] !== $prevBackNummer) {
        foreach ($candidates as $candidate) {
            if ($candidate['backNummer'] === $prevBackNummer) {
                // Hysteresis: keep previous slope unless new slope is clearly better.
                if (($candidate['score'] - $selected['score']) <= 12.0) {
                    $selected = $candidate;
                }
                break;
            }
        }
    }

    $maxDistanceMeters = max(35.0, $selected['widthMeters'] * 1.8);

    if ($selected['distanceMeters'] > $maxDistanceMeters) {
        return [
            'status' => 'unknown',
            'backNummer' => null,
            'confidence' => 0.0,
            'distanceMeters' => round($selected['distanceMeters'], 2),
            'reason' => 'outside_slope_corridor'
        ];
    }

    $confidence = gps_test_confidence_from_score((float)$selected['score'], (float)$selected['distanceMeters'], $maxDistanceMeters, $accuracy);
    if ($confidence < 0.35) {
        return [
            'status' => 'unknown',
            'backNummer' => null,
            'confidence' => round($confidence, 3),
            'distanceMeters' => round($selected['distanceMeters'], 2),
            'reason' => 'low_confidence'
        ];
    }

    return [
        'status' => 'matched',
        'backNummer' => (int)$selected['backNummer'],
        'namn' => (string)$selected['namn'],
        'confidence' => round($confidence, 3),
        'distanceMeters' => round((float)$selected['distanceMeters'], 2),
        'score' => round((float)$selected['score'], 2)
    ];
}

function gps_test_points_from_geojson(array $trackGeoJson): array {
    if (($trackGeoJson['type'] ?? '') !== 'FeatureCollection' || !isset($trackGeoJson['features']) || !is_array($trackGeoJson['features'])) {
        throw new InvalidArgumentException('track must be a GeoJSON FeatureCollection');
    }

    $points = [];
    foreach ($trackGeoJson['features'] as $feature) {
        if (!is_array($feature) || ($feature['type'] ?? '') !== 'Feature') {
            continue;
        }

        $geometry = $feature['geometry'] ?? null;
        $properties = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];

        if (!is_array($geometry)) {
            continue;
        }

        $type = $geometry['type'] ?? '';
        if ($type === 'Point') {
            $coords = $geometry['coordinates'] ?? null;
            if (!is_array($coords) || count($coords) < 2) {
                continue;
            }

            $lon = (float)$coords[0];
            $lat = (float)$coords[1];
            if (!is_finite($lon) || !is_finite($lat) || $lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
                continue;
            }

            $points[] = [
                'lat' => $lat,
                'lon' => $lon,
                'timestamp' => isset($properties['timestamp']) ? (string)$properties['timestamp'] : null,
                'heading' => isset($properties['heading']) && is_numeric($properties['heading']) ? (float)$properties['heading'] : null,
                'speed' => isset($properties['speed']) && is_numeric($properties['speed']) ? (float)$properties['speed'] : null,
                'accuracy' => isset($properties['accuracy']) && is_numeric($properties['accuracy']) ? (float)$properties['accuracy'] : null,
                'altitude' => isset($properties['altitude']) && is_numeric($properties['altitude']) ? (float)$properties['altitude'] : null
            ];
            continue;
        }

        if ($type === 'LineString') {
            $coordinates = $geometry['coordinates'] ?? [];
            if (!is_array($coordinates)) {
                continue;
            }

            foreach ($coordinates as $idx => $coord) {
                if (!is_array($coord) || count($coord) < 2) {
                    continue;
                }

                $lon = (float)$coord[0];
                $lat = (float)$coord[1];
                if (!is_finite($lon) || !is_finite($lat) || $lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
                    continue;
                }

                $points[] = [
                    'lat' => $lat,
                    'lon' => $lon,
                    'timestamp' => isset($properties['timestamps'][$idx]) ? (string)$properties['timestamps'][$idx] : null,
                    'heading' => null,
                    'speed' => null,
                    'accuracy' => null,
                    'altitude' => isset($properties['altitudes'][$idx]) && is_numeric($properties['altitudes'][$idx])
                        ? (float)$properties['altitudes'][$idx]
                        : null
                ];
            }
        }
    }

    // Drop duplicate consecutive points to avoid zero-length runs.
    $deduped = [];
    $prev = null;
    foreach ($points as $point) {
        $roundedLon = round((float)$point['lon'], 7);
        $roundedLat = round((float)$point['lat'], 7);
        if ($prev !== null && abs($roundedLon - $prev[0]) < 1e-7 && abs($roundedLat - $prev[1]) < 1e-7) {
            continue;
        }
        $deduped[] = $point;
        $prev = [$roundedLon, $roundedLat];
    }

    if (count($deduped) === 0) {
        throw new InvalidArgumentException('track contains no valid points');
    }

    if (count($deduped) === 1) {
        throw new InvalidArgumentException('track must contain at least 2 unique points');
    }

    return $deduped;
}

function gps_test_build_segments(array $classifications): array {
    $segments = [];
    $current = null;

    foreach ($classifications as $index => $item) {
        $segmentType = (string)($item['segmentType'] ?? 'unknown');
        $matchedKind = isset($item['matchedKind']) ? (string)$item['matchedKind'] : null;
        $status = (string)($item['status'] ?? 'unknown');
        $backNummer = isset($item['backNummer']) && is_numeric($item['backNummer']) ? (int)$item['backNummer'] : null;
        $liftId = isset($item['liftId']) && trim((string)$item['liftId']) !== '' ? (string)$item['liftId'] : null;
        $liftUid = isset($item['liftUid']) && trim((string)$item['liftUid']) !== '' ? (string)$item['liftUid'] : null;

        $key = implode(':', [
            $segmentType,
            $matchedKind ?? 'null',
            $status,
            $backNummer !== null ? (string)$backNummer : 'null',
            $liftId ?? 'null'
        ]);

        if ($current === null || $current['key'] !== $key) {
            if ($current !== null) {
                unset($current['key']);
                $segments[] = $current;
            }

            $current = [
                'key' => $key,
                'segmentType' => $segmentType,
                'matchedKind' => $matchedKind,
                'status' => $status,
                'backNummer' => $backNummer,
                'liftId' => $liftId,
                'liftUid' => $liftUid,
                'startIndex' => $index,
                'endIndex' => $index,
                'count' => 1,
                'fromTimestamp' => $item['timestamp'] ?? null,
                'toTimestamp' => $item['timestamp'] ?? null
            ];
            continue;
        }

        $current['endIndex'] = $index;
        $current['count']++;
        $current['toTimestamp'] = $item['timestamp'] ?? null;
    }

    if ($current !== null) {
        unset($current['key']);
        $segments[] = $current;
    }

    return $segments;
}

function gps_test_parse_timestamp_seconds(?string $timestamp): ?float {
    if ($timestamp === null || trim($timestamp) === '') {
        return null;
    }
    $unix = strtotime($timestamp);
    return $unix === false ? null : (float)$unix;
}

function gps_test_motion_metrics_for_index(array $points, int $index, int $window = 4): array {
    $count = count($points);
    if ($index < 0 || $index >= $count) {
        return [
            'speedMps' => null,
            'verticalSpeedMps' => null,
            'isIdle' => false,
            'hasAltitudeSignal' => false
        ];
    }

    $start = max(0, $index - max(1, $window));
    $totalDistance = 0.0;
    $firstTs = null;
    $lastTs = null;
    $firstAltitude = null;
    $lastAltitude = null;

    for ($i = $start + 1; $i <= $index; $i++) {
        $prev = $points[$i - 1];
        $curr = $points[$i];
        $totalDistance += gps_test_point_distance_meters(
            [(float)$prev['lon'], (float)$prev['lat']],
            [(float)$curr['lon'], (float)$curr['lat']]
        );
    }

    for ($i = $start; $i <= $index; $i++) {
        $ts = gps_test_parse_timestamp_seconds(isset($points[$i]['timestamp']) ? (string)$points[$i]['timestamp'] : null);
        if ($ts === null) {
            continue;
        }
        if ($firstTs === null) {
            $firstTs = $ts;
        }
        $lastTs = $ts;

        $alt = isset($points[$i]['altitude']) && is_numeric($points[$i]['altitude']) ? (float)$points[$i]['altitude'] : null;
        if ($alt !== null) {
            if ($firstAltitude === null) {
                $firstAltitude = $alt;
            }
            $lastAltitude = $alt;
        }
    }

    $duration = ($firstTs !== null && $lastTs !== null) ? max(0.0, $lastTs - $firstTs) : 0.0;
    $speedFromTrack = $duration > 0.2 ? $totalDistance / $duration : null;
    $speedSensor = isset($points[$index]['speed']) && is_numeric($points[$index]['speed']) ? (float)$points[$index]['speed'] : null;
    $speedMps = $speedSensor !== null ? $speedSensor : $speedFromTrack;

    $verticalSpeedMps = null;
    if ($firstAltitude !== null && $lastAltitude !== null && $duration > 0.2) {
        $verticalSpeedMps = ($lastAltitude - $firstAltitude) / $duration;
    }

    $isIdle = false;
    if ($speedMps !== null && $speedMps < 0.9) {
        $isIdle = true;
    } elseif ($duration >= 4.0 && $totalDistance <= 2.0) {
        $isIdle = true;
    }

    return [
        'speedMps' => $speedMps !== null ? round($speedMps, 3) : null,
        'verticalSpeedMps' => $verticalSpeedMps !== null ? round($verticalSpeedMps, 3) : null,
        'isIdle' => $isIdle,
        'hasAltitudeSignal' => $verticalSpeedMps !== null
    ];
}

function gps_test_best_candidate_for_kind(array $point, array $defs, string $kind, array $context = []): ?array {
    $accuracy = isset($point['accuracy']) && is_numeric($point['accuracy']) ? (float)$point['accuracy'] : null;
    $candidates = [];

    foreach ($defs['features'] ?? [] as $feature) {
        $properties = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
        $geometry = is_array($feature['geometry'] ?? null) ? $feature['geometry'] : [];
        if (($geometry['type'] ?? '') !== 'LineString') {
            continue;
        }

        $widthMeters = (float)($properties['widthMeters'] ?? 25.0);
        $widthMeters = max(5.0, min($widthMeters, 80.0));
        $distanceData = gps_test_nearest_distance_to_linestring((float)$point['lat'], (float)$point['lon'], $geometry['coordinates'] ?? []);
        $distanceMeters = (float)$distanceData['distanceMeters'];
        $segmentBearing = isset($distanceData['segmentBearing']) && is_finite((float)$distanceData['segmentBearing'])
            ? (float)$distanceData['segmentBearing']
            : null;

        $headingPenalty = 0.0;
        if (isset($point['heading']) && $point['heading'] !== null && $segmentBearing !== null) {
            $headingDiff = gps_test_angle_diff_degrees((float)$point['heading'], $segmentBearing);
            $headingPenalty = ($headingDiff / 180.0) * 18.0;
        }

        $score = $distanceMeters + $headingPenalty;
        $entityId = null;
        $entityName = '';
        $backNummer = null;
        $liftId = null;
        $liftUid = null;

        if ($kind === 'back') {
            $backNummer = (int)($properties['backNummer'] ?? 0);
            if ($backNummer <= 0) {
                continue;
            }
            $entityId = (string)$backNummer;
            $entityName = (string)($properties['namn'] ?? '');
            $prevBackNummer = isset($context['prevBackNummer']) && is_numeric($context['prevBackNummer'])
                ? (int)$context['prevBackNummer']
                : null;
            if ($prevBackNummer !== null) {
                $score += ($prevBackNummer === $backNummer) ? -6.0 : 4.0;
            }
        } else {
            $liftId = trim((string)($properties['liftId'] ?? ''));
            $liftUid = trim((string)($properties['liftUid'] ?? ''));
            if ($liftId === '') {
                continue;
            }
            $entityId = $liftId;
            $entityName = (string)($properties['namn'] ?? '');
            $prevLiftId = isset($context['prevLiftId']) ? trim((string)$context['prevLiftId']) : '';
            if ($prevLiftId !== '') {
                $score += ($prevLiftId === $liftId) ? -6.0 : 4.0;
            }
        }

        $maxDistanceMeters = $kind === 'back'
            ? max(35.0, $widthMeters * 1.8)
            : max(22.0, $widthMeters * 1.6);

        $confidence = gps_test_confidence_from_score($score, $distanceMeters, $maxDistanceMeters, $accuracy);
        $candidates[] = [
            'kind' => $kind,
            'entityId' => $entityId,
            'entityName' => $entityName,
            'backNummer' => $backNummer,
            'liftId' => $liftId,
            'liftUid' => $liftUid,
            'widthMeters' => $widthMeters,
            'distanceMeters' => $distanceMeters,
            'maxDistanceMeters' => $maxDistanceMeters,
            'headingPenalty' => $headingPenalty,
            'score' => $score,
            'confidence' => $confidence
        ];
    }

    if (count($candidates) === 0) {
        return null;
    }
    usort($candidates, static fn($a, $b) => $a['score'] <=> $b['score']);
    return $candidates[0];
}

function gps_test_adjust_score_with_motion(array $candidate, array $motion): float {
    $adjusted = (float)$candidate['score'];
    $vertical = isset($motion['verticalSpeedMps']) && is_numeric($motion['verticalSpeedMps']) ? (float)$motion['verticalSpeedMps'] : null;
    $speed = isset($motion['speedMps']) && is_numeric($motion['speedMps']) ? (float)$motion['speedMps'] : null;
    $kind = (string)$candidate['kind'];

    if ($vertical !== null) {
        if ($kind === 'back') {
            if ($vertical < -0.2) {
                $adjusted -= 10.0;
            } elseif ($vertical > 0.1) {
                $adjusted += 16.0;
            }
        } else {
            if ($vertical > 0.15) {
                $adjusted -= 10.0;
            } elseif ($vertical < -0.1) {
                $adjusted += 16.0;
            }
        }
    } elseif ($speed !== null) {
        if ($kind === 'back') {
            if ($speed >= 2.4) {
                $adjusted -= 4.0;
            } elseif ($speed < 1.2) {
                $adjusted += 8.0;
            }
        } else {
            if ($speed >= 0.8 && $speed <= 5.5) {
                $adjusted -= 3.0;
            }
            if ($speed > 8.0) {
                $adjusted += 8.0;
            }
        }
    }

    return $adjusted;
}

function gps_test_classify_track_point(array $point, array $motion, array $backDefs, array $liftDefs, array $context = []): array {
    $accuracy = isset($point['accuracy']) && is_finite((float)$point['accuracy']) ? (float)$point['accuracy'] : null;
    if ($accuracy !== null && $accuracy > 80.0) {
        return [
            'segmentType' => 'unknown',
            'matchedKind' => null,
            'status' => 'unknown',
            'backNummer' => null,
            'liftId' => null,
            'liftUid' => null,
            'confidence' => 0.0,
            'distanceMeters' => null,
            'reason' => 'gps_accuracy_too_low'
        ];
    }

    if (!empty($motion['isIdle'])) {
        return [
            'segmentType' => 'idle',
            'matchedKind' => null,
            'status' => 'unknown',
            'backNummer' => null,
            'liftId' => null,
            'liftUid' => null,
            'confidence' => 0.0,
            'distanceMeters' => null,
            'reason' => 'idle_motion'
        ];
    }

    $back = gps_test_best_candidate_for_kind($point, $backDefs, 'back', $context);
    $lift = gps_test_best_candidate_for_kind($point, $liftDefs, 'lift', $context);
    $candidates = [];

    foreach ([$back, $lift] as $candidate) {
        if ($candidate === null) {
            continue;
        }
        $distanceOk = (float)$candidate['distanceMeters'] <= (float)$candidate['maxDistanceMeters'];
        $confidenceOk = (float)$candidate['confidence'] >= 0.24;
        if (!$distanceOk || !$confidenceOk) {
            continue;
        }
        $candidate['adjustedScore'] = gps_test_adjust_score_with_motion($candidate, $motion);
        $candidates[] = $candidate;
    }

    if (count($candidates) === 0) {
        return [
            'segmentType' => 'unknown',
            'matchedKind' => null,
            'status' => 'unknown',
            'backNummer' => null,
            'liftId' => null,
            'liftUid' => null,
            'confidence' => 0.0,
            'distanceMeters' => null,
            'reason' => 'no_valid_candidate'
        ];
    }

    usort($candidates, static fn($a, $b) => $a['adjustedScore'] <=> $b['adjustedScore']);
    $selected = $candidates[0];

    $prevKind = isset($context['prevMatchedKind']) ? (string)$context['prevMatchedKind'] : '';
    $prevBackNummer = isset($context['prevBackNummer']) && is_numeric($context['prevBackNummer']) ? (int)$context['prevBackNummer'] : null;
    $prevLiftId = isset($context['prevLiftId']) ? trim((string)$context['prevLiftId']) : '';
    foreach ($candidates as $candidate) {
        $isPrevCandidate = false;
        if ($prevKind === 'back' && $candidate['kind'] === 'back' && $prevBackNummer !== null && $candidate['backNummer'] === $prevBackNummer) {
            $isPrevCandidate = true;
        }
        if ($prevKind === 'lift' && $candidate['kind'] === 'lift' && $prevLiftId !== '' && $candidate['liftId'] === $prevLiftId) {
            $isPrevCandidate = true;
        }
        if ($isPrevCandidate && (($candidate['adjustedScore'] - $selected['adjustedScore']) <= 8.0)) {
            $selected = $candidate;
            break;
        }
    }

    $isBack = $selected['kind'] === 'back';
    return [
        'segmentType' => $isBack ? 'descent' : 'lift',
        'matchedKind' => $selected['kind'],
        'status' => $isBack ? 'matched' : 'unknown',
        'backNummer' => $isBack ? (int)$selected['backNummer'] : null,
        'liftId' => !$isBack ? (string)$selected['liftId'] : null,
        'liftUid' => !$isBack ? (string)$selected['liftUid'] : null,
        'confidence' => round((float)$selected['confidence'], 3),
        'distanceMeters' => round((float)$selected['distanceMeters'], 2),
        'reason' => null,
        'namn' => (string)$selected['entityName']
    ];
}

function gps_test_classification_entity_key(array $classification): ?string {
    $kind = isset($classification['matchedKind']) ? (string)$classification['matchedKind'] : '';
    if ($kind === 'back' && isset($classification['backNummer']) && is_numeric($classification['backNummer'])) {
        return 'back:' . (int)$classification['backNummer'];
    }
    if ($kind === 'lift') {
        $liftId = trim((string)($classification['liftId'] ?? ''));
        if ($liftId !== '') {
            return 'lift:' . $liftId;
        }
    }
    return null;
}

function gps_test_mean(array $values): ?float {
    if (count($values) === 0) {
        return null;
    }
    return array_sum($values) / count($values);
}

function gps_test_make_unknown_from_point(array $point, string $reason, string $phase): array {
    return [
        'index' => (int)($point['index'] ?? 0),
        'timestamp' => $point['timestamp'] ?? null,
        'lat' => round((float)($point['lat'] ?? 0.0), 7),
        'lon' => round((float)($point['lon'] ?? 0.0), 7),
        'accuracy' => $point['accuracy'] ?? null,
        'heading' => $point['heading'] ?? null,
        'speed' => $point['speed'] ?? null,
        'altitude' => $point['altitude'] ?? null,
        'speedMps' => $point['speedMps'] ?? null,
        'verticalSpeedMps' => $point['verticalSpeedMps'] ?? null,
        'segmentType' => 'unknown',
        'matchedKind' => null,
        'status' => 'unknown',
        'backNummer' => null,
        'liftId' => null,
        'liftUid' => null,
        'confidence' => 0.0,
        'distanceMeters' => null,
        'reason' => $reason,
        'namn' => null,
        'phase' => $phase
    ];
}

function gps_test_apply_short_segment_filters(array $points): array {
    $segments = gps_test_build_segments($points);
    if (count($segments) < 3) {
        return $points;
    }

    foreach ($segments as $i => $segment) {
        if ($i === 0 || $i === count($segments) - 1) {
            continue;
        }

        $count = (int)($segment['count'] ?? 0);
        if ($count <= 0) {
            continue;
        }
        $segmentKey = gps_test_classification_entity_key($segment);
        if ($segmentKey === null) {
            continue;
        }

        $prevKey = gps_test_classification_entity_key($segments[$i - 1]);
        $nextKey = gps_test_classification_entity_key($segments[$i + 1]);
        if ($prevKey === null || $nextKey === null || $prevKey !== $nextKey) {
            continue;
        }

        $reason = null;
        if ($count <= 3) {
            $reason = 'flip_suppressed';
        } elseif ($count <= 4) {
            $reason = 'short_segment_suppressed';
        }
        if ($reason === null) {
            continue;
        }

        $start = (int)($segment['startIndex'] ?? -1);
        $end = (int)($segment['endIndex'] ?? -1);
        for ($idx = $start; $idx <= $end; $idx++) {
            if (!isset($points[$idx])) {
                continue;
            }
            $phase = isset($points[$idx]['phase']) ? (string)$points[$idx]['phase'] : 'locked';
            $points[$idx] = gps_test_make_unknown_from_point($points[$idx], $reason, $phase);
        }
    }

    return $points;
}

function gps_test_segment_travel_distance_meters(array $points, int $startIndex, int $endIndex): float {
    $distance = 0.0;
    for ($idx = max(1, $startIndex + 1); $idx <= $endIndex; $idx++) {
        if (!isset($points[$idx - 1], $points[$idx])) {
            continue;
        }
        $prev = $points[$idx - 1];
        $curr = $points[$idx];
        $distance += gps_test_point_distance_meters(
            [(float)($prev['lon'] ?? 0.0), (float)($prev['lat'] ?? 0.0)],
            [(float)($curr['lon'] ?? 0.0), (float)($curr['lat'] ?? 0.0)]
        );
    }
    return $distance;
}

function gps_test_apply_coverage_filter(array $points): array {
    $segments = gps_test_build_segments($points);
    foreach ($segments as $segment) {
        $matchedKind = isset($segment['matchedKind']) ? (string)$segment['matchedKind'] : '';
        if ($matchedKind !== 'back' && $matchedKind !== 'lift') {
            continue;
        }

        $start = (int)($segment['startIndex'] ?? -1);
        $end = (int)($segment['endIndex'] ?? -1);
        $count = (int)($segment['count'] ?? 0);
        if ($start < 0 || $end < $start || $count <= 0) {
            continue;
        }

        $distanceMeters = gps_test_segment_travel_distance_meters($points, $start, $end);
        $isSubstantial = $matchedKind === 'back'
            ? ($count >= 12 && $distanceMeters >= 120.0)
            : ($count >= 10 && $distanceMeters >= 100.0);
        if ($isSubstantial) {
            continue;
        }

        for ($idx = $start; $idx <= $end; $idx++) {
            if (!isset($points[$idx])) {
                continue;
            }
            $phase = isset($points[$idx]['phase']) ? (string)$points[$idx]['phase'] : 'locked';
            $points[$idx] = gps_test_make_unknown_from_point($points[$idx], 'insufficient_coverage', $phase);
        }
    }

    return $points;
}

function gps_test_lift_features_by_id(array $liftDefs): array {
    $map = [];
    foreach ($liftDefs['features'] ?? [] as $feature) {
        if (!is_array($feature)) {
            continue;
        }
        $properties = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
        $geometry = is_array($feature['geometry'] ?? null) ? $feature['geometry'] : [];
        if (($geometry['type'] ?? '') !== 'LineString') {
            continue;
        }
        $liftId = trim((string)($properties['liftId'] ?? ''));
        if ($liftId === '') {
            continue;
        }
        if (!isset($map[$liftId])) {
            $map[$liftId] = [];
        }
        $map[$liftId][] = [
            'liftId' => $liftId,
            'liftUid' => trim((string)($properties['liftUid'] ?? '')),
            'namn' => trim((string)($properties['namn'] ?? '')),
            'coordinates' => is_array($geometry['coordinates'] ?? null) ? $geometry['coordinates'] : []
        ];
    }
    return $map;
}

function gps_test_fill_lift_unknown_gaps(array $points, array $liftDefs): array {
    $liftById = gps_test_lift_features_by_id($liftDefs);
    if (count($liftById) === 0) {
        return $points;
    }

    $segments = gps_test_build_segments($points);
    if (count($segments) < 3) {
        return $points;
    }

    for ($i = 1; $i < count($segments) - 1; $i++) {
        $prev = $segments[$i - 1];
        $gap = $segments[$i];
        $next = $segments[$i + 1];

        $prevIsLift = ((string)($prev['matchedKind'] ?? '') === 'lift');
        $nextIsLift = ((string)($next['matchedKind'] ?? '') === 'lift');
        if (!$prevIsLift || !$nextIsLift) {
            continue;
        }

        $prevLiftId = trim((string)($prev['liftId'] ?? ''));
        $nextLiftId = trim((string)($next['liftId'] ?? ''));
        if ($prevLiftId === '' || $prevLiftId !== $nextLiftId) {
            continue;
        }

        $gapType = (string)($gap['segmentType'] ?? 'unknown');
        if (!in_array($gapType, ['unknown', 'idle'], true)) {
            continue;
        }

        $gapCount = (int)($gap['count'] ?? 0);
        if ($gapCount <= 0 || $gapCount > 20) {
            continue;
        }

        $fromTs = isset($gap['fromTimestamp']) ? gps_test_parse_timestamp_seconds((string)$gap['fromTimestamp']) : null;
        $toTs = isset($gap['toTimestamp']) ? gps_test_parse_timestamp_seconds((string)$gap['toTimestamp']) : null;
        if ($fromTs !== null && $toTs !== null && ($toTs - $fromTs) > 30.0) {
            continue;
        }

        $liftFeatures = $liftById[$prevLiftId] ?? [];
        if (count($liftFeatures) === 0) {
            continue;
        }

        $start = (int)($gap['startIndex'] ?? -1);
        $end = (int)($gap['endIndex'] ?? -1);
        if ($start < 0 || $end < $start) {
            continue;
        }

        $minDistances = [];
        $rejected = false;
        for ($idx = $start; $idx <= $end; $idx++) {
            if (!isset($points[$idx])) {
                $rejected = true;
                break;
            }

            $point = $points[$idx];
            $lat = isset($point['lat']) && is_numeric($point['lat']) ? (float)$point['lat'] : null;
            $lon = isset($point['lon']) && is_numeric($point['lon']) ? (float)$point['lon'] : null;
            if ($lat === null || $lon === null) {
                $rejected = true;
                break;
            }

            $bestDistance = INF;
            foreach ($liftFeatures as $feature) {
                $coordinates = $feature['coordinates'] ?? [];
                if (!is_array($coordinates) || count($coordinates) < 2) {
                    continue;
                }
                $distanceData = gps_test_nearest_distance_to_linestring($lat, $lon, $coordinates);
                $distance = (float)($distanceData['distanceMeters'] ?? INF);
                if ($distance < $bestDistance) {
                    $bestDistance = $distance;
                }
            }
            if (!is_finite($bestDistance)) {
                $rejected = true;
                break;
            }
            $minDistances[] = $bestDistance;

            $vertical = isset($point['verticalSpeedMps']) && is_numeric($point['verticalSpeedMps'])
                ? (float)$point['verticalSpeedMps']
                : null;
            $speed = isset($point['speedMps']) && is_numeric($point['speedMps']) ? (float)$point['speedMps'] : null;
            if ($vertical !== null && $vertical < -0.6) {
                $rejected = true;
                break;
            }
            if ($speed !== null && $speed > 7.5) {
                $rejected = true;
                break;
            }
        }

        if ($rejected || count($minDistances) === 0) {
            continue;
        }

        $maxDistance = max($minDistances);
        $medianDistance = gps_test_median($minDistances);
        if ($maxDistance > 30.0 || $medianDistance > 18.0) {
            continue;
        }

        $phase = ((string)($prev['phase'] ?? 'locked') === 'locked' || (string)($next['phase'] ?? 'locked') === 'locked')
            ? 'locked'
            : 'bootstrap';
        $liftUid = trim((string)($prev['liftUid'] ?? '')) !== ''
            ? trim((string)$prev['liftUid'])
            : trim((string)($next['liftUid'] ?? ''));
        $liftName = trim((string)($prev['namn'] ?? '')) !== ''
            ? trim((string)$prev['namn'])
            : trim((string)($next['namn'] ?? ''));

        for ($idx = $start; $idx <= $end; $idx++) {
            if (!isset($points[$idx])) {
                continue;
            }
            $points[$idx]['segmentType'] = 'lift';
            $points[$idx]['matchedKind'] = 'lift';
            $points[$idx]['status'] = 'unknown';
            $points[$idx]['backNummer'] = null;
            $points[$idx]['liftId'] = $prevLiftId;
            $points[$idx]['liftUid'] = $liftUid !== '' ? $liftUid : null;
            $points[$idx]['namn'] = $liftName !== '' ? $liftName : null;
            $points[$idx]['confidence'] = 0.82;
            $points[$idx]['distanceMeters'] = round((float)$minDistances[$idx - $start], 2);
            $points[$idx]['reason'] = 'lift_continuity_bridge';
            $points[$idx]['phase'] = $phase;
        }
    }

    return $points;
}

function gps_test_classify_track(array $points, array $backDefs, array $liftDefs = ['type' => 'FeatureCollection', 'features' => []]): array {
    $rawResults = [];
    $prevBackNummer = null;
    $prevLiftId = null;
    $prevMatchedKind = null;

    foreach ($points as $idx => $point) {
        $motion = gps_test_motion_metrics_for_index($points, $idx);
        $res = gps_test_classify_track_point($point, $motion, $backDefs, $liftDefs, [
            'prevBackNummer' => $prevBackNummer,
            'prevLiftId' => $prevLiftId,
            'prevMatchedKind' => $prevMatchedKind
        ]);

        if (($res['matchedKind'] ?? null) === 'back' && isset($res['backNummer']) && is_numeric($res['backNummer'])) {
            $prevBackNummer = (int)$res['backNummer'];
            $prevMatchedKind = 'back';
        } elseif (($res['matchedKind'] ?? null) === 'lift' && isset($res['liftId'])) {
            $prevLiftId = trim((string)$res['liftId']);
            $prevMatchedKind = 'lift';
        }

        $rawResults[] = [
            'index' => $idx,
            'timestamp' => $point['timestamp'] ?? null,
            'lat' => round((float)$point['lat'], 7),
            'lon' => round((float)$point['lon'], 7),
            'accuracy' => isset($point['accuracy']) ? $point['accuracy'] : null,
            'heading' => isset($point['heading']) ? $point['heading'] : null,
            'speed' => isset($point['speed']) ? $point['speed'] : null,
            'altitude' => isset($point['altitude']) ? $point['altitude'] : null,
            'speedMps' => $motion['speedMps'] ?? null,
            'verticalSpeedMps' => $motion['verticalSpeedMps'] ?? null,
            'segmentType' => $res['segmentType'] ?? 'unknown',
            'matchedKind' => $res['matchedKind'] ?? null,
            'status' => $res['status'],
            'backNummer' => $res['backNummer'],
            'liftId' => $res['liftId'] ?? null,
            'liftUid' => $res['liftUid'] ?? null,
            'confidence' => $res['confidence'],
            'distanceMeters' => $res['distanceMeters'],
            'reason' => $res['reason'] ?? null,
            'namn' => $res['namn'] ?? null,
            'phase' => 'bootstrap'
        ];
    }

    $results = [];
    $locked = false;
    $lockKey = null;
    $idleStreak = 0;

    for ($idx = 0; $idx < count($rawResults); $idx++) {
        $raw = $rawResults[$idx];
        $currentPhase = $locked ? 'locked' : 'bootstrap';
        $segmentType = (string)($raw['segmentType'] ?? 'unknown');
        if (!$locked && $segmentType === 'idle') {
            $results[] = gps_test_make_unknown_from_point($raw, 'prelock_unstable', 'bootstrap');
            continue;
        }

        if ($segmentType === 'idle') {
            $idleStreak++;
            if ($idleStreak >= 10) {
                $locked = false;
                $lockKey = null;
                $currentPhase = 'bootstrap';
            }
            $raw['phase'] = $currentPhase;
            $results[] = $raw;
            continue;
        }

        $idleStreak = 0;

        if (!$locked) {
            $windowStart = max(0, $idx - 11);
            $entityCounts = [];
            $entityConfs = [];
            $fastCount = 0;
            for ($w = $windowStart; $w <= $idx; $w++) {
                $candidate = $rawResults[$w];
                $speed = isset($candidate['speedMps']) && is_numeric($candidate['speedMps']) ? (float)$candidate['speedMps'] : null;
                if ($speed !== null && $speed >= 1.2) {
                    $fastCount++;
                }

                $key = gps_test_classification_entity_key($candidate);
                if ($key === null) {
                    continue;
                }
                $entityCounts[$key] = ($entityCounts[$key] ?? 0) + 1;
                if (!isset($entityConfs[$key])) {
                    $entityConfs[$key] = [];
                }
                if (isset($candidate['confidence']) && is_numeric($candidate['confidence'])) {
                    $entityConfs[$key][] = (float)$candidate['confidence'];
                }
            }

            $bestKey = null;
            $bestCount = 0;
            foreach ($entityCounts as $candidateKey => $count) {
                if ((int)$count > $bestCount) {
                    $bestCount = (int)$count;
                    $bestKey = (string)$candidateKey;
                }
            }

            $medianConf = ($bestKey !== null && isset($entityConfs[$bestKey]) && count($entityConfs[$bestKey]) > 0)
                ? gps_test_median($entityConfs[$bestKey])
                : null;

            if ($bestKey !== null && $bestCount >= 9 && $medianConf !== null && $medianConf >= 0.70 && $fastCount >= 8) {
                $locked = true;
                $lockKey = $bestKey;
                $raw['phase'] = 'locked';
                $results[] = $raw;
                continue;
            }

            $results[] = gps_test_make_unknown_from_point($raw, 'prelock_unstable', 'bootstrap');
            continue;
        }

        $rawKey = gps_test_classification_entity_key($raw);
        if ($rawKey === $lockKey) {
            $raw['phase'] = 'locked';
            $results[] = $raw;
            continue;
        }

        $windowStart = max(0, $idx - 7);
        $challengerCounts = [];
        $challengerConfs = [];
        for ($w = $windowStart; $w <= $idx; $w++) {
            $candidate = $rawResults[$w];
            $candidateKey = gps_test_classification_entity_key($candidate);
            if ($candidateKey === null || $candidateKey === $lockKey) {
                continue;
            }
            $challengerCounts[$candidateKey] = ($challengerCounts[$candidateKey] ?? 0) + 1;
            if (!isset($challengerConfs[$candidateKey])) {
                $challengerConfs[$candidateKey] = [];
            }
            if (isset($candidate['confidence']) && is_numeric($candidate['confidence'])) {
                $challengerConfs[$candidateKey][] = (float)$candidate['confidence'];
            }
        }

        $bestChallenger = null;
        $bestChallengerCount = 0;
        foreach ($challengerCounts as $candidateKey => $count) {
            if ((int)$count > $bestChallengerCount) {
                $bestChallenger = (string)$candidateKey;
                $bestChallengerCount = (int)$count;
            }
        }

        $challengerMean = ($bestChallenger !== null && isset($challengerConfs[$bestChallenger]))
            ? gps_test_mean($challengerConfs[$bestChallenger])
            : null;

        $switchAllowed = $bestChallenger !== null
            && $bestChallengerCount >= 6
            && $challengerMean !== null
            && $challengerMean >= 0.55;
        if ($switchAllowed) {
            $lockKey = $bestChallenger;
            if ($rawKey === $lockKey) {
                $raw['phase'] = 'locked';
                $results[] = $raw;
            } else {
                $results[] = gps_test_make_unknown_from_point($raw, 'flip_suppressed', 'locked');
            }
            continue;
        }

        $results[] = gps_test_make_unknown_from_point($raw, 'flip_suppressed', 'locked');
    }

    $results = gps_test_apply_short_segment_filters($results);
    $results = gps_test_fill_lift_unknown_gaps($results, $liftDefs);
    $results = gps_test_apply_coverage_filter($results);

    return [
        'points' => $results,
        'segments' => gps_test_build_segments($results)
    ];
}

function gps_test_track_to_feature_collection(array $points): array {
    $features = [];

    foreach ($points as $point) {
        $properties = [];
        if (isset($point['timestamp']) && $point['timestamp'] !== null) {
            $properties['timestamp'] = (string)$point['timestamp'];
        }
        if (isset($point['accuracy']) && $point['accuracy'] !== null) {
            $properties['accuracy'] = (float)$point['accuracy'];
        }
        if (isset($point['speed']) && $point['speed'] !== null) {
            $properties['speed'] = (float)$point['speed'];
        }
        if (isset($point['heading']) && $point['heading'] !== null) {
            $properties['heading'] = (float)$point['heading'];
        }
        if (isset($point['altitude']) && $point['altitude'] !== null) {
            $properties['altitude'] = (float)$point['altitude'];
        }

        $features[] = [
            'type' => 'Feature',
            'properties' => $properties,
            'geometry' => [
                'type' => 'Point',
                'coordinates' => [
                    round((float)$point['lon'], 7),
                    round((float)$point['lat'], 7)
                ]
            ]
        ];
    }

    return [
        'type' => 'FeatureCollection',
        'features' => $features
    ];
}
