# Local AI Configuration and Layout Contract Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Convert the editor to a loopback-only, login-free local product and make AI layout generation obey a validated WeChat component contract.

**Architecture:** Keep the existing dependency-free Node server and multi-provider registry. Remove the authentication boundary from local API routes, retain encrypted server-side configuration with masked reads, and add a dedicated prompt/output-contract layer around the existing provider caller. The browser displays a dot placeholder for configured secrets but never receives or persists the real value.

**Tech Stack:** Node.js 20 built-ins, native HTML/CSS/JavaScript, `node:test`, existing canonical GZH renderer.

---

### Task 1: Lock the local-only HTTP contract with failing tests

**Objective:** Describe the new anonymous loopback API behavior before changing production code.

**Files:**
- Modify: `tests/ai-layout-server.test.mjs`
- Modify: `tests/editor-ai.test.js`

**Steps:**

1. Replace auth lifecycle expectations with tests proving `GET/PUT /api/ai/config`, provider model refresh/test, and `POST /api/ai/layout` work without cookies or CSRF on a loopback server.
2. Assert saved configuration is applied immediately and API keys never appear in GET responses, logs, errors, or static assets.
3. Add source assertions proving the frontend contains no login/session/CSRF flow and still opens the AI configuration surface.
4. Run `node --test tests/ai-layout-server.test.mjs tests/editor-ai.test.js` and confirm failures are caused by the existing authentication requirement.

### Task 2: Remove the authentication boundary and preserve local secret handling

**Objective:** Make local AI APIs usable without login while keeping the service loopback-only and configuration masked.

**Files:**
- Modify: `server.mjs`
- Modify: `server/local-config.mjs`
- Modify: `server/ai-layout.mjs`
- Modify: `server/model-providers.mjs`
- Delete: `server/auth.mjs`
- Modify: `.env.example`
- Modify: `package.json`

**Steps:**

1. Remove auth route imports, session creation, login/logout routes, session checks, and CSRF checks.
2. Keep JSON content-type/body limits and provider hostname validation.
3. Require the server host to remain loopback for the login-free mode; refuse non-loopback `HOST` values during bootstrap.
4. Keep encrypted configuration persistence and masked public provider state; allow development to generate a local encryption key inside the ignored `data/` directory.
5. Make `npm start` run without a required `.env`; optional environment overrides remain available to direct Node invocations.
6. Run the focused server tests and make them pass.

### Task 3: Simplify the AI model settings UI

**Objective:** Opening “AI 模型” should directly show the provider configuration without authentication controls.

**Files:**
- Modify: `index.html`
- Modify: `app/editor-app.js`
- Test: `tests/editor-ai.test.js`

**Steps:**

1. Write/verify failing source-contract tests for removal of login form, session caption, logout button, and auth state helpers.
2. Remove login-related HTML/CSS and frontend state/event handlers.
3. Replace session-aware fetch with same-origin JSON fetch; keep 401-free error handling and draft preservation on AI failure.
4. Keep the API key input empty, show a dot placeholder when configured, treat blank save as “keep”, and never persist the value in `localStorage`.
5. Run `node --test tests/editor-ai.test.js` and confirm pass.

### Task 4: Add the Chinese prompt contract and layout modes through TDD

**Objective:** Make layout generation choose canonical components instead of returning meta-analysis or plain cleanup by default.

**Files:**
- Modify: `server/ai-layout.mjs`
- Modify: `server/model-providers.mjs` if shared theme metadata is needed
- Modify: `app/editor-app.js`
- Modify: `index.html`
- Test: `tests/ai-layout-server.test.mjs`
- Test: `tests/editor-ai.test.js`

**Steps:**

1. Add failing tests for `mode: rewrite|faithful`, Chinese-only control instructions, JSON source framing, theme profiles, the full renderer-supported component allowlist, and component-selection rules.
2. Add a compact mode control near “AI 智能排版”, defaulting to `rewrite`, and include it in the layout request.
3. Implement the Chinese system prompt and JSON user payload without XML-like source delimiters.
4. Run the focused prompt and frontend tests until green.

### Task 5: Validate model output and repair once through TDD

**Objective:** Prevent prompt leakage or invalid component grammar from entering the editor.

**Files:**
- Modify: `server/ai-layout.mjs`
- Test: `tests/ai-layout-server.test.mjs`

**Steps:**

1. Add failing unit tests for meta-leakage phrases, unknown component names, unclosed/crossed blocks, and literal source delimiters.
2. Add an integration test whose first upstream response is invalid and second response is valid; assert exactly two calls and return of only the repaired Markdown.
3. Add a failure test where both responses are invalid; assert a safe 502 without returning either candidate.
4. Implement minimal validation and one repair request carrying validation errors and the candidate as JSON data.
5. Run `node --test tests/ai-layout-server.test.mjs` until green.

### Task 6: Reconcile local-first documentation and runtime defaults

**Objective:** Make the documented startup path match the product that now ships.

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `CLAUDE.md`
- Delete: `DEPLOY.md`
- Delete: `Dockerfile`
- Delete: `docker-compose.yml`
- Delete: `.dockerignore`
- Delete: `deploy/nginx/article-rate-limit.conf`
- Delete: `deploy/nginx/article.lawyerworkbench.cloud.conf`

**Steps:**

1. Document `npm start` and `http://127.0.0.1:3000` as the primary path.
2. Remove admin password/session/CSRF instructions and explain that AI settings are local, encrypted at rest, masked in the settings page, and immediately active.
3. Remove public Docker/Nginx deployment artifacts that would conflict with the loopback-only runtime; preserve the history in Git.
4. Reconcile `CLAUDE.md` so it no longer describes the obsolete Bearer-token or `.env` write path.
5. Document backup scope for the encrypted `data/` files and warn that the key/config pair must stay together.

### Task 7: Full verification and review

**Objective:** Prove the combined local product behavior without leaking secrets or regressing the editor.

**Files:**
- Review all modified files

**Steps:**

1. Run `npm test` and require all tests to pass without warnings.
2. Run `node --check server.mjs`, `node --check server/ai-layout.mjs`, `node --check server/local-config.mjs`, `node --check server/model-providers.mjs`, and `node --check app/editor-app.js`.
3. Start the local service and verify health, key masking, immediate configuration update, no browser persistence, and failed-output draft preservation using a synthetic test key.
4. Verify the AI settings popover at desktop and mobile widths in a real browser.
5. Run `git diff --check` and conduct a focused security/code-quality review before delivery.
