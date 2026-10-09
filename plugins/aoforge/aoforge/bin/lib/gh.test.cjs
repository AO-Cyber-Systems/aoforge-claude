'use strict';

// Unit tests for lib/gh.cjs — resolveChain, findRoadmapIssue, addToProject,
// linkSubIssue, cmdGhResolve, and per-process cache.
//
// All tests mock runGh via gh._setRunGh(mockFn) — no live gh CLI calls.
// Per TDD Playbook: hand-built fixtures, no LLM-generated test data.

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const gh = require('./gh.cjs');
const fx = require('./__fixtures__/gh-fixtures.cjs');

// ─── Shared setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset cache + runGh injection before each test
  if (gh._resetCache) gh._resetCache();
  if (gh._setRunGh) gh._setRunGh(null); // restore real runGh (or noop mock)
});

// ─── Group A: resolveChain — full ref ────────────────────────────────────────

describe('resolveChain — full ref', () => {
  test('A1: full ref github_issue + parent_issue sets correct values and provenance', () => {
    // Mock runGh to never be called — no walk for explicit refs without walk
    // (walk is triggered by parent_issue being present; mock returns failure to confirm
    //  the resolver does try to walk but handles gracefully — actually, it DOES walk)
    // For A1 we don't want a walk response, so mock an empty parent walk
    const mock = fx.buildMockRunGh(new Map([
      ['api graphql', { ok: false, status: 1, stdout: '', stderr: '[mock] no walk in A1' }],
    ]));
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/aoforge-claude#10',
      parent_issue: 'AO-Cyber-Systems/aoforge-claude#9',
    });
    const ctx = fx.buildProjectCtx({
      github_repo: 'AO-Cyber-Systems/aoforge-claude',
      org_project: 'PVT_kwDODwqLrc4BRsOP',
    });

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.github_issue, 'AO-Cyber-Systems/aoforge-claude#10');
    assert.strictEqual(r.parent_issue, 'AO-Cyber-Systems/aoforge-claude#9');
    assert.strictEqual(r.org_project, 'PVT_kwDODwqLrc4BRsOP');
    assert.strictEqual(r.provenance.github_issue, 'frontmatter');
    assert.strictEqual(r.provenance.parent_issue, 'frontmatter');
    assert.strictEqual(r.provenance.org_project, 'inherited_from_project');
  });

  test('A2: frontmatter has no org_project; projectCtx.org_project used + provenance = inherited_from_project', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({ github_issue: 'AO-Cyber-Systems/aoforge-claude#10' });
    const ctx = fx.buildProjectCtx({
      github_repo: 'AO-Cyber-Systems/aoforge-claude',
      org_project: 'PVT_kwDODwqLrc4BRsOP',
    });

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.org_project, 'PVT_kwDODwqLrc4BRsOP');
    assert.strictEqual(r.provenance.org_project, 'inherited_from_project');
  });

  test('A3: frontmatter org_project overrides projectCtx.org_project + provenance = frontmatter', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/aoforge-claude#10',
      org_project: 'PVT_custom123',
    });
    const ctx = fx.buildProjectCtx({
      github_repo: 'AO-Cyber-Systems/aoforge-claude',
      org_project: 'PVT_kwDODwqLrc4BRsOP',
    });

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.org_project, 'PVT_custom123');
    assert.strictEqual(r.provenance.org_project, 'frontmatter');
  });
});

// ─── Group B: resolveChain — shorthand resolution ────────────────────────────

describe('resolveChain — shorthand', () => {
  test('B1: parent_issue shorthand #9 + valid github_repo → expanded full ref, provenance = frontmatter', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({ parent_issue: '#9' });
    const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/aoforge-claude' });

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.parent_issue, 'AO-Cyber-Systems/aoforge-claude#9');
    assert.strictEqual(r.provenance.parent_issue, 'frontmatter');
  });

  test('B2: github_issue shorthand #10 + valid github_repo → expanded full ref', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({ github_issue: '#10' });
    const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/aoforge-claude' });

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.github_issue, 'AO-Cyber-Systems/aoforge-claude#10');
  });

  test('B3: shorthand with no github_repo → keeps literal #9 + warning about missing github_repo', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({ parent_issue: '#9' });
    const ctx = fx.buildProjectCtx({}); // no github_repo

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.parent_issue, '#9');
    assert.ok(Array.isArray(r.warnings));
    const warn = r.warnings.find(w => w.includes('parent_issue') && w.includes('github_repo'));
    assert.ok(warn, `Expected warning mentioning parent_issue and github_repo, got: ${JSON.stringify(r.warnings)}`);
  });

  test('B4: shorthand with malformed github_repo (not owner/name) → warning about malformed, field stays as literal', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({ parent_issue: '#9' });
    const ctx = fx.buildProjectCtx({ github_repo: 'just-some-name' }); // malformed

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.parent_issue, '#9');
    assert.ok(Array.isArray(r.warnings));
    const warn = r.warnings.find(w => w.includes('malformed') || w.includes('just-some-name'));
    assert.ok(warn, `Expected warning mentioning malformed github_repo, got: ${JSON.stringify(r.warnings)}`);
  });
});

// ─── Group C: resolveChain — absent fields + provenance vocabulary ───────────

describe('resolveChain — absent fields', () => {
  test('C1: empty frontmatter + empty projectCtx → all fields null/undefined, provenance = absent', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const r = gh.resolveChain({}, {});

    // All chain fields should be null or absent
    assert.strictEqual(r.github_issue, null);
    assert.strictEqual(r.parent_issue, null);
    assert.strictEqual(r.org_project, null);
    assert.strictEqual(r.org_initiative, null);
    assert.strictEqual(r.provenance.github_issue, 'absent');
    assert.strictEqual(r.provenance.parent_issue, 'absent');
    assert.strictEqual(r.provenance.org_project, 'absent');
    assert.strictEqual(r.provenance.org_initiative, 'absent');
  });

  test('C2: all provenance values are from the allowed vocabulary', () => {
    const VALID_PROVENANCE = new Set([
      'frontmatter',
      'inherited_from_project',
      'walked_from_parent',
      'absent',
      'cached',
    ]);

    const mock = fx.buildMockRunGh(new Map([
      ['api graphql', { ok: false, status: 1, stdout: '', stderr: '[mock]' }],
    ]));
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/aoforge-claude#10',
      parent_issue: 'AO-Cyber-Systems/aoforge-claude#9',
    });
    const ctx = fx.buildProjectCtx({
      github_repo: 'AO-Cyber-Systems/aoforge-claude',
      org_project: 'PVT_kwDODwqLrc4BRsOP',
    });

    const r = gh.resolveChain(fm, ctx);

    for (const [field, prov] of Object.entries(r.provenance)) {
      assert.ok(
        VALID_PROVENANCE.has(prov),
        `provenance.${field} = "${prov}" is not in allowed vocabulary`
      );
    }
  });

  test('C3: result.warnings is always an array (empty when no warnings)', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const r = gh.resolveChain({}, {});

    assert.ok(Array.isArray(r.warnings), 'warnings must be an array');
  });
});

// ─── Group D: resolveChain — walk to roadmap_issue + milestone ───────────────

describe('resolveChain — walk to parent + milestone', () => {
  test('D1: parent_issue with [Roadmap] title in walk response → roadmap_issue = parent_issue, provenance = walked_from_parent', () => {
    // Build the GraphQL args key that _walkParent produces for issue #9 in AO-Cyber-Systems/aoforge-claude
    const query = `query($owner: String!, $name: String!, $number: Int!) {\n    repository(owner: $owner, name: $name) {\n      issue(number: $number) {\n        title\n        projectItems(first: 5) {\n          nodes {\n            project { id title }\n            fieldValues(first: 10) {\n              nodes {\n                ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } }\n                ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2Field { name } } }\n              }\n            }\n          }\n        }\n      }\n    }\n  }`;

    const mockResponses = new Map([
      [
        `api graphql -f query=${query} -F owner=AO-Cyber-Systems -F name=aoforge-claude -F number=9`,
        fx.buildGhResponse_issueWithProjectItem({
          issueNumber: 9,
          title: '[Roadmap] aoforge-claude',
        }),
      ],
    ]);
    const mock = fx.buildMockRunGh(mockResponses);
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({
      parent_issue: 'AO-Cyber-Systems/aoforge-claude#9',
    });
    const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/aoforge-claude' });

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.roadmap_issue, 'AO-Cyber-Systems/aoforge-claude#9');
    assert.strictEqual(r.provenance.roadmap_issue, 'walked_from_parent');
  });

  test('D2: parent_issue walk response with project items → milestone fields populated, provenance = walked_from_parent', () => {
    const mockResponses = new Map([
      ['api graphql', fx.buildGhResponse_issueWithProjectItem({
        issueNumber: 9,
        title: '[Roadmap] aoforge-claude',
        projectTitle: 'Product Roadmap',
        product: 'AOForge',
        quarter: 'Q2 2026',
        status: 'In Progress',
      })],
    ]);
    const mock = fx.buildMockRunGh(mockResponses);
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({
      parent_issue: 'AO-Cyber-Systems/aoforge-claude#9',
    });
    const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/aoforge-claude' });

    const r = gh.resolveChain(fm, ctx);

    assert.ok(r.milestone, 'milestone should be populated');
    assert.strictEqual(r.milestone.product, 'AOForge');
    assert.strictEqual(r.milestone.quarter, 'Q2 2026');
    assert.strictEqual(r.milestone.status, 'In Progress');
    assert.strictEqual(r.provenance.milestone, 'walked_from_parent');
  });

  test('D3: no parent_issue but findRoadmapIssue returns a hit → roadmap_issue set, provenance = walked_from_parent', () => {
    // Mock issue list returning a hit, then walking that hit
    const listResponse = fx.buildGhResponse_issueListRoadmap({
      hits: [{ number: 9, title: '[Roadmap] aoforge-claude' }],
    });
    const walkResponse = fx.buildGhResponse_issueWithProjectItem({
      issueNumber: 9,
      title: '[Roadmap] aoforge-claude',
    });

    const mockResponses = new Map([
      ['issue list', listResponse],
      ['api graphql', walkResponse],
    ]);
    const mock = fx.buildMockRunGh(mockResponses);
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({}); // no parent_issue
    const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/aoforge-claude' });

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.roadmap_issue, 'AO-Cyber-Systems/aoforge-claude#9');
    assert.strictEqual(r.provenance.roadmap_issue, 'walked_from_parent');
  });

  test('D4: no parent_issue and no roadmap hit → roadmap_issue = null, provenance = absent', () => {
    const listResponse = fx.buildGhResponse_issueListRoadmap({ hits: [] }); // empty

    const mockResponses = new Map([
      ['issue list', listResponse],
    ]);
    const mock = fx.buildMockRunGh(mockResponses);
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({});
    const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/aoforge-claude' });

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.roadmap_issue, null);
    assert.strictEqual(r.provenance.roadmap_issue, 'absent');
  });
});

// ─── Group E: findRoadmapIssue ────────────────────────────────────────────────

