'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const host_provider = require('./host-provider')

const skill_marker = root => path.join(root, 'scripts', 'stop-hook.js')

const has_skill = root => {
	if (typeof root !== 'string' || root.trim().length === 0) return false
	try {
		return fs.existsSync(skill_marker(root)) && fs.existsSync(path.join(root, 'SKILL.md'))
	} catch {
		return false
	}
}

const host_skill_relatives = () => {
	const home = '/agentflow-home-marker'
	const map = {}
	for (const provider of host_provider.registered_providers) {
		const root = provider.skillRoot(home)
		const relative = root.startsWith(`${home}${path.sep}`) ? root.slice(home.length + 1).split(path.sep).join('/') : ''
		if (!relative) continue
		map[provider.id] = relative
		for (const alias of provider.aliases || []) map[alias] = relative
	}
	return map
}

const candidate_roots = (options = {}) => {
	const env = options.env || process.env
	const home = options.home || os.homedir()
	const cwd = options.cwd || process.cwd()
	const extra = Array.isArray(options.extra_roots) ? options.extra_roots : []
	const host = options.host
	const host_root = host ? host_provider.skill_root_for(host, home) : ''
	const other_roots = host
		? []
		: host_provider.install_roots().map(name => path.join(home, `.${name}`, 'skills', 'agentflow'))
	const roots = [
		env.AGENTFLOW_SKILL_DIR,
		host_root,
		...other_roots,
		path.join(cwd, 'skills', 'agentflow'),
		...extra,
	]
	return [...new Set(roots.filter(value => typeof value === 'string' && value.trim().length > 0).map(root => path.resolve(root)))]
}

const resolve_skill_dir = (options = {}) => candidate_roots(options).find(has_skill) || ''

const resolve_stop_hook = (options = {}) => {
	const root = resolve_skill_dir(options)
	return root ? skill_marker(root) : ''
}

const locator_relative = path.posix.join('.agentflow', 'stop-hook.js')

const locator_path_for = (cwd = process.cwd()) => path.join(cwd, '.agentflow', 'stop-hook.js')

const locator_script_source = () => `'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const host_skill_relatives = ${JSON.stringify(host_skill_relatives())};
const marker = root => path.join(root, 'scripts', 'stop-hook.js');
const usable = root => {
  if (typeof root !== 'string' || root.trim().length === 0) return false;
  try {
    return fs.existsSync(marker(root)) && fs.existsSync(path.join(root, 'SKILL.md'));
  } catch {
    return false;
  }
};

const host_index = process.argv.indexOf('--host');
const host = host_index >= 0 ? String(process.argv[host_index + 1] || '').trim().toLowerCase() : '';
const preferred = host_skill_relatives[host]
  ? path.join(os.homedir(), ...host_skill_relatives[host].split('/'))
  : '';
const roots = [
  process.env.AGENTFLOW_SKILL_DIR,
  preferred,
  path.join(process.cwd(), 'skills', 'agentflow'),
].filter(Boolean);

const skill = roots.map(root => path.resolve(root)).find(usable);
if (!skill) {
  process.stderr.write('agentflow: could not locate the Stop hook skill for this host; set AGENTFLOW_SKILL_DIR or install the skill at this host skillRoot. The session continues (fail-open, same as stop-hook.js).\\n');
  process.exit(0);
}

const result = spawnSync(process.execPath, [marker(skill), ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);
`

module.exports = {
	candidate_roots,
	has_skill,
	host_skill_relatives,
	locator_path_for,
	locator_relative,
	locator_script_source,
	resolve_skill_dir,
	resolve_stop_hook,
}
