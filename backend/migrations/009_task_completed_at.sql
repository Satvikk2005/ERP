-- Track when a task was marked done, so "My Tasks" can keep a completed task
-- visible for the rest of that day and drop it the next day.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Backfill existing done tasks with their last-updated time as the completion
-- time (best available signal), so the daily roll-off works for them too.
UPDATE tasks SET completed_at = updated_at WHERE status = 'done' AND completed_at IS NULL;
