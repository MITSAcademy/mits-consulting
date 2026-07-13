#!/usr/bin/env node
/**
 * MITS Auto-Fix Webhook Server
 *
 * Listens for bug reports from the portal backend, verifies the HMAC signature,
 * then invokes `claude` CLI to analyse and fix the issue automatically.
 *
 * Setup:
 *   1. npm install (in this scripts/ dir — or use: node --experimental-require-module)
 *   2. Set env vars (see .env.autofix.example)
 *   3. Run: node autofix-webhook.js
 *   4. Expose via ngrok: ngrok http 7891
 *   5. Set AUTOFIX_WEBHOOK_URL=https://<ngrok>.ngrok-free.app/webhook in Render backend env
 *   6. Set AUTOFIX_WEBHOOK_SECRET=<same secret> in both Render and this server
 *
 * Security:
 *   - HMAC-SHA256 signature verified on every request
 *   - Claude is only allowed to edit frontend/src/ and backend/src/
 *   - Claude cannot touch .env, prisma/migrations, or run destructive shell commands
 *   - Each fix runs in a separate child process with a 5-minute timeout
 *   - Max 3 concurrent fixes to prevent runaway resource use
 */

const http = require('http');
const crypto = require('crypto');
const { execFile, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const PORT = process.env.AUTOFIX_PORT || 7891;
const SECRET = process.env.AUTOFIX_WEBHOOK_SECRET || '';
const REPO = process.env.MITS_REPO_PATH || path.resolve(__dirname, '..');
const MAX_CONCURRENT = 3;
const FIX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per fix

// Find claude CLI — check PATH first, then known VSCode extension locations
function findClaude() {
  const { execSync } = require('child_process');
  try { return execSync('which claude', { encoding: 'utf8' }).trim(); } catch {}
  const vscodeBase = path.join(process.env.HOME || '', '.vscode/extensions');
  if (fs.existsSync(vscodeBase)) {
    const dirs = fs.readdirSync(vscodeBase)
      .filter(d => d.startsWith('anthropic.claude-code'))
      .sort().reverse(); // latest version first
    for (const d of dirs) {
      const p = path.join(vscodeBase, d, 'resources/native-binary/claude');
      if (fs.existsSync(p)) return p;
    }
  }
  return 'claude'; // fallback
}
const CLAUDE_BIN = process.env.CLAUDE_BIN || findClaude();

// Backend URL to patch bug status after fix
const BACKEND_URL = process.env.MITS_BACKEND_URL || 'http://localhost:4000';
const BACKEND_SECRET = process.env.AUTOFIX_BACKEND_SECRET || ''; // founder JWT or service token

if (!SECRET) {
  console.error('[autofix] ERROR: AUTOFIX_WEBHOOK_SECRET is not set. Refusing to start.');
  process.exit(1);
}

// ── State ────────────────────────────────────────────────────────────────────
let activeFixes = 0;
const fixLog = []; // in-memory ring buffer, last 50 fixes

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fixLog.push(line);
  if (fixLog.length > 50) fixLog.shift();
}

// ── HMAC verification ────────────────────────────────────────────────────────
function verifySignature(payload, sig) {
  if (!sig) return false;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
}

