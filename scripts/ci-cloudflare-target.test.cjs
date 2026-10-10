'use strict';

/**
 * Tests for the Cloudflare deploy-target report (objective 74, TRD 74-02).
 *
 * The script exists so that a public CI log can say which Cloudflare account a deploy
 * targets, by name, without ever printing an account id or a token. The property that
 * matters most is therefore the negative one (cases 7 and 10): no id, no token, no 32-hex
 * string may reach stdout or stderr. No case touches the network: `fetch` is injected and
 * built from the fixture module.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { scrub, summarizeTarget, main } = require('./ci-cloudflare-target.cjs');
const fx = require('./__fixtures__/cloudflare-api-fixtures.cjs');

const PREFIX = 'cloudflare target: ';
const ACCOUNT_PATH = `/client/v4/accounts/${fx.ACCOUNT_ID}`;
const ACCOUNTS_PATH = '/client/v4/accounts';
const PROJECTS_PATH = `/client/v4/accounts/${fx.ACCOUNT_ID}/pages/projects`;

const SECRETS = { CLOUDFLARE_API_TOKEN: fx.TOKEN, CLOUDFLARE_ACCOUNT_ID: fx.ACCOUNT_ID };

/** Run `main` with an injected fetch; collect what it printed and which calls it made. */
async function run(argv, { env = SECRETS, routes = {} } = {}) {
  const fetch = fx.fakeFetch(routes);
  const out = [];
  const err = [];
  const code = await main(argv, {
    env,
    fetch,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  });
  return { code, out, err, calls: fetch.calls, text: [...out, ...err].join('\n') };
}

/** Routes for an account the token can see, with the given Pages projects. */
function healthyRoutes(projects = ['aoforge-docs', 'example-site']) {
  return {
    [ACCOUNT_PATH]: fx.accountResponse('Example Account'),
    [ACCOUNTS_PATH]: fx.accountsResponse([
      { id: fx.ACCOUNT_ID, name: 'Example Account' },
      { id: fx.OTHER_ACCOUNT_ID, name: 'Other Account' },
    ]),
    [PROJECTS_PATH]: fx.projectsResponse(projects),
  };
}

const ARGV = ['--project', 'aoforge-docs'];

