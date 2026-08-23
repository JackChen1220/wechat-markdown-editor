# macOS One-click Launcher Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add a double-clickable macOS launcher that safely starts the local editor and opens its browser page.

**Architecture:** A single root-level zsh `.command` script owns dependency checks, idempotent service detection, background startup, health waiting, logs, and browser opening. Node integration tests exercise the real script on temporary ports without touching user model configuration.

**Tech Stack:** zsh, Node.js 20 built-ins, `node:test`, macOS `open`.

---

### Task 1: Define launcher behavior with RED tests

**Files:**
- Create: `tests/launcher.test.mjs`
- Modify: `package.json`

**Steps:**

1. Add a failing test asserting `启动编辑器.command` exists, is executable, and passes `zsh -n`.
2. Add integration cases for starting on a temporary port, detecting an already-running editor, and refusing a foreign port occupant.
3. Run `node --test tests/launcher.test.mjs`; expect failure because the launcher does not exist.

### Task 2: Implement the launcher

**Files:**
- Create: `启动编辑器.command`

**Steps:**

1. Implement project-directory and Node 20 checks.
2. Implement editor identity and port-conflict checks without killing processes.
3. Implement background startup, log/PID files, bounded health wait, and optional browser opening.
4. Mark the file executable.
5. Run `node --test tests/launcher.test.mjs`; expect all launcher tests to pass.

### Task 3: Document and verify

**Files:**
- Modify: `README.md`

**Steps:**

1. Document double-click startup before the command-line alternative.
2. Run `npm test`, syntax checks, `git diff --check`, and a manual repeat-start probe.
3. Commit the launcher and documentation.

### Task 4: Integrate and push

**Steps:**

1. Fetch `origin` and confirm the remote base has not moved.
2. Fast-forward local `main` to the feature branch.
3. Run `npm test` again on `main`.
4. Push `main` normally to `origin`; never force push.
5. Verify local `main`, `origin/main`, and GitHub `main` resolve to the same commit.