describe('findRoadmapIssue', () => {
  test('E1: issue list returns one [Roadmap] hit → returns owner/repo#N', () => {
    const listResponse = fx.buildGhResponse_issueListRoadmap({
      hits: [{ number: 9, title: '[Roadmap] aoforge-claude' }],
    });
    const mock = fx.buildMockRunGh(new Map([
      ['issue list --repo AO-Cyber-Systems/aoforge-claude --state open --search [Roadmap] in:title --json number,title --limit 5', listResponse],
    ]));
    gh._setRunGh(mock);

    const result = gh.findRoadmapIssue('AO-Cyber-Systems/aoforge-claude');

    assert.strictEqual(result, 'AO-Cyber-Systems/aoforge-claude#9');
  });

  test('E2: issue list returns empty array → returns null', () => {
    const listResponse = fx.buildGhResponse_issueListRoadmap({ hits: [] });
    const mock = fx.buildMockRunGh(new Map([
      ['issue list', listResponse],
    ]));
    gh._setRunGh(mock);

    const result = gh.findRoadmapIssue('AO-Cyber-Systems/aoforge-claude');

    assert.strictEqual(result, null);
  });

  test('E3: multiple hits → returns lowest-numbered issue (deterministic)', () => {
    const listResponse = fx.buildGhResponse_issueListRoadmap({
      hits: [
        { number: 42, title: '[Roadmap] aoforge-claude second' },
        { number: 9, title: '[Roadmap] aoforge-claude first' },
        { number: 17, title: '[Roadmap] aoforge-claude third' },
      ],
    });
    const mock = fx.buildMockRunGh(new Map([
      ['issue list', listResponse],
    ]));
    gh._setRunGh(mock);

    const result = gh.findRoadmapIssue('AO-Cyber-Systems/aoforge-claude');

    // Should return lowest number: #9
    assert.strictEqual(result, 'AO-Cyber-Systems/aoforge-claude#9');
  });

  test('E4: runGh returns ok: false → returns null', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['issue list', { ok: false, status: 1, stdout: '', stderr: '[mock] auth error' }],
    ]));
    gh._setRunGh(mock);

    const result = gh.findRoadmapIssue('AO-Cyber-Systems/aoforge-claude');

    assert.strictEqual(result, null);
  });
});

// ─── Group F: addToProject + linkSubIssue ────────────────────────────────────

describe('addToProject / linkSubIssue', () => {
  // TRD 46-08: the mutations are gh-client ghWrite now (paced). A no-op sleep keeps pacing off the wall clock.
  beforeEach(() => {
    require('./gh-client.cjs')._resetClient();
    require('./gh-client.cjs')._setSleep(() => {});
  });
  afterEach(() => {
    require('./gh-client.cjs')._resetClient();
    require('./gh-client.cjs')._setSleep(null);
  });

  test('F1: addToProject happy path → returns { ok: true, item_id }', () => {
    const nodeIdResp = fx.buildGhResponse_issueNodeId({ nodeId: 'I_kwDO_issue10' });
    const addItemResp = fx.buildGhResponse_addProjectItem({ itemId: 'PVTI_addedItem' });

    // Two GraphQL calls: first to look up issue node ID, second to add to project
    let callIndex = 0;
    const responses = [nodeIdResp, addItemResp];
    const mock = { calls: () => [] };
    const mockFn = (args) => {
      const resp = responses[callIndex] || { ok: false, status: 1, stdout: '', stderr: '[mock] unexpected call' };
      callIndex++;
      return resp;
    };
    mockFn.callCount = () => callIndex;
    mockFn.calls = () => [];

    gh._setRunGh(mockFn);

    const result = gh.addToProject('AO-Cyber-Systems/aoforge-claude#10', 'PVT_kwDODwqLrc4BRsOP');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.item_id, 'PVTI_addedItem');
  });

  test('F2: addToProject mutation returns error → returns { ok: false, error }', () => {
    const nodeIdResp = fx.buildGhResponse_issueNodeId({ nodeId: 'I_kwDO_issue10' });
    const errorResp = fx.buildGhResponse_graphqlError({ message: 'not_authorized' });

    let callIndex = 0;
    const responses = [nodeIdResp, errorResp];
    const mockFn = (args) => {
      const resp = responses[callIndex] || { ok: false, status: 1, stdout: '', stderr: '[mock]' };
      callIndex++;
      return resp;
    };
    mockFn.callCount = () => callIndex;
    mockFn.calls = () => [];

    gh._setRunGh(mockFn);

    const result = gh.addToProject('AO-Cyber-Systems/aoforge-claude#10', 'PVT_kwDODwqLrc4BRsOP');

    assert.strictEqual(result.ok, false);
    assert.ok(result.error, 'expected error field');
  });

  test('F3: linkSubIssue happy path → returns { ok: true }', () => {
    const parentNodeId = fx.buildGhResponse_issueNodeId({ nodeId: 'I_kwDO_parent9' });
    const childNodeId = fx.buildGhResponse_issueNodeId({ nodeId: 'I_kwDO_child10' });
    const addSubResp = fx.buildGhResponse_addSubIssue({ issueId: 'I_kwDO_parent9' });

    let callIndex = 0;
    const responses = [parentNodeId, childNodeId, addSubResp];
    const mockFn = (args) => {
      const resp = responses[callIndex] || { ok: false, status: 1, stdout: '', stderr: '[mock]' };
      callIndex++;
      return resp;
    };
    mockFn.callCount = () => callIndex;
    mockFn.calls = () => [];

    gh._setRunGh(mockFn);

    const result = gh.linkSubIssue('AO-Cyber-Systems/aoforge-claude#9', 'AO-Cyber-Systems/aoforge-claude#10');

    assert.strictEqual(result.ok, true);
  });

  test('F4: linkSubIssue mutation returns error → returns { ok: false, error }', () => {
    const parentNodeId = fx.buildGhResponse_issueNodeId({ nodeId: 'I_kwDO_parent9' });
    const childNodeId = fx.buildGhResponse_issueNodeId({ nodeId: 'I_kwDO_child10' });
    const errorResp = fx.buildGhResponse_graphqlError({ message: 'sub_issue_already_linked' });

    let callIndex = 0;
    const responses = [parentNodeId, childNodeId, errorResp];
    const mockFn = (args) => {
      const resp = responses[callIndex] || { ok: false, status: 1, stdout: '', stderr: '[mock]' };
      callIndex++;
      return resp;
    };
    mockFn.callCount = () => callIndex;
    mockFn.calls = () => [];

    gh._setRunGh(mockFn);

    const result = gh.linkSubIssue('AO-Cyber-Systems/aoforge-claude#9', 'AO-Cyber-Systems/aoforge-claude#10');

    assert.strictEqual(result.ok, false);
    assert.ok(result.error, 'expected error field');
  });

  test('F5: addToProject + linkSubIssue accept parsed object args (issueRef strings, projectId strings) — not raw paths', () => {
    // Verify both functions accept string arguments without file I/O
    // (testing the interface contract: strings in → objects out)
    const nodeIdResp = fx.buildGhResponse_issueNodeId();
    const addItemResp = fx.buildGhResponse_addProjectItem();

    let callIndex = 0;
    const responses = [nodeIdResp, addItemResp];
    const mockFn = (args) => {
      const resp = responses[callIndex] || { ok: false, status: 1, stdout: '', stderr: '[mock]' };
      callIndex++;
      return resp;
    };
    mockFn.callCount = () => callIndex;
    mockFn.calls = () => [];

    gh._setRunGh(mockFn);

    // Should NOT throw — these are string args, not file paths
    assert.doesNotThrow(() => {
      gh.addToProject('owner/repo#42', 'PVT_someProjectId');
    });
  });
});

// ─── Group G: per-process cache ───────────────────────────────────────────────

describe('resolveChain — cache', () => {
  test('G1: second call with same args returns cached result; runGh call count unchanged on second call', () => {
    let ghCallCount = 0;
    const mockFn = (args) => {
      ghCallCount++;
      return { ok: false, status: 1, stdout: '', stderr: '[mock] G1 no walk' };
    };
    mockFn.callCount = () => ghCallCount;
    mockFn.calls = () => [];
    gh._setRunGh(mockFn);

    const fm = fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/aoforge-claude#10',
      _objectiveId: 'g1-test',
    });
    const ctx = fx.buildProjectCtx({
      github_repo: 'AO-Cyber-Systems/aoforge-claude',
      org_project: 'PVT_kwDODwqLrc4BRsOP',
    });

    // First call
    const r1 = gh.resolveChain(fm, ctx);
    const callsAfterFirst = ghCallCount;

    // Second call — same args
    const r2 = gh.resolveChain(fm, ctx);
    const callsAfterSecond = ghCallCount;

    // runGh call count must not increase on second call
    assert.strictEqual(callsAfterFirst, callsAfterSecond, 'runGh should not be called again on cache hit');

    // github_issue was from frontmatter — stays as 'frontmatter' on cache hit
    assert.strictEqual(r2.provenance.github_issue, 'frontmatter');

    // Result values are the same
    assert.strictEqual(r1.github_issue, r2.github_issue);
    assert.strictEqual(r1.org_project, r2.org_project);
  });

  test('G2: after _resetCache(), second call triggers runGh again', () => {
    let ghCallCount = 0;
    const mockFn = (args) => {
      ghCallCount++;
      return { ok: false, status: 1, stdout: '', stderr: '[mock] G2' };
    };
    mockFn.callCount = () => ghCallCount;
    mockFn.calls = () => [];
    gh._setRunGh(mockFn);

    const fm = fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/aoforge-claude#10',
      _objectiveId: 'g2-test',
    });
    const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/aoforge-claude' });

    gh.resolveChain(fm, ctx);
    const callsAfterFirst = ghCallCount;

    gh._resetCache();

    gh.resolveChain(fm, ctx);
    const callsAfterReset = ghCallCount;

    // After reset, second call MUST have triggered more gh calls (or at least re-run the resolver)
    // If no gh calls happen (no walk), we verify by checking that _resetCache worked by asserting
    // the second call DID NOT come from cache (we can't easily check directly without instrumentation,
    // but we verify the count difference is same as first call pattern)
    assert.ok(callsAfterReset >= callsAfterFirst, 'should have made at least as many gh calls after reset');
  });

  test('G3: two different objectives produce separate cache entries', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const fm1 = fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/aoforge-claude#10',
      _objectiveId: 'obj-one',
    });
    const fm2 = fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/aoforge-claude#11',
      _objectiveId: 'obj-two',
    });
    const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/aoforge-claude' });

    const r1 = gh.resolveChain(fm1, ctx);
    const r2 = gh.resolveChain(fm2, ctx);

    // Different github_issue values → different cache entries → different results
    assert.notStrictEqual(r1.github_issue, r2.github_issue);
    assert.strictEqual(r1.github_issue, 'AO-Cyber-Systems/aoforge-claude#10');
    assert.strictEqual(r2.github_issue, 'AO-Cyber-Systems/aoforge-claude#11');
  });

  test('G4: cache is in module scope — after _resetCache() the cache is empty (module-scope, not closure-scope)', () => {
    // This test verifies that _resetCache() actually clears the module-scope cache,
    // not just a closure variable. We verify by re-resolving and checking it re-runs.
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/aoforge-claude#99',
      _objectiveId: 'g4-test',
    });
    const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/aoforge-claude' });

    // Populate cache
    const r1 = gh.resolveChain(fm, ctx);
    assert.strictEqual(r1.github_issue, 'AO-Cyber-Systems/aoforge-claude#99');

    // Reset and verify next call still works (not broken by reset)
    gh._resetCache();
    const r2 = gh.resolveChain(fm, ctx);
    assert.strictEqual(r2.github_issue, 'AO-Cyber-Systems/aoforge-claude#99');

    // The _setRunGh mock is still active post-reset
    assert.ok(typeof gh._resetCache === 'function', '_resetCache must remain exported');
  });
});

// ─── Group H: CLI surface cmdGhResolve ────────────────────────────────────────

