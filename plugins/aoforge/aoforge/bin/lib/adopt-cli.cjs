'use strict';

// adopt-cli.cjs — CLI wiring for `aof-tools adopt <sub>`. Only this file may
// call os.homedir() for adopt's userHome injection (adopt.cjs never does).

const os = require('os');
const helpers = require('./helpers.cjs');
const adopt = require('./adopt.cjs');

function emit(report, raw) {
  const exitCode = report.route === 'refuse' ? 3 : 0;
  const tail = report.reason != null ? report.reason : report.next;
  helpers.output(report, raw, `${report.route}: ${tail}`, exitCode);
}

function cmdAdopt(cwd, args, raw) {
  const sub = args[0];
  const opts = { userHome: os.homedir(), env: process.env };

  if (sub === 'preflight') {
    return emit(adopt.preflight(cwd, opts), raw);
  }
  if (sub === 'begin') {
    return emit(adopt.begin(cwd, { ...opts, pluginVersion: helpers.pluginVersion() }), raw);
  }
  if (sub === 'scaffold') {
    let result;
    try {
      result = adopt.scaffold(cwd, { ...opts, pluginVersion: helpers.pluginVersion() });
    } catch (e) {
      return helpers.error(e.message);
    }
    if (result.route !== 'scaffold') {
      const tail = result.reason != null ? result.reason : result.next;
      return helpers.output(result, raw, `${result.route}: ${tail}`, 3);
    }
    return helpers.output(result, raw, `scaffolded: ${result.created.length} created`, 0);
  }
  if (sub === 'report') {
    let result;
    try {
      result = adopt.report(cwd, { ...opts, pluginVersion: helpers.pluginVersion() });
    } catch (e) {
      return helpers.error(e.message);
    }
    if (result.route !== 'report') {
      const tail = result.reason != null ? result.reason : result.next;
      return helpers.output(result, raw, `${result.route}: ${tail}`, 3);
    }
    return helpers.output(result, raw, `report: ${result.needs_review.length} to review`, 0);
  }
  return helpers.error(`adopt: unknown subcommand ${JSON.stringify(sub)}; expected preflight|begin|scaffold|report`);
}

module.exports = { cmdAdopt };
