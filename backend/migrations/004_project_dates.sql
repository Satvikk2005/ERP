-- Rush ERP → Accesco ERP: project timeline (planned start / target finish)

ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS end_date   DATE;
