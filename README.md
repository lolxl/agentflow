# agentflow

**English** · [繁體中文](README.zh-tw.md)

A file-logged way of working for AI coding agents (Claude Code, Codex, and compatible hosts).

- **What it does:** the agent converses with you through a plain text record file (`devlog.md`) instead of the terminal. Every ask, answer, decision, and commit lands in the file, so the whole project history is auditable and any dead session recovers from the record.

- **Two layers:** a base conversation protocol (rounds, STATUS, Git discipline, delegation rules) for any task, and an on-demand development pipeline (requirements → specification → implementation → acceptance) that loads only when a wish changes product behavior.

## Install

- **As a skill (Claude Code, Codex, and other hosts):**

	```
	npx skills add agfnow/agentflow
	```

- **As a Claude Code plugin (auto-updates on new releases):**

	```
	/plugin marketplace add agfnow/agentflow
	```

## Verify installation

Requirements: Node.js 18 or newer and Git.

Set `AGENTFLOW_SKILL_DIR` to the actual directory where `npx skills add` installed `agentflow`, then run the installed setup check:

	```sh
	AGENTFLOW_SKILL_DIR="<actual installed agentflow skill directory>"
	node "$AGENTFLOW_SKILL_DIR/scripts/setup.js"
	```

The first `godev` use installs the project's hooks. If an optional worker is unavailable, that is an availability result, not proof that installation failed.

## Use

- Type `godev` (or `/devlog`) in a session to activate the protocol; type `ag` to force the full development pipeline on a wish.

- The full user guide ships with the skill: see [`skills/agentflow/docs/AG_GUIDE.md`](skills/agentflow/docs/AG_GUIDE.md) (English) and [`skills/agentflow/docs/AG_GUIDE.zh-tw.md`](skills/agentflow/docs/AG_GUIDE.zh-tw.md) (繁體中文), including which AI models are strong enough to run it.

## How model routing works

- Each project keeps version-7 configuration in the adjacent `ag.json`. Its public roots and setting paths use kebab-case, including `schema-version`, `pipeline-roles`, `external-workers`, and switches such as `target-doc` and `allow-ag`. Project-defined worker profiles map the `best`, `better`, `basic`, and `cheap` tiers to literal commands and models. Unknown keys warn and are ignored; malformed JSON or invalid recognized values are rejected.
