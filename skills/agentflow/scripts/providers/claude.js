'use strict'

const node_os = require('node:os')
const node_path = require('node:path')

const id = 'claude'

const skillRoot = (home = node_os.homedir()) => node_path.join(home, '.claude', 'skills', 'agentflow')

const notify = (payload = {}) => ({
	contract: 'host-notify-v1',
	host: id,
	status: 'unsupported',
	delivered: false,
	reason: 'Claude Code uses its own session UI; Agentflow does not send a separate notify payload',
	payload,
})

const spawnWorker = (spec = {}) => ({
	contract: 'external-runner-v1',
	host: id,
	status: 'delegate',
	launched: false,
	reason: 'Claude workers use the existing external-runner-v1 command path',
	spec,
})

const optionalLint = () => null

const discoverConfig = (options = {}) => {
	const home = options.home || node_os.homedir()
	const cwd = options.cwd || process.cwd()
	const scope = options.scope === 'global' ? 'global' : 'project'
	const hook_file = node_path.join('.claude', 'settings.json')
	return {
		host: id,
		scope,
		installRoot: 'claude',
		skillRoot: skillRoot(home),
		hookFile: hook_file,
		hookConfigPath: scope === 'global' ? node_path.join(home, hook_file) : node_path.join(cwd, hook_file),
		ignoreEntries: ['.claude/'],
	}
}

module.exports = {
	id,
	family: 'claude',
	aliases: [],
	markers: Object.freeze(['CLAUDE_PROJECT_DIR', 'CLAUDE_SESSION_ID', 'CLAUDE_CODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT', 'CLAUDE_CLI']),
	installRoot: 'claude',
	ignoreEntries: Object.freeze(['.claude/']),
	skillRoot,
	notify,
	spawnWorker,
	optionalLint,
	discoverConfig,
}
