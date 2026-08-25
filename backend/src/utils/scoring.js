// Same scoring formula as the original prototype:
// score = 40% consistency + 30% detail (avg words/point) + 15% volume (points/entry) + 15% evidence

function computeStats(entries, windowDays = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  const windowEntries = entries.filter((e) => e.entry_date >= cutoffISO);

  const submittedDates = new Set(windowEntries.map((e) => e.entry_date));
  const consistencyRatio = Math.min(1, submittedDates.size / windowDays);

  const totalBullets = windowEntries.reduce((s, e) => s + (e.bullets?.length || 0), 0);
  const avgBullets = windowEntries.length ? totalBullets / windowEntries.length : 0;
  const volumeRatio = Math.min(1, avgBullets / 3);

  const wordCounts = [];
  windowEntries.forEach((e) =>
    (e.bullets || []).forEach((b) => wordCounts.push(String(b).trim().split(/\s+/).filter(Boolean).length))
  );
  const avgWords = wordCounts.length ? wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length : 0;
  const detailRatio = Math.max(0, Math.min(1, (avgWords - 2) / 6));

  const withAttach = windowEntries.filter((e) => e.attachment_note || e.attachment_url).length;
  const attachRatio = windowEntries.length ? withAttach / windowEntries.length : 0;

  const score = Math.round(consistencyRatio * 40 + volumeRatio * 15 + detailRatio * 30 + attachRatio * 15);

  return {
    score,
    submittedDays: submittedDates.size,
    windowDays,
    avgBulletsPerEntry: avgBullets.toFixed(1),
    avgWords: avgWords.toFixed(1),
    attachRatePct: Math.round(attachRatio * 100),
  };
}

function scoreLabel(score) {
  if (score >= 75) return { text: 'Strong', cls: 'score-strong' };
  if (score >= 50) return { text: 'Steady', cls: 'score-steady' };
  return { text: 'Needs attention', cls: 'score-low' };
}

module.exports = { computeStats, scoreLabel };