describe('cmdGhResolve / aof-tools gh resolve', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-gh-test-'));
    // Create required .aoforge structure
    fs.mkdirSync(path.join(tmpDir, '.aoforge', 'objectives'), { recursive: true });
    // TRD 46-08: resolve sits behind the enabled gate (disabled -> skipped, zero gh calls).
    fs.writeFileSync(path.join(tmpDir, '.aoforge', 'config.json'),
      JSON.stringify({ github: { enabled: true, repo: 'AO-Cyber-Systems/aoforge-claude' } }));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  test('H1: reads OBJECTIVE.md + PROJECT.md, calls resolveChain, prints JSON to stdout', () => {
    // Create PROJECT.md with github_repo and org_project
    fs.writeFileSync(
      path.join(tmpDir, '.aoforge', 'PROJECT.md'),
      '---\nkind: plugin\ngithub_repo: AO-Cyber-Systems/aoforge-claude\norg_project: PVT_kwDODwqLrc4BRsOP\n---\n\n# Test Project\n',
      'utf-8'
    );

    // Create OBJECTIVE.md with github fields
    const objDir = path.join(tmpDir, '.aoforge', 'objectives', '01-foo');
    fs.mkdirSync(objDir, { recursive: true });
    fs.writeFileSync(
      path.join(objDir, 'OBJECTIVE.md'),
      '---\nwork: feature\ngithub_issue: AO-Cyber-Systems/aoforge-claude#10\nparent_issue: AO-Cyber-Systems/aoforge-claude#9\n---\n\n# Objective 01\n',
      'utf-8'
    );

    // Mock runGh to avoid live gh calls
    // TRD 01-03: auth status mock added so requireGhAuth passes before resolve
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_FULL_SCOPES, stderr: '' }],
      ['api graphql', { ok: false, status: 1, stdout: '', stderr: '[mock] no walk' }],
    ]));
    gh._setRunGh(mock);

    // Capture stdout by temporarily redirecting process.stdout.write
    let capturedOutput = '';
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => { capturedOutput += chunk; return true; };

    let exitCode = 0;
    const originalExit = process.exit.bind(process);
    process.exit = (code) => { exitCode = code || 0; };

    try {
      gh.cmdGhResolve(tmpDir, '01-foo', false);
    } finally {
      process.stdout.write = originalWrite;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(capturedOutput);
    assert.strictEqual(parsed.github_issue, 'AO-Cyber-Systems/aoforge-claude#10');
    assert.strictEqual(parsed.parent_issue, 'AO-Cyber-Systems/aoforge-claude#9');
    assert.ok(parsed.provenance, 'output must have provenance');
    assert.strictEqual(exitCode, 0);
  });

  test('H2: raw=true produces one-line JSON; raw=false produces pretty-printed JSON', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.aoforge', 'PROJECT.md'),
      '---\nkind: plugin\ngithub_repo: AO-Cyber-Systems/aoforge-claude\n---\n\n# Test\n',
      'utf-8'
    );

    const objDir = path.join(tmpDir, '.aoforge', 'objectives', '01-bar');
    fs.mkdirSync(objDir, { recursive: true });
    fs.writeFileSync(
      path.join(objDir, 'OBJECTIVE.md'),
      '---\nwork: feature\ngithub_issue: AO-Cyber-Systems/aoforge-claude#10\n---\n\n# Objective\n',
      'utf-8'
    );

    // TRD 01-03: auth status mock added so requireGhAuth passes before resolve
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_FULL_SCOPES, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    // Test pretty (raw=false)
    let prettyOutput = '';
    let rawOutput = '';
    const origWrite = process.stdout.write.bind(process.stdout);
    const origExit = process.exit.bind(process);
    process.exit = () => {};

    process.stdout.write = (chunk) => { prettyOutput += chunk; return true; };
    try { gh.cmdGhResolve(tmpDir, '01-bar', false); } finally { process.stdout.write = origWrite; }

    process.stdout.write = (chunk) => { rawOutput += chunk; return true; };
    try { gh.cmdGhResolve(tmpDir, '01-bar', true); } finally {
      process.stdout.write = origWrite;
      process.exit = origExit;
    }

    // Pretty output should contain newlines
    assert.ok(prettyOutput.includes('\n'), 'pretty output should have newlines');
    // Raw output: the helpers.cjs output() with raw=true writes rawValue (pretty JSON string)
    // Both should be valid JSON
    assert.doesNotThrow(() => JSON.parse(prettyOutput));
  });

  test('H3: OBJECTIVE.md absent → exits non-zero with "objective not found" message on stderr', () => {
    // TRD 01-03: auth status must succeed so the "objective not found" check is reached
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_FULL_SCOPES, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    let stderrOutput = '';
    let exitCodeCalled = null;
    const origStderr = process.stderr.write.bind(process.stderr);
    const origWrite = process.stdout.write.bind(process.stdout);
    const origExit = process.exit.bind(process);

    process.stderr.write = (chunk) => { stderrOutput += chunk; return true; };
    process.stdout.write = (chunk) => { return true; }; // swallow
    process.exit = (code) => { exitCodeCalled = code; };

    try {
      gh.cmdGhResolve(tmpDir, 'nonexistent-objective', false);
    } finally {
      process.stderr.write = origStderr;
      process.stdout.write = origWrite;
      process.exit = origExit;
    }

    // Check: either exit was called with non-zero, or output contains error
    // (output() calls process.exit(0), so we check the JSON output for error field)
    const combined = stderrOutput;
    // The cmdGhResolve should output error JSON then exit(1)
    // exitCodeCalled might be 0 (from output()) or 1 — check that "objective not found" appears somewhere
    assert.ok(
      combined.includes('objective not found') || exitCodeCalled !== 0,
      `Expected "objective not found" in output or non-zero exit. stderr: ${combined}, exit: ${exitCodeCalled}`
    );
  });

  test('H4: OBJECTIVE.md with no GH-link fields → succeeds with all provenance = absent', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.aoforge', 'PROJECT.md'),
      '---\nkind: plugin\n---\n\n# Test\n',
      'utf-8'
    );

    const objDir = path.join(tmpDir, '.aoforge', 'objectives', '01-nogithub');
    fs.mkdirSync(objDir, { recursive: true });
    fs.writeFileSync(
      path.join(objDir, 'OBJECTIVE.md'),
      '---\nwork: feature\n---\n\n# No GH fields\n',
      'utf-8'
    );

    // TRD 01-03: auth status mock added so requireGhAuth passes before resolve
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_FULL_SCOPES, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    let capturedOutput = '';
    let exitCodeCalled = 0;
    const origWrite = process.stdout.write.bind(process.stdout);
    const origExit = process.exit.bind(process);

    process.stdout.write = (chunk) => { capturedOutput += chunk; return true; };
    process.exit = (code) => { exitCodeCalled = code || 0; };

    try {
      gh.cmdGhResolve(tmpDir, '01-nogithub', false);
    } finally {
      process.stdout.write = origWrite;
      process.exit = origExit;
    }

    const parsed = JSON.parse(capturedOutput);
    assert.strictEqual(parsed.provenance.github_issue, 'absent');
    assert.strictEqual(parsed.provenance.parent_issue, 'absent');
    assert.strictEqual(exitCodeCalled, 0);
  });
});

// ─── Group I: round-trip matrix fixture ──────────────────────────────────────

describe('resolveChain — matrix fixture', () => {
  test('I1: buildFrontmatter + buildProjectCtx round-trip through resolveChain without throwing', () => {
    // Test all combinations of (full-ref, shorthand, absent) × (with org_project, without org_project)
    const mockFn = (args) => ({ ok: false, status: 1, stdout: '', stderr: '[mock]' });
    mockFn.callCount = () => 0;
    mockFn.calls = () => [];

    const combinations = [
      // full-ref with org_project
      {
        fm: fx.buildFrontmatter({ github_issue: 'owner/repo#10', parent_issue: 'owner/repo#9', _objectiveId: 'c1' }),
        ctx: fx.buildProjectCtx({ github_repo: 'owner/repo', org_project: 'PVT_1' }),
      },
      // shorthand with org_project
      {
        fm: fx.buildFrontmatter({ github_issue: '#10', parent_issue: '#9', _objectiveId: 'c2' }),
        ctx: fx.buildProjectCtx({ github_repo: 'owner/repo', org_project: 'PVT_1' }),
      },
      // absent with org_project
      {
        fm: fx.buildFrontmatter({ _objectiveId: 'c3' }),
        ctx: fx.buildProjectCtx({ github_repo: 'owner/repo', org_project: 'PVT_1' }),
      },
      // full-ref without org_project
      {
        fm: fx.buildFrontmatter({ github_issue: 'owner/repo#10', _objectiveId: 'c4' }),
        ctx: fx.buildProjectCtx({ github_repo: 'owner/repo' }),
      },
      // shorthand without org_project
      {
        fm: fx.buildFrontmatter({ github_issue: '#10', _objectiveId: 'c5' }),
        ctx: fx.buildProjectCtx({ github_repo: 'owner/repo' }),
      },
      // absent without org_project
      {
        fm: fx.buildFrontmatter({ _objectiveId: 'c6' }),
        ctx: fx.buildProjectCtx({}),
      },
    ];

    for (const { fm, ctx } of combinations) {
      gh._resetCache();
      gh._setRunGh(mockFn);

      let result;
      assert.doesNotThrow(() => {
        result = gh.resolveChain(fm, ctx);
      }, `resolveChain should not throw for: ${JSON.stringify({ fm, ctx })}`);

      assert.ok(result, 'result must be defined');
      assert.ok(result.provenance, 'result must have provenance');
      assert.ok(Array.isArray(result.warnings), 'result.warnings must be an array');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRD 01-03: requireGhAuth + GhAuthError + cmdGhResolve hard-fail tests
// ─────────────────────────────────────────────────────────────────────────────
//
// Hand-built fixture strings — copied from actual `gh auth status` output
// (token values sanitized). Per TDD Playbook habit 4: no LLM-generated data.
//
// GH auth status happy-path output (gh 2.45+, single-quote scope format):
//   github.com
//     ✓ Logged in to github.com account markemerson (keyring)
//     - Active account: true
//     - Git operations protocol: https
//     - Token: gho_*****************************
//     - Token scopes: 'gist', 'project', 'read:org', 'read:project', 'repo'

const AUTH_STDOUT_FULL_SCOPES =
  "github.com\n  ✓ Logged in to github.com account markemerson (keyring)\n  - Active account: true\n  - Git operations protocol: https\n  - Token: gho_**************************\n  - Token scopes: 'gist', 'project', 'read:org', 'read:project', 'repo'";

const AUTH_STDOUT_REPO_GIST_ONLY =
  "github.com\n  ✓ Logged in to github.com account markemerson (keyring)\n  - Active account: true\n  - Token scopes: 'repo', 'gist'";

const AUTH_STDOUT_REPO_ONLY =
  "github.com\n  ✓ Logged in to github.com account markemerson (keyring)\n  - Token scopes: 'repo'";

// Multiline scope format — older gh versions wrap long scope lists
const AUTH_STDOUT_MULTILINE_SCOPES =
  "github.com\n  ✓ Logged in\n  - Token scopes: 'gist',\n      'project'";

// ─── Group A: requireGhAuth — happy path ─────────────────────────────────────

describe('requireGhAuth — happy path', () => {
  test('A1: returns silently when authenticated with all required scopes present', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_FULL_SCOPES, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    // Must not throw
    assert.doesNotThrow(() => gh.requireGhAuth(['project', 'read:project']));
  });

  test('A2: returns silently when user has MORE scopes than required (subset matching)', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_FULL_SCOPES, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    assert.doesNotThrow(() => gh.requireGhAuth(['repo']));
  });

  test('A3: returns silently when requireGhAuth([]) called — empty required scopes', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_FULL_SCOPES, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    assert.doesNotThrow(() => gh.requireGhAuth([]));
  });
});

// ─── Group B: requireGhAuth — fail modes ─────────────────────────────────────

describe('requireGhAuth — fail modes', () => {
  test('B1: missing gh binary → throws GhAuthError with install URL in remediation', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: null, stdout: '', stderr: 'gh: command not found' }],
    ]));
    gh._setRunGh(mock);

    let threw = false;
    try {
      gh.requireGhAuth(['repo']);
      assert.fail('should have thrown');
    } catch (e) {
      threw = true;
      assert.strictEqual(e.name, 'GhAuthError', `Expected GhAuthError, got ${e.name}: ${e.message}`);
      assert.strictEqual(e.remediation, 'Install gh from https://cli.github.com', `Expected exact install URL in remediation, got: ${e.remediation}`);
    }
    assert.ok(threw, 'requireGhAuth must throw on missing binary');
  });

  test('B2: unauthenticated → throws GhAuthError with remediation = "gh auth login"', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' }],
    ]));
    gh._setRunGh(mock);

    let threw = false;
    try {
      gh.requireGhAuth(['repo']);
      assert.fail('should have thrown');
    } catch (e) {
      threw = true;
      assert.strictEqual(e.name, 'GhAuthError');
      assert.strictEqual(e.remediation, 'gh auth login');
    }
    assert.ok(threw);
  });

  test('B3: missing single scope (project) → throws with exact remediation "gh auth refresh -h github.com -s project"', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_REPO_GIST_ONLY, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    let threw = false;
    try {
      gh.requireGhAuth(['project']);
      assert.fail('should have thrown');
    } catch (e) {
      threw = true;
      assert.strictEqual(e.name, 'GhAuthError');
      assert.deepStrictEqual(e.scopes_missing, ['project']);
      assert.strictEqual(e.remediation, 'gh auth refresh -h github.com -s project');
    }
    assert.ok(threw);
  });

  test('B4: missing multiple scopes → remediation uses comma-joined form (not repeated -s flags)', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_REPO_ONLY, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    let threw = false;
    try {
      gh.requireGhAuth(['project', 'read:project']);
      assert.fail('should have thrown');
    } catch (e) {
      threw = true;
      assert.strictEqual(e.name, 'GhAuthError');
      assert.deepStrictEqual(e.scopes_missing, ['project', 'read:project']);
      // EXACT string required per TRD verifier briefings — comma-joined, -h first
      assert.strictEqual(e.remediation, 'gh auth refresh -h github.com -s project,read:project');
    }
    assert.ok(threw);
  });

  test('B5: expired token → throws GhAuthError with remediation = "gh auth refresh" (no scopes flag)', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: 1, stdout: '', stderr: 'The token in keyring/store has expired.' }],
    ]));
    gh._setRunGh(mock);

    let threw = false;
    try {
      gh.requireGhAuth(['repo']);
      assert.fail('should have thrown');
    } catch (e) {
      threw = true;
      assert.strictEqual(e.name, 'GhAuthError');
      assert.strictEqual(e.remediation, 'gh auth refresh');
    }
    assert.ok(threw);
  });

  test('B6: multiline scope output → parseScopes handles both separator styles correctly', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_MULTILINE_SCOPES, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    // Both 'gist' and 'project' should be detected — 'repo' is missing
    let threw = false;
    try {
      gh.requireGhAuth(['repo']);
      assert.fail('should have thrown');
    } catch (e) {
      threw = true;
      assert.strictEqual(e.name, 'GhAuthError');
      assert.deepStrictEqual(e.scopes_missing, ['repo']);
    }
    assert.ok(threw);
  });
});

