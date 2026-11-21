<?php
declare(strict_types=1);

/**
 * ساخت هش رمز پنل مالک.
 * اجرا در ترمینال cPanel:
 *   php hash-password.php 'رمز-جدید'
 * خروجی bcrypt را در NK_OWNER_PASSWORD فایل تنظیمات بگذارید.
 */

$password = $argv[1] ?? '';
if ($password === '') {
    fwrite(STDERR, "Usage: php hash-password.php 'your-password'\n");
    exit(1);
}

echo "bcrypt: " . password_hash($password, PASSWORD_BCRYPT) . "\n";
echo "sha256: " . hash('sha256', $password) . "\n";
