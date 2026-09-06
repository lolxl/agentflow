'use strict';

// Tests for install-hook.js: both host targets, idempotent add, clean remove,
// host filtering, quiet mode, and preservation of unrelated settings.
// Each test runs the real script in a throwaway directory (project scope only,
// so the tester's own ~/.claude and ~/.codex are never touched).

const test = require('node:test');
const assert = require('node:assert');
const node_fs = require('node:fs');
const node_os = require('node:os');
const node_path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const script = node_path.join(__dirname, 'install-hook.js');
const skill_dir = require('./skill-dir.js');

const run = (cwd, args) => execFileSync('node', [script, ...args], { cwd, encoding: 'utf8' });

const fresh_dir = () => node_fs.mkdtempSync(node_path.join(node_os.tmpdir(), 'agentflow-hook-'));

const read_json = file_path => JSON.parse(node_fs.readFileSync(file_path, 'utf8'));

const has_our_nested_stop_hook = config => Array.isArray(config.hooks && config.hooks.Stop)
  && config.hooks.Stop.some(entry => Array.isArray(entry.hooks)
    && entry.hooks.some(hook => typeof hook.command === 'string' && hook.command.includes('stop-hook.js')));

const has_our_stop_hook = has_our_nested_stop_hook;

const has_our_cursor_stop_hook = config => Array.isArray(config.hooks && config.hooks.stop)
  && config.hooks.stop.some(entry => {
    const command = typeof entry === 'string' ? entry : entry && entry.command;
    return typeof command === 'string' && command.includes('stop-hook.js');
  });

test('project install writes both host configs', () => {
  const dir = fresh_dir();

  run(dir, ['--project', '--quiet']);

  const claude = read_json(node_path.join(dir, '.claude', 'settings.json'));
  const codex = read_json(node_path.join(dir, '.codex', 'hooks.json'));
  const locator = node_path.join(dir, '.agentflow', 'stop-hook.js');
  assert.ok(has_our_stop_hook(claude));
  assert.ok(has_our_stop_hook(codex));
  assert.match(claude.hooks.Stop[0].hooks[0].command, /--host claude$/);
  assert.match(codex.hooks.Stop[0].hooks[0].command, /--host codex$/);
  assert.ok(claude.hooks.Stop[0].hooks[0].command.includes(locator));
  assert.ok(!claude.hooks.Stop[0].hooks[0].command.includes(__dirname));
  assert.equal(claude.hooks.stop, undefined);
  assert.equal(codex.hooks.stop, undefined);
  assert.equal(claude.version, undefined);
  assert.ok(node_fs.existsSync(locator));

  const cursor = read_json(node_path.join(dir, '.cursor', 'hooks.json'));
  assert.equal(cursor.version, 1);
  assert.ok(has_our_cursor_stop_hook(cursor));
  assert.match(cursor.hooks.stop[0].command, /--host grok-bot$/);
  assert.ok(cursor.hooks.stop[0].command.includes(locator));
  assert.equal(cursor.hooks.Stop, undefined);
});

test('project install does not claim an old host-neutral hook command', () => {
  const dir = fresh_dir();
  const config_path = node_path.join(dir, '.codex', 'hooks.json');
  node_fs.mkdirSync(node_path.dirname(config_path), { recursive: true });
  const old_command = 'node "/old/stop-hook.js"';
  node_fs.writeFileSync(config_path, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: old_command }] }] } }));

  run(dir, ['--project', '--host', 'codex', '--quiet']);

  const config = read_json(config_path);
  assert.equal(config.hooks.Stop[0].hooks[0].command, old_command);
  assert.equal(config.hooks.Stop.length, 2);
  assert.match(config.hooks.Stop[1].hooks[0].command, /stop-hook\.js" --host codex$/);
});

test('running twice never duplicates the entry', () => {
  const dir = fresh_dir();

  run(dir, ['--project', '--quiet']);
  run(dir, ['--project', '--quiet']);

  const claude = read_json(node_path.join(dir, '.claude', 'settings.json'));
  const codex = read_json(node_path.join(dir, '.codex', 'hooks.json'));
  const cursor = read_json(node_path.join(dir, '.cursor', 'hooks.json'));

  assert.strictEqual(claude.hooks.Stop.length, 1);
  assert.strictEqual(codex.hooks.Stop.length, 1);
  assert.strictEqual(cursor.hooks.stop.length, 1);
  assert.equal(cursor.hooks.Stop, undefined);
});

