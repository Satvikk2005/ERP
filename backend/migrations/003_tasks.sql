-- Rush ERP — daily task assignment for interns
-- People above interns (managers/admins) assign day-scoped tasks to interns.

CREATE TABLE IF NOT EXISTS tasks (
    id            SERIAL PRIMARY KEY,
    intern_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    assigned_by   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    task_date     DATE NOT NULL,
    title         VARCHAR(300) NOT NULL,
    details       TEXT,
    status        VARCHAR(10) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'done')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_intern_date ON tasks(intern_id, task_date);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by ON tasks(assigned_by);