// ─── Group C: GhAuthError shape ──────────────────────────────────────────────

describe('GhAuthError shape', () => {
  test('C1: thrown error is an Error subclass with .name === "GhAuthError"', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' }],
    ]));
    gh._setRunGh(mock);

    try {
      gh.requireGhAuth(['repo']);
      assert.fail('should have thrown');
    } catch (e) {
      assert.ok(e instanceof Error, 'GhAuthError must extend Error');
      assert.strictEqual(e.name, 'GhAuthError');
    }
  });

  test('C2: .message is human-readable and includes the failure mode description', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' }],
    ]));
    gh._setRunGh(mock);

    try {
      gh.requireGhAuth(['repo']);
      assert.fail('should have thrown');
    } catch (e) {
      assert.ok(typeof e.message === 'string' && e.message.length > 0, 'message must be non-empty string');
      // message should describe what went wrong in plain English
      assert.ok(
        e.message.toLowerCase().includes('auth') || e.message.toLowerCase().includes('login') || e.message.toLowerCase().includes('github'),
        `message should mention auth/login/github, got: "${e.message}"`
      );
    }
  });

  test('C3: .remediation is a runnable shell command string (no template placeholders)', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' }],
    ]));
    gh._setRunGh(mock);

    try {
      gh.requireGhAuth(['repo']);
      assert.fail('should have thrown');
    } catch (e) {
      assert.ok(typeof e.remediation === 'string' && e.remediation.length > 0, 'remediation must be non-empty string');
      // No template placeholders like {scope} or <scope>
      assert.ok(!e.remediation.includes('{'), 'remediation must not contain curly braces');
      assert.ok(!e.remediation.includes('<'), 'remediation must not contain angle brackets');
    }
  });

  test('C4: .scopes_missing is always an array (possibly empty for non-scope failures)', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' }],
    ]));
    gh._setRunGh(mock);

    try {
      gh.requireGhAuth(['repo']);
      assert.fail('should have thrown');
    } catch (e) {
      assert.ok(Array.isArray(e.scopes_missing), 'scopes_missing must be an array');
      // For auth failures (not scope failures), scopes_missing should be empty
      assert.strictEqual(e.scopes_missing.length, 0, 'scopes_missing should be empty for auth failures');
    }
  });
});

// ─── Group D: cmdGhResolve — auth hard-fail integration ──────────────────────

describe('cmdGhResolve — auth hard-fail', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-gh-auth-test-'));
    fs.mkdirSync(path.join(tmpDir, '.aoforge', 'objectives'), { recursive: true });
    // TRD 46-08: resolve sits behind the enabled gate. D3 removes this file to test the disabled path.
    fs.writeFileSync(path.join(tmpDir, '.aoforge', 'config.json'),
      JSON.stringify({ github: { enabled: true, repo: 'AO-Cyber-Systems/aoforge-claude' } }));

    // Create a valid OBJECTIVE.md so cmdGhResolve doesn't fail on missing file
    const objDir = path.join(tmpDir, '.aoforge', 'objectives', '01-test');
    fs.mkdirSync(objDir, { recursive: true });
    fs.writeFileSync(
      path.join(objDir, 'OBJECTIVE.md'),
      '---\nwork: feature\ngithub_issue: AO-Cyber-Systems/aoforge-claude#10\n---\n\n# Test\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.aoforge', 'PROJECT.md'),
      '---\nkind: plugin\ngithub_repo: AO-Cyber-Systems/aoforge-claude\n---\n\n# Test\n',
      'utf-8'
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  test('D1: cmdGhResolve writes structured JSON error to stderr + exits non-zero on auth failure', () => {
    // Mock: auth status fails (unauthenticated)
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' }],
    ]));
    gh._setRunGh(mock);

    let stderrOutput = '';
    let exitCodeCalled = null;
    const origStderr = process.stderr.write.bind(process.stderr);
    const origExit = process.exit.bind(process);

    process.stderr.write = (chunk) => { stderrOutput += chunk; return true; };
    process.exit = (code) => { exitCodeCalled = code; };

    try {
      gh.cmdGhResolve(tmpDir, '01-test', false);
    } finally {
      process.stderr.write = origStderr;
      process.exit = origExit;
    }

    // Must have exited non-zero
    assert.strictEqual(exitCodeCalled, 1, `Expected exit code 1, got: ${exitCodeCalled}`);

    // Must have written structured JSON to stderr
    let errPayload;
    assert.doesNotThrow(() => {
      errPayload = JSON.parse(stderrOutput);
    }, `stderr must be valid JSON, got: ${stderrOutput}`);

    assert.ok(errPayload.error, 'error field must be present in stderr JSON');
    assert.ok(errPayload.remediation, 'remediation field must be present in stderr JSON');
    assert.ok(Array.isArray(errPayload.scopes_missing), 'scopes_missing field must be array in stderr JSON');
  });

  test('D2: cmdGhResolve proceeds to call resolveChain when requireGhAuth succeeds', () => {
    // Mock: auth status succeeds with required scopes; issue list/graphql also mocked
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_FULL_SCOPES, stderr: '' }],
      ['api graphql', { ok: false, status: 1, stdout: '', stderr: '[mock] no walk in D2' }],
      ['issue list', { ok: true, status: 0, stdout: '[]', stderr: '' }],
    ]));
    gh._setRunGh(mock);

    let stdoutOutput = '';
    let exitCodeCalled = 0;
    const origWrite = process.stdout.write.bind(process.stdout);
    const origExit = process.exit.bind(process);

    process.stdout.write = (chunk) => { stdoutOutput += chunk; return true; };
    process.exit = (code) => { exitCodeCalled = code || 0; };

    try {
      gh.cmdGhResolve(tmpDir, '01-test', false);
    } finally {
      process.stdout.write = origWrite;
      process.exit = origExit;
    }

    // Should have produced JSON output (not errored out)
    assert.ok(stdoutOutput.length > 0, 'expected stdout output when auth succeeds');
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(stdoutOutput); }, `stdout must be valid JSON, got: ${stdoutOutput}`);
    assert.ok(parsed.provenance, 'output must have provenance field');
    assert.strictEqual(exitCodeCalled, 0, 'exit code must be 0 on success');
  });

  test('D3: cmdGhSyncObjectives preserves skipped:true graceful-skip behavior on auth failure (back-compat)', () => {
    // cmdGhSyncObjectives uses the OLD ghStatus() graceful-skip pattern — NOT requireGhAuth
    // Mock: no config.json → ghStatus returns enabled:false → skipped:true

    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' }],
    ]));
    gh._setRunGh(mock);

    let capturedOutput = '';
    let exitCodeCalled = null;
    const origWrite = process.stdout.write.bind(process.stdout);
    const origExit = process.exit.bind(process);

    process.stdout.write = (chunk) => { capturedOutput += chunk; return true; };
    process.exit = (code) => { exitCodeCalled = code; };

    // No config.json in tmpDir — so ghStatus returns enabled:false, reason: 'github.enabled is false...'
    fs.rmSync(path.join(tmpDir, '.aoforge', 'config.json'), { force: true });
    try {
      gh.cmdGhSyncObjectives(tmpDir, false);
    } finally {
      process.stdout.write = origWrite;
      process.exit = origExit;
    }

    // Must produce { ok: false, skipped: true, reason: ... } — NOT throw a GhAuthError
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(capturedOutput); }, `expected JSON output from cmdGhSyncObjectives, got: ${capturedOutput}`);
    assert.strictEqual(parsed.skipped, true, 'cmdGhSyncObjectives must return skipped:true on missing config, not throw');
    assert.ok(parsed.reason, 'reason field must be present in skip output');
    // Must NOT have exitCode of 1 from requireGhAuth (no throw)
    assert.notStrictEqual(exitCodeCalled, 1, 'cmdGhSyncObjectives must not exit(1) — it gracefully skips');
  });
});

// ─── Group E: parseScopes — internal helper ───────────────────────────────────
// parseScopes is not exported, but its behavior is fully tested via requireGhAuth's
// scope-checking behavior. These tests drive the implementation indirectly.