test('project install replaces stale worktree hooks and collapses owned duplicates', () => {
  const dir = node_fs.realpathSync(fresh_dir());
  const config_path = node_path.join(dir, '.codex', 'hooks.json');
  const stale = `node "${node_path.join(dir, '.worktrees', 'fix-2', 'skills', 'agentflow', 'scripts', 'stop-hook.js')}" --host codex`;
  const current = `node "${node_path.join(__dirname, 'stop-hook.js')}" --host codex`;
  const locator_command = `node "${node_path.join(dir, '.agentflow', 'stop-hook.js')}" --host codex`;
  const foreign = { type: 'command', command: 'foreign-command --keep' };
  node_fs.mkdirSync(node_path.dirname(config_path), { recursive: true });
  node_fs.writeFileSync(config_path, `${JSON.stringify({ hooks: { Stop: [
    { matcher: 'stale', hooks: [{ type: 'command', command: stale }, foreign] },
    { hooks: [{ type: 'command', command: current }] }
  ] } }, null, 2)}\n`);

  run(dir, ['--project', '--host', 'codex', '--quiet']);

  const config = read_json(config_path);
  assert.strictEqual(config.hooks.Stop.length, 1);
  assert.deepEqual(config.hooks.Stop[0], {
    matcher: 'stale',
    hooks: [{ type: 'command', command: locator_command }, foreign]
  });
});

test('--off removes the entry from both hosts', () => {
  const dir = fresh_dir();

  run(dir, ['--project', '--quiet']);
  run(dir, ['--project', '--off', '--quiet']);

  assert.ok(!has_our_stop_hook(read_json(node_path.join(dir, '.claude', 'settings.json'))));
  assert.ok(!has_our_stop_hook(read_json(node_path.join(dir, '.codex', 'hooks.json'))));
  assert.ok(!has_our_cursor_stop_hook(read_json(node_path.join(dir, '.cursor', 'hooks.json'))));
});

test('--host codex touches only the codex config', () => {
  const dir = fresh_dir();

  run(dir, ['--project', '--host', 'codex', '--quiet']);

  assert.ok(has_our_stop_hook(read_json(node_path.join(dir, '.codex', 'hooks.json'))));
  assert.ok(!node_fs.existsSync(node_path.join(dir, '.claude', 'settings.json')));
});

test('--off removes only the owned nested command and preserves siblings and entry metadata', () => {
  const dir = fresh_dir();
  const config_path = node_path.join(dir, '.claude', 'settings.json');
  const owned_command = `node "${node_path.join(__dirname, 'stop-hook.js')}" --host claude`;
  const retained_entry = {
    matcher: 'mixed',
    description: 'keep this metadata',
    hooks: [
      { type: 'command', command: owned_command },
      { type: 'command', command: 'foreign-command --keep' },
    ],
  };
  const other_entry = { matcher: 'other', hooks: [{ type: 'command', command: 'other-command --keep' }] };
  node_fs.mkdirSync(node_path.dirname(config_path), { recursive: true });
  node_fs.writeFileSync(config_path, `${JSON.stringify({ hooks: { Stop: [retained_entry, other_entry] } }, null, 2)}\n`);

  run(dir, ['--project', '--host', 'claude', '--off', '--quiet']);

  const config = read_json(config_path);
  assert.deepEqual(config.hooks.Stop, [
    { ...retained_entry, hooks: [retained_entry.hooks[1]] },
    other_entry,
  ]);
});

test('--off retains a same-filename foreign Stop command', () => {
  const dir = fresh_dir();
  const config_path = node_path.join(dir, '.claude', 'settings.json');
  const foreign = `node "/foreign/stop-hook.js" --host claude`;
  const original = { hooks: { Stop: [{ hooks: [{ type: 'command', command: foreign }] }] } };
  node_fs.mkdirSync(node_path.dirname(config_path), { recursive: true });
  node_fs.writeFileSync(config_path, `${JSON.stringify(original, null, 2)}\n`);

  run(dir, ['--project', '--host', 'claude', '--off', '--quiet']);

  assert.deepEqual(read_json(config_path), original);
});

test('unrelated settings survive an install and a removal', () => {
  const dir = fresh_dir();
  const settings_path = node_path.join(dir, '.claude', 'settings.json');

  node_fs.mkdirSync(node_path.dirname(settings_path), { recursive: true });
  node_fs.writeFileSync(settings_path, JSON.stringify({ model: 'opus', hooks: { PostToolUse: [{ hooks: [] }] } }));

  run(dir, ['--project', '--quiet']);
  run(dir, ['--project', '--off', '--quiet']);

  const config = read_json(settings_path);

  assert.strictEqual(config.model, 'opus');
  assert.ok(Array.isArray(config.hooks.PostToolUse));
  assert.ok(!has_our_stop_hook(config));
});

