'use strict';

/**
 * Hand-written builders for Cloudflare API v4 responses (objective 74, TRD 74-02).
 *
 * Nothing here is random and nothing is a recording of a real response: every value is
 * a neutral constant, so a test that uses them is deterministic and the repository never
 * carries a real account name, account id or token. The names (`Example Account`,
 * `example-site`) are deliberately fictional.
 *
 * The envelope shape is Cloudflare's: `{ success, errors: [{ code, message }], messages,
 * result }`.
 */

// Two distinct 32-hex ids: the account the run is configured for, and one it is not.
const ACCOUNT_ID = 'a'.repeat(32);
const OTHER_ACCOUNT_ID = 'b'.repeat(32);
const TOKEN = 'cf-test-token-not-real';

/** The v4 envelope around `result`. */
function envelope(result, { success = true, errors = [] } = {}) {
  return { success, errors, messages: [], result };
}

/** GET /accounts/{id}: one account, by name. */
function accountResponse(name = 'Example Account') {
  return envelope({ id: ACCOUNT_ID, name });
}

/** GET /accounts: `list` is `[{ id, name }]`. */
function accountsResponse(list) {
  return envelope(list.map(({ id, name }) => ({ id, name })));
}

/**
 * GET /accounts/{id}/pages/projects. `total` reports a `result_info.total_count` larger
 * than the list, which is how the API says a listing is partial.
 */
function projectsResponse(names, { total } = {}) {
  const body = envelope(
    names.map((name) => ({
      name,
      subdomain: `${name}.pages.dev`,
      domains: [],
      production_branch: 'main',
    }))
  );
  body.result_info = { page: 1, per_page: names.length, count: names.length, total_count: total ?? names.length };
  return body;
}

/** A failed call: `success: false` and one error. */
function errorResponse(code, message) {
  return envelope(null, { success: false, errors: [{ code, message }] });
}

/**
 * A stand-in for global `fetch`.
 *
 * `routes` maps a `/client/v4/...` path, without its query string, to the body to return
 * (any envelope above) or to an `Error`, which makes the call throw as a dead network
 * would. A path with no route answers 404 with an error envelope. A body with
 * `success: false` answers a non-2xx status. Every call is recorded on `.calls` as
 * `{ url, path, headers }` so a test can assert what was asked and with which credentials.
 */
function fakeFetch(routes) {
  const calls = [];
  async function fetch(url, init = {}) {
    const path = new URL(url).pathname;
    calls.push({ url: String(url), path, headers: { ...(init.headers || {}) } });
    const route = routes[path];
    if (route instanceof Error) throw route;
    const body = route === undefined ? errorResponse(7000, 'No route for that URI') : route;
    const status = route === undefined ? 404 : body.success === false ? 400 : 200;
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  }
  fetch.calls = calls;
  return fetch;
}

module.exports = {
  ACCOUNT_ID,
  OTHER_ACCOUNT_ID,
  TOKEN,
  envelope,
  accountResponse,
  accountsResponse,
  projectsResponse,
  errorResponse,
  fakeFetch,
};
