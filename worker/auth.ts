export type AppEnv = Env & { LOGTO_CLIENT_SECRET: string; SESSION_SECRET: string }

export interface Session {
  sub: string
  name: string
  admin: boolean
  exp: number
}

interface Flow {
  state: string
  verifier: string
  to: string
}

const SESSION_COOKIE = '__Host-session'
const FLOW_COOKIE = '__Host-flow'
const SESSION_TTL = 86400
const FLOW_TTL = 600

const encoder = new TextEncoder()

const base64url = (data: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(data)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const fromBase64url = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

const random = (bytes: number) => base64url(crypto.getRandomValues(new Uint8Array(bytes)))

const hmacKey = (secret: string) =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])

async function seal(session: Session, secret: string) {
  const body = base64url(encoder.encode(JSON.stringify(session)))
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body))
  return `${body}.${base64url(signature)}`
}

async function unseal(token: string | undefined, secret: string): Promise<Session | null> {
  const [body, signature] = token?.split('.') ?? []
  if (!body || !signature) return null
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      fromBase64url(signature),
      encoder.encode(body),
    )
    if (!valid) return null
    const session: Session = JSON.parse(new TextDecoder().decode(fromBase64url(body)))
    return session.exp > Date.now() / 1000 ? session : null
  } catch {
    return null
  }
}

function cookie(req: Request, name: string) {
  for (const pair of (req.headers.get('Cookie') ?? '').split('; ')) {
    if (pair.startsWith(`${name}=`)) return pair.slice(name.length + 1)
  }
}

const setCookie = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`

function redirect(location: string, ...cookies: string[]) {
  const headers = new Headers({ Location: location })
  for (const value of cookies) headers.append('Set-Cookie', value)
  return new Response(null, { status: 302, headers })
}

const localPath = (to: string | null) => (to && /^\/(?![/\\])/.test(to) ? to : '/')

export const getSession = (req: Request, env: AppEnv) =>
  unseal(cookie(req, SESSION_COOKIE), env.SESSION_SECRET)

async function login(url: URL, env: AppEnv) {
  const flow: Flow = {
    state: random(16),
    verifier: random(32),
    to: localPath(url.searchParams.get('to')),
  }
  const challenge = await crypto.subtle.digest('SHA-256', encoder.encode(flow.verifier))
  const query = new URLSearchParams({
    client_id: env.LOGTO_CLIENT_ID,
    redirect_uri: `${url.origin}/auth/callback`,
    response_type: 'code',
    scope: 'openid profile roles',
    state: flow.state,
    code_challenge: base64url(challenge),
    code_challenge_method: 'S256',
  })
  return redirect(
    `${env.LOGTO_ISSUER}/auth?${query}`,
    setCookie(FLOW_COOKIE, encodeURIComponent(JSON.stringify(flow)), FLOW_TTL),
  )
}

function readFlow(req: Request): Flow | null {
  try {
    return JSON.parse(decodeURIComponent(cookie(req, FLOW_COOKIE) ?? ''))
  } catch {
    return null
  }
}

async function callback(req: Request, url: URL, env: AppEnv) {
  const flow = readFlow(req)
  const code = url.searchParams.get('code')
  if (!flow || !code || url.searchParams.get('state') !== flow.state) {
    return new Response('Invalid sign-in state', { status: 400 })
  }

  const tokenRes = await fetch(`${env.LOGTO_ISSUER}/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${env.LOGTO_CLIENT_ID}:${env.LOGTO_CLIENT_SECRET}`)}` },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${url.origin}/auth/callback`,
      code_verifier: flow.verifier,
    }),
  })
  if (!tokenRes.ok) return new Response('Sign-in failed', { status: 502 })
  const { access_token } = await tokenRes.json<{ access_token: string }>()

  const userRes = await fetch(`${env.LOGTO_ISSUER}/me`, {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  if (!userRes.ok) return new Response('Sign-in failed', { status: 502 })
  const user = await userRes.json<{ sub: string; name?: string; username?: string; roles?: string[] }>()

  const roles = user.roles ?? []
  const admin = roles.includes(env.ROLE_ADMIN)
  const clearFlow = setCookie(FLOW_COOKIE, '', 0)
  if (!admin && !roles.includes(env.ROLE_MEMBER)) return redirect('/?denied', clearFlow)

  const session: Session = {
    sub: user.sub,
    name: user.name || user.username || user.sub,
    admin,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
  }
  return redirect(
    flow.to,
    clearFlow,
    setCookie(SESSION_COOKIE, await seal(session, env.SESSION_SECRET), SESSION_TTL),
  )
}

function logout(url: URL, env: AppEnv) {
  const query = new URLSearchParams({
    client_id: env.LOGTO_CLIENT_ID,
    post_logout_redirect_uri: url.origin,
  })
  return redirect(`${env.LOGTO_ISSUER}/session/end?${query}`, setCookie(SESSION_COOKIE, '', 0))
}

export function handleAuth(req: Request, url: URL, env: AppEnv) {
  if (req.method !== 'GET') return new Response(null, { status: 405 })
  switch (url.pathname) {
    case '/auth/login':
      return login(url, env)
    case '/auth/callback':
      return callback(req, url, env)
    case '/auth/logout':
      return logout(url, env)
  }
  return new Response(null, { status: 404 })
}