test('--quiet prints nothing; normal mode prints per-host lines', () => {
  const quiet_output = run(fresh_dir(), ['--project', '--quiet']);
  const loud_output = run(fresh_dir(), ['--project']);

  assert.strictEqual(quiet_output, '');
  assert.match(loud_output, /claude: added/);
  assert.match(loud_output, /codex: added/);
  assert.match(loud_output, /grok-bot: added/);
  assert.match(loud_output, /not a repository — the pre-commit devlog guard was skipped/);
});

// ---------- the git pre-commit devlog guard ----------

const fresh_repo = () => {
  const dir = fresh_dir();

  execFileSync('git', ['init', '-b', 'main'], { cwd: dir, encoding: 'utf8' });

  return dir;
};

const pre_commit_path = dir => node_path.join(dir, '.git', 'hooks', 'pre-commit');

test('project install writes the pre-commit guard in a git repo, idempotently', () => {
  const dir = fresh_repo();

  run(dir, ['--project', '--quiet']);

  const written = node_fs.readFileSync(pre_commit_path(dir), 'utf8');

  assert.match(written, /agentflow devlog-guard/);
  assert.match(written, /devlog-guard\.js/);
  assert.ok(node_fs.statSync(pre_commit_path(dir)).mode & 0o100, 'the hook is executable');

  run(dir, ['--project', '--quiet']);
  assert.strictEqual(node_fs.readFileSync(pre_commit_path(dir), 'utf8'), written);
});

test('--off removes the guard; a foreign pre-commit hook is never touched', () => {
  const dir = fresh_repo();

  run(dir, ['--project', '--quiet']);
  run(dir, ['--project', '--off', '--quiet']);
  assert.ok(!node_fs.existsSync(pre_commit_path(dir)));

  node_fs.writeFileSync(pre_commit_path(dir), '#!/bin/sh\necho mine\n', { mode: 0o755 });

  const output = run(dir, ['--project']);

  assert.match(output, /left untouched/);
  assert.strictEqual(node_fs.readFileSync(pre_commit_path(dir), 'utf8'), '#!/bin/sh\necho mine\n');

  run(dir, ['--project', '--off', '--quiet']);
  assert.strictEqual(node_fs.readFileSync(pre_commit_path(dir), 'utf8'), '#!/bin/sh\necho mine\n');
});

test('--off leaves a changed Agentflow guard untouched and gives manual-removal instructions', () => {
  const dir = fresh_repo();

  run(dir, ['--project', '--quiet']);
  const changed = `${node_fs.readFileSync(pre_commit_path(dir), 'utf8')}echo user command\n`;
  node_fs.writeFileSync(pre_commit_path(dir), changed, { mode: 0o755 });

  const output = run(dir, ['--project', '--off']);

  assert.match(output, /left untouched/i);
  assert.match(output, /manual/i);
  assert.strictEqual(node_fs.readFileSync(pre_commit_path(dir), 'utf8'), changed);
});

const write_skill = (root, stamp) => {
  node_fs.mkdirSync(node_path.join(root, 'scripts'), { recursive: true });
  node_fs.writeFileSync(node_path.join(root, 'SKILL.md'), `# ${stamp}\n`);
  node_fs.writeFileSync(node_path.join(root, 'scripts', 'stop-hook.js'), `console.log('${stamp}');\n`);
  return root;
};

test('skill-dir prefers AGENTFLOW_SKILL_DIR then the host skillRoot', () => {
  const home = node_fs.mkdtempSync(node_path.join(node_os.tmpdir(), 'agentflow-skill-home-'));
  const env_root = node_path.join(home, 'env-skill');
  const cursor_root = node_path.join(home, '.cursor', 'skills', 'agentflow');
  node_fs.mkdirSync(node_path.join(env_root, 'scripts'), { recursive: true });
  node_fs.writeFileSync(node_path.join(env_root, 'SKILL.md'), '# env\n');
  node_fs.writeFileSync(node_path.join(env_root, 'scripts', 'stop-hook.js'), 'true\n');
  node_fs.mkdirSync(node_path.join(cursor_root, 'scripts'), { recursive: true });
  node_fs.writeFileSync(node_path.join(cursor_root, 'SKILL.md'), '# cursor\n');
  node_fs.writeFileSync(node_path.join(cursor_root, 'scripts', 'stop-hook.js'), 'true\n');

  assert.equal(skill_dir.resolve_skill_dir({
    env: { AGENTFLOW_SKILL_DIR: env_root },
    home,
    cwd: home,
    host: 'grok-bot',
  }), node_path.resolve(env_root));
  assert.equal(skill_dir.resolve_skill_dir({
    env: {},
    home,
    cwd: home,
    host: 'grok-bot',
  }), node_path.resolve(cursor_root));
  assert.equal(skill_dir.resolve_skill_dir({
    env: {},
    home,
    cwd: home,
    host: 'claude',
  }), '');
});