describe('ci-cloudflare-target main', () => {
  test('1a. no CLOUDFLARE_API_TOKEN: says the secrets are not available, exits 0, never calls the API', async () => {
    const r = await run(ARGV, { env: { CLOUDFLARE_ACCOUNT_ID: fx.ACCOUNT_ID } });
    assert.equal(r.code, 0);
    assert.equal(r.calls.length, 0);
    assert.match(
      r.text,
      /Cloudflare secrets are not available to this run \(a fork's pull request, or unset\): nothing to check/
    );
  });

  test('1b. no CLOUDFLARE_ACCOUNT_ID, or empty secrets: same, exit 0, no fetch', async () => {
    for (const env of [{ CLOUDFLARE_API_TOKEN: fx.TOKEN }, { CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ACCOUNT_ID: '' }, {}]) {
      const r = await run(ARGV, { env });
      assert.equal(r.code, 0);
      assert.equal(r.calls.length, 0);
      assert.match(r.text, /not available to this run/);
    }
  });

  test('2. account visible, project present: names the account, the count of others, the projects and "aoforge-docs: present"', async () => {
    const r = await run(ARGV, { routes: healthyRoutes() });
    assert.equal(r.code, 0);
    assert.match(r.text, /account: Example Account/);
    assert.match(r.text, /other accounts the token can see: 1\b/);
    assert.match(r.text, /Pages projects in this account \(2\): aoforge-docs, example-site/);
    assert.match(r.text, /aoforge-docs: present/);
    assert.doesNotMatch(r.text, /ABSENT/);
    // Only a count of the other accounts is printed, never the name of one.
    assert.doesNotMatch(r.text, /Other Account/);
  });

  test('2b. every printed line carries the "cloudflare target: " prefix so a run log can be grepped', async () => {
    const r = await run(ARGV, { routes: healthyRoutes() });
    assert.ok(r.out.length > 0);
    for (const line of r.out) assert.ok(line.startsWith(PREFIX), `unprefixed line: ${line}`);
  });

  test('3. project absent: says ABSENT in this account and how to create it', async () => {
    const r = await run(ARGV, { routes: healthyRoutes(['example-site']) });
    assert.equal(r.code, 0);
    assert.match(r.text, /aoforge-docs: ABSENT in this account/);
    assert.match(r.text, /Pages/);
    assert.match(r.text, /Create/);
    assert.match(r.text, /Direct upload/);
    assert.match(r.text, /production branch main/);
    assert.doesNotMatch(r.text, /aoforge-docs: present/);
  });

  test('4. configured account not among the visible ones: says so, with the projects call error code', async () => {
    const routes = {
      [ACCOUNT_PATH]: fx.errorResponse(9109, 'Unauthorized to access requested resource'),
      [ACCOUNTS_PATH]: fx.accountsResponse([{ id: fx.OTHER_ACCOUNT_ID, name: 'Other Account' }]),
      [PROJECTS_PATH]: fx.errorResponse(10000, 'Authentication error'),
    };
    const r = await run(ARGV, { routes });
    assert.equal(r.code, 0);
    assert.match(r.text, /the token cannot see the configured account/);
    assert.match(r.text, /code 10000/);
    assert.doesNotMatch(r.text, /Other Account/);
  });

  test('5. projects call fails with success:false: reports the code and message, exits 0', async () => {
    const routes = { ...healthyRoutes(), [PROJECTS_PATH]: fx.errorResponse(10000, 'Authentication error') };
    const r = await run(ARGV, { routes });
    assert.equal(r.code, 0);
    assert.match(r.text, /Pages projects could not be listed: code 10000 Authentication error/);
    assert.doesNotMatch(r.text, /aoforge-docs: present/);
  });

  test('6. fetch throws (network down): reports "Cloudflare API unreachable: <message>" once, exits 0', async () => {
    const down = new Error('getaddrinfo ENOTFOUND api.cloudflare.com');
    const routes = { [ACCOUNT_PATH]: down, [ACCOUNTS_PATH]: down, [PROJECTS_PATH]: down };
    const r = await run(ARGV, { routes });
    assert.equal(r.code, 0);
    assert.match(r.text, /Cloudflare API unreachable: getaddrinfo ENOTFOUND api\.cloudflare\.com/);
    assert.equal(r.out.filter((l) => l.includes('unreachable')).length, 1);
  });

  test('6b. an unreadable (non-JSON) response is reported, not thrown', async () => {
    const fetch = async () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError('Unexpected token <'); } });
    const out = [];
    const code = await main(ARGV, { env: SECRETS, fetch, out: (l) => out.push(l), err: () => {} });
    assert.equal(code, 0);
    assert.match(out.join('\n'), /Cloudflare API unreachable: HTTP 502, response was not JSON/);
  });

  test('7. no case prints the account id, the other account id, the token or any 32-hex run', async () => {
    // An error message that echoes the request URL and the token, as an API or proxy can.
    const echo = fx.errorResponse(
      7003,
      `Could not route to /client/v4/accounts/${fx.ACCOUNT_ID}/pages/projects (token ${fx.TOKEN})`
    );
    const scenarios = [
      { routes: healthyRoutes() },
      { routes: healthyRoutes(['example-site']) },
      {
        routes: {
          [ACCOUNT_PATH]: echo,
          [ACCOUNTS_PATH]: fx.accountsResponse([{ id: fx.OTHER_ACCOUNT_ID, name: 'Other Account' }]),
          [PROJECTS_PATH]: echo,
        },
      },
      { routes: { ...healthyRoutes(), [PROJECTS_PATH]: fx.errorResponse(10000, 'Authentication error') } },
      {
        // An id the run was never given (so only the 32-hex rule can catch it).
        routes: {
          ...healthyRoutes(),
          [PROJECTS_PATH]: fx.errorResponse(7003, `No route for /client/v4/accounts/${fx.OTHER_ACCOUNT_ID}/pages/projects`),
        },
      },
      {
        routes: {
          [ACCOUNT_PATH]: new Error(`request to https://api.cloudflare.com${ACCOUNT_PATH} failed, token ${fx.TOKEN}`),
          [ACCOUNTS_PATH]: new Error('socket hang up'),
          [PROJECTS_PATH]: new Error('socket hang up'),
        },
      },
      { routes: {}, env: {} },
      { routes: {}, env: { CLOUDFLARE_API_TOKEN: fx.TOKEN } },
    ];
    for (const scenario of scenarios) {
      const r = await run(ARGV, scenario);
      assert.equal(r.code, 0);
      assert.ok(r.text.length > 0);
      assert.ok(!r.text.includes(fx.ACCOUNT_ID), `account id leaked:\n${r.text}`);
      assert.ok(!r.text.includes(fx.OTHER_ACCOUNT_ID), `other account id leaked:\n${r.text}`);
      assert.ok(!r.text.includes(fx.TOKEN), `token leaked:\n${r.text}`);
      assert.doesNotMatch(r.text, /[0-9a-f]{32}/i, `a 32-hex string leaked:\n${r.text}`);
    }
  });

  test('8. missing --project: usage on stderr, exit 1, nothing fetched', async () => {
    for (const argv of [[], ['--project'], ['--project', '']]) {
      const r = await run(argv, { routes: healthyRoutes() });
      assert.equal(r.code, 1);
      assert.equal(r.calls.length, 0);
      assert.equal(r.out.length, 0);
      assert.match(r.err.join('\n'), /usage: .*--project <name>/i);
    }
  });

  test('8b. --project=<name> is accepted', async () => {
    const r = await run(['--project=aoforge-docs'], { routes: healthyRoutes() });
    assert.equal(r.code, 0);
    assert.match(r.text, /aoforge-docs: present/);
  });

  test('9. each request carries the bearer token and targets the three documented endpoints', async () => {
    const r = await run(ARGV, { routes: healthyRoutes() });
    assert.equal(r.calls.length, 3);
    for (const call of r.calls) {
      assert.equal(call.headers.Authorization, `Bearer ${fx.TOKEN}`);
      assert.ok(call.url.startsWith('https://api.cloudflare.com/client/v4/'), call.url);
    }
    assert.deepEqual(r.calls.map((c) => c.path).sort(), [ACCOUNT_PATH, ACCOUNTS_PATH, PROJECTS_PATH].sort());
    const accountsCall = r.calls.find((c) => c.path === ACCOUNTS_PATH);
    assert.equal(new URL(accountsCall.url).searchParams.get('per_page'), '50');
  });

  test('11. a partial project listing (total_count above the list) says so instead of claiming ABSENT', async () => {
    const routes = { ...healthyRoutes(), [PROJECTS_PATH]: fx.projectsResponse(['example-site'], { total: 130 }) };
    const r = await run(ARGV, { routes });
    assert.equal(r.code, 0);
    assert.match(r.text, /listing is partial: 1 of 130/);
    assert.match(r.text, /aoforge-docs: not in the 1 project\(s\) listed/);
    assert.doesNotMatch(r.text, /aoforge-docs: ABSENT/);
  });
});