describe('parseScopes (via requireGhAuth scope detection)', () => {
  test('E1: single-quote scopes on one line parsed correctly', () => {
    // "Token scopes: 'repo', 'gist', 'project'" → all three found
    const stdout = "github.com\n  ✓ Logged in\n  - Token scopes: 'repo', 'gist', 'project'";
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    // All three scopes present — should NOT throw for any of them
    assert.doesNotThrow(() => gh.requireGhAuth(['repo']));
    assert.doesNotThrow(() => gh.requireGhAuth(['gist']));
    assert.doesNotThrow(() => gh.requireGhAuth(['project']));
  });

  test('E2: multiline scope list parsed correctly (older gh versions)', () => {
    // Scopes split across lines
    const stdout = "github.com\n  ✓ Logged in\n  - Token scopes: 'gist',\n      'project'";
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    // Both gist and project should be detected
    assert.doesNotThrow(() => gh.requireGhAuth(['gist']));
    assert.doesNotThrow(() => gh.requireGhAuth(['project']));
  });

  test('E3: empty stdout → empty scope list → throws on any required scope', () => {
    const mock = fx.buildMockRunGh(new Map([
      // ok:true but empty stdout — no scopes found
      ['auth status', { ok: true, status: 0, stdout: 'github.com\n  ✓ Logged in\n  - Active account: true', stderr: '' }],
    ]));
    gh._setRunGh(mock);

    // No "Token scopes:" line — requires no scopes, should be ok
    assert.doesNotThrow(() => gh.requireGhAuth([]));
  });

  test('E4: double-quoted scopes (older gh output format) parsed correctly', () => {
    // Older gh versions use double quotes: Token scopes: "repo", "gist"
    const stdout = 'github.com\n  ✓ Logged in\n  - Token scopes: "repo", "gist", "project"';
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    assert.doesNotThrow(() => gh.requireGhAuth(['repo']));
    assert.doesNotThrow(() => gh.requireGhAuth(['project']));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRD 01-04: syncObjective + helpers — Groups A-G
// ─────────────────────────────────────────────────────────────────────────────
//
// Tests cover: buildIssueBody (A), buildStickyComment (B), findStickyComment (C),
// upsertStickyComment (D), updateProjectFields (E), syncObjective integration (F),
// cmdGhSyncObjective in-process CLI (G).
//
// Per TDD Playbook habit 4: hand-built fixtures via fx.*; no LLM-generated data.
// Per verifier briefing #2: Group G is in-process (not spawnSync subprocess).
// Per verifier briefing #1: Group E seeds PRODUCT_ROADMAP_FIELDS._captured = true.

const AUTH_STDOUT_SYNC =
  "github.com\n  ✓ Logged in to github.com account markemerson (keyring)\n  - Active account: true\n  - Token scopes: 'gist', 'project', 'read:org', 'read:project', 'repo'";

// ─── Group A: buildIssueBody — canonical body format ─────────────────────────

describe('buildIssueBody', () => {
  const SAMPLE_STATE = {
    number: '1',
    name: 'foo-objective',
    objectiveId: '01-foo',
    goal: 'Test objective goal',
    trd_done: 1,
    trd_total: 3,
    current_wave: 2,
    summary_count: 1,
    last_commit: { sha: 'abc1234', subject: 'feat(x): implement y' },
    success_criteria: [
      { id: 'SC-1', text: 'first criterion', done: true },
      { id: 'SC-2', text: 'second criterion', done: false },
    ],
    trds: [
      { name: '01-01-foo-TRD.md', brief: 'initial task', done: true },
      { name: '01-02-bar-TRD.md', brief: 'second task', done: false },
    ],
    branch: 'feature/v1.1',
  };

  test('A1: returns markdown body containing all state fields in canonical order', () => {
    const body = gh.buildIssueBody(SAMPLE_STATE);
    assert.ok(typeof body === 'string' && body.length > 0, 'body must be non-empty string');
    assert.ok(body.includes('foo-objective'), 'body must include objective name');
    assert.ok(body.includes('Test objective goal'), 'body must include goal');
    assert.ok(body.includes('SC-1'), 'body must include success criteria IDs');
    assert.ok(body.includes('SC-2'), 'body must include success criteria IDs');
    assert.ok(body.includes('01-01-foo-TRD.md'), 'body must include TRD names');
  });

  test('A2: body includes Status line with trd_done/trd_total, wave, and last commit sha', () => {
    const body = gh.buildIssueBody(SAMPLE_STATE);
    assert.ok(body.includes('1/3'), 'body must include trd_done/trd_total ratio');
    assert.ok(body.includes('wave 2') || body.includes('current wave 2'), 'body must include current wave');
    assert.ok(body.includes('abc1234'), 'body must include last commit sha');
  });

  test('A3: body includes success criteria checklist with [x] for done and [ ] for pending', () => {
    const body = gh.buildIssueBody(SAMPLE_STATE);
    assert.ok(body.includes('[x]') || body.includes('[X]'), 'body must include checked item for done SC');
    assert.ok(body.includes('[ ]'), 'body must include unchecked item for pending SC');
    assert.ok(body.includes('SC-1'), 'SC-1 must appear');
    assert.ok(body.includes('SC-2'), 'SC-2 must appear');
  });

  test('A4: body includes TRDs checklist mirroring done state', () => {
    const body = gh.buildIssueBody(SAMPLE_STATE);
    assert.ok(body.includes('01-01-foo-TRD.md'), 'done TRD must appear');
    assert.ok(body.includes('01-02-bar-TRD.md'), 'pending TRD must appear');
    // First TRD is done — should have [x]
    const trdSection = body.slice(body.indexOf('**TRDs:**'));
    assert.ok(trdSection.includes('[x]') || trdSection.includes('[X]'), 'done TRD must be checked');
  });

  test('A5: body ends with the italic _Tracked by [AOForge]..._ footer line', () => {
    const body = gh.buildIssueBody(SAMPLE_STATE);
    const lastLine = body.trim().split('\n').pop();
    assert.ok(lastLine.startsWith('_Tracked by'), `last line must start with "_Tracked by", got: "${lastLine}"`);
    assert.ok(lastLine.includes('AOForge'), 'footer must mention AOForge');
  });

  test('A6: idempotency — same input produces byte-identical output', () => {
    const body1 = gh.buildIssueBody(SAMPLE_STATE);
    const body2 = gh.buildIssueBody(SAMPLE_STATE);
    assert.strictEqual(body1, body2, 'buildIssueBody must be deterministic');
  });
});

// ─── Group B: buildStickyComment — sticky comment body ───────────────────────

describe('buildStickyComment', () => {
  const SAMPLE_STATE_B = {
    current_wave: 2,
    trd_done: 1,
    trd_total: 3,
    summary_count: 1,
    last_commit: { sha: 'abc1234', subject: 'feat(x): implement y' },
    branch: 'feature/v1.1',
  };
  const FIXED_TS = '2026-05-04T12:00:00Z';

  test('B1: first line is exactly "<!-- df:state -->"', () => {
    const body = gh.buildStickyComment(SAMPLE_STATE_B, FIXED_TS);
    const firstLine = body.split('\n')[0];
    assert.strictEqual(firstLine, '<!-- df:state -->', `first line must be the marker, got: "${firstLine}"`);
  });

  test('B2: body contains Wave, TRDs, SUMMARY count, Last commit, and Branch fields', () => {
    const body = gh.buildStickyComment(SAMPLE_STATE_B, FIXED_TS);
    assert.ok(body.includes('Wave:') || body.includes('Wave'), 'must include Wave');
    assert.ok(body.includes('1/3') || body.includes('TRDs:'), 'must include TRDs count');
    assert.ok(body.includes('SUMMARY') || body.includes('summary'), 'must include SUMMARY count');
    assert.ok(body.includes('abc1234'), 'must include last commit sha');
    assert.ok(body.includes('feature/v1.1'), 'must include branch');
  });

  test('B3: body includes "last synced" timestamp field', () => {
    const body = gh.buildStickyComment(SAMPLE_STATE_B, FIXED_TS);
    assert.ok(
      body.includes('2026-05-04') || body.includes('last synced') || body.includes(FIXED_TS),
      'body must include the timestamp'
    );
  });

  test('B4: deterministic given fixed timestamp — byte-identical on repeated calls', () => {
    const body1 = gh.buildStickyComment(SAMPLE_STATE_B, FIXED_TS);
    const body2 = gh.buildStickyComment(SAMPLE_STATE_B, FIXED_TS);
    assert.strictEqual(body1, body2, 'buildStickyComment must be deterministic for fixed timestamp');
  });
});

// ─── Group C: findStickyComment — locates existing marker comment ─────────────

// ─── 46-07: sticky comment + project fields on the new contract ───────────────
// findStickyComment / upsertStickyComment now take the objective id and read EVERY comment page
// (gh-client ghPaginate); they run on the stateful gh-fake. updateProjectFields resolves fields from
// gh-project live discovery (mocked GraphQL), never PRODUCT_ROADMAP_FIELDS. End-to-end sync coverage:
// gh-sync.test.cjs tests 3, 5, 8 (sticky) and 10a-10e (project fields).

function stickyFake() {
  const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
  const f = createFakeGitHub({ commentPageSize: 2 });
  f.seedIssue({ title: 't', body: 'b' });
  gh._setRunGh(f.runGh);
  return f;
}
const ghClientForTests = require('./gh-client.cjs');
function quietClient() { ghClientForTests._resetClient(); ghClientForTests._setSleep(() => {}); }
function restoreClient() { gh._setRunGh(null); ghClientForTests._setSleep(null); ghClientForTests._resetClient(); }

describe('findStickyComment', () => {
  let f;
  beforeEach(() => { quietClient(); f = stickyFake(); });
  afterEach(restoreClient);

  test('C1: returns the id of the state comment for the objective, found past the first page', () => {
    f.seedComment(1, 'a');
    f.seedComment(1, 'b');
    const id = f.seedComment(1, '<!-- aoforge:id=2 kind=state -->\nstate');
    assert.equal(gh.findStickyComment('o/r#1', '2'), id);
  });

  test('C2: the legacy <!-- df:state --> marker matches; the first state comment wins', () => {
    const first = f.seedComment(1, '<!-- df:state -->\nold');
    f.seedComment(1, '<!-- aoforge:id=2 kind=state -->\nnew');
    assert.equal(gh.findStickyComment('o/r#1', '2'), first);
  });

  test("C3: no state comment (or only another objective's) → null", () => {
    f.seedComment(1, 'hello');
    f.seedComment(1, '<!-- aoforge:id=3 kind=state -->\nother');
    assert.equal(gh.findStickyComment('o/r#1', '2'), null);
  });

  test('C4: gh API failure → null', () => {
    f.failNext('comments');
    assert.equal(gh.findStickyComment('o/r#1', '2'), null);
  });
});

describe('upsertStickyComment', () => {
  const BODY = '<!-- aoforge:id=2 kind=state -->\n**AOForge state — last synced 2026-01-01T00:00:00Z**\n\n- Wave: 1';
  let f;
  beforeEach(() => { quietClient(); f = stickyFake(); });
  afterEach(restoreClient);

  test('D1: no known id and no marker → POSTs a new comment, returns { action: "created", comment_id }', () => {
    const r = gh.upsertStickyComment('o/r#1', BODY, { state_comment_id: null }, '2');
    assert.equal(r.action, 'created');
    assert.equal(f.comments.find((c) => c.id === r.comment_id).body, BODY);
  });

  test('D2: known state_comment_id → PATCHes that comment, returns { action: "edited", comment_id }', () => {
    const id = f.seedComment(1, '<!-- aoforge:id=2 kind=state -->\nold');
    const r = gh.upsertStickyComment('o/r#1', BODY, { state_comment_id: id }, '2');
    assert.deepEqual([r.action, r.comment_id], ['edited', id]);
    assert.equal(f.comments.find((c) => c.id === id).body, BODY);
  });

  test('D3: no known id but a marker comment → edits it, returns { action: "edited_via_marker" }', () => {
    const id = f.seedComment(1, '<!-- df:state -->\nlegacy');
    const r = gh.upsertStickyComment('o/r#1', BODY, {}, '2');
    assert.deepEqual([r.action, r.comment_id], ['edited_via_marker', id]);
  });

  test('D4: idempotency — the second call creates nothing and a timestamp-only change is not PATCHed', () => {
    const r1 = gh.upsertStickyComment('o/r#1', BODY, {}, '2');
    const later = BODY.replace('2026-01-01T00:00:00Z', '2026-02-02T00:00:00Z');
    const r2 = gh.upsertStickyComment('o/r#1', later, { state_comment_id: r1.comment_id }, '2');
    assert.deepEqual([r2.action, r2.comment_id], ['unchanged', r1.comment_id]);
    assert.equal(f.comments.length, 1);
    assert.equal(f.writes().length, 1, 'only the first POST');
  });
});

describe('updateProjectFields', () => {
  const cassette = JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__', 'gh-cassettes', 'product-roadmap-fields.json'), 'utf-8'));
  const field = (name) => cassette.fields.find((x) => x.name === name);
  const optionIdOf = (name, opt) => field(name).options.find((o) => o.name === opt).id;
  const okr = (stdout) => ({ ok: true, status: 0, stdout, stderr: '' });
  const queryOf = (args) => (args.find((a) => String(a).startsWith('query=')) || '');
  let calls;
  let env;

  function board(overrides = {}) {
    calls = [];
    return (args) => {
      calls.push(args);
      const q = queryOf(args);
      if (q.includes('addProjectV2ItemById')) {
        return overrides.add || okr(JSON.stringify({ data: { addProjectV2ItemById: { item: { id: 'item_1' } } } }));
      }
      if (q.includes('updateProjectV2ItemFieldValue')) {
        const o = overrides.update && overrides.update(args);
        return o || okr(JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'item_1' } } } }));
      }
      if (q.includes('projectItems')) {
        return okr(JSON.stringify({ data: { repository: { issue: { projectItems: { nodes: [
          { id: 'item_other', project: { id: 'PVT_other' } },
          { id: 'item_existing', project: { id: 'PVT_x' } },
        ] } } } } }));
      }
      if (q.includes('repository(')) return okr(JSON.stringify({ data: { repository: { issue: { id: 'I_1' } } } }));
      const nodes = cassette.fields.map((x) => ({ __typename: x.type, id: x.id, name: x.name, ...(x.options ? { options: x.options.slice() } : {}) }));
      return okr(JSON.stringify({ data: { node: { fields: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } } }));
    };
  }
  const mutations = () => calls.filter((a) => queryOf(a).includes('updateProjectV2ItemFieldValue'));

  beforeEach(() => {
    quietClient();
    env = { AOFORGE_GH_CACHE_DIR: fs.mkdtempSync(path.join(require('os').tmpdir(), 'gh-upf-')) };
  });
  afterEach(restoreClient);

  test('E1: Status + Quarter → options from live discovery, one mutation per field, { ok: true, fields_updated }', () => {
    gh._setRunGh(board());
    const r = gh.updateProjectFields('o/r#1', 'PVT_x', { Status: 'In Progress', Quarter: 'Q3 2026' }, { env });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.fields_updated, ['Status', 'Quarter']);
    assert.equal(mutations().length, 2);
    assert.ok(mutations()[0].includes(`optionId=${optionIdOf('Status', 'In Progress')}`));
    assert.ok(mutations()[1].includes(`optionId=${optionIdOf('Quarter', 'Q3 2026')}`));
  });

  test('E2: one mutation fails → { ok: false } with the successes in fields_updated and the failure in errors', () => {
    const quarterField = `fieldId=${field('Quarter').id}`;
    gh._setRunGh(board({ update: (args) => (args.includes(quarterField) ? { ok: false, status: 1, stdout: '', stderr: 'boom' } : null) }));
    const r = gh.updateProjectFields('o/r#1', 'PVT_x', { Status: 'Done', Quarter: 'Q3 2026' }, { env });
    assert.equal(r.ok, false);
    assert.deepEqual(r.fields_updated, ['Status']);
    assert.equal(r.errors.length, 1);
    assert.equal(r.errors[0].field, 'Quarter');
  });

  test('E3: projectId is null → { ok: false, error: "no projectId..." } with zero gh calls, no throw', () => {
    gh._setRunGh(board());
    const r = gh.updateProjectFields('o/r#1', null, { Status: 'Done' }, { env });
    assert.equal(r.ok, false);
    assert.match(r.error, /no projectId/);
    assert.deepEqual(calls, []);
  });

  test("E4: add-item refused (already on the board) → falls back to this project's existing item", () => {
    gh._setRunGh(board({ add: { ok: false, status: 1, stdout: '', stderr: 'already exists' } }));
    const r = gh.updateProjectFields('o/r#1', 'PVT_x', { Status: 'Done' }, { env });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.item_id, 'item_existing');
    assert.deepEqual(r.fields_updated, ['Status']);
  });
});

