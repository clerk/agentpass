/**
 * AgentPass Todo Service Reference Implementation
 * Uses @agentpass/service with Clerk Sign In Tokens for browser sessions
 * and custom API tokens for bearer tokens.
 *
 * Cloudflare Worker entry point using Hono.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createAgentPassHandler, apiTokens } from './agentpass';
import type { ApiTokenInfo } from './agentpass';

export interface Env {
  SERVICE_ORIGIN: string;
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  SIGNING_KEY: string; // JSON-encoded JWK private key
  SIGNING_KEY_ID: string;
  AUTHORITY_URL: string;
  AUTHORITY_CONFIG_OVERRIDES?: string;
}

// In-memory stores for demo
const todos = new Map<string, Todo[]>();

interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  createdBy?: string;
}

function generateId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

const app = new Hono<{ Bindings: Env }>();

// CORS
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Bearer token auth middleware for /api/* ───
function authenticateToken(authHeader: string | undefined): ApiTokenInfo | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const tokenInfo = apiTokens.get(token);
  if (!tokenInfo) return null;
  if (tokenInfo.expiresAt < Date.now()) {
    apiTokens.delete(token);
    return null;
  }
  return tokenInfo;
}

// ─── Todo API routes ───

app.get('/api/todos', (c) => {
  const tokenInfo = authenticateToken(c.req.header('Authorization'));
  if (!tokenInfo) return c.json({ error: { code: 'unauthorized', message: 'Bearer token required' } }, 401);
  if (!tokenInfo.scope.includes('todos:read') && !tokenInfo.scope.includes('*')) {
    return c.json({ error: { code: 'forbidden', message: 'Missing todos:read scope' } }, 403);
  }
  const userTodos = todos.get(tokenInfo.userEmail) || [];
  return c.json({ todos: userTodos, user: tokenInfo.userEmail, agent: tokenInfo.agentId });
});

app.post('/api/todos', async (c) => {
  const tokenInfo = authenticateToken(c.req.header('Authorization'));
  if (!tokenInfo) return c.json({ error: { code: 'unauthorized', message: 'Bearer token required' } }, 401);
  if (!tokenInfo.scope.includes('todos:write') && !tokenInfo.scope.includes('*')) {
    return c.json({ error: { code: 'forbidden', message: 'Missing todos:write scope' } }, 403);
  }
  const body = await c.req.json<{ title: string }>();
  const todo: Todo = {
    id: generateId(),
    title: body.title,
    completed: false,
    createdAt: new Date().toISOString(),
    createdBy: tokenInfo.agentId,
  };
  const userTodos = todos.get(tokenInfo.userEmail) || [];
  userTodos.push(todo);
  todos.set(tokenInfo.userEmail, userTodos);
  return c.json({ todo }, 201);
});

app.patch('/api/todos/:id', async (c) => {
  const tokenInfo = authenticateToken(c.req.header('Authorization'));
  if (!tokenInfo) return c.json({ error: { code: 'unauthorized', message: 'Bearer token required' } }, 401);
  if (!tokenInfo.scope.includes('todos:write') && !tokenInfo.scope.includes('*')) {
    return c.json({ error: { code: 'forbidden', message: 'Missing todos:write scope' } }, 403);
  }
  const todoId = c.req.param('id');
  const body = await c.req.json<Partial<Todo>>();
  const userTodos = todos.get(tokenInfo.userEmail) || [];
  const todo = userTodos.find(t => t.id === todoId);
  if (!todo) return c.json({ error: { code: 'not_found', message: 'Todo not found' } }, 404);
  if (body.title !== undefined) todo.title = body.title;
  if (body.completed !== undefined) todo.completed = body.completed;
  return c.json({ todo });
});

app.delete('/api/todos/:id', (c) => {
  const tokenInfo = authenticateToken(c.req.header('Authorization'));
  if (!tokenInfo) return c.json({ error: { code: 'unauthorized', message: 'Bearer token required' } }, 401);
  if (!tokenInfo.scope.includes('todos:write') && !tokenInfo.scope.includes('*')) {
    return c.json({ error: { code: 'forbidden', message: 'Missing todos:write scope' } }, 403);
  }
  const todoId = c.req.param('id');
  const userTodos = todos.get(tokenInfo.userEmail) || [];
  const idx = userTodos.findIndex(t => t.id === todoId);
  if (idx === -1) return c.json({ error: { code: 'not_found', message: 'Todo not found' } }, 404);
  userTodos.splice(idx, 1);
  return c.json({ deleted: true });
});

// ─── Browser init endpoint ───

app.get('/init', (c) => {
  const token = c.req.query('token');
  if (!token) {
    return c.json({ error: { code: 'missing_token', message: 'Init token required' } }, 400);
  }

  const tokenInfo = apiTokens.get(token);
  if (!tokenInfo) {
    return c.json({ error: { code: 'invalid_token', message: 'Invalid or consumed init token' } }, 410);
  }

  // Consume the token (single-use)
  apiTokens.delete(token);

  if (tokenInfo.expiresAt < Date.now()) {
    return c.json({ error: { code: 'expired_token', message: 'Init token expired' } }, 410);
  }

  const redirectUrl = `${c.env.SERVICE_ORIGIN}/?user=${encodeURIComponent(tokenInfo.userEmail)}&agent=${encodeURIComponent(tokenInfo.agentId)}`;
  return c.redirect(redirectUrl, 302);
});

// ─── AgentPass Service handler ───

app.all('/agentpass-service/*', async (c) => {
  const handler = createAgentPassHandler(c);
  return handler(c.req.raw);
});

export default app;
