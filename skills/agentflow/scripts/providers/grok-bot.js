'use strict'

const node_os = require('node:os')
const node_path = require('node:path')

const id = 'grok-bot'

const skillRoot = (home = node_os.homedir()) => node_path.join(home, '.cursor', 'skills', 'agentflow')

const hookFormat = Object.freeze({
	event: 'stop',
	style: 'flat-command',
})

const notify = (payload = {}) => ({
	contract: 'cursor-notify-v1',
	host: id,
	status: 'stub',
	capability: 'unsupported',
	delivered: false,
	reason: 'cursor-notify-v1 is a structured stub; this provider does not send a notification',
	title: typeof payload.title === 'string' ? payload.title : '',
	body: typeof payload.body === 'string' ? payload.body : (typeof payload.message === 'string' ? payload.message : ''),
	payload,
})

const spawnWorker = (spec = {}) => ({
	contract: 'cursor-cloud-agent-v1',
	tool: 'use_cloud_agent',
	host: id,
	status: 'stub',
	capability: 'unsupported',
	launched: false,
	reason: 'use_cloud_agent / cursor-cloud-agent-v1 is a structured stub; this provider does not launch a worker',
	prompt: typeof spec.prompt === 'string' ? spec.prompt : '',
	spec,
})

const optionalLint = () => null

const discoverConfig = (options = {}) => {
	const home = options.home || node_os.homedir()
	const cwd = options.cwd || process.cwd()
	const scope = options.scope === 'global' ? 'global' : 'project'
	const hook_file = node_path.join('.cursor', 'hooks.json')
	return {
		host: id,
		scope,
		installRoot: 'cursor',
		skillRoot: skillRoot(home),
		docsPath: node_path.join(home, '.cursor', 'skills'),
		hookFile: hook_file,
		hookConfigPath: scope === 'global' ? node_path.join(home, hook_file) : node_path.join(cwd, hook_file),
		hookFormat,
		ignoreEntries: ['.cursor/'],
	}
}

module.exports = {
	id,
	family: '',
	aliases: Object.freeze(['grok', 'cursor']),
	markers: Object.freeze(['CURSOR_AGENT', 'AGENTFLOW_GROK_BOT', 'GROK_BOT']),
	installRoot: 'cursor',
	ignoreEntries: Object.freeze(['.cursor/']),
	skillRoot,
	hookFormat,
	notify,
	spawnWorker,
	optionalLint,
	discoverConfig,
}