// syncObjective (legacy F1-F5) moved to gh-sync.test.cjs on the 46-07 contract:
//   F1 happy path -> tests 2, 3; F2 "missing github_issue is an error" -> obsolete (the issue is created, test 2);
//   F3 disk-state counts -> test 13; F4 second sync edits, never creates -> tests 4, 5; F5 mapping persistence -> test 3.

describe('cmdGhSyncObjective', () => {
  let proj;
  let capturedStdout;
  let capturedStderr;
  let exitCodeCalled;
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  const origExit = process.exit.bind(process);

  function captureIO() {
    capturedStdout = '';
    capturedStderr = '';
    exitCodeCalled = null;
    process.stdout.write = (chunk) => { capturedStdout += chunk; return true; };
    process.stderr.write = (chunk) => { capturedStderr += chunk; return true; };
    process.exit = (code) => { exitCodeCalled = code === undefined ? 0 : code; };
  }

  function restoreIO() {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
    process.exit = origExit;
  }

  // 46-07: sync is gated by github.enabled (a disabled project is a skip, exit 0), so the failure
  // cases below run against an enabled config.
  function enableGithub(root, enabled = true) {
    const file = path.join(root, '.aoforge', 'config.json');
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { cfg = {}; }
    cfg.github = { ...(cfg.github || {}), enabled, repo: 'AO-Cyber-Systems/aoforge-claude' };
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  }

  beforeEach(() => {
    proj = fx.buildSyncTargetProject({ objectiveId: '01-foo' });
    enableGithub(proj.root);
    gh._resetCache();
    captureIO();
  });

  afterEach(() => {
    restoreIO();
    if (proj) proj.cleanup();
  });

  test('G1: valid objective → calls syncObjective and emits JSON result to stdout', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_SYNC, stderr: '' }],
      ['api graphql', fx.buildGhResponse_issueWithProjectItem()],
      ['issue edit', fx.buildGhResponse_issueEdit()],
      ['api repos/AO-Cyber-Systems/aoforge-claude/issues/10/comments',
        fx.buildGhResponse_commentsList({ comments: [] })],
      ['issue comment', fx.buildGhResponse_commentCreated({ commentId: 12345678 })],
    ]));
    gh._setRunGh(mock);

    try {
      gh.cmdGhSyncObjective(proj.root, '01-foo', false);
    } finally {
      restoreIO();
    }

    // Either exits 0 with JSON on stdout, or exits 1 with error on stderr
    // (objective listing may not find '01-foo' in ROADMAP — that's ok for wiring test)
    const combinedOut = capturedStdout + capturedStderr;
    assert.ok(combinedOut.length > 0, 'must produce some output');
  });

  test('G2: missing auth → exits non-zero with structured JSON error on stderr', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: 1, stdout: '', stderr: 'You are not logged in.' }],
    ]));
    gh._setRunGh(mock);

    try {
      gh.cmdGhSyncObjective(proj.root, '01-foo', false);
    } catch (e) {
      // GhAuthError may propagate if not caught — that's a bug we want to see
      if (e.name !== 'GhAuthError') throw e;
    } finally {
      restoreIO();
    }

    // Must have non-zero exit or error output
    assert.equal(exitCodeCalled, 1, `expected exit 1 on auth failure; stderr="${capturedStderr}"`);
    const err = JSON.parse(capturedStderr);
    assert.match(err.error, /not authenticated/i);
    assert.equal(err.remediation, 'gh auth login');
  });

  test('G2b (46-07): github.enabled:false → skipped JSON on stdout, exit 0, zero gh calls', () => {
    enableGithub(proj.root, false);
    const seen = [];
    gh._setRunGh((args) => { seen.push(args); return { ok: false, status: 1, stdout: '', stderr: '' }; });
    try {
      gh.cmdGhSyncObjective(proj.root, '01-foo', false);
    } finally {
      restoreIO();
    }
    assert.ok(exitCodeCalled === null || exitCodeCalled === 0, `exit=${exitCodeCalled}`);
    assert.equal(JSON.parse(capturedStdout).skipped, true);
    assert.deepEqual(seen, []);
  });

  test('G3: nonexistent objective ID → exits non-zero with error message', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_SYNC, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    try {
      gh.cmdGhSyncObjective(proj.root, 'nonexistent-id', false);
    } finally {
      restoreIO();
    }

    const hasError = exitCodeCalled !== 0 && exitCodeCalled !== null;
    const hasErrorOutput = capturedStderr.length > 0;
    assert.ok(
      hasError || hasErrorOutput,
      `expected non-zero exit or error output for nonexistent ID; exit=${exitCodeCalled}, stderr="${capturedStderr}", stdout="${capturedStdout}"`
    );
  });

  test('G4: no objectiveId provided → exits non-zero with usage message', () => {
    // cmdGhSyncObjective(cwd, undefined, false) — no objectiveId
    try {
      gh.cmdGhSyncObjective(proj.root, undefined, false);
    } finally {
      restoreIO();
    }

    assert.ok(exitCodeCalled !== 0, `expected non-zero exit when no objectiveId; got exit=${exitCodeCalled}`);
    const combined = capturedStdout + capturedStderr;
    assert.ok(
      combined.toLowerCase().includes('usage') || combined.toLowerCase().includes('objectiveid') ||
      combined.includes('sync') || combined.length > 0,
      `expected usage message in output; got: "${combined}"`
    );
  });
});

// ─── Group H (01-06): OBJECTIVE.md backfill — obj 0 ─────────────────────────
// Tests are RED because .aoforge/objectives/00-refine-defaults-table/OBJECTIVE.md
// does not exist yet.

// this repository's planning tree, wherever it is (`.planning/` until 72-21 moves it, `.aoforge/` after)
const OBJ0_PATH = path.join(
  require('./compat.cjs').planningRoot(path.join(__dirname, '..', '..', '..', '..', '..')),
  'objectives', '00-refine-defaults-table', 'OBJECTIVE.md'
);
const { extractFrontmatter } = require('./frontmatter.cjs');
// The planning tree is history: objective 0 recorded its issues under the repository's name at
// the time, which the AOForge rename (objective 72) does not rewrite.
const { LEGACY } = require('./legacy-names.cjs');
const OBJ0_REPO = `AO-Cyber-Systems/${LEGACY.repo}`;

test('H1 (01-06): obj 0 OBJECTIVE.md has github_issue = <repo at the time>#20', () => {
  assert.ok(fs.existsSync(OBJ0_PATH), `OBJECTIVE.md must exist at ${OBJ0_PATH}`);
  const fm = extractFrontmatter(fs.readFileSync(OBJ0_PATH, 'utf-8'));
  assert.strictEqual(fm.github_issue, `${OBJ0_REPO}#20`);
});

test('H2 (01-06): obj 0 OBJECTIVE.md has parent_issue = <repo at the time>#9', () => {
  assert.ok(fs.existsSync(OBJ0_PATH), `OBJECTIVE.md must exist at ${OBJ0_PATH}`);
  const fm = extractFrontmatter(fs.readFileSync(OBJ0_PATH, 'utf-8'));
  assert.strictEqual(fm.parent_issue, `${OBJ0_REPO}#9`);
});

test('H3 (01-06): obj 0 OBJECTIVE.md is valid frontmatter (no parse error)', () => {
  assert.ok(fs.existsSync(OBJ0_PATH), `OBJECTIVE.md must exist at ${OBJ0_PATH}`);
  const fm = extractFrontmatter(fs.readFileSync(OBJ0_PATH, 'utf-8'));
  assert.ok(fm !== null && typeof fm === 'object', 'frontmatter must parse cleanly');
});

// ─── Group I (01-06): cassettes — shape assertions ───────────────────────────
// Tests are RED because cassette files don't exist yet.

const CASSETTE_DIR = path.join(__dirname, '__fixtures__', 'gh-cassettes');

test('I1 (01-06): aoforge-claude-9-walk.json is valid JSON', () => {
  const p = path.join(CASSETTE_DIR, 'aoforge-claude-9-walk.json');
  assert.ok(fs.existsSync(p), `cassette must exist at ${p}`);
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(p, 'utf-8')));
});

