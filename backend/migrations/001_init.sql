-- WorkTrack ERP — initial schema
-- Run this once against your Postgres database before starting the server.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gives us gen_random_uuid()

CREATE TABLE IF NOT EXISTS employees (
    id              SERIAL PRIMARY KEY,
    employee_code   VARCHAR(20) UNIQUE NOT NULL,      -- e.g. EMP-001
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    department      VARCHAR(100) NOT NULL,
    job_title       VARCHAR(150) NOT NULL,
    access_role     VARCHAR(20) NOT NULL DEFAULT 'employee'
                        CHECK (access_role IN ('employee', 'manager', 'admin')),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    must_reset_pw   BOOLEAN NOT NULL DEFAULT true,      -- force change on first login
    failed_attempts SMALLINT NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    entry_date      DATE NOT NULL,
    bullets         JSONB NOT NULL DEFAULT '[]',        -- array of strings
    attachment_note VARCHAR(255),                       -- filename/link reference
    attachment_url  TEXT,                                -- real cloud storage URL (S3 etc), optional
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (employee_id, entry_date)                    -- one entry per employee per day (editable)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    actor_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    action          VARCHAR(100) NOT NULL,               -- e.g. 'login', 'login_failed', 'entry_submit', 'report_view'
    target          VARCHAR(150),
    ip_address      VARCHAR(64),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_entries_employee ON work_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_entries_date ON work_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_employee_id);
