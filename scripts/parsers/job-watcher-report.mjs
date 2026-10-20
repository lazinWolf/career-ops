#!/usr/bin/env node
// Local parser (jobs-json-v1) that feeds job-watcher results into scan.mjs.
//
// job-watcher (path: JOB_WATCHER_DIR in .env) scrapes LinkedIn, Internshala,
// Indeed, Naukri and Wellfound for India and writes a run report. Refresh it on
// the host with scripts/discover.sh, which then runs `scan.mjs`; it picks the
// listings up through the "Job Watcher (India boards)" entry in portals.yml.
//
// Only decisions job-watcher did not reject are emitted (its profile already
// drops senior, unpaid and out-of-area listings); scan.mjs then applies the
// portals.yml title/location filters and scan-history dedup on top.
//
// Usage: node scripts/parsers/job-watcher-report.mjs [report-path] [--max-age-days N]

import { readFileSync, statSync } from 'fs';

const args = process.argv.slice(2);
const ageFlag = args.indexOf('--max-age-days');
const maxAgeDays = ageFlag >= 0 ? Number(args[ageFlag + 1]) : 3;
const reportPath = args.find((arg, i) => !arg.startsWith('--') && i !== ageFlag + 1)
  || 'data/job-watcher/run-report.json';

const SKIP_OUTCOMES = new Set(['rejected', 'evaluation_failed']);

let report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (err) {
  console.error(`job-watcher parser: cannot read ${reportPath} (${err.code || err.message}). Run scripts/discover.sh first.`);
  process.exit(1);
}

const ageDays = (Date.now() - statSync(reportPath).mtimeMs) / 86_400_000;
if (Number.isFinite(maxAgeDays) && ageDays > maxAgeDays) {
  console.error(`job-watcher parser: report is ${ageDays.toFixed(1)} days old (limit ${maxAgeDays}); refresh with scripts/discover.sh`);
  process.exit(1);
}

const jobs = [];
const seen = new Set();
for (const d of report.decisions || []) {
  if (!d || SKIP_OUTCOMES.has(d.outcome) || !d.title || !d.url || seen.has(d.url)) continue;
  seen.add(d.url);
  jobs.push({
    title: String(d.title).trim(),
    url: d.url,
    company: d.company || `(${d.source})`,
    location: d.location || '',
  });
}

process.stdout.write(JSON.stringify({ jobs }));
