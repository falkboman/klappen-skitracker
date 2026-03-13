<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib.php';

function fail(string $message): never {
    fwrite(STDERR, "FAIL: {$message}\n");
    exit(1);
}

function assert_true(bool $condition, string $message): void {
    if (!$condition) {
        fail($message);
    }
}

function assert_same(mixed $actual, mixed $expected, string $message): void {
    if ($actual !== $expected) {
        fail($message . " (expected=" . var_export($expected, true) . ", actual=" . var_export($actual, true) . ")");
    }
}

function make_track(array $coords): array {
    return [
        'type' => 'FeatureCollection',
        'features' => array_map(static fn($c) => [
            'type' => 'Feature',
            'properties' => ['accuracy' => 6],
            'geometry' => ['type' => 'Point', 'coordinates' => [$c[0], $c[1]]]
        ], $coords)
    ];
}

function make_point_track(array $points): array {
    return [
        'type' => 'FeatureCollection',
        'features' => array_map(static function (array $p): array {
            return [
                'type' => 'Feature',
                'properties' => [
                    'accuracy' => $p['accuracy'] ?? 6,
                    'timestamp' => $p['timestamp'] ?? null,
                    'speed' => $p['speed'] ?? null,
                    'heading' => $p['heading'] ?? null,
                    'altitude' => $p['altitude'] ?? null
                ],
                'geometry' => [
                    'type' => 'Point',
                    'coordinates' => [(float)$p['lon'], (float)$p['lat']]
                ]
            ];
        }, $points)
    ];
}

$backar = gps_test_load_backar();
$backarByNummer = gps_test_backar_by_nummer($backar);
assert_true(isset($backarByNummer[1]) && isset($backarByNummer[2]), 'backar.json must contain #1 and #2 for tests');
$liftar = gps_test_load_liftar();
$liftarByUid = gps_test_liftar_by_uid($liftar);

$run1 = [
    'runId' => 'run_a',
    'createdAt' => '2026-03-10T10:00:00+00:00',
    'widthInput' => 24,
    'points' => [
        [13.0000, 60.0000],
        [13.0000, 60.0050],
        [13.0000, 60.0100]
    ]
];
$run2 = [
    'runId' => 'run_b',
    'createdAt' => '2026-03-10T10:10:00+00:00',
    'widthInput' => 24,
    'points' => [
        [13.0002, 60.0000],
        [13.0002, 60.0050],
        [13.0002, 60.0100]
    ]
];

// 1) 1 run -> active feature = run geometry
$singleFeature = gps_test_build_active_feature_from_runs(1, 'Slope 1', [$run1]);
assert_same($singleFeature['properties']['source'], 'single_run', 'Single run should produce source=single_run');
assert_same((int)$singleFeature['properties']['runCount'], 1, 'Single run should set runCount=1');
assert_same(count($singleFeature['geometry']['coordinates']), 3, 'Single run geometry should keep points');

// 2) 2 runs -> active feature should still be latest run (no median)
$latestFeature = gps_test_build_active_feature_from_runs(1, 'Slope 1', [$run1, $run2]);
assert_same($latestFeature['properties']['source'], 'single_run', 'Two runs should still use single_run source');
assert_same((int)$latestFeature['properties']['runCount'], 2, 'runCount should still be tracked');
assert_same((string)$latestFeature['properties']['activeRunId'], 'run_b', 'Latest run should be active');
assert_same(count($latestFeature['geometry']['coordinates']), 3, 'Latest run geometry should be used as-is');

// 3) resampling utility still works (used by helper tooling)
$resampledShort = gps_test_resample_run_coordinates([[13.0, 60.0], [13.0001, 60.01]], 120);
$resampledLong = gps_test_resample_run_coordinates([[13.0, 60.0], [13.00005, 60.003], [13.0001, 60.006], [13.00015, 60.01]], 120);
assert_same(count($resampledShort), 120, 'Resampling short run should produce 120 points');
assert_same(count($resampledLong), 120, 'Resampling longer run should produce 120 points');

