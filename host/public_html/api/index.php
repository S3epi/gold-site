<?php
declare(strict_types=1);

$configPath = getenv('NARKHINO_CONFIG') ?: dirname(__DIR__, 2) . '/narkhino-config.php';
if (!is_file($configPath)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'ok' => false,
        'error' => 'فایل تنظیمات پیدا نشد. narkhino-config.php را یک پوشه بالاتر از public_html قرار دهید.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
require $configPath;
require __DIR__ . '/lib.php';

nk_boot();

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$path = nk_request_path();
$routes = [
    'GET health' => 'nk_health',
    'GET v1/prices' => 'nk_api_prices',
    'GET v1/gold' => 'nk_api_group',
    'GET v1/coins' => 'nk_api_group',
    'GET v1/currencies' => 'nk_api_group',
    'GET v1/ounce' => 'nk_api_group',
    'GET v1/history' => 'nk_api_history',
    'GET v1/announcements/active' => 'nk_public_announcements',
    'POST v1/announcements/read' => 'nk_public_announcement_read',
    'GET v1/owner/session' => 'nk_owner_session',
    'POST v1/owner/login' => 'nk_owner_login',
    'POST v1/owner/logout' => 'nk_owner_logout',
    'GET v1/owner/state' => 'nk_owner_state',
    'POST v1/owner/settings' => 'nk_owner_settings',
    'POST v1/owner/telegram/test' => 'nk_owner_telegram_test',
    'POST v1/owner/telegram/refresh' => 'nk_owner_telegram_test',
    'POST v1/owner/telegram/send' => 'nk_owner_telegram_send',
    'POST v1/owner/announcements' => 'nk_owner_announcement_create',
    'POST v1/owner/announcements/delete' => 'nk_owner_announcement_delete',
    'POST v1/owner/api-keys' => 'nk_owner_key_create',
    'POST v1/owner/api-keys/delete' => 'nk_owner_key_delete'
];

$key = $method . ' ' . $path;
if (!isset($routes[$key])) {
    nk_json(['ok' => false, 'error' => 'مسیر درخواستی وجود ندارد.'], 404);
}
$routes[$key]();
