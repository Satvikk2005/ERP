-- Collective tasks: a task can be assigned to more than one person. tasks.assignee_id
-- stays as the "primary" owner (for display / backward compatibility); the full set
-- of assignees lives here.
CREATE TABLE IF NOT EXISTS task_assignees (
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_task_assignees_emp ON task_assignees(employee_id);

-- Backfill every existing single-assignee task into the join table.
INSERT INTO task_assignees (task_id, employee_id)
  SELECT id, assignee_id FROM tasks WHERE assignee_id IS NOT NULL
  ON CONFLICT DO NOTHING;
