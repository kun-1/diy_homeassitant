import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const TOKEN = 'test-mcp-token';
const CLIENT_ID = 'printer-todo-web';
const CLIENT_SECRET = 'test-client-secret';

describe('OAuth 2.0 for Web MCP clients', () => {
  const app = buildApp(':memory:');
  let base = '';

  beforeAll(async () => {
    process.env.MCP_TOKEN = TOKEN;
    process.env.OAUTH_CLIENT_ID = CLIENT_ID;
    process.env.OAUTH_CLIENT_SECRET = CLIENT_SECRET;
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  });

  afterAll(async () => {
    await app.close();
    delete process.env.MCP_TOKEN;
    delete process.env.OAUTH_CLIENT_ID;
    delete process.env.OAUTH_CLIENT_SECRET;
  });

  it('publishes RFC 9728 and RFC 8414 metadata', async () => {
    const pr = await fetch(`${base}/.well-known/oauth-protected-resource`);
    expect(pr.status).toBe(200);
    const prJson = (await pr.json()) as { resource: string; authorization_servers: string[] };
    expect(prJson.resource).toBe(`${base}/mcp`);

    const as = await fetch(`${base}/.well-known/oauth-authorization-server`);
    expect(as.status).toBe(200);
    const asJson = (await as.json()) as { authorization_endpoint: string; token_endpoint: string };
    expect(asJson.authorization_endpoint).toBe(`${base}/oauth/authorize`);
    expect(asJson.token_endpoint).toBe(`${base}/oauth/token`);
  });

  it('completes authorization_code + PKCE S256 flow and grants access to /mcp', async () => {
    const verifier = 'my-secret-pkce-verifier-1234567890';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const redirectUri = 'https://gemini.google.com/oauth/callback';

    const authPage = await fetch(
      `${base}/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=xyz&code_challenge=${challenge}&code_challenge_method=S256`,
    );
    expect(authPage.status).toBe(200);

    const authPost = await fetch(`${base}/oauth/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      redirect: 'manual',
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
        state: 'xyz',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        passcode: TOKEN,
      }),
    });
    expect(authPost.status).toBe(302);
    const location = authPost.headers.get('location') ?? '';
    const code = new URL(location).searchParams.get('code');
    expect(code).toBeTruthy();

    const tokenRes = await fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code!,
        redirect_uri: redirectUri,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code_verifier: verifier,
      }),
    });
    expect(tokenRes.status).toBe(200);
    const tokenJson = (await tokenRes.json()) as { access_token: string; token_type: string };
    expect(tokenJson.token_type).toBe('Bearer');

    const mcpRes = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${tokenJson.access_token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(mcpRes.status).toBe(200);
  });
});
