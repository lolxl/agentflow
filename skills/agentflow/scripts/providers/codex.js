'use strict'

const node_os = require('node:os')
const node_path = require('node:path')

const id = 'codex'

const skillRoot = (home = node_os.homedir()) => node_path.join(home, '.codex', 'skills', 'agentflow')

const notify = (payload = {}) => ({
	contract: 'host-notify-v1',
	host: id,
	status: 'unsupported',
	delivered: false,
	reason: 'Codex uses its own session UI; Agentflow does not send a separate notify payload',
	payload,
})

const spawnWorker = (spec = {}) => ({
	contract: 'external-runner-v1',
	host: id,
	status: 'delegate',
	launched: false,
	reason: 'Codex workers use the existing external-runner-v1 command path',
	spec,
})

const optionalLint = () => null

const discoverConfig = (options = {}) => {
	const home = options.home || node_os.homedir()
	const cwd = options.cwd || process.cwd()
	const scope = options.scope === 'global' ? 'global' : 'project'
	const hook_file = node_path.join('.codex', 'hooks.json')
	return {
		host: id,
		scope,
		installRoot: 'codex',
		skillRoot: skillRoot(home),
		hookFile: hook_file,
		hookConfigPath: scope === 'global' ? node_path.join(home, hook_file) : node_path.join(cwd, hook_file),
		ignoreEntries: ['.codex/'],
	}
}

module.exports = {
	id,
	family: 'codex',
	aliases: [],
	markers: Object.freeze(['CODEX_SESSION_ID', 'CODEX_THREAD_ID', 'CODEX_CI', 'CODEX_SANDBOX', 'CODEX_CLI']),
	installRoot: 'codex',
	ignoreEntries: Object.freeze(['.codex/']),
	skillRoot,
	notify,
	spawnWorker,
	optionalLint,
	discoverConfig,
}
