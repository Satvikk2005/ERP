-- Add an "hr" access role and a leave-request (mail) module.

-- 1) Allow 'hr' as an access role (relax the existing CHECK constraint).
DO $$
BEGIN
  ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_access_role_check;
  ALTER TABLE employees ADD CONSTRAINT employees_access_role_check
    CHECK (access_role IN ('employee', 'manager', 'admin', 'hr'));
END $$;

-- 2) Leave requests employees file to HR. A single day uses start_date = end_date.
CREATE TABLE IF NOT EXISTS leave_requests (
    id           SERIAL PRIMARY KEY,
    employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    start_date   DATE NOT NULL,
    end_date     DATE NOT NULL,
    reason       TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leave_requests_emp ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(start_date, end_date);