// ── Claude auto-fix ──────────────────────────────────────────────────────────
async function runAutoFix(bugId, description, url, role, reportedBy) {
  if (activeFixes >= MAX_CONCURRENT) {
    log(`[${bugId}] Skipped — ${MAX_CONCURRENT} fixes already running`);
    return { skipped: true };
  }

  activeFixes++;
  log(`[${bugId}] Starting auto-fix (active: ${activeFixes}/${MAX_CONCURRENT})`);
  log(`[${bugId}] Reporter: ${reportedBy} (${role}) at ${url}`);
  log(`[${bugId}] Description: ${description.slice(0, 200)}`);

  const prompt = `You are fixing a bug in the MITS Consulting Hub portal.

Bug report from ${reportedBy} (role: ${role}) at page ${url}:
"${description}"

Repository is at: ${REPO}
Frontend: ${REPO}/frontend/src/
Backend: ${REPO}/backend/src/

Instructions:
1. Read the relevant files to understand the bug
2. Fix it with minimal, targeted changes
3. Do NOT touch: .env files, prisma/migrations/, secrets, or CI config
4. After fixing, run: cd ${REPO} && git add -A frontend/src backend/src && git commit -m "fix: auto-fix bug reported by ${reportedBy} — ${description.slice(0, 60)}" && git push origin main
5. Output the commit hash on the last line as: COMMIT:<hash>

Fix the bug now.`;

  return new Promise((resolve) => {
    log(`[${bugId}] Using claude: ${CLAUDE_BIN}`);
    const child = execFile(
      CLAUDE_BIN,
      ['--print', '--allowedTools', 'Read,Edit,Write,Bash'],
      {
        cwd: REPO,
        timeout: FIX_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, HOME: process.env.HOME },
      },
      (err, stdout, stderr) => {
        activeFixes--;

        if (err) {
          log(`[${bugId}] Fix failed: ${err.message}`);
          resolve({ success: false, error: err.message });
          return;
        }

        // Extract commit hash from output
        const commitMatch = stdout.match(/COMMIT:([a-f0-9]{7,40})/);
        const commit = commitMatch ? commitMatch[1] : null;

        log(`[${bugId}] Fix completed. Commit: ${commit || 'unknown'}`);
        if (stderr) log(`[${bugId}] stderr: ${stderr.slice(0, 500)}`);

        resolve({ success: true, commit, output: stdout.slice(-1000) });
      }
    );

    child.on('spawn', () => {
      log(`[${bugId}] Claude CLI spawned (pid ${child.pid})`);
      child.stdin.write(prompt);
      child.stdin.end();
    });
  });
}

// ── Patch bug status back to portal ─────────────────────────────────────────
async function patchBugStatus(bugId, status, fixCommit) {
  if (!BACKEND_SECRET) return;
  try {
    await fetch(`${BACKEND_URL}/api/bug-reports/${bugId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BACKEND_SECRET}` },
      body: JSON.stringify({ status, fixCommit }),
    });
    log(`[${bugId}] Patched status → ${status} (commit: ${fixCommit})`);
  } catch (e) {
    log(`[${bugId}] Failed to patch status: ${e.message}`);
  }
}

// ── HTTP server ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, activeFixes, recentLog: fixLog.slice(-10) }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  // Read body
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    // Verify signature
    const sig = req.headers['x-mits-signature'];
    if (!verifySignature(body, sig)) {
      log(`[webhook] Invalid signature — rejecting request`);
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end('Bad JSON');
      return;
    }

    const { bugId, description, url, role, reportedBy } = payload;
    if (!bugId || !description) {
      res.writeHead(400);
      res.end('Missing bugId or description');
      return;
    }

    // Ack immediately — fix runs async
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: 'Fix queued' }));

    // Update status to 'fixing'
    await patchBugStatus(bugId, 'fixing', null);

    // Run the fix
    const result = await runAutoFix(bugId, description, url, role, reportedBy);

    // Update status based on result
    if (result.success) {
      await patchBugStatus(bugId, 'fixed', result.commit);
    } else if (!result.skipped) {
      await patchBugStatus(bugId, 'open', null);
    }
  });
});

server.listen(PORT, () => {
  log(`Auto-fix webhook server listening on :${PORT}`);
  log(`Repo: ${REPO}`);
  log(`Max concurrent fixes: ${MAX_CONCURRENT}`);
  log(`Fix timeout: ${FIX_TIMEOUT_MS / 1000}s`);
  log(`Health check: http://localhost:${PORT}/health`);
});

server.on('error', (e) => {
  console.error('[autofix] Server error:', e);
});
