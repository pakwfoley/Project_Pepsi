'use client';

import { createAuth0Client, type Auth0Client } from '@auth0/auth0-spa-js';

const domain = 'dev-uxnklrcyku2o3xyz.us.auth0.com';
const clientId = '8ycycQBliyhYr0G9emPjIzvujzPF7nYx';
const audience = 'https://api.project-pepsi';
let client: Promise<Auth0Client> | undefined;

export function authClient() {
  client ??= createAuth0Client({ domain, clientId, authorizationParams: { audience, scope: 'openid profile email read:listings write:listings analyze:listings', redirect_uri: `${window.location.origin}/auth/callback` }, cacheLocation: 'localstorage', useRefreshTokens: false });
  return client;
}

export async function authorizedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = await (await authClient()).getTokenSilently();
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
