'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { output, error, normalizeObjectiveName, findPlanFiles, trdKey, pluginVersion, installedPlugin, marketplaceCheckout } = require('./helpers.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { getMilestoneInfo } = require('./roadmap.cjs');
// The config / JOB.md / state.json repairs live in the upgrade migrations (TRD 36-04a); health
// calls them so each repair exists in exactly one place.
const m0001 = require('./migrations/0001-config-stamp.cjs');
const m0002 = require('./migrations/0002-job-to-trd.cjs');
const m0003 = require('./migrations/0003-state-json-seed.cjs');
const { planningRoot, planningRel, planningDirLabel } = require('./compat.cjs');

// ─── Engine lag helpers (Check 11 in cmdValidateHealth) ───────────────────────

// Compares two "x.y.z" semver strings as 3-tuples. Non-numeric/missing segments
// treat as 0. Returns 1 if a > b, -1 if a < b, 0 if equal.
function compareSemver(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

// Reads plugins/aoforge/.claude-plugin/plugin.json as committed on origin/main,
// from the LOCAL MARKETPLACE CHECKOUT the plugin manager maintains at
// ~/.claude/plugins/marketplaces/aocyber (via helpers.marketplaceCheckout()) —
// not an aoforge-claude dev checkout relative to the running file, which
// doesn't exist when aof-tools runs from the ~/.claude/aoforge mirror (every
// skill invocation). Best-effort `git fetch` first so origin/main isn't
// read stale; the fetch's own failure (offline, etc.) is ignored — `git show`
// still runs against whatever origin/main currently resolves to locally.
// Returns the version string, or null on any failure (no marketplace
// checkout, no git, bad JSON, etc.) — never fails health for a missing
// checkout, it just means W021 can't be evaluated.
function defaultMainVersionFn() {
  try {
    const checkout = marketplaceCheckout();
    if (!checkout) return null;
    // Never let git block on a credential prompt — health runs unattended.
    const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    try {
      execFileSync('git', ['-C', checkout, 'fetch', '--quiet', 'origin', 'main'], { timeout: 5000, encoding: 'utf-8', env: gitEnv });
    } catch {
      // Offline / no network / fetch failed — fall through and read whatever
      // origin/main already resolves to locally.
    }
    const out = execFileSync(
      'git',
      ['-C', checkout, 'show', 'origin/main:plugins/aoforge/.claude-plugin/plugin.json'],
      { timeout: 5000, encoding: 'utf-8', env: gitEnv }
    );
    const parsed = JSON.parse(out);
    return (parsed && typeof parsed.version === 'string' && parsed.version) ? parsed.version : null;
  } catch {
    return null;
  }
}

function cmdValidateConsistency(cwd, raw) {
  const roadmapPath = path.join(planningRoot(cwd), 'ROADMAP.md');
  const objectivesDir = path.join(planningRoot(cwd), 'objectives');
  const errors = [];
  const warnings = [];

  // Check for ROADMAP
  if (!fs.existsSync(roadmapPath)) {
    errors.push('ROADMAP.md not found');
    output({ passed: false, errors, warnings }, raw, 'failed');
    return;
  }

  const roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');

  // Extract objectives from ROADMAP
  const roadmapObjectives = new Set();
  const objectivePattern = /#{2,4}\s*Objective\s+(\d+(?:\.\d+)?)\s*:/gi;
  let m;
  while ((m = objectivePattern.exec(roadmapContent)) !== null) {
    roadmapObjectives.add(m[1]);
  }

  // Get objectives on disk
  const diskObjectives = new Set();
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    for (const dir of dirs) {
      const dm = dir.match(/^(\d+(?:\.\d+)?)/);
      if (dm) diskObjectives.add(dm[1]);
    }
  } catch {}

  // Check: objectives in ROADMAP but not on disk
  for (const p of roadmapObjectives) {
    if (!diskObjectives.has(p) && !diskObjectives.has(normalizeObjectiveName(p))) {
      warnings.push(`Objective ${p} in ROADMAP.md but no directory on disk`);
    }
  }

  // Check: objectives on disk but not in ROADMAP
  for (const p of diskObjectives) {
    const unpadded = String(parseInt(p, 10));
    if (!roadmapObjectives.has(p) && !roadmapObjectives.has(unpadded)) {
      warnings.push(`Objective ${p} exists on disk but not in ROADMAP.md`);
    }
  }

  // Check: sequential objective numbers (integers only)
  const integerObjectives = [...diskObjectives]
    .filter(p => !p.includes('.'))
    .map(p => parseInt(p, 10))
    .sort((a, b) => a - b);

  for (let i = 1; i < integerObjectives.length; i++) {
    if (integerObjectives[i] !== integerObjectives[i - 1] + 1) {
      warnings.push(`Gap in objective numbering: ${integerObjectives[i - 1]} → ${integerObjectives[i]}`);
    }
  }

  // Check: job numbering within objectives
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

    for (const dir of dirs) {
      const objectiveFiles = fs.readdirSync(path.join(objectivesDir, dir));
      const plans = findPlanFiles(objectiveFiles).sort();

      // Extract job numbers
      const jobNums = plans.map(p => {
        const pm = p.match(/-(\d{2})-(TRD|JOB)\.md$/);
        return pm ? parseInt(pm[1], 10) : null;
      }).filter(n => n !== null);

      for (let i = 1; i < jobNums.length; i++) {
        if (jobNums[i] !== jobNums[i - 1] + 1) {
          warnings.push(`Gap in job numbering in ${dir}: job ${jobNums[i - 1]} → ${jobNums[i]}`);
        }
      }

      // Check: plans without summaries (completed plans)
      const summaries = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md'));
      // Pair on the NN-MM key (TRD 53-02): `NN-MM-<slug>-TRD.md` owns `NN-MM-SUMMARY.md`
      // and `NN-MM-<slug>-SUMMARY.md` alike.
      const jobKeys = new Set(plans.map(p => trdKey(p)));

      // Summary without matching job is suspicious
      for (const summary of summaries) {
        if (!jobKeys.has(trdKey(summary))) {
          warnings.push(`Summary ${summary} in ${dir} has no matching TRD.md or JOB.md`);
        }
      }
    }
  } catch {}

  // Check: frontmatter in plans has required fields
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    for (const dir of dirs) {
      const objectiveFiles = fs.readdirSync(path.join(objectivesDir, dir));
      const plans = findPlanFiles(objectiveFiles);

      for (const jobFile of plans) {
        const content = fs.readFileSync(path.join(objectivesDir, dir, jobFile), 'utf-8');
        const fm = extractFrontmatter(content);

        if (!fm.wave) {
          warnings.push(`${dir}/${jobFile}: missing 'wave' in frontmatter`);
        }
      }
    }
  } catch {}

  const passed = errors.length === 0;
  output({ passed, errors, warnings, warning_count: warnings.length }, raw, passed ? 'passed' : 'failed');
}