test('Stop hook command stays on a project locator and does not bake the skill directory', () => {
  const dir = node_fs.realpathSync(fresh_dir());
  run(dir, ['--project', '--host', 'grok-bot', '--quiet']);

  const cursor = read_json(node_path.join(dir, '.cursor', 'hooks.json'));
  const command = cursor.hooks.stop[0].command;
  const locator = node_path.join(dir, '.agentflow', 'stop-hook.js');
  assert.equal(command, `node "${locator}" --host grok-bot`);
  assert.equal(cursor.hooks.Stop, undefined);
  assert.equal(cursor.version, 1);
  assert.ok(!command.includes(__dirname));
  assert.ok(!command.includes('/tmp/agentflow-skill'));
});

test('locator resolves AGENTFLOW_SKILL_DIR at hook runtime', () => {
  const dir = node_fs.realpathSync(fresh_dir());
  const skill = node_fs.mkdtempSync(node_path.join(node_os.tmpdir(), 'agentflow-skill-copy-'));
  node_fs.mkdirSync(node_path.join(skill, 'scripts'), { recursive: true });
  node_fs.writeFileSync(node_path.join(skill, 'SKILL.md'), '# agentflow\n');
  node_fs.writeFileSync(node_path.join(skill, 'scripts', 'stop-hook.js'), 'console.log(process.argv.slice(2).join(" "));\n');
  run(dir, ['--project', '--host', 'grok-bot', '--quiet']);

  const locator = node_path.join(dir, '.agentflow', 'stop-hook.js');
  const result = execFileSync('node', [locator, '--host', 'grok-bot'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, AGENTFLOW_SKILL_DIR: skill },
  });
  assert.match(result, /--host grok-bot/);
});

test('locator prefers the installing host skillRoot and does not steal another host tree', () => {
  const dir = node_fs.realpathSync(fresh_dir());
  const home = node_fs.mkdtempSync(node_path.join(node_os.tmpdir(), 'agentflow-multi-skill-'));
  write_skill(node_path.join(home, '.cursor', 'skills', 'agentflow'), 'cursor-skill');
  write_skill(node_path.join(home, '.claude', 'skills', 'agentflow'), 'claude-skill');
  write_skill(node_path.join(home, '.codex', 'skills', 'agentflow'), 'codex-skill');
  run(dir, ['--project', '--quiet']);
  const locator = node_path.join(dir, '.agentflow', 'stop-hook.js');
  const run_host = host => execFileSync('node', [locator, '--host', host], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, AGENTFLOW_SKILL_DIR: '', HOME: home },
  });

  assert.match(run_host('grok-bot'), /cursor-skill/);
  assert.match(run_host('claude'), /claude-skill/);
  assert.match(run_host('codex'), /codex-skill/);
  assert.equal(skill_dir.resolve_skill_dir({ env: {}, home, cwd: dir, host: 'claude' }), node_path.join(home, '.claude', 'skills', 'agentflow'));
  assert.equal(skill_dir.resolve_skill_dir({ env: {}, home, cwd: dir, host: 'codex' }), node_path.join(home, '.codex', 'skills', 'agentflow'));
});

test('locator warns and fails open when the skill directory is gone', () => {
  const dir = node_fs.realpathSync(fresh_dir());
  run(dir, ['--project', '--host', 'grok-bot', '--quiet']);
  const locator = node_path.join(dir, '.agentflow', 'stop-hook.js');
  const result = spawnSync(process.execPath, [locator, '--host', 'grok-bot'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, AGENTFLOW_SKILL_DIR: '', HOME: dir },
  });
  assert.equal(result.status, 0);
  assert.match(String(result.stderr || ''), /AGENTFLOW_SKILL_DIR|could not locate|fail-open/i);
});