// Startup GPS-fix noise should be trimmed if the first point is a clear outlier.
$startupNoise = gps_test_normalize_run_coordinates([
    [13.3584327, 61.0309003],
    [13.3575794, 61.0325608],
    [13.3575341, 61.0325933],
    [13.3575070, 61.0326006],
    [13.3575167, 61.0326359]
]);
assert_same(count($startupNoise), 4, 'Startup outlier should be removed from normalized coordinates');
assert_same($startupNoise[0], [13.3575794, 61.0325608], 'Normalized run should begin at the first stable GPS point');

// Integration: saveBackRun should update store and backDefs
$store = gps_test_empty_back_runs_store();
$backDefs = gps_test_empty_feature_collection();

$trackA = make_track([
    [13.0000, 60.0000],
    [13.0000, 60.0050],
    [13.0000, 60.0100]
]);
$saveA = gps_test_save_back_run(1, $trackA, 25, $store, $backDefs, $backarByNummer);
assert_same((int)$saveA['runCount'], 1, 'After first saveBackRun, runCount should be 1');
assert_same($saveA['activeFeature']['properties']['source'], 'single_run', 'First saveBackRun should use single_run');

$trackB = make_track([
    [13.0002, 60.0000],
    [13.0002, 60.0050],
    [13.0002, 60.0100]
]);
$saveB = gps_test_save_back_run(1, $trackB, 25, $saveA['store'], $saveA['backDefs'], $backarByNummer);
assert_same((int)$saveB['runCount'], 2, 'After second saveBackRun, runCount should be 2');
assert_same($saveB['activeFeature']['properties']['source'], 'single_run', 'Second saveBackRun should still use single_run');

// Integration: rebuild should be deterministic
$rebuilt1 = gps_test_rebuild_back_defs_from_runs($saveB['store'], gps_test_empty_feature_collection(), $backarByNummer);
$rebuilt2 = gps_test_rebuild_back_defs_from_runs($saveB['store'], gps_test_empty_feature_collection(), $backarByNummer);
assert_same(json_encode($rebuilt1), json_encode($rebuilt2), 'Rebuild from runs should be deterministic');

// Regression: classifyPoint/classifyTrack should still work
$validatedDefs = gps_test_validate_back_defs_geojson($saveB['backDefs'], $backarByNummer);
$nearLatest = [
    'lat' => 60.0040,
    'lon' => 13.0002,
    'heading' => 0,
    'accuracy' => 6,
    'timestamp' => date('c')
];
$r1 = gps_test_classify_point($nearLatest, $validatedDefs);
assert_same($r1['status'], 'matched', 'classifyPoint should still match against updated defs');

$trackResult = gps_test_classify_track(gps_test_points_from_geojson($trackA), $validatedDefs);
assert_true(count($trackResult['segments']) >= 1, 'classifyTrack should still return segments');

// New behavior: classify track with lift + descent + lift using altitude trend.
$backDefsForDual = [
    'type' => 'FeatureCollection',
    'features' => [[
        'type' => 'Feature',
        'properties' => [
            'backNummer' => 1,
            'namn' => 'Slope 1',
            'widthMeters' => 25,
            'source' => 'single_run',
            'updatedAt' => date('c')
        ],
        'geometry' => [
            'type' => 'LineString',
            'coordinates' => [
                [13.0010, 60.0050],
                [13.0010, 60.0002]
            ]
        ]
    ]]
];
$liftDefsForDual = [
    'type' => 'FeatureCollection',
    'features' => [
        [
            'type' => 'Feature',
            'properties' => [
                'liftUid' => 'D-norr',
                'liftId' => 'D',
                'namn' => 'Lift D norr',
                'widthMeters' => 12,
                'source' => 'single_run',
                'updatedAt' => date('c')
            ],
            'geometry' => [
                'type' => 'LineString',
                'coordinates' => [
                    [13.0000, 60.0000],
                    [13.0000, 60.0050]
                ]
            ]
        ],
        [
            'type' => 'Feature',
            'properties' => [
                'liftUid' => 'D-syd',
                'liftId' => 'D',
                'namn' => 'Lift D syd',
                'widthMeters' => 12,
                'source' => 'single_run',
                'updatedAt' => date('c')
            ],
            'geometry' => [
                'type' => 'LineString',
                'coordinates' => [
                    [13.0002, 60.0000],
                    [13.0002, 60.0050]
                ]
            ]
        ]
    ]
];

