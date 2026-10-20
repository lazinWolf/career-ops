#!/usr/bin/env node
// Generate job-watcher's profile from career-ops config, so targeting lives in
// ONE place (portals.yml + config/profile.yml + cv.md) and never drifts.
//
//   role_terms         ← portals.yml title_filter.positive
//   allowed_locations  ← portals.yml location_filter.allow (+ job-watcher's
//                        "XX, IN" state codes for the same metros)
//   skills             ← cv.md "## Skills" section
//   job stage / years  ← fixed for an early-career search (see EARLY_CAREER)
//
// Writes data/job-watcher/profile.json (job-watcher's version-1 schema), which
// scripts/discover.sh passes to job-watcher with --profile. Run in the
// container (needs js-yaml):  node scripts/sync-job-watcher-profile.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import * as yaml from 'js-yaml';

const OUT = 'data/job-watcher/profile.json';

// job-watcher writes Indeed/Naukri locations as "Bengaluru, KA, IN".
const STATE_CODES = ['ka, in', 'ts, in', 'mh, in', 'hr, in', 'dl, in', 'up, in', 'tn, in'];

const EARLY_CAREER = {
  job_types: ['internship', 'fulltime'],
  career_stage: 'early',
  experience_years: 0,
  max_required_years: 1,
  preferred_workplaces: ['remote'],
  accept_unpaid_internships: false,
};

const portals = yaml.load(readFileSync('portals.yml', 'utf8'));
const cv = readFileSync('cv.md', 'utf8');

const roleTerms = (portals.title_filter?.positive || [])
  .map(term => String(term).replace(/^(word|stem):/, '').trim())
  .filter(term => term && !term.includes(' + '));

const locations = [
  ...(portals.location_filter?.allow || []).map(place => String(place).toLowerCase()),
  ...STATE_CODES,
];

// "- **Languages:** Python, Java, Go" → ["Python", "Java", "Go"]
const skillsSection = cv.split(/^## Skills\s*$/m)[1]?.split(/^## /m)[0] || '';
const skills = skillsSection
  .split('\n')
  .map(line => line.replace(/^-\s*\*\*[^*]+\*\*\s*/, ''))
  .flatMap(line => line.split(','))
  .map(skill => skill.replace(/\(.*?\)/g, '').trim())
  .filter(skill => skill && !skill.startsWith('#'));

const unique = list => [...new Map(list.map(item => [item.toLowerCase(), item])).values()];

const document = {
  version: 1,
  is_example: false,
  profile: {
    role_terms: unique(roleTerms),
    skills: unique(skills),
    allowed_locations: unique(locations),
    excluded_companies: [],
    ...EARLY_CAREER,
  },
};

mkdirSync('data/job-watcher', { recursive: true });
writeFileSync(OUT, JSON.stringify(document, null, 2) + '\n');
console.log(`${OUT}: ${document.profile.role_terms.length} role terms, ${document.profile.skills.length} skills, ${document.profile.allowed_locations.length} locations`);
