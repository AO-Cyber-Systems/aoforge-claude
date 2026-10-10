'use strict';

// Tests for scripts/ci-visual-judge.cjs (TRD 74-01), the CI assertion that the live visual
// judge really looked at the fixture screenshots.
//
// NO TEST MAKES A NETWORK CALL. The CLI cases inject `{ env, spawn, readFile, out, err }` into
// main(): env is a hand-built object (never process.env) and spawn is a stub, so the live judge
// is never started. The one case that runs the real CLI (case 17) runs `--judge labels` with
// ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL stripped from its environment.
//
// Every rollup comes from the hand-written builders in __fixtures__/visual-judge-rollups.cjs.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'ci-visual-judge.cjs');
const {
  MANIFEST_PATH,
  liveState,
  brokenLiveState,
  downgradedState,
  liveRollup,
  fixtureManifest,
} = require('./__fixtures__/visual-judge-rollups.cjs');

// A value shaped like nothing real. It must never appear in anything the script prints.
const FAKE_CREDENTIAL = 'test-only-not-a-key';

/**
 * Injected dependencies for main(). `spawnResult` is what the stubbed spawn returns (an
 * object, or a function of (cmd, args, opts)); `files` serves readFile by path, anything else
 * falls through to the real filesystem (the committed fixture manifest).
 */
function harness({ env = { ANTHROPIC_API_KEY: FAKE_CREDENTIAL }, spawnResult, files = {} } = {}) {
  const calls = [];
  const out = [];
  const err = [];
  const deps = {
    env,
    spawn(cmd, args, opts) {
      calls.push({ cmd, args, opts });
      return typeof spawnResult === 'function' ? spawnResult(cmd, args, opts) : spawnResult;
    },
    readFile(p, enc) {
      if (Object.prototype.hasOwnProperty.call(files, p)) return files[p];
      return fs.readFileSync(p, enc);
    },
    out: (s) => out.push(String(s)),
    err: (s) => err.push(String(s)),
  };
  return { deps, calls, stdout: () => out.join(''), stderr: () => err.join('') };
}

function loadScript() {
  return require(SCRIPT);
}