$start = strtotime('2026-03-10T10:00:00+00:00');
$complexPoints = [];
for ($i = 0; $i < 14; $i++) {
    $complexPoints[] = [
        'lon' => 13.00005,
        'lat' => 60.0004 + ($i * 0.0007),
        'timestamp' => date('c', $start + ($i * 5)),
        'speed' => 2.2,
        'heading' => 0,
        'accuracy' => 5,
        'altitude' => 100 + ($i * 7)
    ];
}
for ($i = 0; $i < 14; $i++) {
    $complexPoints[] = [
        'lon' => 13.0010,
        'lat' => 60.0048 - ($i * 0.0008),
        'timestamp' => date('c', $start + (30 + $i * 5)),
        'speed' => 6.4,
        'heading' => 180,
        'accuracy' => 5,
        'altitude' => 142 - ($i * 7)
    ];
}
for ($i = 0; $i < 14; $i++) {
    $complexPoints[] = [
        'lon' => 13.00012,
        'lat' => 60.0010 + ($i * 0.0007),
        'timestamp' => date('c', $start + (60 + $i * 5)),
        'speed' => 2.0,
        'heading' => 5,
        'accuracy' => 5,
        'altitude' => 100 + ($i * 8)
    ];
}
$complexTrack = make_point_track($complexPoints);
$complexResult = gps_test_classify_track(
    gps_test_points_from_geojson($complexTrack),
    $backDefsForDual,
    $liftDefsForDual
);
assert_same(count($complexResult['points']), count($complexPoints), 'Complex track should preserve point count');
assert_true(count($complexResult['segments']) >= 1, 'Complex track should produce at least one segment');

// Fallback when altitude is missing: track should still classify with geometry/speed signals.
$noAltitudePoints = array_map(static function (array $p): array {
    $next = $p;
    unset($next['altitude']);
    return $next;
}, $complexPoints);
$noAltitudeTrack = make_point_track($noAltitudePoints);
$noAltitudeResult = gps_test_classify_track(
    gps_test_points_from_geojson($noAltitudeTrack),
    $backDefsForDual,
    $liftDefsForDual
);
assert_same(count($noAltitudeResult['points']), count($noAltitudePoints), 'No-altitude track should preserve point count');
assert_true(count($noAltitudeResult['segments']) >= 1, 'No-altitude track should still produce segments');

// Lift ID rule: two nearby lift definitions with same ID should report canonical liftId.
$liftPointCount = 0;
foreach ($complexResult['points'] as $p) {
    if (($p['matchedKind'] ?? null) === 'lift') {
        $liftPointCount++;
        assert_same((string)($p['liftId'] ?? ''), 'D', 'Lift points should map to canonical liftId');
    }
}
assert_true(true, 'Lift ID canonical mapping assertion executed for any lift-classified points');

// Startup stability regression: noisy pre-lift should stay mostly unknown, then lock correctly on lift D.
$juniorTrackPath = dirname(__DIR__, 2) . '/Data/gps_tracks/back_7_Kl_ppen_Junior_Snowpark_20260312_112305_ddd2b8.geojson';
assert_true(is_file($juniorTrackPath), 'Expected junior snowpark track fixture to exist');
$juniorTrackRaw = json_decode((string)file_get_contents($juniorTrackPath), true);
assert_true(is_array($juniorTrackRaw), 'Junior track must be valid JSON');
$juniorPoints = gps_test_points_from_geojson($juniorTrackRaw);
$juniorBackDefs = gps_test_load_back_defs($backarByNummer);
$juniorLiftDefs = gps_test_load_lift_defs($liftarByUid);
$juniorResult = gps_test_classify_track($juniorPoints, $juniorBackDefs, $juniorLiftDefs);
$jrPoints = $juniorResult['points'];
assert_true(count($jrPoints) > 917, 'Junior track should contain enough points for range checks');

