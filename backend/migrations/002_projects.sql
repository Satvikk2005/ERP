-- Rush ERP — projects module
-- Adds company-wide project tracking on top of the work-update tables.

CREATE TABLE IF NOT EXISTS projects (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    department      VARCHAR(100) NOT NULL,
    manager_id      INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    status          VARCHAR(10) NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'paused', 'closed')),
    created_by      INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which employees are assigned to a project (the manager is implicit and also
-- allowed here). Composite PK prevents adding the same person twice.
CREATE TABLE IF NOT EXISTS project_members (
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_projects_department ON projects(department);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_manager ON projects(manager_id);
CREATE INDEX IF NOT EXISTS idx_project_members_employee ON project_members(employee_id);
