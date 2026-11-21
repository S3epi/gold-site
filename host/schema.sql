-- نرخینو | ساختار پایگاه داده (اختیاری؛ API خودش جدول‌ها را می‌سازد)
CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(64) NOT NULL PRIMARY KEY,
  v MEDIUMTEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS announcements (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  text TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  INDEX idx_active (active, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id INT UNSIGNED NOT NULL,
  device VARCHAR(64) NOT NULL,
  read_at BIGINT NOT NULL,
  PRIMARY KEY (announcement_id, device)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS api_keys (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  api_key VARCHAR(80) NOT NULL UNIQUE,
  domain VARCHAR(190) NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  last_used_at BIGINT NULL,
  requests INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
