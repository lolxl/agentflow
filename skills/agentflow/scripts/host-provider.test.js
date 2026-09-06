'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const host_provider = require('./host-provider')
const settings = require('./ag-settings')
const intake = require('./resume-intake')
const install_hook = require('./install-hook')

const contract_keys = ['id', 'skillRoot', 'notify', 'spawnWorker', 'optionalLint', 'discoverConfig']

test('registry lists the three registered hosts and grok-bot aliases', () => {
	assert.deepEqual(host_provider.host_ids, ['codex', 'claude', 'grok-bot'])
	assert.equal(host_provider.registered_id('grok'), 'grok-bot')
	assert.equal(host_provider.registered_id('cursor'), 'grok-bot')
	assert.equal(host_provider.registered_id('GROK-BOT'), 'grok-bot')
	assert.equal(host_provider.normalise_host('cursor'), 'grok-bot')
	assert.ok(host_provider.is_registered_host('grok'))
	assert.equal(host_provider.is_registered_host('pstack'), false)
})

test('every registered provider exposes the HostProvider contract', () => {
	for (const id of host_provider.host_ids) {
		const provider = host_provider.get_provider(id)
		for (const key of contract_keys) {
			assert.equal(typeof provider[key] === 'function' || typeof provider[key] === 'string', true, `${id}.${key}`)
		}
		assert.equal(provider.id, id)
		assert.ok(Array.isArray(provider.markers))
		assert.ok(typeof provider.skillRoot() === 'string')
		assert.ok(provider.discoverConfig({ cwd: os.tmpdir(), home: os.tmpdir() }).hookConfigPath)
	}
})

test('unknown and empty hosts stay blocked; there is no default-to-codex', () => {
	assert.throws(() => host_provider.normalise_host(''), { code: 'AG_HOST_INVALID' })
	assert.throws(() => host_provider.normalise_host('pstack'), { code: 'AG_HOST_INVALID' })
	assert.throws(() => host_provider.normalise_host('gemini'), { code: 'AG_HOST_INVALID' })
	assert.throws(() => host_provider.detect_host({ env: {} }), { code: 'AG_HOST_UNKNOWN' })
	assert.throws(() => host_provider.detect_host({ env: { PATH: '/usr/bin', AGENTFLOW_HOST: '' } }), { code: 'AG_HOST_UNKNOWN' })
	assert.throws(() => settings.detect_host({ env: {} }), /unknown/)
	assert.throws(() => settings.detect_host({ explicit_host: 'not-a-host', env: {} }), error => error.code === 'AG_HOST_INVALID')
})

test('AGENTFLOW_HOST is a registry-validated override and beats markers', () => {
	assert.equal(host_provider.detect_host({ env: { AGENTFLOW_HOST: 'cursor', CODEX_SESSION_ID: 'x' } }), 'grok-bot')
	assert.equal(host_provider.detect_host({ env: { AGENTFLOW_HOST: 'grok' } }), 'grok-bot')
	assert.equal(settings.detect_host({ env: { AGENTFLOW_HOST: 'claude', CODEX_SESSION_ID: 'x' } }), 'claude')
	assert.throws(() => host_provider.detect_host({ env: { AGENTFLOW_HOST: 'pstack' } }), { code: 'AG_HOST_INVALID' })
	assert.equal(host_provider.detect_host({ explicit_host: 'codex', env: { AGENTFLOW_HOST: 'claude' } }), 'codex')
})

test('runtime markers include grok-bot and stay unambiguous', () => {
	assert.deepEqual(host_provider.host_markers['grok-bot'], ['CURSOR_AGENT', 'AGENTFLOW_GROK_BOT', 'GROK_BOT'])
	assert.equal(settings.detect_host({ env: { CURSOR_AGENT: '1' } }), 'grok-bot')
	assert.equal(settings.detect_host({ env: { AGENTFLOW_GROK_BOT: '1' } }), 'grok-bot')
	assert.equal(settings.detect_host({ env: { GROK_BOT: 'yes' } }), 'grok-bot')
	assert.throws(() => settings.detect_host({ env: { CURSOR_AGENT: '1', CLAUDE_CODE: '1' } }), /ambiguous/)
	assert.throws(() => settings.detect_host({ env: { CURSOR_AGENT: '0' } }), /unknown/)
})

