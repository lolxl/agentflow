'use strict'

// HostProvider registry.
//
// Host identity, discovery, and host-owned side effects go through this
// module. Providers are thin: they expose id, skillRoot, notify,
// spawnWorker, optionalLint, and discoverConfig. Unknown hosts stay blocked.

const node_os = require('node:os')

const codex = require('./providers/codex')
const claude = require('./providers/claude')
const grok_bot = require('./providers/grok-bot')

class HostError extends Error {
	constructor(message, details = {}) {
		super(message)
		this.name = 'HostError'
		this.code = details.code || 'AG_HOST_INVALID'
		this.errors = details.errors || [message]
	}
}

const registered_providers = Object.freeze([codex, claude, grok_bot])

const provider_by_id = Object.freeze(Object.fromEntries(registered_providers.map(provider => [provider.id, provider])))

const alias_to_id = Object.freeze(Object.fromEntries(registered_providers.flatMap(provider => [
	[provider.id, provider.id],
	...(provider.aliases || []).map(alias => [alias, provider.id]),
])))

const host_ids = Object.freeze(registered_providers.map(provider => provider.id))

const host_id_pattern = host_ids.map(id => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')

const host_markers = Object.freeze(Object.fromEntries(registered_providers.map(provider => [provider.id, provider.markers])))

const marker_is_set = value => value !== undefined && value !== null && value !== '' && value !== '0' && value !== 'false'

const known_host_text = () => host_ids.join(', ')

const as_host_error = (error, fallback_code) => {
	if (error instanceof HostError) return error
	return new HostError(error && error.message ? error.message : 'host provider failed', { code: (error && error.code) || fallback_code || 'AG_HOST_INVALID' })
}

const registered_id = value => {
	if (typeof value !== 'string') return ''
	return alias_to_id[value.trim().toLowerCase()] || ''
}

const is_registered_host = value => registered_id(value) !== ''

const get_provider = host => {
	const id = registered_id(host)
	if (!id) throw new HostError(`unknown host provider '${host}'`, { code: 'AG_HOST_UNKNOWN' })
	return provider_by_id[id]
}

const normalise_host = host => {
	if (host === undefined || host === null || host === '') {
		throw new HostError(`active host must be one of: ${known_host_text()}`, { code: 'AG_HOST_INVALID' })
	}
	const id = registered_id(host)
	if (!id) throw new HostError(`active host must be one of: ${known_host_text()}`, { code: 'AG_HOST_INVALID' })
	return id
}

const env_from = options => options && options.env !== undefined ? options.env : process.env

const explicit_host_from = (options = {}) => {
	if (options.explicit_host !== undefined) return options.explicit_host
	if (options.active_host !== undefined) return options.active_host
	if (options.coordinator_host !== undefined) return options.coordinator_host
	if (options.host !== undefined) return options.host
	return undefined
}

const detect_host_info = (options = {}) => {
	const explicit_host = explicit_host_from(options)
	if (explicit_host !== undefined) {
		return { host: normalise_host(explicit_host), source: 'explicit coordinator identity', provider: get_provider(explicit_host) }
	}

	const env = env_from(options)
	if (marker_is_set(env && env.AGENTFLOW_HOST)) {
		return { host: normalise_host(env.AGENTFLOW_HOST), source: 'AGENTFLOW_HOST override', provider: get_provider(env.AGENTFLOW_HOST) }
	}

	const found = host_ids.filter(id => (host_markers[id] || []).some(name => marker_is_set(env && env[name])))
	if (found.length === 1) return { host: found[0], source: 'host-owned runtime marker', provider: provider_by_id[found[0]] }
	if (found.length > 1) {
		throw new HostError('active host is ambiguous: both supported host families supplied runtime markers', { code: 'AG_HOST_AMBIGUOUS' })
	}

	throw new HostError('active host is unknown: no supported host identity was supplied', { code: 'AG_HOST_UNKNOWN' })
}

const detect_host = options => detect_host_info(options).host

const family_for_host = host => {
	if (!host) return ''
	try {
		const family = get_provider(host).family
		return typeof family === 'string' ? family : ''
	} catch (error) {
		return ''
	}
}

const opposite_host = host => {
	const id = registered_id(host)
	if (id === 'codex') return 'claude'
	if (id === 'claude') return 'codex'
	return ''
}

const default_hook_format = Object.freeze({ event: 'Stop', style: 'nested-command' })
const cursor_hook_format = Object.freeze({ event: 'stop', style: 'flat-command' })

const hook_format_for = host => {
	const provider = get_provider(host)
	const format = provider.hookFormat
	if (format && typeof format.event === 'string' && typeof format.style === 'string') return format
	return provider.installRoot === 'cursor' ? cursor_hook_format : default_hook_format
}

// Drop parent-host identity when launching a known child CLI so Cursor-spawned
// Codex/Claude workers are not detected as grok-bot. Keep AGENTFLOW_HOST only
// when it already names that child (Codex↔Claude dispatch).
const isolate_worker_env = (env, child_host) => {
	const environment = { ...(env || {}) }
	const id = registered_id(child_host)
	if (!id) return environment
	for (const other of host_ids) {
		if (other === id) continue
		for (const marker of host_markers[other] || []) delete environment[marker]
	}
	if (marker_is_set(environment.AGENTFLOW_HOST)) {
		const override = registered_id(environment.AGENTFLOW_HOST)
		if (override !== id) delete environment.AGENTFLOW_HOST
	}
	return environment
}

const skill_root_for = (host, home = node_os.homedir()) => get_provider(host).skillRoot(home)

const notify = (host, payload) => get_provider(host).notify(payload)

const spawn_worker = (host, spec) => get_provider(host).spawnWorker(spec)

const optional_lint = (host, facts) => {
	const provider = get_provider(host)
	return typeof provider.optionalLint === 'function' ? provider.optionalLint(facts) : null
}

const discover_config = (host, options) => get_provider(host).discoverConfig(options || {})

const hook_hosts = () => host_ids.slice()

const install_roots = () => ['agents', ...registered_providers.map(provider => provider.installRoot).filter(Boolean)]

const ignore_entries = () => [...new Set(registered_providers.flatMap(provider => provider.ignoreEntries || []))].sort()

const hook_command_host_pattern = () => new RegExp(`^node\\s+(?:(['"])(.*?)\\1|([^\\s]+))\\s+--host\\s+(${host_id_pattern})$`)

const status_host_pattern = () => host_id_pattern

module.exports = {
	HostError,
	as_host_error,
	providers: provider_by_id,
	registered_providers,
	host_ids,
	host_id_pattern,
	host_markers,
	alias_to_id,
	marker_is_set,
	registered_id,
	is_registered_host,
	get_provider,
	normalise_host,
	detect_host_info,
	detect_host,
	family_for_host,
	opposite_host,
	hook_format_for,
	isolate_worker_env,
	skill_root_for,
	notify,
	spawn_worker,
	optional_lint,
	discover_config,
	hook_hosts,
	install_roots,
	ignore_entries,
	hook_command_host_pattern,
	status_host_pattern,
	known_host_text,
}
