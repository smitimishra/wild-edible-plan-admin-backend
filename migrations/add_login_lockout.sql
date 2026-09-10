-- ============================================================
-- LOGIN LOCKOUT MIGRATION
-- Run this against the wildplant database
-- ============================================================

-- 1. Track failed login attempts per email
CREATE TABLE IF NOT EXISTS login_attempts (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(150) NOT NULL,
    attempted_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success         BOOLEAN      NOT NULL DEFAULT FALSE,
    ip_address      VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email
    ON login_attempts (email, attempted_at DESC);

-- 2. System settings (key/value store for admin-configurable values)
CREATE TABLE IF NOT EXISTS system_settings (
    key         VARCHAR(100) PRIMARY KEY,
    value       TEXT         NOT NULL,
    description TEXT,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by  INT REFERENCES users(id)
);

-- Seed default lockout values
INSERT INTO system_settings (key, value, description)
VALUES
    ('login_max_attempts',  '3',  'Number of failed login attempts before account is locked'),
    ('login_lockout_hours', '1',  'Number of hours account stays locked after max attempts exceeded')
ON CONFLICT (key) DO NOTHING;
