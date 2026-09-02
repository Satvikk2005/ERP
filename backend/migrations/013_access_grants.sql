-- Temporary access grants: an admin can lift a user to a higher access level
-- for a limited time (e.g. to cover for someone who is unavailable). A grant is
-- "active" while revoked_at IS NULL AND expires_at > now().
CREATE TABLE IF NOT EXISTS access_grants (
    id           SERIAL PRIMARY KEY,
    employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    granted_role VARCHAR(20) NOT NULL CHECK (granted_role IN ('manager', 'hr', 'admin')),
    granted_by   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    reason       TEXT,
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_access_grants_active ON access_grants(employee_id, expires_at) WHERE revoked_at IS NULL;