function cmdValidateHealth(cwd, options, raw) {
  const planningDir = planningRoot(cwd);
  const projectPath = path.join(planningDir, 'PROJECT.md');
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  const statePath = path.join(planningDir, 'STATE.md');
  const configPath = path.join(planningDir, 'config.json');
  const objectivesDir = path.join(planningDir, 'objectives');

  const errors = [];
  const warnings = [];
  const info = [];
  const repairs = [];

  // Helper to add issue
  const addIssue = (severity, code, message, fix, repairable = false) => {
    const issue = { code, message, fix, repairable };
    if (severity === 'error') errors.push(issue);
    else if (severity === 'warning') warnings.push(issue);
    else info.push(issue);
  };

  // ─── Check 1: .aoforge/ exists ───────────────────────────────────────────
  if (!fs.existsSync(planningDir)) {
    addIssue('error', 'E001', `${planningDirLabel()} directory not found`, 'Run /aoforge:new-project to initialize');
    output({
      engine_version: pluginVersion(),
      schema_version: 1,
      status: 'broken',
      errors,
      warnings,
      info,
      repairable_count: 0,
    }, raw);
    return;
  }

  // ─── Check 2: PROJECT.md exists and has required sections ─────────────────
  if (!fs.existsSync(projectPath)) {
    addIssue('error', 'E002', 'PROJECT.md not found', 'Run /aoforge:new-project to create');
  } else {
    const content = fs.readFileSync(projectPath, 'utf-8');
    const requiredSections = ['## What This Is', '## Core Value', '## Requirements'];
    for (const section of requiredSections) {
      if (!content.includes(section)) {
        addIssue('warning', 'W001', `PROJECT.md missing section: ${section}`, 'Add section manually');
      }
    }
  }

  // ─── Check 3: ROADMAP.md exists ───────────────────────────────────────────
  if (!fs.existsSync(roadmapPath)) {
    addIssue('error', 'E003', 'ROADMAP.md not found', 'Run /aoforge:milestone new to create roadmap');
  }

  // ─── Check 4: STATE.md exists and its position names a real objective ─────
  if (!fs.existsSync(statePath)) {
    addIssue('error', 'E004', 'STATE.md not found', 'Run /aoforge:status check --repair to regenerate', true);
    repairs.push('regenerateState');
  } else {
    const stateContent = fs.readFileSync(statePath, 'utf-8');

    // Read only the current position-line conventions — never a general
    // "objective N" prose match, which also matches decisions/status prose
    // referencing archived or future objectives (e.g. "objectives 27–36
    // complete", "Phase 9 handoff"). The retired [Pp]hase\s+N regex is gone.
    const POSITION_RES = [
      /^\*\*Objective complete:\*\*\s*(\d+(?:\.\d+)?)/gm,
      /^\*\*Current [Oo]bjective:\*\*\s*(\d+(?:\.\d+)?)/gm,
      /^Objective:\s*(\d+(?:\.\d+)?)\s+of\b/gm,
    ];
    const positionRefs = new Set();
    for (const re of POSITION_RES) {
      for (const m of stateContent.matchAll(re)) positionRefs.add(m[1]);
    }

    // Known objectives: .aoforge/objectives/<NN-...> UNION any <NN-...> dir one
    // or two levels under .aoforge/milestones/ (archived objectives keep their
    // numbers valid forever — W002 must never fire on history).
    const knownObjectives = new Set();
    const addNumberedDirs = (dirPath) => {
      let entries;
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const m = e.name.match(/^(\d+(?:\.\d+)?)-/);
        if (m) knownObjectives.add(parseFloat(m[1]));
      }
    };
    addNumberedDirs(objectivesDir);
    const milestonesDir = path.join(planningDir, 'milestones');
    let milestoneEntries = [];
    try {
      milestoneEntries = fs.readdirSync(milestonesDir, { withFileTypes: true }).filter(e => e.isDirectory());
    } catch {}
    for (const e of milestoneEntries) {
      const selfMatch = e.name.match(/^(\d+(?:\.\d+)?)-/);
      if (selfMatch) knownObjectives.add(parseFloat(selfMatch[1])); // one level under milestones/
      addNumberedDirs(path.join(milestonesDir, e.name)); // two levels under milestones/
    }

    // Only warn if there is a known objective set to compare against (not just an empty project).
    if (knownObjectives.size > 0) {
      for (const ref of positionRefs) {
        if (!knownObjectives.has(parseFloat(ref))) {
          addIssue(
            'warning',
            'W002',
            `STATE.md references objective ${ref}, but only objectives ${[...knownObjectives].sort((a, b) => a - b).join(', ')} exist`,
            'Correct the objective number in STATE.md (or restore the objective directory)',
            false
          );
          // W002 is intentionally NOT repairable: a single stale number must never let --repair
          // overwrite a user's whole STATE.md with the regenerateState stub. Never push it here.
        }
      }
    }
  }

  // ─── Check 5: config.json valid JSON + valid schema ───────────────────────
  if (!fs.existsSync(configPath)) {
    addIssue('warning', 'W003', 'config.json not found', 'Run /aoforge:status check --repair to create with defaults', true);
    repairs.push('createConfig');
  } else {
    try {
      const rawContent = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(rawContent);
      // Validate known fields
      const validProfiles = ['quality', 'balanced', 'budget'];
      if (parsed.model_profile && !validProfiles.includes(parsed.model_profile)) {
        addIssue('warning', 'W004', `config.json: invalid model_profile "${parsed.model_profile}"`, `Valid values: ${validProfiles.join(', ')}`);
      }
    } catch (err) {
      addIssue('error', 'E005', `config.json: JSON parse error - ${err.message}`, 'Run /aoforge:status check --repair to reset to defaults', true);
      repairs.push('resetConfig');
    }
  }

  // ─── Check 6: Objective directory naming (NN-name format) ─────────────────────
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !e.name.match(/^\d{2}(?:\.\d+)?-[\w-]+$/)) {
        addIssue('warning', 'W005', `Objective directory "${e.name}" doesn't follow NN-name format`, 'Rename to match pattern (e.g., 01-setup)');
      }
    }
  } catch {}

  // ─── Check 7: Orphaned jobs (JOB without SUMMARY) ─────────────────────────
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const objectiveFiles = fs.readdirSync(path.join(objectivesDir, e.name));
      const plans = findPlanFiles(objectiveFiles);
      const summaries = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
      // Pair on the NN-MM key (TRD 53-02): executors write `NN-MM-SUMMARY.md` beside a named
      // `NN-MM-<slug>-TRD.md`, and either summary name counts as the TRD's summary.
      const summaryKeys = new Set(summaries.map(s => trdKey(s)));

      for (const jobFile of plans) {
        if (!summaryKeys.has(trdKey(jobFile))) {
          addIssue('info', 'I001', `${e.name}/${jobFile} has no SUMMARY.md`, 'May be in progress');
        }
      }
    }
  } catch {}

  // ─── Check 8: Run existing consistency checks ─────────────────────────────
  // Inline subset of cmdValidateConsistency
  if (fs.existsSync(roadmapPath)) {
    const roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');
    const roadmapObjectives = new Set();
    const objectivePattern = /#{2,4}\s*Objective\s+(\d+(?:\.\d+)?)\s*:/gi;
    let m;
    while ((m = objectivePattern.exec(roadmapContent)) !== null) {
      roadmapObjectives.add(m[1]);
    }

    // W007 only: an objective is "known" if any roadmap lists it — current or archived — as a
    // heading or as a checklist/bullet line. W006 keeps reading ROADMAP.md headings only.
    // The patterns are built per call: /g regexes are stateful across exec() loops.
    const collectListedObjectives = (text, set) => {
      const patterns = [
        /#{2,4}\s*Objective\s+(\d+(?:\.\d+)?)\s*:/gi,
        // Anchored to a list marker so prose ("**Depends on:** Objective 23") never counts.
        /^\s*-\s*(?:\[[ xX]\]\s*)?\*{0,2}Objective\s+(\d+(?:\.\d+)?)\s*:/gim,
      ];
      for (const re of patterns) {
        let mm;
        while ((mm = re.exec(text)) !== null) set.add(mm[1]);
      }
    };
    const w007KnownObjectives = new Set(roadmapObjectives);
    collectListedObjectives(roadmapContent, w007KnownObjectives);
    try {
      const milestonesDir = path.join(planningDir, 'milestones');
      for (const f of fs.readdirSync(milestonesDir)) {
        if (!/-ROADMAP\.md$/.test(f)) continue;
        try {
          collectListedObjectives(fs.readFileSync(path.join(milestonesDir, f), 'utf-8'), w007KnownObjectives);
        } catch {}
      }
    } catch {}

    const diskObjectives = new Set();
    try {
      const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const dm = e.name.match(/^(\d+(?:\.\d+)?)/);
          if (dm) diskObjectives.add(dm[1]);
        }
      }
    } catch {}

    // Objectives in ROADMAP but not on disk
    for (const p of roadmapObjectives) {
      const padded = String(parseInt(p, 10)).padStart(2, '0');
      if (!diskObjectives.has(p) && !diskObjectives.has(padded)) {
        addIssue('warning', 'W006', `Objective ${p} in ROADMAP.md but no directory on disk`, 'Create objective directory or remove from roadmap');
      }
    }

    // Objectives on disk but not in ROADMAP
    for (const p of diskObjectives) {
      const unpadded = String(parseInt(p, 10));
      if (!w007KnownObjectives.has(p) && !w007KnownObjectives.has(unpadded)) {
        addIssue('warning', 'W007', `Objective ${p} exists on disk but not in ROADMAP.md`, 'Add to roadmap or remove directory');
      }
    }
  }

  // ─── Check 9: Legacy JOB.md files (should be TRD.md) ─────────────────────
  // A JOB.md whose TRD.md already exists is a conflict migration 0002 never renames, so it is not
  // counted here (a warning whose --repair cannot fix it would never clear).
  const legacyJobFiles = m0002.findLegacyJobFiles(cwd).filter((f) => !f.conflict);
  if (legacyJobFiles.length > 0) {
    addIssue(
      'warning',
      'W008',
      `Legacy JOB.md format found: ${legacyJobFiles.length} file(s). TRD.md is the current format.`,
      'Run /aoforge:status check --repair to auto-rename to TRD.md',
      true
    );
    repairs.push('migrateJobFiles');
  }

  // ─── Check 10: state.json sidecar missing ─────────────────────────────────
  const stateJsonPath = path.join(planningDir, 'state.json');
  if (fs.existsSync(statePath) && !fs.existsSync(stateJsonPath)) {
    addIssue(
      'warning',
      'W009',
      'state.json sidecar not found. Machine-readable state fields use slower markdown parsing.',
      'Run /aoforge:status check --repair to create state.json from existing STATE.md',
      true
    );
    repairs.push('createStateJson');
  }

  // ─── Check 11: Engine lag (installed vs mirror vs origin/main) ────────────
  // Skills invoke aof-tools via the ~/.claude/aoforge mirror, not the plugin
  // checkout — sync-runtime.js re-mirrors on session start, but a session that
  // never restarted keeps running a stale mirror silently. Surface both kinds
  // of drift: the mirror falling behind the installed plugin (E020), and the
  // installed plugin falling behind origin/main (W021, best-effort only).
  //
  // `installed` and `main` deliberately do NOT come from helpers.pluginVersion():
  // when aof-tools runs from the mirror (every skill invocation), that
  // function's first candidate (a .claude-plugin/plugin.json relative to
  // __dirname) doesn't exist there, so it silently falls through to the same
  // ~/.claude/aoforge/.plugin-version file `mirror` below also reads — making
  // "installed" and "mirror" identical by construction and E020 structurally
  // unfireable in production. `installed` reads the plugin manager's own
  // ~/.claude/plugins/installed_plugins.json instead (helpers.installedPlugin);
  // `main` reads the plugin manager's marketplace checkout
  // (helpers.marketplaceCheckout), not an aoforge-claude dev checkout relative
  // to the running file (which also doesn't exist from the mirror).
  const installedPluginFn = options.installedPluginFn || installedPlugin;
  const homeDir = options.homeDir || os.homedir();
  const mainVersionFn = options.mainVersionFn || defaultMainVersionFn;

  const runningVer = pluginVersion();

  let installedInfo = null;
  try {
    // Threads homeDir through so a test can point BOTH the mirror-file read
    // below AND the default helpers.installedPlugin() lookup at one fixture
    // home, without needing a separate installedPluginFn override (the
    // mirror-path end-to-end case below relies on exactly this).
    installedInfo = installedPluginFn({ homeDir });
  } catch {
    installedInfo = null;
  }
  const installedVer = (installedInfo && typeof installedInfo.version === 'string' && installedInfo.version)
    ? installedInfo.version
    : null;

  const mirrorVersionPath = path.join(homeDir, '.claude', 'aoforge', '.plugin-version');
  let mirrorVer = null;
  if (fs.existsSync(mirrorVersionPath)) {
    try {
      mirrorVer = fs.readFileSync(mirrorVersionPath, 'utf-8').trim();
    } catch {
      mirrorVer = null;
    }
  }

  let mainVer = null;
  try {
    mainVer = mainVersionFn();
  } catch {
    mainVer = null;
  }

  // Only compare when both sides are known — a fresh machine has no mirror
  // yet (not staleness), and installed may be unknown on a dev checkout with
  // no plugin-manager registry. mirror !== installed has two directions:
  // mirror < installed is real staleness (E020, existing wording); mirror >
  // installed happens on a dev checkout run via --plugin-dir, where
  // ~/.claude/aoforge legitimately leads the installed plugin — that is not
  // an error, just worth surfacing (I022, info, no fix text). Use
  // compareSemver rather than string inequality so the two directions split.
  if (mirrorVer && installedVer) {
    const cmp = compareSemver(mirrorVer, installedVer);
    if (cmp < 0) {
      addIssue(
        'error',
        'E020',
        `mirror-stale: ~/.claude/aoforge is ${mirrorVer} but the installed plugin is ${installedVer}`,
        'Start a new session so sync-runtime re-mirrors, or run the sync hook, or run `/plugin update aoforge@aocyber`'
      );
    } else if (cmp > 0) {
      addIssue(
        'info',
        'I022',
        `mirror-ahead: ~/.claude/aoforge is ${mirrorVer}, installed plugin is ${installedVer} (dev checkout?)`
      );
    }
  }

  if (mainVer && installedVer && compareSemver(mainVer, installedVer) > 0) {
    addIssue(
      'warning',
      'W021',
      `plugin-behind-main: installed ${installedVer}, origin/main ${mainVer}`,
      'Update the plugin from the marketplace'
    );
  }

  const engine = { running: runningVer, mirror: mirrorVer, installed: installedVer, main: mainVer };

  // ─── Check 12: Stack profile (.aoforge/STACK.md) ──────────────────────────
  // Not auto-repaired: drafting a profile needs human confirmation (`stack init`).
  // See TRD 35-05's mapping table for the STK -> health code assignments below.
  try {
    const { validateProfile } = require('./stack-profile.cjs');
    const { detectManifest } = require('./project-state.cjs');
    const stackPath = path.join(planningDir, 'STACK.md');

    if (fs.existsSync(stackPath)) {
      const v = validateProfile({ projectRoot: cwd, userHome: homeDir });

      // E030 — one aggregate error per run, covering schema violations (STK001),
      // cycles/depth (STK003/STK004), an unrecognized section (STK006), a parse
      // failure (STK008), and a missing component profile (STK009).
      const E030_CODES = new Set(['STK001', 'STK003', 'STK004', 'STK006', 'STK008', 'STK009']);
      const e030Issues = v.errors.filter((e) => E030_CODES.has(e.code));
      if (e030Issues.length > 0) {
        const first = e030Issues[0];
        const more = e030Issues.length - 1;
        addIssue(
          'error',
          'E030',
          `stack-profile-invalid: ${planningRel(cwd, 'STACK.md')} — ${first.code}: ${first.msg}${more > 0 ? ` (+${more} more)` : ''}`,
          `Run \`aof-tools stack validate\` for the full list and fix ${planningRel(cwd, 'STACK.md')}`
        );
      }

      // W030 — one per unresolved `extends` (STK002). Extract the id from the
      // issue message (`extends '<id>' ...`) since it isn't carried separately.
      for (const e of v.errors) {
        if (e.code !== 'STK002') continue;
        const idMatch = e.msg.match(/extends '([^']+)'/);
        const id = idMatch ? idMatch[1] : e.msg;
        addIssue(
          'warning',
          'W030',
          `stack-extends-unresolved: extends "${id}" not found in ~/.claude/aoforge/stacks/ or the bundled stack-profiles/`,
          `Install ~/.claude/aoforge/stacks/${id}.md or change \`extends\``
        );
      }

      // W031 — one per undefined command key (STK005) in loop/gates/generated/verification.
      for (const e of v.errors) {
        if (e.code !== 'STK005') continue;
        const keyMatch = e.msg.match(/names '([^']+)'/);
        const key = keyMatch ? keyMatch[1] : e.msg;
        addIssue(
          'warning',
          'W031',
          `stack-undefined-command: ${e.path} names "${key}", which no tier defines`,
          `Define commands.${key} in ${planningRel(cwd, 'STACK.md')} or remove it from ${e.path}`
        );
      }

      // W032 — validator warnings, each with its own fix hint. Never flips `ok`.
      //   STK007: body over 150 lines.   STK010: placeholder skill pin (e.g. "<sha>").
      const W032_FIX = {
        STK007: 'Trim the profile body; link to skills/docs instead of pasting them',
        STK010: 'Pin agent_tooling.skills[].pin to a real commit SHA',
      };
      for (const w of v.warnings) {
        if (!Object.prototype.hasOwnProperty.call(W032_FIX, w.code)) continue;
        addIssue('warning', 'W032', `stack-profile-warning: ${w.msg}`, W032_FIX[w.code]);
      }
    } else {
      const m = detectManifest(cwd, { userHome: homeDir });
      if (m.has_manifest) {
        addIssue(
          'info',
          'I030',
          `stack-profile-absent: a ${m.primary_lang} manifest is present but ${planningRel(cwd, 'STACK.md')} is not (general profile in use)`,
          'Draft one with `aof-tools stack init`, review it, then `aof-tools stack init --write`'
        );
      }
    }
  } catch (e) {
    // A check that could not run is never silent — surface it as an error
    // rather than swallowing it (e.g. the bundled general profile is missing).
    addIssue('error', 'E030', `stack-profile-check-failed: ${e.message}`, 'Run `aof-tools stack validate`');
  }

  // ─── Check 12b: Managed .mcp.json server binaries (TRD 42-09) ───────────────
  // W033 — a server `aof-tools stack mcp --write` owns (env.AOFORGE_MANAGED === 'stack') whose
  // command does not resolve. Advisory and never repaired: `.mcp.json` is opt-in per repo, so
  // health never writes it. Foreign servers are not ours to judge. An absent or unparseable
  // `.mcp.json` is skipped — Claude Code itself reports a broken one. `options.env` is the test
  // seam for PATH (defaults to process.env), like `homeDir` above.
  try {
    const mcpFile = path.join(cwd, '.mcp.json');
    if (fs.existsSync(mcpFile)) {
      let doc = null;
      try { doc = JSON.parse(fs.readFileSync(mcpFile, 'utf-8')); } catch (_) { doc = null; }
      const servers = doc && typeof doc === 'object' && doc.mcpServers && typeof doc.mcpServers === 'object' ? doc.mcpServers : {};
      const managedNames = Object.keys(servers).filter((n) => {
        const s = servers[n];
        return s && typeof s === 'object' && s.env && s.env.AOFORGE_MANAGED === 'stack';
      });
      if (managedNames.length > 0) {
        const { resolveBinary } = require('./stack-verify.cjs');
        const env = options.env || process.env;
        for (const name of managedNames) {
          const command = servers[name].command;
          if (typeof command === 'string' && resolveBinary(command, { env, home: homeDir })) continue;
          addIssue(
            'warning',
            'W033',
            `stack-mcp-binary-missing: ${name} (${command})`,
            `Install ${command} or run aof-tools stack mcp --write to prune`
          );
        }
      }
    }
  } catch (e) {
    addIssue('warning', 'W033', `stack-mcp-check-failed: ${e.message}`, 'Run `aof-tools stack mcp` to see the managed servers');
  }

  // ─── Check 13: Upgrade state (objective 36) ────────────────────────────────
  // W040 is deliberately NOT repairable: the migrations are the repair, run by
  // `aof-tools upgrade --apply`. `--repair` keeps its own per-issue repairs
  // (W008/W009/W003) so nothing runs twice. A check that cannot run (a broken
  // registry, a detect that throws) is reported, never passed silently.
  try {
    const upgrade = require('./upgrade.cjs');
    const r = upgrade.check({
      projectRoot: cwd,
      userHome: homeDir,
      pluginVersion: runningVer,
      registryDir: options.upgradeRegistryDir,
    });
    if (r.failed.length > 0) {
      const why = r.failed.map((f) => `${f.id} ${f.phase} failed: ${f.error}`).join('; ');
      addIssue('warning', 'W040', `upgrade-check-not-available: ${why}`, 'Run `aof-tools upgrade --check` to see why');
    } else if (!r.up_to_date) {
      addIssue(
        'warning',
        'W040',
        `project-behind: stamped ${r.from ? `v${r.from}` : 'never'}, AOForge v${r.to}; ` +
          `${r.pending.length} pending, ${r.pending_confirm.length} need confirmation`,
        'Run `aof-tools upgrade --apply` (or /aoforge:status check --migrate)'
      );
    }
  } catch (e) {
    const why = Array.isArray(e.problems) ? `upgrade registry invalid: ${e.problems.join('; ')}` : e.message;
    addIssue('warning', 'W040', `upgrade-check-not-available: ${why}`, 'Run `aof-tools upgrade --check` to see why');
  }

  // ─── Check 14: Documentation staleness (objective 38) ──────────────────────
  // Advisory only — never repairable. W050 removed-command refs, W051 STACK.md review age,
  // W052 declared-vs-detected language drift, W053 codebase maps N commits behind. A check
  // that cannot run is never silent (W054), matching Check 12/13's pattern above.
  try {
    const { collect } = require('./doc-staleness.cjs');
    let docsConfig = {};
    try {
      docsConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      // Missing/malformed config.json is already reported by Check 5 (W003/E005);
      // Check 14 just falls back to doc-staleness.cjs's own DEFAULTS.
    }
    for (const i of collect({ projectRoot: cwd, userHome: homeDir, config: docsConfig }).issues) {
      addIssue('warning', i.code, i.message, i.fix, false);
    }
  } catch (e) {
    addIssue('warning', 'W054', `doc-staleness-check-failed: ${e.message}`, 'Run `aof-tools validate docs` to see why');
  }

  // ─── Check 15: Planning cache drift (objective 48) ─────────────────────────
  // Store mode only (planning-mode.cjs); local mode returns before reading any outbox state, so
  // nothing here changes for a local project. W055: a cache or generated `.aoforge/` file whose
  // bytes match neither its cache-index baseline nor a pending verb write — changed outside the
  // aof-tools verbs (D-15). Advisory and never repairable: publishing and restoring are both valid
  // fixes, and only the user knows which was meant. A check that cannot run, or ran partially
  // (the 5,000-file cap), is never silent (W056), matching Check 14's W054.
  const driftFix = 'Run `aof-tools validate health --raw` after `gh pull --all`';
  try {
    const { findCacheDrift } = require('./planning-drift.cjs');
    const r = findCacheDrift(cwd, { home: homeDir });
    for (const d of r.drift) addIssue('warning', 'W055', d.message, d.fix, false);
    for (const note of r.notes) addIssue('warning', 'W056', `planning-drift-check-failed: ${note}`, driftFix, false);
  } catch (e) {
    addIssue('warning', 'W056', `planning-drift-check-failed: ${e.message}`, driftFix, false);
  }

  // ─── Check 16: Store sync health (objective 50, GEN-03) ────────────────────
  // Store mode only; gh-health.collectStoreHealth returns {applicable:false} in local mode before it
  // reads any outbox, mapping or objective state, so a local project's report is unchanged. Offline
  // (no gh call). W057 unsynced writes (pending/blocked ops, a halted outbox, a recovered journal),
  // W058 missing links, W059 orphans (the offline half; `aof-tools gh orphans <objective>` is the
  // online scan), W060 frozen-body drift. Warnings only and never repairable: --repair must not
  // flush the outbox or rewrite the cache. A check that cannot run is never silent (W061).
  try {
    const r = require('./gh-health.cjs').collectStoreHealth(cwd, { home: homeDir });
    if (r && r.applicable) {
      for (const f of r.findings) addIssue('warning', f.code, f.message, f.fix, false);
    }
  } catch (e) {
    addIssue(
      'warning',
      'W061',
      `gh-health-check-failed: ${e.message}`,
      'Run `aof-tools gh outbox status` and `aof-tools validate health --raw` to see why',
      false,
    );
  }

  // ─── Check 17: Stale checks workflow pin (objective 61, STOR-03) ───────────
  // `.github/workflows/aoforge.yml`, written by `gh setup --apply`, pins AOForge's reusable workflow and its
  // aoforge-ref to the release that ran setup, and nothing re-pins it after an upgrade. W062: the managed workflow pins
  // a release older than the installed plugin (checks-pin.cjs owns the parse and the decision; a branch or SHA pin, a
  // fork's own @ref and an unmanaged file are never stale). The comparison version is the installed plugin
  // (installedVer, Check 11), else the running engine (runningVer). A local file read with no gh or git call. A warning
  // and never repairable: re-pinning is `gh setup --apply` plus a pull request, which a repair must never do. A check
  // that cannot run is never silent: it reports under its own code, like Check 12b.
  try {
    const r = require('./checks-pin.cjs').collectPinFindings({ projectRoot: cwd, installedVersion: installedVer || runningVer });
    for (const f of r.findings) addIssue('warning', f.code, f.message, f.fix, false);
  } catch (e) {
    addIssue('warning', 'W062', `checks-pin-check-failed: ${e.message}`, 'Run `aof-tools doctor` to see why', false);
  }

  // ─── Check 18: Stale pinned model id (objective 61, OBS-01) ────────────────
  // The running engine's references/model-profiles.json pins a concrete id per tier, and models{} is live (the vision
  // judge sends it to the Messages API). Currency is derived from data, not a hard-coded list: model-currency judges each
  // pin against references/model-rates.json, where a newer priced version of the same family supersedes it (W063
  // model-id-stale) and an id the table does not price cannot be judged (W063 model-id-unknown). A local read with no
  // network call. A warning and never repairable: the ids change in the plugin source and ship with a release. A check
  // that cannot run is never silent (W063 model-id-check-failed). Doctor check 13 owns the code; check 22 defers it.
  try {
    const { MODEL_PROFILES_PATH } = require('./helpers.cjs');
    const { loadRates, RATES_PATH } = require('./calibration-inputs.cjs');
    const { staleModelIds } = require('./model-currency.cjs');
    const profiles = JSON.parse(fs.readFileSync(options.modelProfilesPath || MODEL_PROFILES_PATH, 'utf-8'));
    const rates = loadRates(options.modelRatesPath || RATES_PATH);
    if (!rates.ok) throw new Error(rates.error);
    const modelFix = 'Update the plugin (`/plugin update aoforge@aocyber`); in the AOForge source, update models in '
      + 'references/model-profiles.json';
    for (const s of staleModelIds(profiles.models, rates)) {
      const message = s.reason === 'superseded'
        ? `model-id-stale: models.${s.tier} = ${s.id} is superseded by ${s.current} (model-rates.json)`
        : `model-id-unknown: models.${s.tier} = ${s.id} is not in model-rates.json, so its currency cannot be checked`;
      addIssue('warning', 'W063', message, modelFix, false);
    }
  } catch (e) {
    addIssue('warning', 'W063', `model-id-check-failed: ${e.message}`, 'Run `aof-tools doctor` to see why', false);
  }

  // ─── Check 19: .aoforge/.skill-active marker (objective 69, TOOL-09) ─────
  // E006 a tracked marker (holds the edit gate open in every clone), W064 a stale untracked one. Repairable when
  // skill-marker-health's plan says so; the repair untracks and/or removes that one file behind the DOC-06 index
  // guard. Doctor check 23 owns both codes; check 22 defers them. A check that cannot run is never silent.
  let skillMarker = null;
  const skillMarkerNowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  try {
    skillMarker = options.skillMarkerHealth || require('./skill-marker-health.cjs');
    const state = skillMarker.inspect(cwd, { nowMs: skillMarkerNowMs, env: process.env });
    const plan = skillMarker.planRepair(cwd, state, { env: process.env });
    for (const f of skillMarker.findings(state, plan)) {
      addIssue(f.severity, f.code, f.message, f.fix, f.repairable);
      if (f.repairable && !repairs.includes('repairSkillMarker')) repairs.push('repairSkillMarker');
    }
  } catch (e) {
    addIssue('warning', 'W064', `skill-marker-check-failed: ${e.message}`, 'Run `aof-tools doctor` to see why', false);
  }

  // ─── Check 20: requirements-completed agrees with VERIFICATION (objective 69, TOOL-10) ─────
  // W065: a requirement an objective's VERIFICATION marks SATISFIED that no SUMMARY in that objective lists in
  // requirements-completed (requirements-agreement.cjs; only IDs defined in a REQUIREMENTS document). Advisory and never
  // repairable: choosing the SUMMARY is a reviewed `summary post`. A check that cannot run is never silent.
  try {
    const ra = options.requirementsAgreement || require('./requirements-agreement.cjs');
    for (const f of ra.scan(planningDir).findings) addIssue('warning', 'W065', ra.findingMessage(f), ra.findingFix(f), false);
  } catch (e) {
    addIssue('warning', 'W065', `requirements-check-failed: ${e.message}`, 'Run `aof-tools validate requirements` to see why', false);
  }

  // ─── Check 21: Legacy planning directory (objective 72, INST-03) ─────────
  // W066: the project still has only the legacy planning directory (AOForge reads it for one release; migration 0012
  // moves it), or has both (the legacy one is ignored). Advisory and never repairable here: the move is the
  // migration's, with its backup and its commit (planning-layout.cjs).
  {
    const issue = require('./planning-layout.cjs').legacyPlanningIssue(cwd);
    if (issue) addIssue('warning', issue.code, issue.message, issue.fix, false);
  }

  // ─── Perform repairs if requested ─────────────────────────────────────────
  const repairActions = [];
  if (options.repair && repairs.length > 0) {
    const migrationCtx = { projectRoot: cwd, userHome: homeDir, pluginVersion: pluginVersion(), dryRun: false, options: {} };
    for (const repair of repairs) {
      try {
        switch (repair) {
          case 'createConfig':
          case 'resetConfig': {
            // The nested template shape, from migration 0001 (the only copy of it).
            fs.writeFileSync(configPath, JSON.stringify(m0001.buildConfig(null), null, 2) + '\n', 'utf-8');
            repairActions.push({ action: repair, success: true, path: 'config.json' });
            break;
          }
          case 'regenerateState': {
            // Generate minimal STATE.md from ROADMAP.md structure
            const milestone = getMilestoneInfo(cwd);
            let stateContent = `# Session State\n\n`;
            stateContent += `## Project Reference\n\n`;
            stateContent += `See: ${planningRel(cwd, 'PROJECT.md')}\n\n`;
            stateContent += `## Position\n\n`;
            stateContent += `**Milestone:** ${milestone.version} ${milestone.name}\n`;
            stateContent += `**Current objective:** (determining...)\n`;
            stateContent += `**Status:** Resuming\n\n`;
            stateContent += `## Session Log\n\n`;
            stateContent += `- ${new Date().toISOString().split('T')[0]}: STATE.md regenerated by /aoforge:status check --repair\n`;
            fs.writeFileSync(statePath, stateContent, 'utf-8');
            repairActions.push({ action: repair, success: true, path: 'STATE.md' });
            break;
          }
          case 'createStateJson': {
            // Seed state.json from STATE.md via migration 0003.
            const res = m0003.apply(migrationCtx);
            repairActions.push({ action: repair, success: true, path: 'state.json', seeded_fields: res.notes.seeded_fields });
            break;
          }
          case 'migrateJobFiles': {
            // Rename JOB.md -> TRD.md and log it in STATE.md via migration 0002.
            const res = m0002.apply(migrationCtx);
            repairActions.push({ action: repair, success: true, migrated: res.notes.migrated });
            break;
          }
          case 'repairSkillMarker': {
            // Untrack and/or remove the one marker file (skill-marker-health owns the guard and the re-check).
            // `path` is relative to .aoforge/, which is how doctor check 22 builds its `changed` list.
            const res = skillMarker.repair(cwd, { nowMs: skillMarkerNowMs, env: process.env });
            if ((res.untracked || []).length) repairActions.push({ action: 'untrackSkillMarker', success: true, path: '.skill-active' });
            if ((res.removed || []).length) repairActions.push({ action: 'removeStaleSkillMarker', success: true, path: '.skill-active' });
            if (res.refused) repairActions.push({ action: 'repairSkillMarker', success: false, error: res.refused });
            break;
          }
        }
      } catch (err) {
        repairActions.push({ action: repair, success: false, error: err.message });
      }
    }
  }

  // ─── Determine overall status ─────────────────────────────────────────────
  let status;
  if (errors.length > 0) {
    status = 'broken';
  } else if (warnings.length > 0) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }

  const repairableCount = errors.filter(e => e.repairable).length +
                         warnings.filter(w => w.repairable).length;

  output({
    // Every tool output carries these two (spec): a consumer can reject a
    // report produced by a stale engine. Present on the E001 early return too.
    engine_version: pluginVersion(),
    schema_version: 1,
    status,
    errors,
    warnings,
    info,
    engine,
    repairable_count: repairableCount,
    repairs_performed: repairActions.length > 0 ? repairActions : undefined,
  }, raw);
}