test('grok-bot skillRoot is the Cursor/Grok skills path', () => {
	const home = '/tmp/fake-home'
	assert.equal(host_provider.skill_root_for('grok-bot', home), path.join(home, '.cursor', 'skills', 'agentflow'))
	assert.equal(host_provider.skill_root_for('cursor', home), path.join(home, '.cursor', 'skills', 'agentflow'))
	assert.equal(host_provider.discover_config('grok-bot', { home, cwd: '/tmp/repo', scope: 'project' }).docsPath, path.join(home, '.cursor', 'skills'))
	assert.ok(host_provider.install_roots().includes('cursor'))
	assert.ok(host_provider.ignore_entries().includes('.cursor/'))
})

test('grok-bot notify returns the cursor-notify-v1 stub and does not deliver', () => {
	const result = host_provider.notify('grok', { title: 'ready', body: 'review' })
	assert.equal(result.contract, 'cursor-notify-v1')
	assert.equal(result.status, 'stub')
	assert.equal(result.delivered, false)
	assert.equal(result.host, 'grok-bot')
	assert.equal(result.title, 'ready')
	assert.equal(result.body, 'review')
})

test('grok-bot spawnWorker returns the cloud-agent stub and does not launch', () => {
	const result = host_provider.spawn_worker('cursor', { prompt: 'implement the host registry' })
	assert.equal(result.contract, 'cursor-cloud-agent-v1')
	assert.equal(result.tool, 'use_cloud_agent')
	assert.equal(result.status, 'stub')
	assert.equal(result.launched, false)
	assert.equal(result.prompt, 'implement the host registry')
})

test('codex and claude providers wrap the existing host contract', () => {
	const codex = host_provider.notify('codex', { title: 'x' })
	const claude = host_provider.spawn_worker('claude', { prompt: 'y' })
	assert.equal(codex.contract, 'host-notify-v1')
	assert.equal(codex.delivered, false)
	assert.equal(claude.contract, 'external-runner-v1')
	assert.equal(claude.launched, false)
	assert.equal(host_provider.optional_lint('codex'), null)
	assert.equal(host_provider.discover_config('claude', { cwd: '/tmp/repo', scope: 'project' }).hookConfigPath, path.join('/tmp/repo', '.claude', 'settings.json'))
	assert.equal(host_provider.discover_config('codex', { cwd: '/tmp/repo', scope: 'project' }).hookConfigPath, path.join('/tmp/repo', '.codex', 'hooks.json'))
})

test('ag-settings templates and STATUS accept grok-bot as a registered host', () => {
	const config = settings.make_template('cursor')
	assert.equal(config.switches['cli-provider'], 'on')
	assert.equal(settings.validate_config(config, { active_host: 'grok-bot', executables: ['codex', 'claude'] }).valid, true)
	const missing_cli = settings.validate_config(config, { active_host: 'grok-bot', executables: [] })
	assert.equal(missing_cli.valid, true)
	assert.match(missing_cli.warnings.join('; '), /cli-provider=on has no available CLI executable/)
	assert.match(missing_cli.warnings.join('; '), /cli-provider: off/)
	const bot_only = JSON.parse(JSON.stringify(config))
	bot_only.switches['cli-provider'] = 'off'
	const bot_only_result = settings.validate_config(bot_only, { active_host: 'grok-bot', executables: [] })
	assert.equal(bot_only_result.valid, true)
	assert.doesNotMatch(bot_only_result.warnings.join('; '), /no available CLI executable|no available external-worker/)
	const status = settings.format_status({
		project: 'demo',
		notebook: 'devlog.md',
		current_commit: 'none',
		tests_scenarios: 'none',
		host: 'grok-bot',
		validation: 'validated',
		proven: 'none',
		open: 'none',
		next: 'none',
		artifacts: 'none',
		archived_eras: 'none',
	})
	assert.equal(settings.validate_status_projection(status).valid, true)
	assert.match(status, /validated for grok-bot this round/)
})

