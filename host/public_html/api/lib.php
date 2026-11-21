<?php
declare(strict_types=1);

const NK_PERSIAN_DIGITS = ['0' => '۰', '1' => '۱', '2' => '۲', '3' => '۳', '4' => '۴', '5' => '۵', '6' => '۶', '7' => '۷', '8' => '۸', '9' => '۹'];

function nk_boot(): void
{
    date_default_timezone_set(defined('NK_TIMEZONE') ? NK_TIMEZONE : 'Asia/Tehran');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Cache-Control: no-store');

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        if ($origin !== '') {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Vary: Origin');
        }
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: X-Api-Key, Content-Type');
        header('Access-Control-Max-Age: 600');
        http_response_code(204);
        exit;
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => defined('NK_COOKIE_PATH') ? NK_COOKIE_PATH : '/',
            'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
            'httponly' => true,
            'samesite' => 'Lax'
        ]);
        session_name('narkhino_owner');
        session_start();
    }

    nk_migrate();
}

function nk_request_path(): string
{
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/api')), '/');
    if ($scriptDir !== '' && $scriptDir !== '.' && strpos($uri, $scriptDir) === 0) {
        $uri = substr($uri, strlen($scriptDir));
    }
    $uri = trim($uri, '/');
    if (strpos($uri, 'api/') === 0) {
        $uri = substr($uri, 4);
    }
    return $uri;
}

function nk_json(mixed $data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function nk_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    try {
        $pdo = new PDO(NK_DB_DSN, NK_DB_USER, NK_DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]);
        $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
    } catch (Throwable $e) {
        nk_json(['ok' => false, 'error' => 'اتصال به پایگاه داده برقرار نشد؛ مشخصات دیتابیس را در تنظیمات بررسی کنید.'], 500);
    }
    return $pdo;
}