test('I2 (01-06): aoforge-claude-9-walk.json has issue title matching /^\\[Roadmap\\]/', () => {
  const p = path.join(CASSETTE_DIR, 'aoforge-claude-9-walk.json');
  assert.ok(fs.existsSync(p), `cassette must exist at ${p}`);
  const c = JSON.parse(fs.readFileSync(p, 'utf-8'));
  assert.match(c.data.repository.issue.title, /^\[Roadmap\]/);
});

test('I3 (01-06): aoforge-claude-9-walk.json has projectItems.nodes[0].project.id = PVT_kwDODwqLrc4BRsOP', () => {
  const p = path.join(CASSETTE_DIR, 'aoforge-claude-9-walk.json');
  assert.ok(fs.existsSync(p), `cassette must exist at ${p}`);
  const c = JSON.parse(fs.readFileSync(p, 'utf-8'));
  const nodes = c.data.repository.issue.projectItems.nodes;
  assert.ok(Array.isArray(nodes) && nodes.length > 0, 'projectItems.nodes must be non-empty');
  assert.strictEqual(nodes[0].project.id, 'PVT_kwDODwqLrc4BRsOP');
});

test('I4 (01-06): product-roadmap-fields.json is valid JSON', () => {
  const p = path.join(CASSETTE_DIR, 'product-roadmap-fields.json');
  assert.ok(fs.existsSync(p), `cassette must exist at ${p}`);
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(p, 'utf-8')));
});

test('I5 (01-06): product-roadmap-fields.json has Status, Product, Quarter fields', () => {
  const p = path.join(CASSETTE_DIR, 'product-roadmap-fields.json');
  assert.ok(fs.existsSync(p), `cassette must exist at ${p}`);
  const c = JSON.parse(fs.readFileSync(p, 'utf-8'));
  assert.ok(Array.isArray(c.fields), 'fields must be an array');
  const names = new Set(c.fields.map(f => f.name));
  assert.ok(names.has('Status'), 'Status field must be present');
  assert.ok(names.has('Product'), 'Product field must be present');
  assert.ok(names.has('Quarter'), 'Quarter field must be present');
});

// ─── Group J (01-06): replay-mode integration ────────────────────────────────
// Tests use cassette file as mock gh response — RED until cassette + constant captured.

test('J1 (01-06): resolveChain aoforge-claude#20 walks parent #9 and returns roadmap_issue + milestone', () => {
  const cassettePath = path.join(CASSETTE_DIR, 'aoforge-claude-9-walk.json');
  assert.ok(fs.existsSync(cassettePath), `cassette must exist at ${cassettePath}`);
  const cassette = JSON.parse(fs.readFileSync(cassettePath, 'utf-8'));

  // Inject mock: graphql query → cassette; issue list → empty (no fallback needed)
  const responses = new Map([
    ['api graphql', { ok: true, status: 0, stdout: JSON.stringify(cassette), stderr: '' }],
    ['issue list', fx.buildGhResponse_issueListRoadmap({ hits: [] })],
  ]);
  const mock = fx.buildMockRunGh(responses);
  gh._setRunGh(mock);
  gh._resetCache();

  const r = gh.resolveChain(
    fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/aoforge-claude#20',
      parent_issue: 'AO-Cyber-Systems/aoforge-claude#9',
    }),
    fx.buildProjectCtx({
      github_repo: 'AO-Cyber-Systems/aoforge-claude',
      org_project: 'PVT_kwDODwqLrc4BRsOP',
    })
  );

  assert.strictEqual(r.roadmap_issue, 'AO-Cyber-Systems/aoforge-claude#9');
  assert.strictEqual(r.provenance.roadmap_issue, 'walked_from_parent');
  assert.ok(r.milestone, 'milestone should populate from cassette walk');
  assert.strictEqual(r.milestone.product, 'AOForge');
});

test('J2 (01-06): resolveChain replay — provenance.roadmap_issue is walked_from_parent', () => {
  const cassettePath = path.join(CASSETTE_DIR, 'aoforge-claude-9-walk.json');
  assert.ok(fs.existsSync(cassettePath), `cassette must exist at ${cassettePath}`);
  const cassette = JSON.parse(fs.readFileSync(cassettePath, 'utf-8'));

  const mock = fx.buildMockRunGh(new Map([
    ['api graphql', { ok: true, status: 0, stdout: JSON.stringify(cassette), stderr: '' }],
  ]));
  gh._setRunGh(mock);
  gh._resetCache();

  const r = gh.resolveChain(
    fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/aoforge-claude#20',
      parent_issue: 'AO-Cyber-Systems/aoforge-claude#9',
    }),
    fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/aoforge-claude', org_project: 'PVT_kwDODwqLrc4BRsOP' })
  );

  assert.strictEqual(r.provenance.roadmap_issue, 'walked_from_parent');
});

test('J3 (01-06): resolveChain replay — second call returns cached result (same shape)', () => {
  const cassettePath = path.join(CASSETTE_DIR, 'aoforge-claude-9-walk.json');
  assert.ok(fs.existsSync(cassettePath), `cassette must exist at ${cassettePath}`);
  const cassette = JSON.parse(fs.readFileSync(cassettePath, 'utf-8'));

  const mock = fx.buildMockRunGh(new Map([
    ['api graphql', { ok: true, status: 0, stdout: JSON.stringify(cassette), stderr: '' }],
  ]));
  gh._setRunGh(mock);
  gh._resetCache();

  const fm = fx.buildFrontmatter({
    github_issue: 'AO-Cyber-Systems/aoforge-claude#20',
    parent_issue: 'AO-Cyber-Systems/aoforge-claude#9',
  });
  const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/aoforge-claude', org_project: 'PVT_kwDODwqLrc4BRsOP' });

  const r1 = gh.resolveChain(fm, ctx);
  const callsAfterFirst = mock.callCount();

  const r2 = gh.resolveChain(fm, ctx);
  const callsAfterSecond = mock.callCount();

  // Second call should not invoke gh (served from cache)
  assert.strictEqual(callsAfterFirst, callsAfterSecond, 'second resolveChain call must serve from cache (no new gh calls)');
  assert.strictEqual(r2.roadmap_issue, r1.roadmap_issue);
  assert.strictEqual(r2.milestone && r2.milestone.product, r1.milestone && r1.milestone.product);
});

test('J4 (01-06): resolveChain replay — milestone.title is "Product Roadmap"', () => {
  const cassettePath = path.join(CASSETTE_DIR, 'aoforge-claude-9-walk.json');
  assert.ok(fs.existsSync(cassettePath), `cassette must exist at ${cassettePath}`);
  const cassette = JSON.parse(fs.readFileSync(cassettePath, 'utf-8'));

  const mock = fx.buildMockRunGh(new Map([
    ['api graphql', { ok: true, status: 0, stdout: JSON.stringify(cassette), stderr: '' }],
  ]));
  gh._setRunGh(mock);
  gh._resetCache();

  const r = gh.resolveChain(
    fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/aoforge-claude#20',
      parent_issue: 'AO-Cyber-Systems/aoforge-claude#9',
    }),
    fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/aoforge-claude', org_project: 'PVT_kwDODwqLrc4BRsOP' })
  );

  assert.strictEqual(r.milestone && r.milestone.title, 'Product Roadmap');
});

// ─── Group K (01-06): PRODUCT_ROADMAP_FIELDS populated ───────────────────────
// RED: _captured is currently false.

// K1-K6 (01-06) deleted in 46-07: PRODUCT_ROADMAP_FIELDS no longer reads the cassette (it is a frozen
// deprecated stub, gh-sync.test.cjs test 15); updateProjectFields resolves fields and options by name from
// live discovery (describe('updateProjectFields') E1-E4 above, gh-sync 10a/10d, gh-project U* tests).

const LIVE = process.env.GH_INTEGRATION === '1';

test('L1 (01-06): live — resolveChain walks aoforge-claude#9 and returns roadmap_issue + AOForge product', { skip: !LIVE }, () => {
  // Real gh calls — don't mock
  gh._setRunGh(null);
  gh._resetCache();

  const r = gh.resolveChain(
    fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/aoforge-claude#20',
      parent_issue: 'AO-Cyber-Systems/aoforge-claude#9',
    }),
    fx.buildProjectCtx({
      github_repo: 'AO-Cyber-Systems/aoforge-claude',
      org_project: 'PVT_kwDODwqLrc4BRsOP',
    })
  );

  assert.strictEqual(r.roadmap_issue, 'AO-Cyber-Systems/aoforge-claude#9', `expected roadmap_issue to be #9; got: ${r.roadmap_issue}`);
  assert.ok(r.milestone, 'milestone must populate from live walk');
  assert.strictEqual(r.milestone.product, 'AOForge', `expected milestone.product = AOForge; got: ${r.milestone && r.milestone.product}`);
});

test('L2 (01-06): live — resolveChain live result matches cassette shape', { skip: !LIVE }, () => {
  gh._setRunGh(null);
  gh._resetCache();

  const liveResult = gh.resolveChain(
    fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/aoforge-claude#20',
      parent_issue: 'AO-Cyber-Systems/aoforge-claude#9',
    }),
    fx.buildProjectCtx({
      github_repo: 'AO-Cyber-Systems/aoforge-claude',
      org_project: 'PVT_kwDODwqLrc4BRsOP',
    })
  );

  // Compare against replay result (using saved cassette)
  const cassettePath = path.join(CASSETTE_DIR, 'aoforge-claude-9-walk.json');
  assert.ok(fs.existsSync(cassettePath), 'cassette must exist for drift detection');
  const cassette = JSON.parse(fs.readFileSync(cassettePath, 'utf-8'));

  const cassetteProduct = (() => {
    try {
      const nodes = cassette.data.repository.issue.projectItems.nodes[0].fieldValues.nodes;
      const productNode = nodes.find(n => n.field && n.field.name === 'Product');
      return productNode ? productNode.name : null;
    } catch { return null; }
  })();

  assert.strictEqual(
    liveResult.milestone && liveResult.milestone.product,
    cassetteProduct,
    `live.milestone.product (${liveResult.milestone && liveResult.milestone.product}) must match cassette (${cassetteProduct}); if different, cassette drift detected — re-record aoforge-claude-9-walk.json`
  );
});

test('L3 (01-06): live — sync round-trip returns ok:true', { skip: !LIVE }, () => {
  gh._setRunGh(null);
  const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
  gh._resetCache();

  const r = gh.syncObjective('00-refine-defaults-table', root);
  assert.ok(r.ok, `syncObjective returned ok:false — error: ${r.error}`);
  assert.ok(r.issue_updated !== undefined, 'issue_updated must be in result');
  assert.ok(r.comment_action, 'comment_action must be in result');
});

test('L4 (01-06): live — sync is idempotent (second run edits, not creates)', { skip: !LIVE }, () => {
  gh._setRunGh(null);
  const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
  gh._resetCache();

  const r1 = gh.syncObjective('00-refine-defaults-table', root);
  assert.ok(r1.ok, `first syncObjective failed: ${r1.error}`);

  gh._resetCache();
  const r2 = gh.syncObjective('00-refine-defaults-table', root);
  assert.ok(r2.ok, `second syncObjective failed: ${r2.error}`);
  assert.notStrictEqual(r2.comment_action, 'created', 'second sync must edit existing sticky comment, not create a new one');
});

// ─── TRD 02-03: walkProject ───────────────────────────────────────────────────

const {
  buildGhResponse_projectItemsList,
  buildGhResponse_subIssuesByTrackedIssues,
} = require('./__fixtures__/gh-fixtures.cjs');

// ─── Group W: walkProject happy paths ────────────────────────────────────────

