import crypto from 'node:crypto';

const COOKIE_NAME = 'fiona_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const OPEN_PATHS = new Set(['/health', '/login', '/logout', '/session']);

const sha256 = (value) => crypto.createHash('sha256').update(value).digest();

export function createAuth(password, now = () => Date.now()) {
  // Key derives from the password, so changing it invalidates every session.
  const key = sha256(`fiona-session:${password}`);
  const failures = new Map();

  const sign = (expiresAt) => crypto.createHmac('sha256', key).update(String(expiresAt)).digest('hex');
  const issueToken = () => {
    const expiresAt = now() + SESSION_MS;
    return `${expiresAt}.${sign(expiresAt)}`;
  };

  function isValidToken(token) {
    const [expiresAt, signature] = String(token ?? '').split('.');
    if (!/^\d+$/.test(expiresAt ?? '') || !signature || Number(expiresAt) < now()) return false;
    const expected = Buffer.from(sign(expiresAt));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  function readToken(req) {
    for (const part of String(req.headers.cookie ?? '').split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === COOKIE_NAME) return rest.join('=');
    }
    return null;
  }

  const isAuthenticated = (req) => Boolean(password) && isValidToken(readToken(req));

  function cookie(req, value, maxAgeSeconds) {
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
  }

  function tooManyFailures(ip) {
    const entry = failures.get(ip);
    if (!entry || entry.resetAt < now()) return false;
    return entry.count >= MAX_FAILURES;
  }

  function recordFailure(ip) {
    for (const [key, value] of failures) {
      if (value.resetAt < now()) failures.delete(key);
    }
    const entry = failures.get(ip);
    if (!entry || entry.resetAt < now()) failures.set(ip, { count: 1, resetAt: now() + FAILURE_WINDOW_MS });
    else entry.count += 1;
  }

  return {
    isAuthenticated,
    requireAuth(req, res, next) {
      if (OPEN_PATHS.has(req.path)) return next();
      if (!password) return res.status(503).json({ success: false, message: 'APP_PASSWORD is not configured' });
      if (!isAuthenticated(req)) return res.status(401).json({ success: false, message: 'Login required' });
      return next();
    },
    login(req, res) {
      if (!password) return res.status(503).json({ success: false, message: 'APP_PASSWORD is not configured' });
      if (tooManyFailures(req.ip)) {
        return res.status(429).json({ success: false, message: 'Πολλές αποτυχημένες προσπάθειες. Δοκίμασε αργότερα.' });
      }
      const supplied = sha256(String(req.body?.password ?? ''));
      if (!crypto.timingSafeEqual(supplied, sha256(password))) {
        recordFailure(req.ip);
        return res.status(401).json({ success: false, message: 'Λάθος κωδικός' });
      }
      failures.delete(req.ip);
      res.setHeader('Set-Cookie', cookie(req, issueToken(), SESSION_MS / 1000));
      return res.json({ success: true });
    },
    logout(req, res) {
      res.setHeader('Set-Cookie', cookie(req, '', 0));
      res.json({ success: true });
    },
    session(req, res) {
      res.status(isAuthenticated(req) ? 200 : 401).json({ success: isAuthenticated(req) });
    },
  };
}