function nk_migrate(): void
{
    static $done = false;
    if ($done) return;
    $done = true;
    $db = nk_db();
    $db->exec('CREATE TABLE IF NOT EXISTS settings (
        k VARCHAR(64) NOT NULL PRIMARY KEY,
        v MEDIUMTEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    $db->exec('CREATE TABLE IF NOT EXISTS announcements (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        text TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        INDEX idx_active (active, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    $db->exec('CREATE TABLE IF NOT EXISTS announcement_reads (
        announcement_id INT UNSIGNED NOT NULL,
        device VARCHAR(64) NOT NULL,
        read_at BIGINT NOT NULL,
        PRIMARY KEY (announcement_id, device)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    $db->exec('CREATE TABLE IF NOT EXISTS api_keys (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        label VARCHAR(100) NOT NULL,
        api_key VARCHAR(80) NOT NULL UNIQUE,
        domain VARCHAR(190) NOT NULL DEFAULT \'\',
        created_at BIGINT NOT NULL,
        last_used_at BIGINT NULL,
        requests INT UNSIGNED NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
}

function nk_setting(string $key, ?string $default = null): ?string
{
    $stmt = nk_db()->prepare('SELECT v FROM settings WHERE k = ? LIMIT 1');
    $stmt->execute([$key]);
    $value = $stmt->fetchColumn();
    return $value === false ? $default : (string) $value;
}

function nk_set_setting(string $key, string $value): void
{
    $stmt = nk_db()->prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)');
    $stmt->execute([$key, $value]);
}

function nk_now_ms(): int
{
    return (int) round(microtime(true) * 1000);
}

function nk_host(): string
{
    if (defined('NK_SITE_URL') && NK_SITE_URL !== '') {
        return rtrim((string) NK_SITE_URL, '/');
    }
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    return $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
}

/* ---------------- prices ---------------- */

function nk_price_map(): array
{
    return [
        'geram18' => ['id' => 'gold18', 'title' => 'طلای ۱۸ عیار (گرمی)', 'short' => '۱۸ عیار', 'group' => 'gold', 'unit' => 'TOMAN', 'rial' => true],
        'geram24' => ['id' => 'gold24', 'title' => 'طلای ۲۴ عیار (گرمی)', 'short' => '۲۴ عیار', 'group' => 'gold', 'unit' => 'TOMAN', 'rial' => true],
        'gold_740k' => ['id' => 'gold740', 'title' => 'طلای دست‌دوم (۷۴۰)', 'short' => '۷۴۰', 'group' => 'gold', 'unit' => 'TOMAN', 'rial' => true],
        'gold_melted_wholesale' => ['id' => 'melted', 'title' => 'آب‌شده بنکداری (هر مثقال)', 'short' => 'آب‌شده', 'group' => 'gold', 'unit' => 'TOMAN', 'rial' => true],
        'mesghal' => ['id' => 'mithqal', 'title' => 'مثقال طلا', 'short' => 'مثقال', 'group' => 'gold', 'unit' => 'TOMAN', 'rial' => true],
        'sekee' => ['id' => 'emami', 'title' => 'سکه امامی', 'short' => 'امامی', 'group' => 'coin', 'unit' => 'TOMAN', 'rial' => true],
        'sekeb' => ['id' => 'bahar', 'title' => 'سکه بهار آزادی', 'short' => 'بهار', 'group' => 'coin', 'unit' => 'TOMAN', 'rial' => true],
        'nim' => ['id' => 'half', 'title' => 'نیم سکه', 'short' => 'نیم', 'group' => 'coin', 'unit' => 'TOMAN', 'rial' => true],
        'rob' => ['id' => 'quarter', 'title' => 'ربع سکه', 'short' => 'ربع', 'group' => 'coin', 'unit' => 'TOMAN', 'rial' => true],
        'gerami' => ['id' => 'gram1', 'title' => 'سکه یک‌گرمی', 'short' => 'یک‌گرمی', 'group' => 'coin', 'unit' => 'TOMAN', 'rial' => true],
        'dollar' => ['id' => 'usd', 'title' => 'دلار آمریکا', 'short' => 'دلار', 'group' => 'currency', 'unit' => 'TOMAN', 'rial' => true],
        'euro' => ['id' => 'eur', 'title' => 'یورو', 'short' => 'یورو', 'group' => 'currency', 'unit' => 'TOMAN', 'rial' => true],
        'derham' => ['id' => 'aed', 'title' => 'درهم امارات', 'short' => 'درهم', 'group' => 'currency', 'unit' => 'TOMAN', 'rial' => true],
        'pound' => ['id' => 'gbp', 'title' => 'پوند انگلیس', 'short' => 'پوند', 'group' => 'currency', 'unit' => 'TOMAN', 'rial' => true],
        'lira' => ['id' => 'try', 'title' => 'لیر ترکیه', 'short' => 'لیر', 'group' => 'currency', 'unit' => 'TOMAN', 'rial' => true],
        'ons' => ['id' => 'xau', 'title' => 'انس جهانی طلا', 'short' => 'انس', 'group' => 'ounce', 'unit' => 'USD', 'rial' => false]
    ];
}

function nk_num(mixed $value): ?float
{
    if ($value === null) return null;
    $text = str_replace([',', '٬', ' ', "\u{200c}"], '', (string) $value);
    $text = strtr($text, ['۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9', '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9', '٫' => '.']);
    if ($text === '' || !is_numeric($text)) return null;
    return (float) $text;
}

function nk_tgju_ts(?string $value): ?int
{
    if (!$value) return null;
    try {
        $dt = new DateTime($value, new DateTimeZone('Asia/Tehran'));
        $ms = $dt->getTimestamp() * 1000;
        return abs(nk_now_ms() - $ms) < 3 * 86400000 ? $ms : null;
    } catch (Throwable) {
        return null;
    }
}

function nk_cache_path(): string
{
    $dir = defined('NK_CACHE_DIR') && NK_CACHE_DIR !== '' ? NK_CACHE_DIR : sys_get_temp_dir();
    if (!is_dir($dir)) {
        @mkdir($dir, 0770, true);
    }
    return rtrim($dir, '/\\') . '/narkhino-prices.json';
}

function nk_prices(bool $force = false): array
{
    $cacheFile = nk_cache_path();
    $cached = null;
    if (is_file($cacheFile)) {
        $raw = @file_get_contents($cacheFile);
        $cached = $raw ? json_decode($raw, true) : null;
        if (is_array($cached) && !$force && isset($cached['at']) && nk_now_ms() - (int) $cached['at'] < 8000) {
            return $cached['data'];
        }
    }

    $data = nk_fetch_tgju();
    if ($data !== null) {
        @file_put_contents($cacheFile, json_encode(['at' => nk_now_ms(), 'data' => $data], JSON_UNESCAPED_UNICODE), LOCK_EX);
        return $data;
    }
    if (is_array($cached) && isset($cached['at'], $cached['data']) && nk_now_ms() - (int) $cached['at'] < 120000) {
        return $cached['data'];
    }
    nk_json(['ok' => false, 'error' => 'دریافت قیمت زنده از منبع بازار در این لحظه ممکن نشد؛ دوباره تلاش کنید.'], 503);
}

function nk_fetch_tgju(): ?array
{
    $map = nk_price_map();
    $keys = array_keys($map);
    $keys[] = 'tether_gold_xaut';
    $keys[] = '_t' . intdiv(time(), 8);
    $url = 'https://api.tgju.org/v1/widget/tmp?keys=' . rawurlencode(implode(',', $keys)) . '&lang=1&hl=0&index=0';

    $ch = curl_init($url);
    if ($ch === false) return null;
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_ENCODING => '',
        CURLOPT_USERAGENT => 'Narkhino/1.0 (+price board)',
        CURLOPT_HTTPHEADER => ['Accept: application/json']
    ]);
    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if (!is_string($body) || $status !== 200) return null;

    $json = json_decode($body, true);
    $list = $json['response']['indicators'] ?? null;
    if (!is_array($list)) return null;

    $items = [];
    foreach ($list as $row) {
        $name = (string) ($row['name'] ?? '');
        if (!isset($map[$name])) continue;
        $spec = $map[$name];
        $price = nk_num($row['p'] ?? null);
        if ($price === null || $price <= 0) continue;
        $factor = $spec['rial'] ? 10 : 1;
        $item = [
            'id' => $spec['id'],
            'title' => $spec['title'],
            'short' => $spec['short'],
            'group' => $spec['group'],
            'unit' => $spec['unit'],
            'price' => $spec['unit'] === 'USD' ? round($price, 2) : (int) round($price / $factor),
            'changePct' => nk_num($row['dp'] ?? null),
            'high' => ($h = nk_num($row['h'] ?? null)) !== null ? ($spec['unit'] === 'USD' ? round($h, 2) : (int) round($h / $factor)) : null,
            'low' => ($l = nk_num($row['l'] ?? null)) !== null ? ($spec['unit'] === 'USD' ? round($l, 2) : (int) round($l / $factor)) : null,
            'ts' => nk_tgju_ts(isset($row['updated_at']) ? (string) $row['updated_at'] : null)
        ];
        $items[$spec['id']] = $item;
    }
    if (count($items) < 3) return null;

    return [
        'ok' => true,
        'source' => 'tgju',
        'generatedAt' => nk_now_ms(),
        'items' => array_values($items),
        'usdToman' => isset($items['usd']) ? $items['usd']['price'] : null,
        'ounceUsd' => isset($items['xau']) ? $items['xau']['price'] : null
    ];
}

function nk_history(string $instrument, string $period): array
{
    $map = nk_price_map();
    $slug = null;
    $spec = null;
    foreach ($map as $tgjuKey => $row) {
        if ($row['id'] === $instrument) {
            $slug = $tgjuKey;
            $spec = $row;
            break;
        }
    }
    if ($slug === null || $spec === null || $instrument === 'melted18') {
        nk_json(['ok' => false, 'error' => 'تاریخچه برای این شاخص در دسترس نیست.'], 404);
    }

    $url = 'https://api.tgju.org/v1/market/indicator/summary-table-data/' . rawurlencode($slug);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_USERAGENT => 'Narkhino/1.0 (+price board)',
        CURLOPT_HTTPHEADER => ['Accept: application/json']
    ]);
    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if (!is_string($body) || $status !== 200) {
        nk_json(['ok' => false, 'error' => 'دریافت تاریخچه از منبع بازار ممکن نشد.'], 503);
    }
    $json = json_decode($body, true);
    $rows = $json['data'] ?? null;
    if (!is_array($rows)) {
        nk_json(['ok' => false, 'error' => 'پاسخ تاریخچهٔ منبع معتبر نبود.'], 502);
    }

    $from = nk_period_start($period);
    $tz = new DateTimeZone('Asia/Tehran');
    $points = [];
    foreach ($rows as $row) {
        if (!is_array($row) || count($row) < 7) continue;
        $close = nk_num($row[3]);
        $date = (string) $row[6];
        if ($close === null || $close <= 0) continue;
        try {
            $dt = new DateTime($date, $tz);
        } catch (Throwable) {
            continue;
        }
        $t = $dt->getTimestamp();
        if ($t * 1000 < $from) continue;
        $points[] = [
            't' => $t,
            'p' => $spec['unit'] === 'USD' ? round($close, 2) : (int) round($close / 10)
        ];
    }
    usort($points, static fn(array $a, array $b): int => $a['t'] <=> $b['t']);

    return [
        'ok' => true,
        'instrument' => ['id' => $spec['id'], 'title' => $spec['title'], 'short' => $spec['short'], 'unit' => $spec['unit'], 'group' => $spec['group']],
        'period' => $period,
        'points' => $points
    ];
}

