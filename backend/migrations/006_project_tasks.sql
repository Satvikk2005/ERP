-- Rework tasks to be project-scoped and assignable to any project member,
-- add per-task work submissions, and a per-project activity log (history).

-- 1) Tasks: rename intern_id -> assignee_id (idempotent) and attach to a project.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'tasks' AND column_name = 'intern_id') THEN
    ALTER TABLE tasks RENAME COLUMN intern_id TO assignee_id;
  END IF;
END $$;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;
-- Tasks are no longer necessarily day-scoped, so the date is optional now.
ALTER TABLE tasks ALTER COLUMN task_date DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);

-- 2) Per-task work submissions (what the assignee did, plus an optional doc).
CREATE TABLE IF NOT EXISTS task_submissions (
    id              SERIAL PRIMARY KEY,
    task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    employee_id     INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    body            TEXT NOT NULL,
    attachment_note VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_submissions_task ON task_submissions(task_id);

-- 3) Project activity log powering the per-project "History" view.
CREATE TABLE IF NOT EXISTS project_activity (
    id          BIGSERIAL PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    actor_id    INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    action      VARCHAR(40) NOT NULL,
    detail      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_activity_project ON project_activity(project_id, created_at);