// ─── validate docs (TRD 38-10) ──────────────────────────────────────────────
//
// A cheap, read-only doc-staleness report for the default /aoforge:status view.
// Full `validate health` does a best-effort `git fetch` in Check 11 (too slow
// for every status call); this drives the same doc-staleness.collect() as
// Check 14 above, with no other check attached — no network, no git fetch.
function cmdValidateDocs(cwd, raw) {
  const planningDir = planningRoot(cwd);
  if (!fs.existsSync(planningDir)) {
    const note = `no ${planningDirLabel()}`;
    output({ issues: [], checked: {}, note }, raw, note);
    return;
  }

  const configPath = path.join(planningDir, 'config.json');
  let docsConfig = {};
  try {
    docsConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    // Missing/malformed config.json: fall back to doc-staleness.cjs's own
    // DEFAULTS, same as Check 14 above. Not this command's job to report it.
  }

  const { collect } = require('./doc-staleness.cjs');
  const { issues, checked } = collect({ projectRoot: cwd, userHome: os.homedir(), config: docsConfig });

  const rawText = issues.length
    ? issues.map((i) => `${i.code} ${i.message}`).join('\n')
    : 'no documentation advisories';

  output({ issues, checked }, raw, rawText);
}

// ─── validate requirements (TRD 69-05, TOOL-10) ─────────────────────────────
//
// The read-only, network-free form of validate health Check 20: full `validate health` does a best-effort `git fetch` in
// Check 11, so this drives the same requirements-agreement scan with no other check attached. `objective` limits it to
// one objective (matched by number, as the other objective-scoped commands do). Advisory like `validate docs`: every
// outcome, findings included, exits 0, and scripts read the JSON.
function cmdValidateRequirements(cwd, { objective } = {}, raw) {
  const planningDir = planningRoot(cwd);
  if (!fs.existsSync(planningDir)) {
    const note = `no ${planningDirLabel()}`;
    output({ findings: [], checked: {}, note }, raw, note);
    return;
  }

  const ra = require('./requirements-agreement.cjs');
  const { checked, findings, skipped } = ra.scan(planningDir, { objective });
  const rendered = findings.map((f) => ({ ...f, message: ra.findingMessage(f), fix: ra.findingFix(f) }));

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const rawText = rendered.length
    ? rendered.map((f) => `W065 ${f.message}\n  fix: ${f.fix}`).join('\n')
    : `requirements-completed agrees with VERIFICATION (${plural(checked.objectives, 'objective')}, ${plural(checked.requirements, 'requirement')} checked)`;

  output({ findings: rendered, checked, skipped }, raw, rawText);
}

module.exports = {
  cmdValidateConsistency,
  cmdValidateHealth,
  cmdValidateDocs,
  cmdValidateRequirements,
  compareSemver,
};