function nk_period_start(string $period): int
{
    $now = new DateTimeImmutable('now', new DateTimeZone('Asia/Tehran'));
    $start = match ($period) {
        'today' => $now->setTime(0, 0, 0),
        '24h' => $now->modify('-1 day'),
        '1w' => $now->modify('-7 days'),
        '1m' => $now->modify('-30 days'),
        '3m' => $now->modify('-90 days'),
        '6m' => $now->modify('-180 days'),
        '1y' => $now->modify('-365 days'),
        default => new DateTimeImmutable('@0')
    };
    return $start->getTimestamp() * 1000;
}

/* ---------------- public prices API (domain + key) ---------------- */

function nk_origin_host(): string
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '') {
        return strtolower((string) parse_url($origin, PHP_URL_HOST));
    }
    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    if ($referer !== '') {
        return strtolower((string) parse_url($referer, PHP_URL_HOST));
    }
    return '';
}

function nk_require_api_key(): array
{
    $key = $_SERVER['HTTP_X_API_KEY'] ?? ($_GET['key'] ?? '');
    $key = trim((string) $key);
    if ($key === '') {
        nk_json(['ok' => false, 'error' => 'کلید API لازم است؛ آن را در پنل مالک بسازید و با هدر X-Api-Key بفرستید.'], 401);
    }
    $stmt = nk_db()->prepare('SELECT * FROM api_keys WHERE api_key = ? LIMIT 1');
    $stmt->execute([$key]);
    $row = $stmt->fetch();
    if (!$row) {
        nk_json(['ok' => false, 'error' => 'کلید API معتبر نیست.'], 403);
    }

    $originHost = nk_origin_host();
    $allowed = strtolower((string) $row['domain']);
    $allowed = preg_replace('#^(https?://)?(www\.)?#', '', $allowed);
    $allowed = rtrim((string) $allowed, '/');
    if ($allowed !== '' && $originHost !== '' && $allowed !== $originHost) {
        nk_json(['ok' => false, 'error' => 'این کلید فقط برای دامنهٔ ' . $allowed . ' مجاز است.'], 403);
    }
    if ($originHost !== '' && ($allowed === '' || $allowed === $originHost)) {
        header('Access-Control-Allow-Origin: ' . ($_SERVER['HTTP_ORIGIN'] ?? ''));
        header('Vary: Origin');
    }

    $up = nk_db()->prepare('UPDATE api_keys SET requests = requests + 1, last_used_at = ? WHERE id = ?');
    $up->execute([nk_now_ms(), (int) $row['id']]);
    return $row;
}