test('grok-bot cli-provider off does not select Codex or Claude profiles', () => {
	const grok = settings.make_template('grok-bot')
	grok.switches['cli-provider'] = 'off'
	assert.equal(settings.select_profile(grok, { active_host: 'grok-bot', executables: ['codex', 'claude'] }), null)
	grok.switches['cli-provider'] = 'on'
	assert.equal(settings.select_profile(grok, { active_host: 'grok-bot', executables: ['codex', 'claude'] }).id, 'codex-default')

	const codex = settings.make_template('codex')
	assert.equal(settings.select_profile(codex, { active_host: 'codex', executables: ['codex', 'claude'] }).id, 'codex-default')
	assert.equal(settings.select_profile(codex, { active_host: 'codex', executables: ['codex'] }).id, 'codex-default')
	const claude = settings.make_template('claude')
	assert.equal(settings.select_profile(claude, { active_host: 'claude', executables: ['codex', 'claude'] }).id, 'claude-default')
	assert.equal(settings.select_profile(claude, { active_host: 'claude', executables: ['claude'] }).id, 'claude-default')
})

test('resume-intake does not default to codex', () => {
	assert.throws(() => intake.parse_args([], { env: {} }), /unknown|registered host|AGENTFLOW_HOST/)
	assert.equal(intake.parse_args(['--host', 'cursor'], { env: {} }).active_host, 'grok-bot')
	assert.equal(intake.parse_args([], { env: { AGENTFLOW_HOST: 'grok' } }).active_host, 'grok-bot')
	assert.throws(() => intake.parse_args(['--host', 'pstack']), /must be one of|AG_HOST_INVALID|pstack|registered/)
	assert.throws(() => intake.collect_intake({ repo_root: os.tmpdir() }), error => error.code === 'AG_HOST_INVALID' || /must be one of/.test(error.message))
})

test('install-hook discovers grok-bot config through the registry', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-grok-hook-'))
	assert.equal(install_hook.config_path_for('cursor', 'project', dir), path.join(dir, '.cursor', 'hooks.json'))
	install_hook.install({ cwd: dir, hosts: ['grok-bot'], quiet: true, say: () => {} })
	const config = JSON.parse(fs.readFileSync(path.join(dir, '.cursor', 'hooks.json'), 'utf8'))
	assert.match(config.hooks.Stop[0].hooks[0].command, /stop-hook\.js" --host grok-bot$/)
	assert.ok(!fs.existsSync(path.join(dir, '.claude', 'settings.json')))
	fs.rmSync(dir, { recursive: true, force: true })
})

test('Chef, TEAM, and quiet-hours stay out of core host files', () => {
	const core = [
		'skills/agentflow/scripts/host-provider.js',
		'skills/agentflow/scripts/ag-settings.js',
		'skills/agentflow/scripts/stop-hook.js',
		'skills/agentflow/scripts/install-hook.js',
		'skills/agentflow/scripts/skill-dir.js',
		'skills/agentflow/scripts/setup.js',
		'skills/agentflow/scripts/resume-intake.js',
		'skills/agentflow/scripts/agf.js',
		'skills/agentflow/scripts/external-runner.js',
		'skills/agentflow/scripts/providers/codex.js',
		'skills/agentflow/scripts/providers/claude.js',
		'skills/agentflow/SKILL.md',
	]
	const root = path.resolve(__dirname, '../../..')
	for (const relative of core) {
		const text = fs.readFileSync(path.join(root, relative), 'utf8')
		assert.doesNotMatch(text, /\bChef\b/)
		assert.doesNotMatch(text, /\bTEAM\b/)
		assert.doesNotMatch(text, /quiet-hours/)
	}
	const docs = fs.readFileSync(path.join(root, 'skills/agentflow/providers/grok-bot/SKILL.md'), 'utf8')
	assert.match(docs, /Chef/)
	assert.match(docs, /TEAM/)
	assert.match(docs, /quiet-hours/)
})
