---
name: grok-bot
description: Agentflow host provider for Cursor / Grok. Coordinator identity only; it does not replace Codex or Claude CLI workers.
---

# grok-bot host provider

This skill documents the **grok-bot** Agentflow host. Core Agentflow stays host-neutral. Cursor-only operations live here.

## Identity

- Canonical id: `grok-bot`
- Aliases: `grok`, `cursor`
- Runtime markers: `CURSOR_AGENT`, `AGENTFLOW_GROK_BOT`, `GROK_BOT`
- Override: `AGENTFLOW_HOST=grok-bot` (also accepts `grok` or `cursor`)

Unknown or empty host values stay blocked (`AG_HOST_INVALID` / `AG_HOST_UNKNOWN`). There is no default-to-codex.

## Skill root

Cursor / Grok skills are installed under the user skill path:

- User skills: `~/.cursor/skills`
- Agentflow copy: `~/.cursor/skills/agentflow`

Project-local Cursor files use `.cursor/` (hooks stub: `.cursor/hooks.json`).

## Notify

`notify` returns a **cursor-notify-v1** stub contract. It does not send a notification. Callers record the structured result; they must not treat `delivered: false` as a sent message.

## Spawn worker

`spawnWorker` returns a **use_cloud_agent / cursor-cloud-agent-v1** stub contract. It does **not** launch a cloud agent. The result is a structured request record (`launched: false`) for later wiring.

Existing Codex and Claude CLI workers still go through `external-runner-v1`.

## Grok Bot-only path

The default template keeps `cli-provider: on` and Codex/Claude worker profiles. That is intentional: the coordinator host is not a CLI worker. External review still expects `codex` or `claude` on `PATH`.

To stay on Grok Bot / Cursor with no external CLI:

1. Set `cli-provider: off`.
2. Do not expect `spawnWorker` to launch a cloud agent. It stays a stub (`launched: false`).
3. Activation and notebook-only rounds do not need an external reviewer.

If `cli-provider` stays `on` and neither `codex` nor `claude` is available, settings validation warns and tells you to set `cli-provider: off` for Grok Bot only.

## Ephemeral skill copies

`agf init` may run from a temporary skill directory such as `/tmp/agentflow-skill`. The Stop hook does not bake that path. A project-local locator (`.agentflow/stop-hook.js`) looks up `AGENTFLOW_SKILL_DIR`, then the host `skillRoot()` (`~/.cursor/skills/agentflow` for grok-bot). If you inited from a temp copy, install the skill under the user skill path or set `AGENTFLOW_SKILL_DIR` to a directory that still exists.

## Chef / TEAM / quiet-hours

These rules apply only when the active host is grok-bot. They are not core Agentflow settings.

- **Chef** — the grok-bot coordinator may follow a Cursor Chef-style brief (goal, constraints, proof). Chef language never becomes an `ag.json` switch.
- **TEAM** — a TEAM mention is a Cursor-side collaboration hint. It does not create Agentflow streams, workers, or pipeline roles.
- **quiet-hours** — optional notify suppression for the cursor-notify-v1 stub. Core Agentflow does not schedule or enforce quiet hours.

Do not add Chef, TEAM, or quiet-hours fields to `ag.json`, STATUS, or shared scripts.