function nk_health(): never
{
    // The board itself reads providers directly, so the dedicated API stays
    // key-protected even on this host.
    nk_json(['ok' => false, 'service' => 'narkhino-api', 'error' => 'دسترسی عمومی به API غیرفعال است.']);
}

function nk_api_prices(): never
{
    nk_require_api_key();
    nk_json(nk_prices());
}

function nk_api_group(): never
{
    nk_require_api_key();
    $path = nk_request_path();
    $group = substr($path, 3);
    $prices = nk_prices();
    $items = array_values(array_filter(
        $prices['items'],
        static fn(array $item): bool => $item['group'] === $group
    ));
    nk_json([
        'ok' => true,
        'source' => $prices['source'],
        'generatedAt' => $prices['generatedAt'],
        'group' => $group,
        'items' => $items,
        'usdToman' => $prices['usdToman'],
        'ounceUsd' => $prices['ounceUsd']
    ]);
}

function nk_api_history(): never
{
    nk_require_api_key();
    $instrument = (string) ($_GET['instrument'] ?? '');
    $period = (string) ($_GET['period'] ?? '1m');
    $allowed = ['today', '24h', '1w', '1m', '3m', '6m', '1y', 'all'];
    if (!in_array($period, $allowed, true)) {
        nk_json(['ok' => false, 'error' => 'بازهٔ زمانی معتبر نیست.'], 422);
    }
    nk_json(nk_history($instrument, $period));
}

/* ---------------- announcements ---------------- */

function nk_public_announcements(): never
{
    $device = (string) ($_GET['device'] ?? '');
    $db = nk_db();
    if ($device !== '') {
        $stmt = $db->prepare('SELECT a.id, a.text, a.created_at FROM announcements a
            WHERE a.active = 1 AND NOT EXISTS (
                SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.device = ?
            ) ORDER BY a.created_at DESC LIMIT 10');
        $stmt->execute([$device]);
    } else {
        $stmt = $db->query('SELECT id, text, created_at FROM announcements WHERE active = 1 ORDER BY created_at DESC LIMIT 10');
    }
    $items = [];
    foreach ($stmt->fetchAll() as $row) {
        $items[] = [
            'id' => (int) $row['id'],
            'text' => (string) $row['text'],
            'createdAt' => (int) $row['created_at']
        ];
    }
    nk_json(['ok' => true, 'items' => $items]);
}

function nk_public_announcement_read(): never
{
    $body = nk_body();
    $id = (int) ($body['id'] ?? 0);
    $device = (string) ($body['device'] ?? '');
    if ($id <= 0 || !preg_match('/^[A-Za-z0-9_-]{8,64}$/', $device)) {
        nk_json(['ok' => false, 'error' => 'درخواست نامعتبر است.'], 422);
    }
    $stmt = nk_db()->prepare('INSERT IGNORE INTO announcement_reads (announcement_id, device, read_at) VALUES (?, ?, ?)');
    $stmt->execute([$id, $device, nk_now_ms()]);
    nk_json(['ok' => true]);
}

/* ---------------- owner auth ---------------- */

function nk_is_owner(): bool
{
    return !empty($_SESSION['narkhino_owner']);
}

function nk_owner_guard(): void
{
    if (!nk_is_owner()) {
        nk_json(['ok' => false, 'error' => 'برای این کار باید وارد پنل مالک شوید.'], 401);
    }
    $origin = nk_origin_host();
    if ($origin !== '' && $origin !== strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''))) {
        nk_json(['ok' => false, 'error' => 'درخواست از دامنهٔ مجاز نیست.'], 403);
    }
}

function nk_verify_password(string $input): bool
{
    $stored = defined('NK_OWNER_PASSWORD') ? (string) NK_OWNER_PASSWORD : '';
    if ($stored === '') return false;
    if (str_starts_with($stored, '$2')) {
        return password_verify($input, $stored);
    }
    return hash_equals(strtolower($stored), hash('sha256', $input));
}