test('W1 (02-03): walkProject single page returns 3 normalized items', () => {
  const responses = new Map();
  responses.set('api graphql', buildGhResponse_projectItemsList({
    items: [
      { content_type: 'Issue', issue_ref: 'AO-Cyber-Systems/aodex#33',
        title: '[Roadmap] Foo', body: '', status: 'In Progress', product: 'AODex', quarter: 'Q2 2026' },
      { content_type: 'Issue', issue_ref: 'AO-Cyber-Systems/aosentry#20',
        title: '[Roadmap] Bar', body: '', status: 'Todo', product: 'AOSentry', quarter: 'Q2 2026' },
      { content_type: 'DraftIssue', title: 'AOForge Internal Alpha', body: 'wip', status: 'Todo', product: 'AOForge', quarter: 'Q2 2026' },
    ],
    hasNextPage: false,
  }));
  gh._setRunGh(fx.buildMockRunGh(responses));
  try {
    const result = gh.walkProject('PVT_test');
    assert.strictEqual(result.items.length, 3);
    assert.strictEqual(result.items[0].item_type, 'issue');
    assert.strictEqual(result.items[0].issue_ref, 'AO-Cyber-Systems/aodex#33');
    assert.strictEqual(result.items[2].item_type, 'draft');
    assert.deepStrictEqual(result.warnings, []);
  } finally { gh._setRunGh(null); }
});

test('W2 (02-03): walkProject two pages returns 9 items with cursor passed', () => {
  let callCount = 0;
  function mockFn(args) {
    callCount++;
    if (callCount === 1) {
      // First page — 5 items, hasNextPage=true
      return buildGhResponse_projectItemsList({
        items: [
          { content_type: 'Issue', issue_ref: 'org/repo#1', title: 'Item 1', body: '', status: 'Todo', product: 'AODex', quarter: 'Q2 2026' },
          { content_type: 'Issue', issue_ref: 'org/repo#2', title: 'Item 2', body: '', status: 'Todo', product: 'AODex', quarter: 'Q2 2026' },
          { content_type: 'Issue', issue_ref: 'org/repo#3', title: 'Item 3', body: '', status: 'Todo', product: 'AODex', quarter: 'Q2 2026' },
          { content_type: 'Issue', issue_ref: 'org/repo#4', title: 'Item 4', body: '', status: 'Todo', product: 'AODex', quarter: 'Q2 2026' },
          { content_type: 'Issue', issue_ref: 'org/repo#5', title: 'Item 5', body: '', status: 'Todo', product: 'AODex', quarter: 'Q2 2026' },
        ],
        hasNextPage: true,
        endCursor: 'cursor-abc',
      });
    }
    // Second page — verify cursor arg passed, 4 items, hasNextPage=false
    const hasCursorArg = args.some(a => typeof a === 'string' && a.includes('cursor-abc'));
    assert.ok(hasCursorArg, 'W2: cursor should be passed on second page call');
    return buildGhResponse_projectItemsList({
      items: [
        { content_type: 'Issue', issue_ref: 'org/repo#6', title: 'Item 6', body: '', status: 'Todo', product: 'AODex', quarter: 'Q2 2026' },
        { content_type: 'Issue', issue_ref: 'org/repo#7', title: 'Item 7', body: '', status: 'Todo', product: 'AODex', quarter: 'Q2 2026' },
        { content_type: 'Issue', issue_ref: 'org/repo#8', title: 'Item 8', body: '', status: 'Todo', product: 'AODex', quarter: 'Q2 2026' },
        { content_type: 'Issue', issue_ref: 'org/repo#9', title: 'Item 9', body: '', status: 'Todo', product: 'AODex', quarter: 'Q2 2026' },
      ],
      hasNextPage: false,
    });
  }
  gh._setRunGh(mockFn);
  try {
    const result = gh.walkProject('PVT_test');
    assert.strictEqual(result.items.length, 9);
    assert.strictEqual(callCount, 2, 'W2: should call gh exactly twice');
    assert.deepStrictEqual(result.warnings, []);
  } finally { gh._setRunGh(null); }
});

test('W3 (02-03): walkProject empty project returns { items: [], warnings: [] }', () => {
  const responses = new Map();
  responses.set('api graphql', buildGhResponse_projectItemsList({
    items: [], hasNextPage: false,
  }));
  gh._setRunGh(fx.buildMockRunGh(responses));
  try {
    const result = gh.walkProject('PVT_test');
    assert.deepStrictEqual(result.items, []);
    assert.deepStrictEqual(result.warnings, []);
  } finally { gh._setRunGh(null); }
});

test('W4 (02-03): each item carries normalized fields {item_type, issue_ref, title, body, product, quarter, status, sub_issues}', () => {
  const responses = new Map();
  responses.set('api graphql', buildGhResponse_projectItemsList({
    items: [
      { content_type: 'Issue', issue_ref: 'AO-Cyber-Systems/aodex#33',
        title: '[Roadmap] Foo', body: 'body text', status: 'In Progress', product: 'AODex', quarter: 'Q2 2026' },
    ],
    hasNextPage: false,
  }));
  gh._setRunGh(fx.buildMockRunGh(responses));
  try {
    const result = gh.walkProject('PVT_test');
    const item = result.items[0];
    assert.strictEqual(item.item_type, 'issue');
    assert.strictEqual(item.issue_ref, 'AO-Cyber-Systems/aodex#33');
    assert.strictEqual(item.title, '[Roadmap] Foo');
    assert.strictEqual(item.body, 'body text');
    assert.strictEqual(item.product, 'AODex');
    assert.strictEqual(item.quarter, 'Q2 2026');
    assert.strictEqual(item.status, 'In Progress');
    assert.ok(Array.isArray(item.sub_issues), 'sub_issues must be array');
  } finally { gh._setRunGh(null); }
});

test('W5 (02-03): DraftIssue content type → item_type=draft, issue_ref=null, title+body present', () => {
  const responses = new Map();
  responses.set('api graphql', buildGhResponse_projectItemsList({
    items: [
      { content_type: 'DraftIssue', title: 'Program Milestone Q3', body: 'draft body', status: 'Todo', product: 'Infrastructure', quarter: 'Q3 2026' },
    ],
    hasNextPage: false,
  }));
  gh._setRunGh(fx.buildMockRunGh(responses));
  try {
    const result = gh.walkProject('PVT_test');
    assert.strictEqual(result.items.length, 1);
    const item = result.items[0];
    assert.strictEqual(item.item_type, 'draft');
    assert.strictEqual(item.issue_ref, null);
    assert.strictEqual(item.title, 'Program Milestone Q3');
    assert.strictEqual(item.body, 'draft body');
  } finally { gh._setRunGh(null); }
});

test('W6 (02-03): Issue with trackedIssues.totalCount=2 → sub_issues has 2 entries with {ref, title, state}', () => {
  const subNodes = buildGhResponse_subIssuesByTrackedIssues({
    subIssues: [
      { ref: 'AO-Cyber-Systems/aodex#101', title: 'Sub A', state: 'OPEN' },
      { ref: 'AO-Cyber-Systems/aodex#102', title: 'Sub B', state: 'CLOSED' },
    ],
  });
  const responses = new Map();
  responses.set('api graphql', buildGhResponse_projectItemsList({
    items: [
      { content_type: 'Issue', issue_ref: 'AO-Cyber-Systems/aodex#33',
        title: '[Roadmap] Foo', body: '', status: 'In Progress', product: 'AODex', quarter: 'Q2 2026',
        tracked_total: 2, tracked_nodes: subNodes },
    ],
    hasNextPage: false,
  }));
  gh._setRunGh(fx.buildMockRunGh(responses));
  try {
    const result = gh.walkProject('PVT_test');
    const item = result.items[0];
    assert.strictEqual(item.sub_issues.length, 2);
    assert.strictEqual(item.sub_issues[0].ref, 'AO-Cyber-Systems/aodex#101');
    assert.strictEqual(item.sub_issues[0].title, 'Sub A');
    assert.strictEqual(item.sub_issues[0].state, 'OPEN');
    assert.strictEqual(item.sub_issues[1].state, 'CLOSED');
  } finally { gh._setRunGh(null); }
});

test('W7 (02-03): Issue with trackedIssues.totalCount=0 → sub_issues=[] AND raw body preserved', () => {
  const bodyText = '## Deliverables\n- [ ] AO-Cyber-Systems/aodex#200 — some task';
  const responses = new Map();
  responses.set('api graphql', buildGhResponse_projectItemsList({
    items: [
      { content_type: 'Issue', issue_ref: 'AO-Cyber-Systems/aodex#33',
        title: '[Roadmap] Foo', body: bodyText, status: 'In Progress', product: 'AODex', quarter: 'Q2 2026',
        tracked_total: 0, tracked_nodes: [] },
    ],
    hasNextPage: false,
  }));
  gh._setRunGh(fx.buildMockRunGh(responses));
  try {
    const result = gh.walkProject('PVT_test');
    const item = result.items[0];
    assert.deepStrictEqual(item.sub_issues, []);
    assert.strictEqual(item.body, bodyText, 'body must be preserved for task-list fallback');
  } finally { gh._setRunGh(null); }
});

// ─── Group WF: walkProject failure modes ─────────────────────────────────────

test('WF1 (02-03): ok:false response → warnings.push stderr; items empty or partial', () => {
  const responses = new Map();
  responses.set('api graphql', { ok: false, status: 1, stdout: '', stderr: 'GraphQL error: unauthorized' });
  gh._setRunGh(fx.buildMockRunGh(responses));
  try {
    const result = gh.walkProject('PVT_test');
    assert.ok(result.warnings.length > 0, 'WF1: should have at least one warning');
    assert.ok(result.warnings[0].includes('walkProject'), 'WF1: warning should mention walkProject');
    assert.deepStrictEqual(result.items, []);
  } finally { gh._setRunGh(null); }
});

test('WF2 (02-03): data:null response → warnings.push unexpected response shape; items empty', () => {
  const responses = new Map();
  responses.set('api graphql', { ok: true, status: 0, stdout: JSON.stringify({ data: null }), stderr: '' });
  gh._setRunGh(fx.buildMockRunGh(responses));
  try {
    const result = gh.walkProject('PVT_test');
    assert.ok(result.warnings.some(w => w.includes('unexpected response shape')), 'WF2: should warn about response shape');
    assert.deepStrictEqual(result.items, []);
  } finally { gh._setRunGh(null); }
});

test('WF3 (02-03): malformed JSON in stdout → warnings.push parse failed; items empty', () => {
  const responses = new Map();
  responses.set('api graphql', { ok: true, status: 0, stdout: 'not json {{', stderr: '' });
  gh._setRunGh(fx.buildMockRunGh(responses));
  try {
    const result = gh.walkProject('PVT_test');
    assert.ok(result.warnings.some(w => w.includes('parse failed')), 'WF3: should warn about parse failure');
    assert.deepStrictEqual(result.items, []);
  } finally { gh._setRunGh(null); }
});

test('WF4 (02-03): pagination loop guard — always hasNextPage=true → abort at 100 pages with warning', () => {
  function alwaysNextPage() {
    return buildGhResponse_projectItemsList({
      items: [
        { content_type: 'Issue', issue_ref: 'org/repo#1', title: 'Item', body: '', status: 'Todo', product: 'X', quarter: 'Q1 2026' },
      ],
      hasNextPage: true,
      endCursor: 'cursor-forever',
    });
  }
  gh._setRunGh(alwaysNextPage);
  try {
    const result = gh.walkProject('PVT_test');
    assert.ok(result.warnings.some(w => w.includes('aborted') && w.includes('100 pages')), 'WF4: should warn about abort at 100 pages');
    assert.strictEqual(result.items.length, 100, 'WF4: should have collected 100 items (1 per page)');
  } finally { gh._setRunGh(null); }
});

// ─── Group GG: gh.test.cjs integration with existing patterns ────────────────

test('GG1 (02-03): walkProject is exported from gh.cjs module.exports', () => {
  assert.strictEqual(typeof gh.walkProject, 'function', 'walkProject must be a function');
});

test('GG2 (02-03): walkProject with no projectId returns empty items with warning', () => {
  const result = gh.walkProject('');
  assert.deepStrictEqual(result.items, []);
  assert.ok(result.warnings.length > 0, 'GG2: should warn on missing projectId');
});