describe('ci-visual-judge main()', () => {
  test('1. no ANTHROPIC_API_KEY and no ANTHROPIC_AUTH_TOKEN: exit 1, names both, never spawns', () => {
    const { main } = loadScript();
    const h = harness({ env: { PATH: '/usr/bin' } });
    const code = main([MANIFEST_PATH], h.deps);
    assert.equal(code, 1);
    assert.match(h.stderr(), /ANTHROPIC_API_KEY/);
    assert.match(h.stderr(), /ANTHROPIC_AUTH_TOKEN/);
    assert.match(h.stderr(), /repository secret/);
    assert.equal(h.calls.length, 0, 'the judge must not be started without a credential');
  });

  test('2. credential present and a passing live rollup: exit 0, summary printed, credential never printed', () => {
    const { main } = loadScript();
    const h = harness({ spawnResult: { status: 0, stdout: JSON.stringify(liveRollup()), stderr: '' } });
    const code = main([MANIFEST_PATH], h.deps);
    assert.equal(code, 0, h.stdout() + h.stderr());
    const stdout = h.stdout();
    assert.match(stdout, /gate=binding/);
    assert.match(stdout, /model=claude-test-model/);
    assert.match(stdout, /^docs-home expect=pass verdict=pass is_broken=false votes=0\/3 evidence=vision$/m);
    assert.match(stdout, /^docs-home-broken expect=fail verdict=fail is_broken=true votes=3\/3 evidence=vision \(high overflow\)$/m);
    assert.match(stdout, /tokens: input=8400 output=900/);
    assert.match(stdout, /^PASS/m);
    assert.ok(!stdout.includes(FAKE_CREDENTIAL), 'stdout must not carry the credential');
    assert.ok(!h.stderr().includes(FAKE_CREDENTIAL), 'stderr must not carry the credential');
  });

  test('3. spawns node on the repo aof-tools with verify flutter-ui-eval <manifest> --judge live --raw', () => {
    const { main } = loadScript();
    const h = harness({ spawnResult: { status: 0, stdout: JSON.stringify(liveRollup()), stderr: '' } });
    main([MANIFEST_PATH], h.deps);
    assert.equal(h.calls.length, 1);
    const { cmd, args, opts } = h.calls[0];
    assert.equal(cmd, process.execPath);
    assert.deepEqual(args, [
      path.join(__dirname, '..', 'plugins', 'aoforge', 'aoforge', 'bin', 'aof-tools.cjs'),
      'verify', 'flutter-ui-eval', MANIFEST_PATH, '--judge', 'live', '--raw',
    ]);
    assert.equal(opts.env, h.deps.env, 'the child gets the injected environment, credential included');
  });

  test('4. stdout "@file:<path>" (the 50 KB fallback): the rollup is read from that file', () => {
    const { main } = loadScript();
    const tmp = '/nonexistent-dir/df-ui-eval-1234.json';
    const h = harness({
      spawnResult: { status: 0, stdout: '@file:' + tmp, stderr: '' },
      files: { [tmp]: JSON.stringify(liveRollup({ model: 'claude-from-file' })) },
    });
    const code = main([MANIFEST_PATH], h.deps);
    assert.equal(code, 0, h.stdout() + h.stderr());
    assert.match(h.stdout(), /model=claude-from-file/);
  });

  test('5. empty stdout, non-JSON stdout or a spawn error: exit 1, "could not parse the judge\'s output"', () => {
    const { main } = loadScript();
    const results = {
      empty: { status: 0, stdout: '', stderr: '' },
      'not json': { status: 1, stdout: 'Error: something broke', stderr: 'trace' },
      'spawn error': { status: null, stdout: '', stderr: '', error: new Error('spawnSync node ENOENT') },
      'spawn error with stdout': { status: null, stdout: JSON.stringify(liveRollup()), stderr: '', error: new Error('ENOBUFS') },
    };
    for (const [label, spawnResult] of Object.entries(results)) {
      const h = harness({ spawnResult });
      const code = main([MANIFEST_PATH], h.deps);
      assert.equal(code, 1, `${label}: exit code`);
      assert.match(h.stderr(), /could not parse the judge's output/, `${label}: message`);
      assert.doesNotMatch(h.stdout(), /^PASS/m, `${label}: no PASS line`);
    }
  });

  test('6. no manifest argument: exit 1 with usage, never spawns (an unreadable manifest likewise)', () => {
    const { main } = loadScript();
    const h = harness();
    const code = main([], h.deps);
    assert.equal(code, 1);
    assert.match(h.stderr(), /usage: node scripts\/ci-visual-judge\.cjs <manifest>/i);
    assert.equal(h.calls.length, 0);

    const missing = path.join(__dirname, '__fixtures__', 'visual-judge', 'no-such-manifest.json');
    const h2 = harness();
    assert.equal(main([missing], h2.deps), 1);
    assert.match(h2.stderr(), /could not read the manifest/);
    assert.equal(h2.calls.length, 0, 'the judge must not be started without a manifest');
  });

  test('19. a credential echoed back by the judge (curl\'s "Command failed" message) is redacted, long text cut', () => {
    const { main } = loadScript();
    // execFileSync's error message is "Command failed: <file> <args...>", so a failed curl in
    // anthropicMessagesCall puts its header (credential) and the base64 image body into the
    // state's error, which the engine copies into the rollup.
    const body = JSON.stringify({ messages: [{ content: [{ type: 'image', source: { data: 'A'.repeat(200000) } }] }] });
    const curlFailure = (header) =>
      `Command failed: curl -sS -X POST https://api.anthropic.com/v1/messages -H content-type: application/json -H ${header} -d ${body}`;
    const cases = [
      { env: { ANTHROPIC_API_KEY: FAKE_CREDENTIAL }, header: `x-api-key: ${FAKE_CREDENTIAL}` },
      { env: { ANTHROPIC_AUTH_TOKEN: FAKE_CREDENTIAL, ANTHROPIC_BASE_URL: 'https://gateway.invalid' }, header: `authorization: Bearer ${FAKE_CREDENTIAL}` },
    ];
    for (const { env, header } of cases) {
      const leaky = liveRollup({
        model: null,
        usage: { input_tokens: 0, output_tokens: 0 },
        states: [downgradedState('docs-home', curlFailure(header)), downgradedState('docs-home-broken', curlFailure(header))],
      });
      const h = harness({ env, spawnResult: { status: 0, stdout: JSON.stringify(leaky), stderr: `curl: (6) ${header}` } });
      const code = main([MANIFEST_PATH], h.deps);
      assert.equal(code, 1);
      const all = h.stdout() + h.stderr();
      assert.ok(!all.includes(FAKE_CREDENTIAL), 'the credential must never be printed');
      assert.match(h.stdout(), /\*\*\*/, 'the redaction is visible');
      const longest = Math.max(...all.split('\n').map((l) => l.length));
      assert.ok(longest < 4000, `a printed line is ${longest} characters long`);
    }

    // The parse-failure path prints the child's stderr: redacted there too.
    const h = harness({ spawnResult: { status: 1, stdout: '', stderr: `Command failed: curl -H x-api-key: ${FAKE_CREDENTIAL}` } });
    assert.equal(main([MANIFEST_PATH], h.deps), 1);
    assert.ok(!(h.stdout() + h.stderr()).includes(FAKE_CREDENTIAL));
  });
});

describe('assertLiveRollup(rollup, manifest)', () => {
  test('7. happy path: docs-home not broken, docs-home-broken broken with a high overflow, both vision', () => {
    const { assertLiveRollup } = loadScript();
    const result = assertLiveRollup(liveRollup(), fixtureManifest());
    assert.deepEqual(result, { ok: true, failures: [], warnings: [] });
  });

  test('8. gate not binding, judge not live-vision or network not true: "not a live run"', () => {
    const { assertLiveRollup } = loadScript();
    const offline = [
      { gate: 'advisory' },
      { judge: 'offline-label-echo' },
      { network: false },
      { network: undefined },
    ];
    for (const override of offline) {
      const result = assertLiveRollup(liveRollup(override), fixtureManifest());
      assert.equal(result.ok, false, JSON.stringify(override));
      assert.ok(result.failures.some((f) => /not a live run/.test(f)), JSON.stringify(result.failures));
    }
  });

  test('9. a state with errors or without evidence vision: failure naming the state and its first error', () => {
    const { assertLiveRollup } = loadScript();
    // The credential-less live run exactly as the engine reports it: still gate binding and
    // exit 0, both states downgraded to review with the call's error and no evidence.
    const noCredential = 'no credential — set ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL) to run the live vision call.';
    const credentialLess = liveRollup({
      model: null,
      verdict: 'pass-with-reviews',
      counts: { pass: 0, fail: 0, review: 2, known_broken: 0 },
      reviews: ['docs-home'],
      usage: { input_tokens: 0, output_tokens: 0 },
      states: [downgradedState('docs-home', noCredential), downgradedState('docs-home-broken', noCredential)],
    });
    const result = assertLiveRollup(credentialLess, fixtureManifest());
    assert.equal(result.ok, false);
    assert.ok(result.failures.includes(`docs-home: not judged by the live model: ${noCredential}`), JSON.stringify(result.failures));
    assert.ok(result.failures.includes(`docs-home-broken: not judged by the live model: ${noCredential}`), JSON.stringify(result.failures));

    // No errors, but the evidence is not vision (a labels lookup slipped into a live rollup).
    const labelEvidence = liveRollup({ states: [liveState({ evidence: 'label' }), brokenLiveState()] });
    const r2 = assertLiveRollup(labelEvidence, fixtureManifest());
    assert.equal(r2.ok, false);
    assert.ok(r2.failures.some((f) => /^docs-home: not judged by the live model: evidence=label$/.test(f)), JSON.stringify(r2.failures));
  });

  test('10. an expect-pass state in fails[] (judged broken with a HIGH defect): failure naming it', () => {
    const { assertLiveRollup } = loadScript();
    const regression = liveRollup({
      verdict: 'fail',
      counts: { pass: 0, fail: 2, review: 0, known_broken: 0 },
      fails: ['docs-home'],
      states: [brokenLiveState({ state_id: 'docs-home' }), brokenLiveState()],
    });
    const result = assertLiveRollup(regression, fixtureManifest());
    assert.equal(result.ok, false);
    assert.ok(result.failures.some((f) => /^docs-home: judged broken with a HIGH defect but expected to pass/.test(f)), JSON.stringify(result.failures));
  });

  test('11. an expect-pass state judged broken below HIGH (known_broken): ok, with a warning naming it', () => {
    const { assertLiveRollup } = loadScript();
    const belowHigh = liveRollup({
      counts: { pass: 1, fail: 1, review: 0, known_broken: 1 },
      known_broken: ['docs-home'],
      states: [
        liveState({
          is_broken: true,
          votes: { broken: 2, ok: 1 },
          flake: true,
          defects: [{ type: 'misalignment', severity: 'medium', region: 'nav', rationale: 'Nav links sit lower than the brand.' }],
          known_broken: true,
          max_severity: 'medium',
        }),
        brokenLiveState(),
      ],
    });
    const result = assertLiveRollup(belowHigh, fixtureManifest());
    assert.equal(result.ok, true, JSON.stringify(result.failures));
    assert.deepEqual(result.failures, []);
    assert.equal(result.warnings.length, 1, JSON.stringify(result.warnings));
    assert.match(result.warnings[0], /^docs-home: judged broken below HIGH \(medium\)/);
  });

  test('12. an expect-pass state with verdict review, flake true, is_broken false: ok, with a flake warning', () => {
    const { assertLiveRollup } = loadScript();
    const flaky = liveRollup({
      verdict: 'pass-with-reviews',
      counts: { pass: 0, fail: 1, review: 1, known_broken: 0 },
      reviews: ['docs-home'],
      states: [
        liveState({
          verdict: 'review',
          is_broken: false,
          flake: true,
          votes: { broken: 1, ok: 2 },
          defects: [{ type: 'overflow', severity: 'high', region: 'hero', rationale: 'One sample saw the mesh crossing the text.' }],
        }),
        brokenLiveState(),
      ],
    });
    const result = assertLiveRollup(flaky, fixtureManifest());
    assert.equal(result.ok, true, JSON.stringify(result.failures));
    assert.equal(result.warnings.length, 1, JSON.stringify(result.warnings));
    assert.match(result.warnings[0], /^docs-home: the samples split \(1\/3 broken\); within the flake budget/);
  });

  test('13. the expect-fail state judged not broken (in resolved[]): "the judge missed the known defect"', () => {
    const { assertLiveRollup } = loadScript();
    // The rollup verdict is a clean pass: the engine reads an expect:fail state that passes as
    // "likely fixed". For this fixture it means the model did not see the injected defect.
    const missed = liveRollup({
      counts: { pass: 2, fail: 0, review: 0, known_broken: 0 },
      known_failing: [],
      resolved: ['docs-home-broken'],
      states: [liveState(), liveState({ state_id: 'docs-home-broken' })],
    });
    const result = assertLiveRollup(missed, fixtureManifest());
    assert.equal(result.ok, false);
    assert.ok(result.failures.some((f) => /^docs-home-broken: the judge missed the known defect/.test(f)), JSON.stringify(result.failures));
  });

  test('14. unjudged[] non-empty: failure', () => {
    const { assertLiveRollup } = loadScript();
    const unjudged = liveRollup({ unjudged: ['docs-home'] });
    const result = assertLiveRollup(unjudged, fixtureManifest());
    assert.equal(result.ok, false);
    assert.ok(result.failures.some((f) => /^unjudged states: docs-home/.test(f)), JSON.stringify(result.failures));
  });

  test('15. states.length differs from the manifest, or a manifest state_id is missing: failure', () => {
    const { assertLiveRollup } = loadScript();
    const oneState = liveRollup({ states: [liveState()] });
    const r1 = assertLiveRollup(oneState, fixtureManifest());
    assert.equal(r1.ok, false);
    assert.ok(r1.failures.some((f) => /^the rollup has 1 state\(s\), the manifest has 2/.test(f)), JSON.stringify(r1.failures));
    assert.ok(r1.failures.some((f) => /^docs-home-broken: missing from the rollup/.test(f)), JSON.stringify(r1.failures));

    // Same count, wrong id: a renamed state must not stand in for a manifest state.
    const renamed = liveRollup({ states: [liveState(), brokenLiveState({ state_id: 'something-else' })] });
    const r2 = assertLiveRollup(renamed, fixtureManifest());
    assert.equal(r2.ok, false);
    assert.ok(r2.failures.some((f) => /^docs-home-broken: missing from the rollup/.test(f)), JSON.stringify(r2.failures));
  });

  test('16. usage.input_tokens missing or 0: "no tokens were spent"', () => {
    const { assertLiveRollup } = loadScript();
    const noSpend = [
      { usage: { input_tokens: 0, output_tokens: 0 } },
      { usage: { output_tokens: 900 } },
      { usage: undefined },
    ];
    for (const override of noSpend) {
      const result = assertLiveRollup(liveRollup(override), fixtureManifest());
      assert.equal(result.ok, false, JSON.stringify(override));
      assert.ok(result.failures.some((f) => /no tokens were spent/.test(f)), JSON.stringify(result.failures));
    }
  });

  test('18. the rollup verdict is fail and nothing else was recorded: failure naming fails[] and reviews[]', () => {
    const { assertLiveRollup } = loadScript();
    // Reviews over the flake budget: every state was judged by vision, the known defect was
    // seen, yet the engine escalated the run to fail. The assertion must not be greener.
    const overBudget = liveRollup({
      flakeBudget: 0,
      verdict: 'fail',
      counts: { pass: 0, fail: 1, review: 1, known_broken: 0 },
      reviews: ['docs-home'],
      states: [liveState({ verdict: 'review', flake: true, votes: { broken: 1, ok: 2 } }), brokenLiveState()],
    });
    const result = assertLiveRollup(overBudget, fixtureManifest());
    assert.equal(result.ok, false);
    assert.ok(
      result.failures.some((f) => f === "the judge's own verdict is fail (fails: none; reviews: docs-home)"),
      JSON.stringify(result.failures));
  });
});

describe('the committed fixture (real files, no network)', () => {
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  test('17. resolves through the real CLI offline: 2 states, known_failing [docs-home-broken], pass; real PNGs', () => {
    const { execFileSync } = require('node:child_process');
    const { AOF_TOOLS } = loadScript();
    const strippedEnv = { ...process.env };
    delete strippedEnv.ANTHROPIC_API_KEY;
    delete strippedEnv.ANTHROPIC_AUTH_TOKEN;
    delete strippedEnv.ANTHROPIC_BASE_URL;
    let out;
    try {
      out = execFileSync(process.execPath, [AOF_TOOLS, 'verify', 'flutter-ui-eval', MANIFEST_PATH, '--judge', 'labels', '--raw'],
        { encoding: 'utf-8', env: strippedEnv });
    } catch (err) { out = err.stdout; } // verdict fail exits 1 with the rollup still on stdout

    const rollup = JSON.parse(out);
    assert.equal(rollup.resolution, 'resolved');
    assert.equal(rollup.network, false);
    assert.equal(rollup.states.length, 2);
    assert.deepEqual(rollup.known_failing, ['docs-home-broken']);
    assert.deepEqual(rollup.fails, []);
    assert.deepEqual(rollup.unjudged, []);
    assert.equal(rollup.verdict, 'pass');

    const manifest = fixtureManifest();
    assert.equal(manifest.unjudgedPolicy, 'fail');
    assert.equal(manifest.samples, 3);
    for (const s of manifest.states) {
      const png = path.join(path.dirname(MANIFEST_PATH), s.screenshot_path);
      const bytes = fs.readFileSync(png);
      assert.ok(bytes.subarray(0, 8).equals(PNG_MAGIC), `${s.state_id}: not a PNG`);
      assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR', `${s.state_id}: first chunk is not IHDR`);
      const width = bytes.readUInt32BE(16);
      assert.ok(width >= 360, `${s.state_id}: width ${width} < 360`);
      assert.ok(bytes.length > 10 * 1024, `${s.state_id}: ${bytes.length} bytes is a placeholder, not a capture`);
    }
  });
});