function nk_owner_session(): never
{
    nk_json([
        'ok' => true,
        'authenticated' => nk_is_owner(),
        'hasPassword' => defined('NK_OWNER_PASSWORD') && NK_OWNER_PASSWORD !== ''
    ]);
}

function nk_owner_login(): never
{
    $body = nk_body();
    $password = (string) ($body['password'] ?? '');
    $now = time();
    $attempts = array_values(array_filter($_SESSION['nk_login_attempts'] ?? [], static fn($t): bool => $now - (int) $t < 600));
    if (count($attempts) >= 6) {
        nk_json(['ok' => false, 'error' => 'تلاش‌های ورود زیاد بود؛ چند دقیقه بعد دوباره امتحان کنید.'], 429);
    }
    if (!nk_verify_password($password)) {
        $attempts[] = $now;
        $_SESSION['nk_login_attempts'] = $attempts;
        nk_json(['ok' => false, 'error' => 'رمز عبور درست نیست.'], 401);
    }
    session_regenerate_id(true);
    $_SESSION['narkhino_owner'] = true;
    unset($_SESSION['nk_login_attempts']);
    nk_json(['ok' => true]);
}

function nk_owner_logout(): never
{
    $_SESSION = [];
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_destroy();
    }
    nk_json(['ok' => true]);
}

function nk_body(): array
{
    $raw = file_get_contents('php://input');
    $json = $raw ? json_decode($raw, true) : null;
    return is_array($json) ? $json : [];
}

/* ---------------- owner state & settings ---------------- */