test('reinstall replaces an ephemeral absolute skill path with the project locator', () => {
  const dir = node_fs.realpathSync(fresh_dir());
  const config_path = node_path.join(dir, '.cursor', 'hooks.json');
  const ephemeral = `node "/tmp/agentflow-skill/skills/agentflow/scripts/stop-hook.js" --host grok-bot`;
  node_fs.mkdirSync(node_path.dirname(config_path), { recursive: true });
  node_fs.writeFileSync(config_path, `${JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: ephemeral }] }] } }, null, 2)}\n`);

  run(dir, ['--project', '--host', 'grok-bot', '--quiet']);

  const config = read_json(config_path);
  const command = config.hooks.stop[0].command;
  assert.equal(command, `node "${node_path.join(dir, '.agentflow', 'stop-hook.js')}" --host grok-bot`);
  assert.equal(config.hooks.Stop, undefined);
  assert.ok(!command.includes('/tmp/agentflow-skill'));
});

test('grok-bot install writes Cursor-native stop and --off removes it', () => {
  const dir = fresh_dir();
  run(dir, ['--project', '--host', 'grok-bot', '--quiet']);
  const config_path = node_path.join(dir, '.cursor', 'hooks.json');
  const config = read_json(config_path);
  assert.deepEqual(config.hooks.stop, [{
    command: `node "${node_path.join(dir, '.agentflow', 'stop-hook.js')}" --host grok-bot`,
  }]);
  assert.equal(config.hooks.Stop, undefined);
  assert.ok(!node_fs.existsSync(node_path.join(dir, '.claude', 'settings.json')));
  assert.ok(!node_fs.existsSync(node_path.join(dir, '.codex', 'hooks.json')));

  assert.deepEqual(require('./install-hook.js').inspect({ cwd: dir, hosts: ['cursor'] }), [
    `remove the verified Agentflow Stop hook from ${config_path}`,
  ]);
  run(dir, ['--project', '--host', 'cursor', '--off', '--quiet']);
  const after = read_json(config_path);
  assert.equal(after.hooks && after.hooks.stop, undefined);
  assert.equal(after.hooks && after.hooks.Stop, undefined);
  assert.deepEqual(require('./install-hook.js').inspect({ cwd: dir, hosts: ['grok'] }), []);
});

test('grok-bot reinstall migrates Claude-shaped Stop and keeps foreign cursor stop entries', () => {
  const dir = node_fs.realpathSync(fresh_dir());
  const config_path = node_path.join(dir, '.cursor', 'hooks.json');
  const owned = `node "${node_path.join(__dirname, 'stop-hook.js')}" --host grok-bot`;
  const foreign = { command: 'foreign-cursor-stop --keep' };
  node_fs.mkdirSync(node_path.dirname(config_path), { recursive: true });
  node_fs.writeFileSync(config_path, `${JSON.stringify({
    hooks: {
      afterFileEdit: [{ command: 'format.sh' }],
      Stop: [{ hooks: [{ type: 'command', command: owned }] }],
      stop: [foreign],
    },
  }, null, 2)}\n`);

  run(dir, ['--project', '--host', 'grok-bot', '--quiet']);

  const config = read_json(config_path);
  assert.deepEqual(config.hooks.afterFileEdit, [{ command: 'format.sh' }]);
  assert.deepEqual(config.hooks.stop, [
    foreign,
    { command: `node "${node_path.join(dir, '.agentflow', 'stop-hook.js')}" --host grok-bot` },
  ]);
  assert.equal(config.hooks.Stop, undefined);
});

test('inspect lists only verified owned hooks and --off removes a stale project-worktree Stop hook', () => {
  const dir = fresh_repo();
  const config_path = node_path.join(dir, '.codex', 'hooks.json');
  const stale = `node "${node_path.join(dir, '.worktrees', 'old', 'skills', 'agentflow', 'scripts', 'stop-hook.js')}" --host codex`;
  node_fs.mkdirSync(node_path.dirname(config_path), { recursive: true });
  node_fs.writeFileSync(config_path, `${JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: stale }] }] } }, null, 2)}\n`);

  assert.deepEqual(require('./install-hook.js').inspect({ cwd: dir, hosts: ['codex'] }), [
    `remove the verified Agentflow Stop hook from ${config_path}`,
  ]);
  run(dir, ['--project', '--host', 'codex', '--off', '--quiet']);
  assert.deepEqual(require('./install-hook.js').inspect({ cwd: dir, hosts: ['codex'] }), []);
});
