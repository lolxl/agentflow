'use strict';

const assert = require('node:assert/strict');
const child_process = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ag_settings = require('./ag-settings.js');
const { collect } = require('./completion-context.js');

const git = (root, args) => child_process.execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const write = (root, relative, content) => {
	const file = path.join(root, relative);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content);
};

const commit = (root, message) => {
	git(root, ['add', '-A']);
	git(root, ['commit', '-qm', message]);
};

const cleanup_fixture = () => {
	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-completion-context-')));
	git(root, ['init', '-q']);
	git(root, ['config', 'user.name', 'Agentflow Test']);
	git(root, ['config', 'user.email', 'agentflow@example.invalid']);
	const config = ag_settings.make_template('codex');
	config.switches['target-doc'] = '.agentflow/devlog.md';
	config.switches['workspace-dir'] = '.agentflow';
	write(root, 'ag.json', `${JSON.stringify(config, null, 2)}\n`);
	write(root, '.agentflow/devlog.md', '# STATUS\n\nProject: test\n\n---\n\n# \u2192 Ask / A-001\n\n+ start\n\n# \u2190 Reply / A-001\n\n## [SUMMARY]\n\n- Done.\n\n## Questions (batched \u2014 each with a suggested default)\n\n- None.\n\n---\n\n# \u2192 Ask / A-002\n\n+\n');
	commit(root, 'root baseline');
	write(root, 'src.js', 'module.exports = true;\n');
	write(root, '.agentflow/features/fix-2/fix-2.devlog.md', '# STATUS\n\nFeature: fix-2 \u2014 closed\n');
	commit(root, 'deliver fix-2');
	write(root, '.agentflow/devlog.md', fs.readFileSync(path.join(root, '.agentflow/devlog.md'), 'utf8').replace('# \u2192 Ask / A-002\n\n+\n', '# \u2192 Ask / A-002\n\n+ cleanup: fix-2\n'));
	return root;
};

test('post-merge cleanup does not request a second review of delivered stream changes', () => {
	const root = cleanup_fixture();
	const devlog_text = fs.readFileSync(path.join(root, '.agentflow/devlog.md'), 'utf8');
	const result = collect({ project_root: root, notebook_path: '.agentflow/devlog.md', devlog_text });

	assert.equal(result.review_decision.status, 'not-requested');
	assert.deepEqual(result.git_paths.committed, []);
});

test('post-closure source changes still require a new review', () => {
	const root = cleanup_fixture();
	write(root, 'after-close.js', 'module.exports = false;\n');
	commit(root, 'change source after stream closure');
	const devlog_text = fs.readFileSync(path.join(root, '.agentflow/devlog.md'), 'utf8');
	const result = collect({ project_root: root, notebook_path: '.agentflow/devlog.md', devlog_text });

	assert.equal(result.review_decision.status, 'required');
	assert.ok(result.git_paths.committed.includes('after-close.js'));
	assert.ok(!result.git_paths.committed.includes('src.js'));
});

const first_reply_fixture = () => {
	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-first-reply-')));
	git(root, ['init', '-q']);
	git(root, ['config', 'user.name', 'Agentflow Test']);
	git(root, ['config', 'user.email', 'agentflow@example.invalid']);
	write(root, 'src/app.js', 'module.exports = 1;\n');
	commit(root, 'existing product');
	const config = ag_settings.make_template('grok-bot');
	config.switches['target-doc'] = '.agentflow/devlog.md';
	config.switches['workspace-dir'] = '.agentflow';
	write(root, 'ag.json', `${JSON.stringify(config, null, 2)}\n`);
	write(root, '.agentflow/devlog.md', '# STATUS\n\nProject: test\n\n---\n\n# \u2192 Ask / A-001\n\n+ godev\n');
	commit(root, 'agentflow init');
	return root;
};

test('first-reply activation on a repo with product files does not treat the whole tree as in-scope', () => {
	const root = first_reply_fixture();
	write(root, '.agentflow/devlog.md', '# STATUS\n\nProject: test\nHost: grok-bot\n\n---\n\n# \u2192 Ask / A-001\n\n+ godev\n');
	const devlog_text = fs.readFileSync(path.join(root, '.agentflow/devlog.md'), 'utf8');
	const result = collect({ project_root: root, notebook_path: '.agentflow/devlog.md', devlog_text });

	assert.equal(result.review_decision.status, 'not-requested');
	assert.ok(!result.review_decision.changed_files.includes('src/app.js'));
	assert.ok(result.review_decision.changed_files.every(file =>
		file === 'ag.json' || file === '.gitignore' || file.startsWith('.agentflow/')
	));
});

test('first-reply still requires review when a product file changed after the Ask', () => {
	const root = first_reply_fixture();
	write(root, 'src/app.js', 'module.exports = 2;\n');
	const devlog_text = fs.readFileSync(path.join(root, '.agentflow/devlog.md'), 'utf8');
	const result = collect({ project_root: root, notebook_path: '.agentflow/devlog.md', devlog_text });

	assert.equal(result.review_decision.status, 'required');
	assert.ok(result.git_paths.working.includes('src/app.js') || result.git_paths.changed.includes('src/app.js'));
});

test('first-reply still requires review when a product change was committed after the Ask', () => {
	const root = first_reply_fixture();
	write(root, 'src/app.js', 'module.exports = 3;\n');
	commit(root, 'product change after ask');
	const devlog_text = fs.readFileSync(path.join(root, '.agentflow/devlog.md'), 'utf8');
	const result = collect({ project_root: root, notebook_path: '.agentflow/devlog.md', devlog_text });

	assert.equal(result.review_decision.status, 'required');
	assert.ok(result.git_paths.committed.includes('src/app.js'));
	assert.ok(!result.git_paths.committed.includes('README.md'));
});

test('non-ASCII Agentflow record paths remain inside the record boundary', () => {
	const root = cleanup_fixture();
	const record_path = '.agentflow/artifacts/archives/runlog-luna 大盤點.md';
	write(root, record_path, 'archive record\n');
	const devlog_text = fs.readFileSync(path.join(root, '.agentflow/devlog.md'), 'utf8');
	const result = collect({ project_root: root, notebook_path: '.agentflow/devlog.md', devlog_text });

	assert.equal(result.review_decision.status, 'not-requested');
	assert.ok(result.git_paths.working.includes(record_path));
});