function nk_owner_state(): never
{
    nk_owner_guard();
    $db = nk_db();

    $announcements = [];
    foreach ($db->query('SELECT a.id, a.text, a.created_at,
        (SELECT COUNT(*) FROM announcement_reads r WHERE r.announcement_id = a.id) AS reads
        FROM announcements a ORDER BY a.created_at DESC LIMIT 50')->fetchAll() as $row) {
        $announcements[] = [
            'id' => (int) $row['id'],
            'text' => (string) $row['text'],
            'createdAt' => (int) $row['created_at'],
            'reads' => (int) $row['reads']
        ];
    }

    $keys = [];
    foreach ($db->query('SELECT * FROM api_keys ORDER BY id DESC')->fetchAll() as $row) {
        $keys[] = [
            'id' => (int) $row['id'],
            'label' => (string) $row['label'],
            'key' => (string) $row['api_key'],
            'domain' => (string) $row['domain'],
            'createdAt' => (int) $row['created_at'],
            'lastUsedAt' => $row['last_used_at'] !== null ? (int) $row['last_used_at'] : null,
            'requests' => (int) $row['requests']
        ];
    }

    $token = nk_setting('telegram_token', '') ?? '';
    $isAdmin = nk_setting('telegram_is_admin', '');
    nk_json([
        'ok' => true,
        'channel' => nk_setting('channel', '') ?? '',
        'telegram' => [
            'hasToken' => $token !== '',
            'tokenHint' => $token !== '' ? substr($token, 0, 4) . '…' . substr($token, -4) : '',
            'channel' => nk_setting('telegram_channel', '') ?? '',
            'botUsername' => nk_setting('telegram_bot', null),
            'isAdmin' => $isAdmin === '' ? null : $isAdmin === '1',
            'message' => nk_setting('telegram_message', null)
        ],
        'announcements' => $announcements,
        'apiKeys' => $keys,
        'host' => nk_host(),
        'hasPassword' => defined('NK_OWNER_PASSWORD') && NK_OWNER_PASSWORD !== ''
    ]);
}

function nk_owner_settings(): never
{
    nk_owner_guard();
    $body = nk_body();

    if (array_key_exists('channel', $body)) {
        $raw = trim((string) $body['channel']);
        if ($raw === '') {
            nk_set_setting('channel', '');
        } else {
            $url = nk_normalize_channel_link($raw);
            if ($url === null) {
                nk_json(['ok' => false, 'error' => 'آدرس کانال معتبر نیست؛ نمونه: @channel یا https://t.me/channel'], 422);
            }
            nk_set_setting('channel', $url);
        }
    }

    if (array_key_exists('telegramToken', $body)) {
        $token = trim((string) $body['telegramToken']);
        if ($token !== '') {
            if (!preg_match('/^\d{5,}:[A-Za-z0-9_-]{20,}$/', $token)) {
                nk_json(['ok' => false, 'error' => 'قالب توکن ربات درست نیست؛ نمونه: 123456789:AA...'], 422);
            }
            nk_set_setting('telegram_token', $token);
            nk_set_setting('telegram_bot', '');
            nk_set_setting('telegram_is_admin', '');
            nk_set_setting('telegram_message', '');
        }
    }

    if (array_key_exists('telegramChannel', $body)) {
        $raw = trim((string) $body['telegramChannel']);
        if ($raw === '') {
            nk_set_setting('telegram_channel', '');
        } else {
            $target = nk_chat_target($raw);
            if ($target === null) {
                nk_json(['ok' => false, 'error' => 'کانال تلگرام معتبر نیست. یوزرنیم @channel یا شناسهٔ عددی بدهید؛ لینک دعوت خصوصی پشتیبانی نمی‌شود.'], 422);
            }
            nk_set_setting('telegram_channel', $target);
        }
    }

    nk_json(['ok' => true, 'message' => 'تنظیمات ذخیره شد.']);
}

function nk_normalize_channel_link(string $raw): ?string
{
    $raw = trim($raw);
    if (preg_match('#^(?:https?://)?(?:www\.)?(?:t|telegram)\.me/(?:s/)?([A-Za-z0-9_]{4,32})/?$#i', $raw, $m)) {
        return 'https://t.me/' . $m[1];
    }
    if (preg_match('/^@?([A-Za-z][A-Za-z0-9_]{3,31})$/', $raw, $m)) {
        return 'https://t.me/' . $m[1];
    }
    if (preg_match('#^https?://(?:t|telegram)\.me/(?:\+|joinchat/)[A-Za-z0-9_-]{8,}$#i', $raw)) {
        return $raw;
    }
    return null;
}

function nk_chat_target(string $raw): ?string
{
    $raw = trim($raw);
    if ($raw === '') return null;
    if (preg_match('/^-?\d{5,}$/', $raw)) return $raw;
    if (preg_match('#^(?:https?://)?(?:www\.)?(?:t|telegram)\.me/(?:s/)?([A-Za-z0-9_]{4,32})/?$#i', $raw, $m)) {
        return '@' . $m[1];
    }
    if (preg_match('/^@?([A-Za-z][A-Za-z0-9_]{3,31})$/', $raw, $m)) {
        return '@' . $m[1];
    }
    return null;
}

/* ---------------- telegram ---------------- */

function nk_telegram(string $method, array $params, string $token, int $timeout = 20): array
{
    $ch = curl_init('https://api.telegram.org/bot' . $token . '/' . $method);
    if ($ch === false) {
        return ['ok' => false, 'code' => 0, 'description' => 'اتصال به تلگرام ممکن نشد.'];
    }
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($params),
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_USERAGENT => 'Narkhino/1.0'
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if (!is_string($body) || $body === '') {
        return ['ok' => false, 'code' => $code, 'description' => $curlError !== '' ? $curlError : 'پاسخی از تلگرام دریافت نشد.'];
    }
    $json = json_decode($body, true);
    return [
        'ok' => is_array($json) ? (bool) ($json['ok'] ?? false) : false,
        'code' => $code,
        'result' => is_array($json) ? ($json['result'] ?? null) : null,
        'description' => is_array($json) ? (string) ($json['description'] ?? '') : 'پاسخ تلگرام قابل خواندن نبود.'
    ];
}

function nk_telegram_error(array $res): string
{
    $desc = strtolower((string) ($res['description'] ?? ''));
    $code = (int) ($res['code'] ?? 0);
    if ($code === 401 || str_contains($desc, 'unauthorized')) {
        return 'توکن ربات نامعتبر است؛ توکن را از BotFather دوباره بگیرید.';
    }
    if (str_contains($desc, 'chat not found')) {
        return 'کانال پیدا نشد؛ یوزرنیم یا شناسهٔ کانال را بررسی کنید.';
    }
    if (str_contains($desc, 'not enough rights') || str_contains($desc, 'chat_write_forbidden')) {
        return 'ربات اجازهٔ ارسال پیام در کانال را ندارد؛ دسترسی ارسال پیام را به ربات بدهید.';
    }
    if (str_contains($desc, 'bot is not a member') || str_contains($desc, 'user not found')) {
        return 'ربات در کانال نیست؛ آن را ادمین کانال کنید.';
    }
    if (str_contains($desc, 'blocked')) {
        return 'ربات توسط مدیر کانال مسدود شده است.';
    }
    if (str_contains($desc, 'too many requests')) {
        return 'تلگرام درخواست‌های زیادی دریافت کرد؛ کمی بعد دوباره تلاش کنید.';
    }
    $text = (string) ($res['description'] ?? '');
    return $text !== '' ? 'تلگرام خطا داد: ' . $text : 'ارتباط با تلگرام ممکن نشد.';
}

function nk_telegram_check(): array
{
    $token = nk_setting('telegram_token', '') ?? '';
    if ($token === '') {
        return ['ok' => false, 'botUsername' => null, 'isAdmin' => null, 'message' => 'توکن ربات هنوز تنظیم نشده است.'];
    }
    $me = nk_telegram('getMe', [], $token);
    if (!$me['ok']) {
        return ['ok' => false, 'botUsername' => null, 'isAdmin' => null, 'message' => nk_telegram_error($me)];
    }
    $botUsername = (string) ($me['result']['username'] ?? '');
    $botId = (int) ($me['result']['id'] ?? 0);
    nk_set_setting('telegram_bot', $botUsername);

    $chat = nk_setting('telegram_channel', '') ?? '';
    if ($chat === '') {
        $msg = 'اتصال بات برقرار است؛ حالا یوزرنیم یا لینک کانال را ذخیره کنید.';
        nk_set_setting('telegram_message', $msg);
        return ['ok' => false, 'botUsername' => $botUsername, 'isAdmin' => null, 'message' => $msg];
    }

    $info = nk_telegram('getChat', ['chat_id' => $chat], $token);
    if (!$info['ok']) {
        $msg = nk_telegram_error($info);
        nk_set_setting('telegram_is_admin', '0');
        nk_set_setting('telegram_message', $msg);
        return ['ok' => false, 'botUsername' => $botUsername, 'isAdmin' => false, 'message' => $msg];
    }

    $member = nk_telegram('getChatMember', ['chat_id' => $chat, 'user_id' => $botId], $token);
    $status = $member['ok'] ? (string) ($member['result']['status'] ?? '') : '';
    $isAdmin = in_array($status, ['administrator', 'creator'], true);
    if (!$isAdmin) {
        $msg = $member['ok']
            ? 'ربات ادمین کانال نیست. ربات را ادمین کنید و اجازهٔ ارسال پیام بدهید.'
            : nk_telegram_error($member);
        nk_set_setting('telegram_is_admin', '0');
        nk_set_setting('telegram_message', $msg);
        return ['ok' => false, 'botUsername' => $botUsername, 'isAdmin' => false, 'message' => $msg];
    }

    $title = (string) ($info['result']['title'] ?? $chat);
    $msg = 'اتصال برقرار است؛ @' . $botUsername . ' ادمین کانال «' . $title . '» است.';
    nk_set_setting('telegram_is_admin', '1');
    nk_set_setting('telegram_message', $msg);
    return ['ok' => true, 'botUsername' => $botUsername, 'isAdmin' => true, 'message' => $msg];
}

function nk_owner_telegram_test(): never
{
    nk_owner_guard();
    nk_json(nk_telegram_check());
}

function nk_owner_telegram_send(): never
{
    nk_owner_guard();
    $check = nk_telegram_check();
    if (!$check['ok']) {
        nk_json($check);
    }
    $token = nk_setting('telegram_token', '') ?? '';
    $chat = nk_setting('telegram_channel', '') ?? '';
    $prices = nk_prices();
    $text = nk_telegram_text($prices);

    $res = nk_telegram('sendMessage', [
        'chat_id' => $chat,
        'text' => $text,
        'disable_web_page_preview' => 'true'
    ], $token, 30);
    if (!$res['ok']) {
        $msg = nk_telegram_error($res);
        nk_set_setting('telegram_message', $msg);
        nk_json(['ok' => false, 'botUsername' => $check['botUsername'], 'isAdmin' => true, 'message' => $msg]);
    }
    $msg = 'قیمت‌ها با موفقیت به کانال ارسال شد.';
    nk_set_setting('telegram_message', $msg);
    nk_json(['ok' => true, 'botUsername' => $check['botUsername'], 'isAdmin' => true, 'message' => $msg]);
}

function nk_fa_digits(string $text): string
{
    return strtr($text, NK_PERSIAN_DIGITS);
}

function nk_fa_money(float|int $value): string
{
    return nk_fa_digits(number_format((float) $value, 0, '.', '٬'));
}

function nk_fa_usd(float $value): string
{
    return nk_fa_digits(number_format($value, 2, '.', '٬'));
}

function nk_jalali(int $timestamp): string
{
    $tz = new DateTimeZone('Asia/Tehran');
    $dt = new DateTimeImmutable('@' . $timestamp);
    $dt = $dt->setTimezone($tz);
    $gy = (int) $dt->format('Y');
    $gm = (int) $dt->format('n');
    $gd = (int) $dt->format('j');
    $gDaysInMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    $gy2 = $gm > 2 ? $gy + 1 : $gy;
    $days = 355666 + (365 * $gy) + intdiv($gy2 + 3, 4) - intdiv($gy2 + 99, 100) + intdiv($gy2 + 399, 400) + $gd + $gDaysInMonth[$gm - 1];
    $jy = -1595 + 33 * intdiv($days, 12053);
    $days %= 12053;
    $jy += 4 * intdiv($days, 1461);
    $days %= 1461;
    if ($days > 365) {
        $jy += intdiv($days - 1, 365);
        $days = ($days - 1) % 365;
    }
    if ($days < 186) {
        $jm = 1 + intdiv($days, 31);
        $jd = 1 + ($days % 31);
    } else {
        $jm = 7 + intdiv($days - 186, 30);
        $jd = 1 + (($days - 186) % 30);
    }
    return sprintf('%04d/%02d/%02d %s', $jy, $jm, $jd, $dt->format('H:i'));
}

function nk_telegram_text(array $prices): string
{
    $byId = [];
    foreach ($prices['items'] as $item) {
        $byId[$item['id']] = $item;
    }
    $lines = [];
    $lines[] = 'نرخینو | قیمت لحظه‌ای بازار';
    $lines[] = 'زمان تهران: ' . nk_fa_digits(nk_jalali(intdiv((int) $prices['generatedAt'], 1000)));
    $lines[] = '────────────────';
    $order = [
        ['gold18', 'طلای ۱۸ عیار', 'تومان'],
        ['gold740', 'طلای دست‌دوم ۷۴۰', 'تومان'],
        ['gold24', 'طلای ۲۴ عیار', 'تومان'],
        ['mithqal', 'مثقال طلا', 'تومان'],
        ['emami', 'سکه امامی', 'تومان'],
        ['bahar', 'سکه بهار آزادی', 'تومان'],
        ['half', 'نیم سکه', 'تومان'],
        ['quarter', 'ربع سکه', 'تومان'],
        ['usd', 'دلار آمریکا', 'تومان'],
        ['eur', 'یورو', 'تومان'],
        ['aed', 'درهم امارات', 'تومان'],
        ['xau', 'انس جهانی طلا', 'دلار']
    ];
    foreach ($order as [$id, $label, $unit]) {
        if (!isset($byId[$id]) || $byId[$id]['price'] === null) continue;
        $item = $byId[$id];
        $value = $unit === 'تومان' ? nk_fa_money($item['price']) : nk_fa_usd((float) $item['price']);
        $line = $label . ': ' . $value . ' ' . $unit;
        if ($item['changePct'] !== null) {
            $pct = (float) $item['changePct'];
            $line .= ' (' . ($pct > 0 ? '+' : $pct < 0 ? '−' : '') . nk_fa_digits(number_format(abs($pct), 2)) . '٪)';
        }
        $lines[] = $line;
    }
    $lines[] = '────────────────';
    $lines[] = 'قیمت‌ها مبنای معامله نیستند؛ نرخینو مسئولیتی در قبال معاملات نمی‌پذیرد.';
    return implode("\n", $lines);
}

/* ---------------- owner announcements & API keys ---------------- */

function nk_owner_announcement_create(): never
{
    nk_owner_guard();
    $body = nk_body();
    $text = trim((string) ($body['text'] ?? ''));
    if ($text === '') {
        nk_json(['ok' => false, 'error' => 'متن اعلان خالی است.'], 422);
    }
    $text = mb_substr(strip_tags($text), 0, 2000);
    $stmt = nk_db()->prepare('INSERT INTO announcements (text, created_at, active) VALUES (?, ?, 1)');
    $stmt->execute([$text, nk_now_ms()]);
    nk_json(['ok' => true, 'id' => (int) nk_db()->lastInsertId(), 'message' => 'اعلان ثبت شد.']);
}

function nk_owner_announcement_delete(): never
{
    nk_owner_guard();
    $body = nk_body();
    $id = (int) ($body['id'] ?? 0);
    if ($id <= 0) {
        nk_json(['ok' => false, 'error' => 'شناسهٔ اعلان نامعتبر است.'], 422);
    }
    nk_db()->prepare('DELETE FROM announcements WHERE id = ?')->execute([$id]);
    nk_db()->prepare('DELETE FROM announcement_reads WHERE announcement_id = ?')->execute([$id]);
    nk_json(['ok' => true]);
}

function nk_owner_key_create(): never
{
    nk_owner_guard();
    $body = nk_body();
    $label = mb_substr(trim((string) ($body['label'] ?? '')), 0, 100);
    if ($label === '') $label = 'کلید سایت';
    $domain = strtolower(trim((string) ($body['domain'] ?? '')));
    $domain = preg_replace('#^https?://#', '', $domain);
    $domain = rtrim((string) $domain, '/');
    if ($domain !== '' && !preg_match('/^[a-z0-9.-]+\.[a-z]{2,}$/', $domain)) {
        nk_json(['ok' => false, 'error' => 'دامنهٔ مجاز درست نیست؛ نمونه: example.com (خالی = همهٔ دامنه‌ها).'], 422);
    }
    $key = 'nk_' . bin2hex(random_bytes(24));
    $stmt = nk_db()->prepare('INSERT INTO api_keys (label, api_key, domain, created_at) VALUES (?, ?, ?, ?)');
    $stmt->execute([$label, $key, $domain, nk_now_ms()]);
    nk_json([
        'ok' => true,
        'message' => 'کلید ساخته شد؛ آن را فقط به مصرف‌کنندهٔ مجاز بدهید.',
        'key' => [
            'id' => (int) nk_db()->lastInsertId(),
            'label' => $label,
            'key' => $key,
            'domain' => $domain,
            'createdAt' => nk_now_ms(),
            'lastUsedAt' => null,
            'requests' => 0
        ]
    ]);
}

function nk_owner_key_delete(): never
{
    nk_owner_guard();
    $body = nk_body();
    $id = (int) ($body['id'] ?? 0);
    if ($id <= 0) {
        nk_json(['ok' => false, 'error' => 'شناسهٔ کلید نامعتبر است.'], 422);
    }
    nk_db()->prepare('DELETE FROM api_keys WHERE id = ?')->execute([$id]);
    nk_json(['ok' => true]);
}