describe('ci-cloudflare-target summarizeTarget', () => {
  const ids = { accountId: fx.ACCOUNT_ID, token: fx.TOKEN, project: 'aoforge-docs' };

  test('12. reports accountVisible and projectPresent alongside the lines', () => {
    const present = summarizeTarget(
      {
        account: fx.accountResponse(),
        accounts: fx.accountsResponse([{ id: fx.ACCOUNT_ID, name: 'Example Account' }]),
        projects: fx.projectsResponse(['aoforge-docs']),
      },
      ids
    );
    assert.equal(present.accountVisible, true);
    assert.equal(present.projectPresent, true);
    assert.ok(Array.isArray(present.lines) && present.lines.length > 0);

    const absent = summarizeTarget(
      {
        account: fx.errorResponse(9109, 'Unauthorized'),
        accounts: fx.accountsResponse([{ id: fx.OTHER_ACCOUNT_ID, name: 'Other Account' }]),
        projects: fx.projectsResponse([]),
      },
      ids
    );
    assert.equal(absent.accountVisible, false);
    assert.equal(absent.projectPresent, false);
  });

  test('12b. a failed section reports an error with no account id even when the message echoes one', () => {
    const r = summarizeTarget(
      {
        account: { error: `connect ECONNREFUSED ${fx.ACCOUNT_ID}` },
        accounts: { error: 'x' },
        projects: { error: 'x' },
      },
      ids
    );
    assert.ok(r.lines.every((l) => !l.includes(fx.ACCOUNT_ID)));
  });
});

describe('ci-cloudflare-target scrub', () => {
  test('10. replaces every 32-hex run with <id> and every given secret with <redacted>', () => {
    const hex = '0123456789abcdef0123456789abcdef';
    const text = `GET /accounts/${hex}/pages failed for ${hex} with cf-test-token-not-real, again cf-test-token-not-real`;
    const cleaned = scrub(text, ['cf-test-token-not-real']);
    assert.equal(cleaned, 'GET /accounts/<id>/pages failed for <id> with <redacted>, again <redacted>');
  });

  test('10b. scrubs a Cloudflare error message that echoes the URL, and ignores empty secrets', () => {
    const msg = `Could not route to /client/v4/accounts/${fx.ACCOUNT_ID}/pages/projects`;
    assert.equal(scrub(msg, ['', undefined, null]), 'Could not route to /client/v4/accounts/<id>/pages/projects');
    assert.equal(scrub('nothing to hide'), 'nothing to hide');
  });

  test('10c. a secret that is itself 32 hex characters is redacted, not left as an id marker', () => {
    assert.equal(scrub(`id ${fx.ACCOUNT_ID}`, [fx.ACCOUNT_ID]), 'id <redacted>');
  });
});
