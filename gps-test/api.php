<?php
declare(strict_types=1);

require_once __DIR__ . '/lib.php';

header('Content-Type: application/json; charset=utf-8');

function gps_test_send_json(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function gps_test_read_post_json(): array {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw ?: '{}', true);
    if (!is_array($payload)) {
        gps_test_send_json(['error' => 'Invalid JSON body'], 400);
    }
    return $payload;
}

try {
    gps_test_ensure_data_files();

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = (string)($_GET['action'] ?? '');

    $backar = gps_test_load_backar();
    $backarByNummer = gps_test_backar_by_nummer($backar);
    $liftar = gps_test_load_liftar();
    $liftarByUid = gps_test_liftar_by_uid($liftar);

    if ($method === 'GET' && $action === 'backar') {
        gps_test_send_json(['backar' => $backar]);
    }

    if ($method === 'GET' && $action === 'liftar') {
        gps_test_send_json(['liftar' => $liftar]);
    }

    if ($method === 'GET' && $action === 'backDefs') {
        $defs = gps_test_load_back_defs($backarByNummer);
        gps_test_send_json(['backDefs' => $defs]);
    }

    if ($method === 'GET' && $action === 'liftDefs') {
        $defs = gps_test_load_lift_defs($liftarByUid);
        gps_test_send_json(['liftDefs' => $defs]);
    }

    if ($method === 'GET' && $action === 'backRuns') {
        $store = gps_test_load_back_runs_store($backarByNummer);
        $backNummer = isset($_GET['backNummer']) ? (int)$_GET['backNummer'] : 0;
        $includeGeoJson = isset($_GET['geojson']) && (string)$_GET['geojson'] === '1';

        if ($backNummer > 0) {
            $runs = $store['backRuns'][(string)$backNummer] ?? [];
            $metaRuns = array_map(static function (array $run): array {
                return [
                    'runId' => (string)($run['runId'] ?? ''),
                    'backNummer' => (int)($run['backNummer'] ?? 0),
                    'createdAt' => (string)($run['createdAt'] ?? ''),
                    'widthInput' => (float)($run['widthInput'] ?? 25.0),
                    'pointCount' => (int)($run['pointCount'] ?? 0),
                    'metadata' => is_array($run['metadata'] ?? null) ? $run['metadata'] : []
                ];
            }, is_array($runs) ? $runs : []);

            $response = [
                'backNummer' => $backNummer,
                'runCount' => count($metaRuns),
                'runs' => $metaRuns
            ];
            if ($includeGeoJson) {
                $response['runsGeoJson'] = gps_test_back_runs_to_feature_collection($store, $backNummer);
            }
            gps_test_send_json($response);
        }

        $response = [
            'summaries' => gps_test_back_runs_summary($store)
        ];
        if ($includeGeoJson) {
            $response['runsGeoJson'] = gps_test_back_runs_to_feature_collection($store, null);
        }
        gps_test_send_json($response);
    }

    if ($method === 'GET' && $action === 'liftRuns') {
        $store = gps_test_load_lift_runs_store($liftarByUid);
        $liftUid = trim((string)($_GET['liftUid'] ?? ''));
        $includeGeoJson = isset($_GET['geojson']) && (string)$_GET['geojson'] === '1';

        if ($liftUid !== '') {
            if (!isset($liftarByUid[$liftUid])) {
                gps_test_send_json(['error' => 'Valid liftUid is required'], 400);
            }

            $runs = $store['liftRuns'][$liftUid] ?? [];
            $metaRuns = array_map(static function (array $run): array {
                return [
                    'runId' => (string)($run['runId'] ?? ''),
                    'liftUid' => (string)($run['liftUid'] ?? ''),
                    'liftId' => (string)($run['liftId'] ?? ''),
                    'createdAt' => (string)($run['createdAt'] ?? ''),
                    'widthInput' => (float)($run['widthInput'] ?? 25.0),
                    'pointCount' => (int)($run['pointCount'] ?? 0),
                    'metadata' => is_array($run['metadata'] ?? null) ? $run['metadata'] : []
                ];
            }, is_array($runs) ? $runs : []);

            $response = [
                'liftUid' => $liftUid,
                'runCount' => count($metaRuns),
                'runs' => $metaRuns
            ];
            if ($includeGeoJson) {
                $response['runsGeoJson'] = gps_test_lift_runs_to_feature_collection($store, $liftUid);
            }
            gps_test_send_json($response);
        }

        $response = [
            'summaries' => gps_test_lift_runs_summary($store)
        ];
        if ($includeGeoJson) {
            $response['runsGeoJson'] = gps_test_lift_runs_to_feature_collection($store, null);
        }
        gps_test_send_json($response);
    }

    if ($method === 'POST' && $action === 'backDefs') {
        $payload = gps_test_read_post_json();
        $geojson = isset($payload['geojson']) && is_array($payload['geojson']) ? $payload['geojson'] : $payload;

        $validated = gps_test_validate_back_defs_geojson($geojson, $backarByNummer);
        gps_test_write_json_file(GPS_TEST_BACK_DEFS_FILE, $validated);

        gps_test_send_json(['ok' => true, 'backDefs' => $validated]);
    }

    if ($method === 'POST' && $action === 'liftDefs') {
        $payload = gps_test_read_post_json();
        $geojson = isset($payload['geojson']) && is_array($payload['geojson']) ? $payload['geojson'] : $payload;

        $validated = gps_test_validate_lift_defs_geojson($geojson, $liftarByUid);
        gps_test_write_json_file(GPS_TEST_LIFT_DEFS_FILE, $validated);

        gps_test_send_json(['ok' => true, 'liftDefs' => $validated]);
    }

    if ($method === 'POST' && $action === 'saveBackRun') {
        $payload = gps_test_read_post_json();
        $backNummer = (int)($payload['backNummer'] ?? 0);
        if ($backNummer <= 0) {
            gps_test_send_json(['error' => 'backNummer is required'], 400);
        }

        $track = $payload['track'] ?? null;
        if (!is_array($track)) {
            gps_test_send_json(['error' => 'track is required and must be a GeoJSON FeatureCollection'], 400);
        }

        $widthInput = isset($payload['widthMeters']) && is_numeric($payload['widthMeters'])
            ? (float)$payload['widthMeters']
            : null;

        $store = gps_test_load_back_runs_store($backarByNummer);
        $backDefs = gps_test_load_back_defs($backarByNummer);
        $result = gps_test_save_back_run($backNummer, $track, $widthInput, $store, $backDefs, $backarByNummer);

        $validatedBackDefs = gps_test_validate_back_defs_geojson($result['backDefs'], $backarByNummer);
        gps_test_save_back_runs_store($result['store']);
        gps_test_write_json_file(GPS_TEST_BACK_DEFS_FILE, $validatedBackDefs);

        $activeSource = (string)($result['activeFeature']['properties']['source'] ?? 'single_run');
        gps_test_send_json([
            'ok' => true,
            'run' => [
                'runId' => (string)$result['run']['runId'],
                'backNummer' => (int)$result['run']['backNummer'],
                'createdAt' => (string)$result['run']['createdAt'],
                'pointCount' => (int)$result['run']['pointCount'],
                'widthInput' => (float)$result['run']['widthInput']
            ],
            'runCount' => (int)$result['runCount'],
            'mode' => $activeSource,
            'activeFeature' => $result['activeFeature'],
            'backDefs' => $validatedBackDefs
        ], 201);
    }

    if ($method === 'POST' && $action === 'saveLiftRun') {
        $payload = gps_test_read_post_json();
        $liftUid = trim((string)($payload['liftUid'] ?? ''));
        if ($liftUid === '') {
            gps_test_send_json(['error' => 'liftUid is required'], 400);
        }
        if (!isset($liftarByUid[$liftUid])) {
            gps_test_send_json(['error' => 'Unknown liftUid'], 400);
        }

        $track = $payload['track'] ?? null;
        if (!is_array($track)) {
            gps_test_send_json(['error' => 'track is required and must be a GeoJSON FeatureCollection'], 400);
        }

        $widthInput = isset($payload['widthMeters']) && is_numeric($payload['widthMeters'])
            ? (float)$payload['widthMeters']
            : null;

        $store = gps_test_load_lift_runs_store($liftarByUid);
        $liftDefs = gps_test_load_lift_defs($liftarByUid);
        $result = gps_test_save_lift_run($liftUid, $track, $widthInput, $store, $liftDefs, $liftarByUid);

        $validatedLiftDefs = gps_test_validate_lift_defs_geojson($result['liftDefs'], $liftarByUid);
        gps_test_save_lift_runs_store($result['store']);
        gps_test_write_json_file(GPS_TEST_LIFT_DEFS_FILE, $validatedLiftDefs);

        $activeSource = (string)($result['activeFeature']['properties']['source'] ?? 'single_run');
        gps_test_send_json([
            'ok' => true,
            'run' => [
                'runId' => (string)$result['run']['runId'],
                'liftUid' => (string)$result['run']['liftUid'],
                'liftId' => (string)$result['run']['liftId'],
                'createdAt' => (string)$result['run']['createdAt'],
                'pointCount' => (int)$result['run']['pointCount'],
                'widthInput' => (float)$result['run']['widthInput']
            ],
            'runCount' => (int)$result['runCount'],
            'mode' => $activeSource,
            'activeFeature' => $result['activeFeature'],
            'liftDefs' => $validatedLiftDefs
        ], 201);
    }

    if ($method === 'POST' && $action === 'deleteBackRuns') {
        $payload = gps_test_read_post_json();
        $backNummer = (int)($payload['backNummer'] ?? 0);
        if ($backNummer <= 0 || !isset($backarByNummer[$backNummer])) {
            gps_test_send_json(['error' => 'Valid backNummer is required'], 400);
        }

        $store = gps_test_load_back_runs_store($backarByNummer);
        $backDefs = gps_test_load_back_defs($backarByNummer);

        $removedRuns = count($store['backRuns'][(string)$backNummer] ?? []);
        unset($store['backRuns'][(string)$backNummer]);

        $features = is_array($backDefs['features'] ?? null) ? $backDefs['features'] : [];
        $nextFeatures = [];
        $removedDefs = 0;
        foreach ($features as $feature) {
            $nr = (int)($feature['properties']['backNummer'] ?? 0);
            if ($nr === $backNummer) {
                $removedDefs++;
                continue;
            }
            $nextFeatures[] = $feature;
        }

        $nextBackDefs = [
            'type' => 'FeatureCollection',
            'features' => $nextFeatures
        ];
        $validatedBackDefs = gps_test_validate_back_defs_geojson($nextBackDefs, $backarByNummer);

        gps_test_save_back_runs_store($store);
        gps_test_write_json_file(GPS_TEST_BACK_DEFS_FILE, $validatedBackDefs);

        gps_test_send_json([
            'ok' => true,
            'backNummer' => $backNummer,
            'removedRuns' => $removedRuns,
            'removedDefs' => $removedDefs,
            'summaries' => gps_test_back_runs_summary($store),
            'backDefs' => $validatedBackDefs
        ]);
    }

    if ($method === 'POST' && $action === 'deleteLiftRuns') {
        $payload = gps_test_read_post_json();
        $liftUid = trim((string)($payload['liftUid'] ?? ''));
        if ($liftUid === '' || !isset($liftarByUid[$liftUid])) {
            gps_test_send_json(['error' => 'Valid liftUid is required'], 400);
        }

        $store = gps_test_load_lift_runs_store($liftarByUid);
        $liftDefs = gps_test_load_lift_defs($liftarByUid);

        $removedRuns = count($store['liftRuns'][$liftUid] ?? []);
        unset($store['liftRuns'][$liftUid]);

        $features = is_array($liftDefs['features'] ?? null) ? $liftDefs['features'] : [];
        $nextFeatures = [];
        $removedDefs = 0;
        foreach ($features as $feature) {
            $uid = trim((string)($feature['properties']['liftUid'] ?? ''));
            if ($uid === $liftUid) {
                $removedDefs++;
                continue;
            }
            $nextFeatures[] = $feature;
        }

        $nextLiftDefs = [
            'type' => 'FeatureCollection',
            'features' => $nextFeatures
        ];
        $validatedLiftDefs = gps_test_validate_lift_defs_geojson($nextLiftDefs, $liftarByUid);

        gps_test_save_lift_runs_store($store);
        gps_test_write_json_file(GPS_TEST_LIFT_DEFS_FILE, $validatedLiftDefs);

        gps_test_send_json([
            'ok' => true,
            'liftUid' => $liftUid,
            'removedRuns' => $removedRuns,
            'removedDefs' => $removedDefs,
            'summaries' => gps_test_lift_runs_summary($store),
            'liftDefs' => $validatedLiftDefs
        ]);
    }

    if ($method === 'POST' && $action === 'deleteBackRun') {
        $payload = gps_test_read_post_json();
        $backNummer = (int)($payload['backNummer'] ?? 0);
        $runId = trim((string)($payload['runId'] ?? ''));

        if ($backNummer <= 0 || !isset($backarByNummer[$backNummer])) {
            gps_test_send_json(['error' => 'Valid backNummer is required'], 400);
        }
        if ($runId === '' || !preg_match('/^[A-Za-z0-9_-]+$/', $runId)) {
            gps_test_send_json(['error' => 'Valid runId is required'], 400);
        }

        $store = gps_test_load_back_runs_store($backarByNummer);
        $backDefs = gps_test_load_back_defs($backarByNummer);
        $key = (string)$backNummer;
        $runs = is_array($store['backRuns'][$key] ?? null) ? $store['backRuns'][$key] : [];

        $before = count($runs);
        $runs = array_values(array_filter($runs, static fn($r) => (string)($r['runId'] ?? '') !== $runId));
        if (count($runs) === $before) {
            gps_test_send_json(['error' => 'Run not found for this back'], 404);
        }

        if (count($runs) === 0) {
            unset($store['backRuns'][$key]);

            $features = is_array($backDefs['features'] ?? null) ? $backDefs['features'] : [];
            $nextFeatures = [];
            foreach ($features as $feature) {
                $nr = (int)($feature['properties']['backNummer'] ?? 0);
                if ($nr === $backNummer) {
                    continue;
                }
                $nextFeatures[] = $feature;
            }
            $backDefs = [
                'type' => 'FeatureCollection',
                'features' => $nextFeatures
            ];
            $mode = 'none';
            $runCount = 0;
        } else {
            $store['backRuns'][$key] = $runs;
            $feature = gps_test_build_active_feature_from_runs($backNummer, (string)$backarByNummer[$backNummer]['namn'], $runs);
            $backDefs = gps_test_upsert_feature_in_defs($backDefs, $feature);
            $mode = (string)($feature['properties']['source'] ?? 'single_run');
            $runCount = count($runs);
        }

        $validatedBackDefs = gps_test_validate_back_defs_geojson($backDefs, $backarByNummer);
        gps_test_save_back_runs_store($store);
        gps_test_write_json_file(GPS_TEST_BACK_DEFS_FILE, $validatedBackDefs);

        gps_test_send_json([
            'ok' => true,
            'backNummer' => $backNummer,
            'deletedRunId' => $runId,
            'runCount' => $runCount,
            'mode' => $mode,
            'summaries' => gps_test_back_runs_summary($store),
            'backDefs' => $validatedBackDefs
        ]);
    }

    if ($method === 'POST' && $action === 'deleteLiftRun') {
        $payload = gps_test_read_post_json();
        $liftUid = trim((string)($payload['liftUid'] ?? ''));
        $runId = trim((string)($payload['runId'] ?? ''));

        if ($liftUid === '' || !isset($liftarByUid[$liftUid])) {
            gps_test_send_json(['error' => 'Valid liftUid is required'], 400);
        }
        if ($runId === '' || !preg_match('/^[A-Za-z0-9_-]+$/', $runId)) {
            gps_test_send_json(['error' => 'Valid runId is required'], 400);
        }

        $store = gps_test_load_lift_runs_store($liftarByUid);
        $liftDefs = gps_test_load_lift_defs($liftarByUid);
        $runs = is_array($store['liftRuns'][$liftUid] ?? null) ? $store['liftRuns'][$liftUid] : [];

        $before = count($runs);
        $runs = array_values(array_filter($runs, static fn($r) => (string)($r['runId'] ?? '') !== $runId));
        if (count($runs) === $before) {
            gps_test_send_json(['error' => 'Run not found for this lift'], 404);
        }

        if (count($runs) === 0) {
            unset($store['liftRuns'][$liftUid]);

            $features = is_array($liftDefs['features'] ?? null) ? $liftDefs['features'] : [];
            $nextFeatures = [];
            foreach ($features as $feature) {
                $uid = trim((string)($feature['properties']['liftUid'] ?? ''));
                if ($uid === $liftUid) {
                    continue;
                }
                $nextFeatures[] = $feature;
            }
            $liftDefs = [
                'type' => 'FeatureCollection',
                'features' => $nextFeatures
            ];
            $mode = 'none';
            $runCount = 0;
        } else {
            $store['liftRuns'][$liftUid] = $runs;
            $feature = gps_test_build_active_lift_feature_from_runs($liftUid, $liftarByUid[$liftUid], $runs);
            $liftDefs = gps_test_upsert_feature_in_lift_defs($liftDefs, $feature);
            $mode = (string)($feature['properties']['source'] ?? 'single_run');
            $runCount = count($runs);
        }

        $validatedLiftDefs = gps_test_validate_lift_defs_geojson($liftDefs, $liftarByUid);
        gps_test_save_lift_runs_store($store);
        gps_test_write_json_file(GPS_TEST_LIFT_DEFS_FILE, $validatedLiftDefs);

        gps_test_send_json([
            'ok' => true,
            'liftUid' => $liftUid,
            'deletedRunId' => $runId,
            'runCount' => $runCount,
            'mode' => $mode,
            'summaries' => gps_test_lift_runs_summary($store),
            'liftDefs' => $validatedLiftDefs
        ]);
    }

    if ($method === 'POST' && $action === 'rebuildBackDefsFromRuns') {
        $store = gps_test_load_back_runs_store($backarByNummer);
        $backDefs = gps_test_load_back_defs($backarByNummer);

        $rebuilt = gps_test_rebuild_back_defs_from_runs($store, $backDefs, $backarByNummer);
        $validated = gps_test_validate_back_defs_geojson($rebuilt, $backarByNummer);
        gps_test_write_json_file(GPS_TEST_BACK_DEFS_FILE, $validated);

        gps_test_send_json([
            'ok' => true,
            'backDefs' => $validated,
            'summaries' => gps_test_back_runs_summary($store)
        ]);
    }

    if ($method === 'POST' && $action === 'classifyPoint') {
        $payload = gps_test_read_post_json();
        $point = gps_test_parse_point_payload($payload);

        $defs = gps_test_load_back_defs($backarByNummer);
        $context = [
            'prevBackNummer' => $payload['prevBackNummer'] ?? null
        ];
        $classification = gps_test_classify_point($point, $defs, $context);

        gps_test_send_json([
            'status' => $classification['status'],
            'backNummer' => $classification['backNummer'],
            'confidence' => $classification['confidence'],
            'distanceMeters' => $classification['distanceMeters'],
            'reason' => $classification['reason'] ?? null,
            'namn' => $classification['namn'] ?? null
        ]);
    }

    if ($method === 'POST' && $action === 'classifyTrack') {
        $payload = gps_test_read_post_json();
        $track = $payload['track'] ?? null;
        if (!is_array($track)) {
            gps_test_send_json(['error' => 'track is required and must be a GeoJSON FeatureCollection'], 400);
        }

        $points = gps_test_points_from_geojson($track);
        $backDefs = gps_test_load_back_defs($backarByNummer);
        $liftDefs = gps_test_load_lift_defs($liftarByUid);
        $result = gps_test_classify_track($points, $backDefs, $liftDefs);

        gps_test_send_json([
            'ok' => true,
            'points' => $result['points'],
            'segments' => $result['segments']
        ]);
    }

    if ($method === 'POST' && $action === 'saveTrack') {
        $payload = gps_test_read_post_json();
        $track = $payload['track'] ?? null;
        if (!is_array($track)) {
            gps_test_send_json(['error' => 'track is required and must be a GeoJSON FeatureCollection'], 400);
        }

        $points = gps_test_points_from_geojson($track);
        $fc = gps_test_track_to_feature_collection($points);

        $name = trim((string)($payload['name'] ?? ''));
        $safeName = preg_replace('/[^a-zA-Z0-9_\-]+/', '_', $name) ?: '';
        $prefix = $safeName !== '' ? $safeName . '_' : 'track_';
        $filename = $prefix . date('Ymd_His') . '_' . substr(bin2hex(random_bytes(3)), 0, 6) . '.geojson';

        $fullPath = GPS_TEST_TRACKS_DIR . '/' . $filename;
        gps_test_write_json_file($fullPath, $fc);

        gps_test_send_json([
            'ok' => true,
            'file' => $filename,
            'points' => count($points)
        ], 201);
    }

    if ($method === 'GET' && $action === 'tracks') {
        $items = [];
        if (is_dir(GPS_TEST_TRACKS_DIR)) {
            $files = scandir(GPS_TEST_TRACKS_DIR) ?: [];
            foreach ($files as $file) {
                if ($file === '.' || $file === '..' || !str_ends_with($file, '.geojson')) {
                    continue;
                }

                $path = GPS_TEST_TRACKS_DIR . '/' . $file;
                $items[] = [
                    'file' => $file,
                    'sizeBytes' => is_file($path) ? filesize($path) : 0,
                    'updatedAt' => is_file($path) ? date('c', (int)filemtime($path)) : null
                ];
            }
        }

        usort($items, static fn($a, $b) => strcmp((string)$b['updatedAt'], (string)$a['updatedAt']));
        gps_test_send_json(['tracks' => $items]);
    }

    if ($method === 'GET' && $action === 'trackFile') {
        $file = trim((string)($_GET['file'] ?? ''));
        if ($file === '' || !preg_match('/^[A-Za-z0-9._-]+\.geojson$/', $file)) {
            gps_test_send_json(['error' => 'file is required and must be a .geojson filename'], 400);
        }

        $path = GPS_TEST_TRACKS_DIR . '/' . basename($file);
        if (!is_file($path)) {
            gps_test_send_json(['error' => 'Track file not found'], 404);
        }

        $track = gps_test_read_json_file($path);
        if ($track === []) {
            gps_test_send_json(['error' => 'Track file is empty or invalid JSON'], 400);
        }

        gps_test_points_from_geojson($track); // validation
        gps_test_send_json(['file' => $file, 'track' => $track]);
    }

    gps_test_send_json(['error' => 'Unsupported action or method'], 404);
} catch (InvalidArgumentException $e) {
    gps_test_send_json(['error' => $e->getMessage()], 400);
} catch (Throwable $e) {
    gps_test_send_json(['error' => $e->getMessage()], 500);
}
