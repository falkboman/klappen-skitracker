<?php
declare(strict_types=1);

$appPath = __DIR__ . '/app.js';
if (!is_file($appPath)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'app.js not found';
    exit;
}

$etag = '"' . md5_file($appPath) . '"';
$ifNoneMatch = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';

header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-cache, must-revalidate, max-age=0');
header('ETag: ' . $etag);

if ($ifNoneMatch === $etag) {
    http_response_code(304);
    exit;
}

readfile($appPath);
