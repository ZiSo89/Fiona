import crypto from 'node:crypto';

const COOKIE_NAME = 'project_tracker_session';
const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest();
const editorKey = (storeId, teamName) => `${storeId}|${teamName}`;

export function createProjectTrackerAuth({ teamPasswords = {}, sessionSecret = '', now = () => Date.now() } = {}) {
  const passwords = new Map(Object.entries(teamPasswords));
  const failures = new Map();
  const key = sessionSecret ? sha256(`project-tracker-session:${sessionSecret}`) : null;

  const sign = (payload) => crypto.createHmac('sha256', key).update(payload).digest('hex');

  function issueToken(storeId, teamName) {
    const payload = Buffer.from(JSON.stringify({
      expiresAt: now() + SESSION_MS,
      storeId,
      teamName,
    })).toString('base64url');
    return `${payload}.${sign(payload)}`;
  }

  function readToken(req) {
    for (const part of String(req.headers.cookie ?? '').split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === COOKIE_NAME) return rest.join('=');
    }
    return null;
  }

  function readSession(req) {
    if (!key) return null;
    const [payload, signature] = String(readToken(req) ?? '').split('.');
    if (!payload || !signature) return null;
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

    try {
      const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (!Number.isFinite(session.expiresAt) || session.expiresAt < now()) return null;
      if (!passwords.has(editorKey(session.storeId, session.teamName))) return null;
      return { storeId: session.storeId, teamName: session.teamName };
    } catch {
      return null;
    }
  }

  function cookie(req, value, maxAgeSeconds) {
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    return `${COOKIE_NAME}=${value}; Path=/api/tracker; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
  }

  function tooManyFailures(ip) {
    const entry = failures.get(ip);
    return Boolean(entry && entry.resetAt >= now() && entry.count >= MAX_FAILURES);
  }

  function recordFailure(ip) {
    const entry = failures.get(ip);
    if (!entry || entry.resetAt < now()) failures.set(ip, { count: 1, resetAt: now() + FAILURE_WINDOW_MS });
    else entry.count += 1;
  }

  function login(req, res) {
    if (!key) return res.status(503).json({ success: false, message: 'Tracker editor sessions are not configured' });
    if (tooManyFailures(req.ip)) return res.status(429).json({ success: false, message: 'Too many attempts. Try again later.' });

    const storeId = String(req.body?.storeId ?? '').trim();
    const teamName = String(req.body?.teamName ?? '').trim();
    const password = passwords.get(editorKey(storeId, teamName));
    const supplied = sha256(String(req.body?.password ?? ''));
    const expected = sha256(password ?? crypto.randomBytes(32).toString('hex'));
    if (!password || !crypto.timingSafeEqual(supplied, expected)) {
      recordFailure(req.ip);
      return res.status(password ? 401 : 403).json({ success: false, message: 'Invalid editor credentials' });
    }

    failures.delete(req.ip);
    res.setHeader('Set-Cookie', cookie(req, issueToken(storeId, teamName), SESSION_MS / 1000));
    return res.json({ success: true, storeId, teamName });
  }

  return {
    login,
    logout(req, res) {
      res.setHeader('Set-Cookie', cookie(req, '', 0));
      return res.json({ success: true });
    },
    session(req, res) {
      const editor = readSession(req);
      return res.json({ success: Boolean(editor), editor });
    },
    requireAuth(req, res, next) {
      const editor = readSession(req);
      if (!editor) return res.status(401).json({ success: false, message: 'Tracker editor login required' });
      req.trackerEditor = editor;
      return next();
    },
  };
}

export { editorKey as projectTrackerEditorKey };