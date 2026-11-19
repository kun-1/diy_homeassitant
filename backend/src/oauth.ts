import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

interface AuthCodeRecord {
  clientId: string;
  redirectUri: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  expiresAt: number;
}

const authCodes = new Map<string, AuthCodeRecord>();

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function getOrigin(req: FastifyRequest): string {
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(protoHeader)
    ? protoHeader[0]
    : (protoHeader?.split(',')[0]?.trim() || req.protocol || 'http');
  const hostHeader = req.headers['x-forwarded-host'] ?? req.headers.host ?? '127.0.0.1:3100';
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader.split(',')[0].trim();
  return `${proto}://${host}`;
}

function isValidRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === 'https:') return true;
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function signOAuthToken(secret: string, kind: 'access' | 'refresh', ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const nonce = randomBytes(8).toString('hex');
  const payload = Buffer.from(JSON.stringify({ k: kind, exp, n: nonce })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `pt_${payload}.${sig}`;
}

export function verifyOAuthAccessToken(token: string, secret: string): boolean {
  if (!token.startsWith('pt_')) return false;
  const body = token.slice(3);
  const dot = body.indexOf('.');
  if (dot <= 0) return false;
  const payload = body.slice(0, dot);
  const sig = body.slice(dot + 1);
  const expectedSig = createHmac('sha256', secret).update(payload).digest('base64url');
  if (!safeEqual(sig, expectedSig)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      k?: string;
      exp?: number;
    };
    return parsed.k === 'access' && typeof parsed.exp === 'number' && parsed.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function verifyPkce(verifier: string, challenge: string, method = 'plain'): boolean {
  if (method === 'S256') {
    const digest = createHash('sha256').update(verifier).digest('base64url');
    return safeEqual(digest, challenge);
  }
  return safeEqual(verifier, challenge);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderAuthorizePage(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  error?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>授权连接无线热敏打印机</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; background: #0f172a; color: #f1f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 14px; padding: 24px; max-width: 400px; width: 100%; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  p { font-size: 13px; color: #94a3b8; line-height: 1.5; margin: 0 0 16px; }
  label { display: block; font-size: 12px; color: #cbd5e1; margin-bottom: 6px; }
  input[type="text"] { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: #fff; font-size: 14px; -webkit-text-security: disc; }
  button { width: 100%; margin-top: 16px; padding: 11px; border: none; border-radius: 8px; background: #38bdf8; color: #082f49; font-weight: 700; font-size: 14px; cursor: pointer; }
  .err { background: #7f1d1d; color: #fecaca; padding: 8px 10px; border-radius: 8px; font-size: 12px; margin-bottom: 12px; }
</style>
</head>
<body>
  <form class="card" method="post" action="/oauth/authorize">
    <h1>🖨️ 授权连接热敏打印机 MCP</h1>
    <p>客户端 <b>${escapeHtml(params.clientId)}</b> 请求访问你的无线热敏打印机（Todo / 留言 / 图片打印）。请输入后端的 <code>MCP_TOKEN</code> 确认授权。</p>
    ${params.error ? `<div class="err">${escapeHtml(params.error)}</div>` : ''}
    <input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}" />
    <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}" />
    <input type="hidden" name="state" value="${escapeHtml(params.state)}" />
    <input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge)}" />
    <input type="hidden" name="code_challenge_method" value="${escapeHtml(params.codeChallengeMethod)}" />
    <label>设备配对码 (MCP_TOKEN)</label>
    <input type="text" name="passcode" autocomplete="off" spellcheck="false" required autofocus placeholder="输入 backend/.env.local 中的 MCP_TOKEN" />
    <button type="submit">确认授权并跳转</button>
  </form>
</body>
</html>`;
}

export function registerOAuth(app: FastifyInstance): void {
  app.addHook('onResponse', (req, reply, done) => {
    if (
      req.url.startsWith('/oauth') ||
      req.url.startsWith('/.well-known') ||
      req.url.startsWith('/mcp')
    ) {
      console.log(`[MCP/OAuth] ${req.method} ${req.url} -> ${reply.statusCode}`);
    }
    done();
  });

  // Support application/x-www-form-urlencoded without extra dependencies.
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body, done) => {
      try {
        const params = new URLSearchParams(body as string);
        const obj: Record<string, string> = {};
        for (const [k, v] of params.entries()) obj[k] = v;
        done(null, obj);
      } catch (err) {
        done(err as Error);
      }
    },
  );

  // RFC 9728 Protected Resource Metadata
  const protectedResourceMeta = (req: FastifyRequest) => {
    const origin = getOrigin(req);
    return {
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      bearer_methods_supported: ['header'],
    };
  };
  app.get('/.well-known/oauth-protected-resource', protectedResourceMeta);
  app.get('/.well-known/oauth-protected-resource/mcp', protectedResourceMeta);

  // RFC 8414 Authorization Server Metadata
  app.get('/.well-known/oauth-authorization-server', (req) => {
    const origin = getOrigin(req);
    return {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      code_challenge_methods_supported: ['S256', 'plain'],
    };
  });

  app.get('/oauth/authorize', (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const clientId = q.client_id ?? '';
    const redirectUri = q.redirect_uri ?? '';
    const expectedClientId = process.env.OAUTH_CLIENT_ID;

    if (!clientId || (expectedClientId && clientId !== expectedClientId)) {
      return reply.code(400).send({ error: 'invalid_client' });
    }
    if (!redirectUri || !isValidRedirectUri(redirectUri)) {
      return reply.code(400).send({ error: 'invalid_redirect_uri' });
    }

    reply.header('content-type', 'text/html; charset=utf-8');
    return renderAuthorizePage({
      clientId,
      redirectUri,
      state: q.state ?? '',
      codeChallenge: q.code_challenge ?? '',
      codeChallengeMethod: q.code_challenge_method ?? 'S256',
    });
  });

  app.post('/oauth/authorize', (req, reply) => {
    const b = (req.body ?? {}) as Record<string, string | undefined>;
    const clientId = b.client_id ?? '';
    const redirectUri = b.redirect_uri ?? '';
    const state = b.state ?? '';
    const passcode = b.passcode ?? '';
    const expectedClientId = process.env.OAUTH_CLIENT_ID;
    const mcpToken = process.env.MCP_TOKEN ?? '';

    if (!clientId || (expectedClientId && clientId !== expectedClientId)) {
      return reply.code(400).send({ error: 'invalid_client' });
    }
    if (!redirectUri || !isValidRedirectUri(redirectUri)) {
      return reply.code(400).send({ error: 'invalid_redirect_uri' });
    }
    if (!mcpToken || !safeEqual(passcode, mcpToken)) {
      reply.code(401).header('content-type', 'text/html; charset=utf-8');
      return renderAuthorizePage({
        clientId,
        redirectUri,
        state,
        codeChallenge: b.code_challenge ?? '',
        codeChallengeMethod: b.code_challenge_method ?? 'S256',
        error: '访问密码 (MCP_TOKEN) 不正确，请重试',
      });
    }

    const code = randomBytes(24).toString('base64url');
    authCodes.set(code, {
      clientId,
      redirectUri,
      codeChallenge: b.code_challenge || undefined,
      codeChallengeMethod: b.code_challenge_method || 'S256',
      expiresAt: Date.now() + 5 * 60_000,
    });

    const target = new URL(redirectUri);
    target.searchParams.set('code', code);
    if (state) target.searchParams.set('state', state);
    return reply.redirect(target.toString());
  });

  app.post('/oauth/token', (req, reply) => {
    const b = (req.body ?? {}) as Record<string, string | undefined>;
    const mcpToken = process.env.MCP_TOKEN ?? '';
    const expectedClientId = process.env.OAUTH_CLIENT_ID ?? '';
    const expectedClientSecret = process.env.OAUTH_CLIENT_SECRET ?? '';

    if (!mcpToken || !expectedClientId || !expectedClientSecret) {
      return reply.code(503).send({ error: 'server_error', error_description: 'OAuth not configured' });
    }

    let clientId = b.client_id ?? '';
    let clientSecret = b.client_secret ?? '';
    const authHeader = req.headers.authorization ?? '';
    if (authHeader.startsWith('Basic ')) {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      if (idx > 0) {
        clientId = decodeURIComponent(decoded.slice(0, idx));
        clientSecret = decodeURIComponent(decoded.slice(idx + 1));
      }
    }

    if (!safeEqual(clientId, expectedClientId) || !safeEqual(clientSecret, expectedClientSecret)) {
      console.log('[OAuth/token] invalid_client', { hasAuthHeader: Boolean(authHeader), clientId });
      return reply.code(401).send({ error: 'invalid_client' });
    }

    const grantType = b.grant_type;
    if (grantType === 'authorization_code') {
      const code = b.code ?? '';
      const record = authCodes.get(code);
      authCodes.delete(code);
      if (!record || record.expiresAt < Date.now() || record.clientId !== clientId) {
        console.log('[OAuth/token] invalid_grant: code missing/expired/client mismatch', {
          found: Boolean(record),
          expired: record ? record.expiresAt < Date.now() : null,
        });
        return reply.code(400).send({ error: 'invalid_grant' });
      }
      if (b.redirect_uri && b.redirect_uri !== record.redirectUri) {
        console.log('[OAuth/token] invalid_grant: redirect_uri mismatch');
        return reply.code(400).send({ error: 'invalid_grant' });
      }
      if (record.codeChallenge) {
        const verifier = b.code_verifier ?? '';
        if (!verifier || !verifyPkce(verifier, record.codeChallenge, record.codeChallengeMethod)) {
          console.log('[OAuth/token] invalid_grant: PKCE failed');
          return reply.code(400).send({ error: 'invalid_grant', error_description: 'PKCE failed' });
        }
      }
      return {
        access_token: signOAuthToken(mcpToken, 'access', 86400 * 30),
        token_type: 'Bearer',
        expires_in: 86400 * 30,
        refresh_token: signOAuthToken(mcpToken, 'refresh', 86400 * 90),
        scope: 'mcp',
      };
    }

    if (grantType === 'refresh_token') {
      const rt = b.refresh_token ?? '';
      if (!rt.startsWith('pt_')) {
        return reply.code(400).send({ error: 'invalid_grant' });
      }
      return {
        access_token: signOAuthToken(mcpToken, 'access', 86400 * 30),
        token_type: 'Bearer',
        expires_in: 86400 * 30,
        refresh_token: signOAuthToken(mcpToken, 'refresh', 86400 * 90),
      };
    }

    return reply.code(400).send({ error: 'unsupported_grant_type' });
  });
}
