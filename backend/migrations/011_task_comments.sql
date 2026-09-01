-- Split task discussion from work updates. task_submissions stays the work-update
-- log (mirrored into the personal report); task_comments is pure discussion and
-- is NOT mirrored anywhere.
CREATE TABLE IF NOT EXISTS task_comments (
    id          SERIAL PRIMARY KEY,
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
