-- Richer, Zoho-style tasks: priority, completion %, tags, stipend, start date,
-- duration, and subtasks; plus per-task docs and issues for the task panel tabs.

-- 1) Extra task fields (all optional / defaulted so existing rows stay valid).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority   VARCHAR(10) NOT NULL DEFAULT 'none';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completion INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags       TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stipend    BOOLEAN     NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS duration   VARCHAR(40);
-- A subtask points at its parent task; deleting the parent removes its subtasks.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);

-- 2) Documents attached to a task (name + optional link/note).
CREATE TABLE IF NOT EXISTS task_docs (
    id          SERIAL PRIMARY KEY,
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    url         TEXT,
    added_by    INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_docs_task ON task_docs(task_id);

-- 3) Issues raised against a task (title + open/closed).
CREATE TABLE IF NOT EXISTS task_issues (
    id          SERIAL PRIMARY KEY,
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title       VARCHAR(300) NOT NULL,
    status      VARCHAR(10) NOT NULL DEFAULT 'open',
    created_by  INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_issues_task ON task_issues(task_id);