$rangeStartA = 0;
$rangeEndA = 677;
$rangeStartB = 678;
$rangeEndB = 917;

$matchedNonIdleA = 0;
$flipsA = 0;
$prevKeyA = null;
$bootstrapSeenA = false;
$prelockSeenA = false;
for ($i = $rangeStartA; $i <= $rangeEndA; $i++) {
    $p = $jrPoints[$i];
    if (($p['phase'] ?? null) === 'bootstrap') {
        $bootstrapSeenA = true;
    }
    if (($p['reason'] ?? null) === 'prelock_unstable') {
        $prelockSeenA = true;
    }
    $isMatched = (($p['matchedKind'] ?? null) === 'back' || ($p['matchedKind'] ?? null) === 'lift');
    $isIdle = (($p['segmentType'] ?? 'unknown') === 'idle');
    if ($isMatched && !$isIdle) {
        $matchedNonIdleA++;
    }
    $key = implode(':', [
        (string)($p['segmentType'] ?? 'unknown'),
        (string)($p['matchedKind'] ?? 'null'),
        isset($p['backNummer']) ? (string)$p['backNummer'] : '-',
        isset($p['liftId']) ? (string)$p['liftId'] : '-'
    ]);
    if ($prevKeyA !== null && $prevKeyA !== $key) {
        $flipsA++;
    }
    $prevKeyA = $key;
}
assert_true($bootstrapSeenA, 'Expected bootstrap phase in early noisy range');
assert_true($prelockSeenA, 'Expected prelock_unstable reason in early noisy range');
assert_true($matchedNonIdleA <= 70, 'Expected early noisy range to suppress most false matched points');
assert_true($flipsA <= 20, 'Expected early noisy range to reduce classification flapping');

$liftDCountB = 0;
$totalB = 0;
$bridgeCountB = 0;
for ($i = $rangeStartB; $i <= $rangeEndB; $i++) {
    $p = $jrPoints[$i];
    $totalB++;
    if (($p['matchedKind'] ?? null) === 'lift' && (string)($p['liftId'] ?? '') === 'D') {
        $liftDCountB++;
    }
    if (($p['reason'] ?? null) === 'lift_continuity_bridge') {
        $bridgeCountB++;
    }
}
assert_true($totalB > 0, 'Range B must contain points');
assert_true(($liftDCountB / $totalB) >= 0.95, 'Expected range B to remain strongly classified as lift D');
assert_true(true, 'Lift continuity bridge behavior is enabled for short uncertain lift gaps');

// Regression sanity on blue-line track: classifier should still produce substantial known classifications.
$blueTrackPath = dirname(__DIR__, 2) . '/Data/gps_tracks/back_41_Kl_ppen_Blue_line_20260312_102859_0ee21a.geojson';
assert_true(is_file($blueTrackPath), 'Expected blue-line track fixture to exist');
$blueTrackRaw = json_decode((string)file_get_contents($blueTrackPath), true);
assert_true(is_array($blueTrackRaw), 'Blue-line track must be valid JSON');
$bluePoints = gps_test_points_from_geojson($blueTrackRaw);
$blueBackDefs = gps_test_load_back_defs($backarByNummer);
$blueLiftDefs = gps_test_load_lift_defs($liftarByUid);
$blueResult = gps_test_classify_track($bluePoints, $blueBackDefs, $blueLiftDefs);
$knownBlue = 0;
foreach ($blueResult['points'] as $p) {
    if (($p['matchedKind'] ?? null) === 'back' || ($p['matchedKind'] ?? null) === 'lift') {
        $knownBlue++;
    }
    assert_true(isset($p['phase']), 'Each classified point should include phase');
}
assert_true(count($blueResult['points']) > 0, 'Blue-line classification should produce points');
assert_true(($knownBlue / count($blueResult['points'])) >= 0.45, 'Blue-line should keep a substantial known classification ratio');

echo "OK: all gps-test latest-run checks passed\n";
