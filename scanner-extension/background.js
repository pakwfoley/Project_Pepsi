const DEFAULTS = {
  enabled: false,
  tabId: null,
  intervalMinutes: 5,
  keywords: 'rolex,omega,tudor,breitling,cartier,iwc,grand seiko,longines',
  excludedKeywords: 'replica,homage,inspired style,parts only,wanted',
  maximumAsk: 10000,
  minimumScore: 55,
  autoScroll: true,
  homeLocation: 'Nevada City, CA',
  homeLatitude: 39.3017,
  homeLongitude: -120.9717,
  maximumDistanceMiles: 100,
  localOnly: true,
  backendUrl: 'https://projectpepsi-production.up.railway.app',
  listings: {},
};

chrome.runtime.onInstalled.addListener(async () => {
  const saved = await chrome.storage.local.get(DEFAULTS);
  await chrome.storage.local.set(saved);
  await resetAlarm(saved);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'project-pepsi-scan') return;
  await runScan();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_SCANNER') {
    startScanner(message.settings).then(sendResponse); return true;
  }
  if (message.type === 'STOP_SCANNER') {
    stopScanner().then(sendResponse); return true;
  }
  if (message.type === 'SCAN_NOW') {
    runScan().then(sendResponse); return true;
  }
  if (message.type === 'LISTINGS_FOUND') {
    storeListings(message.listings, sender.tab?.id).then(sendResponse); return true;
  }
  if (message.type === 'AUTH_SIGN_IN') { signIn().then(sendResponse); return true; }
  if (message.type === 'AUTH_STATUS') { authStatus().then(sendResponse); return true; }
  if (message.type === 'AUTH_SIGN_OUT') { signOut().then(sendResponse); return true; }
});

const AUTH0_DOMAIN = 'dev-uxnklrcyku2o3xyz.us.auth0.com';
const AUTH0_CLIENT_ID = 'jthSzbjxVTRm16BJyAVDhN1L79vf1gWE';
const AUTH0_AUDIENCE = 'https://api.project-pepsi';
const AUTH0_SCOPES = 'openid profile email read:listings write:listings analyze:listings';

const base64Url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function signIn() {
  try {
    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(64)));
    const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const state = base64Url(crypto.getRandomValues(new Uint8Array(24)));
    const redirectUri = chrome.identity.getRedirectURL();
    const authorize = new URL(`https://${AUTH0_DOMAIN}/authorize`);
    authorize.search = new URLSearchParams({ response_type: 'code', client_id: AUTH0_CLIENT_ID, redirect_uri: redirectUri, audience: AUTH0_AUDIENCE, scope: AUTH0_SCOPES, code_challenge: challenge, code_challenge_method: 'S256', state }).toString();
    const callback = await chrome.identity.launchWebAuthFlow({ url: authorize.toString(), interactive: true });
    if (!callback) throw new Error('Sign-in did not return to the extension.');
    const returned = new URL(callback);
    if (returned.searchParams.get('state') !== state) throw new Error('OAuth state validation failed.');
    const code = returned.searchParams.get('code');
    if (!code) throw new Error(returned.searchParams.get('error_description') || 'Authorization code missing.');
    const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: AUTH0_CLIENT_ID, code, code_verifier: verifier, redirect_uri: redirectUri }) });
    const tokens = await response.json();
    if (!response.ok || !tokens.access_token) throw new Error(tokens.error_description || 'Token exchange failed.');
    await chrome.storage.local.set({ accessToken: tokens.access_token, accessTokenExpiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000 });
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Sign-in failed.' }; }
}

async function accessToken() {
  const state = await chrome.storage.local.get(['accessToken', 'accessTokenExpiresAt']);
  if (!state.accessToken || Number(state.accessTokenExpiresAt) <= Date.now() + 30_000) throw new Error('Sign in to Project Pepsi before scanning.');
  return state.accessToken;
}

async function authStatus() {
  try { await accessToken(); return { authenticated: true }; }
  catch { return { authenticated: false }; }
}

async function signOut() {
  await stopScanner();
  await chrome.storage.local.remove(['accessToken', 'accessTokenExpiresAt']);
  return { ok: true };
}

async function startScanner(settings) {
  try { await accessToken(); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Sign in to Project Pepsi before scanning.' }; }
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !tab.url?.startsWith('https://www.facebook.com/marketplace/')) {
    return { ok: false, error: 'Open the Facebook Marketplace search you want scanned, then try again.' };
  }
  const next = { ...settings, enabled: true, tabId: tab.id, searchUrl: tab.url, pausedReason: '' };
  await chrome.storage.local.set(next); await resetAlarm(next);
  return runScan();
}

async function stopScanner() {
  await chrome.storage.local.set({ enabled: false, tabId: null });
  await chrome.alarms.clear('project-pepsi-scan');
  return { ok: true };
}

async function resetAlarm(settings) {
  await chrome.alarms.clear('project-pepsi-scan');
  if (settings.enabled) chrome.alarms.create('project-pepsi-scan', { periodInMinutes: Math.max(1, Number(settings.intervalMinutes) || 5) });
}

async function runScan() {
  const settings = await chrome.storage.local.get(DEFAULTS);
  if (!settings.enabled || !settings.tabId) return { ok: false, error: 'Scanner is stopped.' };
  try {
    await accessToken();
    const tab = await chrome.tabs.get(settings.tabId);
    if (!tab.url?.startsWith('https://www.facebook.com/marketplace/')) throw new Error('The scanner tab is no longer on Marketplace.');
    let response;
    try {
      response = await chrome.tabs.sendMessage(settings.tabId, { type: 'SCAN_PAGE', autoScroll: settings.autoScroll });
    } catch (error) {
      if (!String(error).includes('Receiving end does not exist')) throw error;
      await chrome.scripting.executeScript({ target: { tabId: settings.tabId }, files: ['locations.js', 'content.js'] });
      response = await chrome.tabs.sendMessage(settings.tabId, { type: 'SCAN_PAGE', autoScroll: settings.autoScroll });
    }
    if (!response?.ok) throw new Error(response?.error || 'The Marketplace page did not respond.');
    const stored = await storeListings(response.listings || [], settings.tabId);
    await chrome.storage.local.set({ lastScanAt: new Date().toISOString(), pausedReason: '', lastVisibleCount: response.count });
    return { ok: true, count: response.count, newCount: stored.newCount, flaggedCount: stored.flaggedCount };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Scanner tab unavailable.';
    await chrome.storage.local.set({ pausedReason: reason });
    return { ok: false, error: reason };
  }
}

function scoreListing(listing, settings) {
  const text = `${listing.title} ${listing.rawText}`.toLowerCase();
  const wanted = String(settings.keywords).split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const excluded = String(settings.excludedKeywords).split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (excluded.some((term) => text.includes(term))) return { score: 0, reasons: ['Excluded term found'], eligible: false };
  if (settings.localOnly && listing.distanceMiles != null && listing.distanceMiles > Number(settings.maximumDistanceMiles)) return { score: 0, reasons: [`Outside ${settings.maximumDistanceMiles}-mile radius`], eligible: false };
  let score = 10; const reasons = [];
  const match = wanted.find((term) => text.includes(term));
  if (match) { score += 45; reasons.push(`Matches “${match}”`); }
  if (listing.price && listing.price <= Number(settings.maximumAsk)) { score += 25; reasons.push(`Ask is within ${formatMoney(settings.maximumAsk)}`); }
  if (/\b(?:full set|box.{0,8}papers|papers.{0,8}box)\b/i.test(text)) { score += 10; reasons.push('Mentions full set'); }
  if (/\b(?:ref(?:erence)?[\s:#-]*[a-z0-9.-]{5,}|\d{3}\.\d{2}\.\d{2})\b/i.test(text)) { score += 10; reasons.push('Reference-like identifier found'); }
  if (listing.distanceMiles != null && listing.distanceMiles <= Number(settings.maximumDistanceMiles)) { score += 15; reasons.push(`${Math.round(listing.distanceMiles)} mi from Nevada City`); }
  else if (listing.distanceMiles == null) { score -= 20; reasons.push('Location unknown'); }
  if (!listing.price) reasons.push('Price needs review');
  return { score: Math.max(0, Math.min(score, 100)), reasons, eligible: listing.distanceMiles != null ? listing.distanceMiles <= Number(settings.maximumDistanceMiles) : !settings.localOnly };
}

async function storeListings(incoming, tabId) {
  const settings = await chrome.storage.local.get(DEFAULTS);
  if (tabId !== settings.tabId) return { ok: false };
  const records = { ...settings.listings }; let newCount = 0; let flaggedCount = 0; let aiCount = 0;
  let collectorTabId = null;
  try { for (const listing of incoming) {
    const prior = records[listing.id]; const scored = scoreListing(listing, settings);
    records[listing.id] = { ...prior, ...listing, ...scored, firstSeenAt: prior?.firstSeenAt || new Date().toISOString(), lastSeenAt: new Date().toISOString() };
    if (!prior) newCount += 1;
    const needsInitialAnalysis = !prior?.aiAnalysis && !prior?.aiRequestedAt;
    const needsImageUpgrade = Boolean(prior?.aiAnalysis) && Number(prior?.imagesReviewed || 0) < 2 && !prior?.multiImageAttemptedAt;
    if ((needsInitialAnalysis || needsImageUpgrade) && scored.score >= 35 && aiCount < 3) {
      records[listing.id].aiRequestedAt = new Date().toISOString();
      if (needsImageUpgrade) records[listing.id].multiImageAttemptedAt = new Date().toISOString();
      try {
        const detail = await scrapeDetailListing(listing, collectorTabId);
        collectorTabId = detail.collectorTabId;
        const sources = detail.images?.length ? detail.images : (listing.images || []).map((sourceUrl, imageIndex) => ({ imageIndex, sourceUrl, sourceType: 'facebook_search_card' }));
        const imageData = await prepareImages(sources);
        const packageForAnalysis = {
          contractVersion: 1,
          source: 'facebook_marketplace',
          sourceListingId: String(listing.id || ''),
          url: listing.url,
          title: listing.title,
          rawText: detail.rawText || listing.rawText || '',
          price: listing.price ?? null,
          locationText: listing.locationText || '',
          distanceMiles: listing.distanceMiles ?? null,
          images: imageData,
        };
        const response = await fetch(`${settings.backendUrl}/api/analyze`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await accessToken()}` }, body: JSON.stringify(packageForAnalysis) });
        const result = await response.json();
        if (!response.ok) throw new Error(response.status === 401 ? 'Sign into the private Project Pepsi site, then scan again.' : result.error || 'Backend analysis failed.');
        records[listing.id].rawText = packageForAnalysis.rawText; records[listing.id].aiAnalysis = result.analysis; records[listing.id].aiModel = result.model; records[listing.id].imagesReviewed = result.ingestion?.submittedImages?.length || 0; aiCount += 1;
      } catch (error) { records[listing.id].aiError = error instanceof Error ? error.message : 'Backend analysis failed.'; }
    }
    if (!prior?.notifiedAt && scored.eligible && scored.score >= Number(settings.minimumScore)) {
      records[listing.id].notifiedAt = new Date().toISOString(); flaggedCount += 1;
      try {
        await chrome.notifications.create(`pepsi-${listing.id}`, { type: 'basic', iconUrl: 'icon.svg', title: `Project Pepsi · ${scored.score}/100`, message: `${listing.title}${listing.price ? ` · ${formatMoney(listing.price)}` : ''}${listing.distanceMiles != null ? ` · ${Math.round(listing.distanceMiles)} mi` : ' · location unknown'}` });
      } catch (_error) {
        // Some Chrome builds reject SVG notification icons. The opportunity is
        // still retained in the popup, and a cosmetic notification failure must
        // never abort the scan.
      }
    }
  } } finally { if (collectorTabId) await chrome.tabs.remove(collectorTabId).catch(() => undefined); }
  const trimmed = Object.fromEntries(Object.entries(records).sort((a, b) => String(b[1].lastSeenAt).localeCompare(String(a[1].lastSeenAt))).slice(0, 500));
  await chrome.storage.local.set({ listings: trimmed, lastNewCount: newCount, lastFlaggedCount: flaggedCount });
  return { ok: true, newCount, flaggedCount };
}

async function scrapeDetailListing(listing, collectorTabId) {
  let tabId = collectorTabId;
  if (tabId) {
    try { await chrome.tabs.update(tabId, { url: listing.url, active: false }); }
    catch { tabId = null; }
  }
  if (!tabId) tabId = (await chrome.tabs.create({ url: listing.url, active: false })).id;
  if (!tabId) return { ...listing, collectorTabId: null };
  await waitForTab(tabId);
  await delay(1500);
  let response;
  try { response = await chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_DETAIL' }); }
  catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['locations.js', 'content.js'] });
    response = await chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_DETAIL' });
  }
  return response?.ok ? { ...response, collectorTabId: tabId } : { ...listing, collectorTabId: tabId };
}

function waitForTab(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 12000);
    const listener = (updatedId, info) => {
      if (updatedId === tabId && info.status === 'complete') { clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve(); }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function prepareImages(sources) {
  const results = [];
  const unique = [...new Map(sources.map((item) => [item.sourceUrl, item])).values()].slice(0, 6);
  for (const source of unique) {
    try {
      const response = await fetch(source.sourceUrl, { credentials: 'include' }); const original = await response.blob();
      if (!response.ok || !original.type.startsWith('image/')) continue;
      const bitmap = await createImageBitmap(original); const originalWidth = bitmap.width; const originalHeight = bitmap.height;
      const scale = Math.min(1, 2048 / Math.max(originalWidth, originalHeight)); const width = Math.max(1, Math.round(originalWidth * scale)); const height = Math.max(1, Math.round(originalHeight * scale));
      const canvas = new OffscreenCanvas(width, height); const context = canvas.getContext('2d'); if (!context) { bitmap.close(); continue; }
      context.drawImage(bitmap, 0, 0, width, height); bitmap.close();
      let quality = 0.88; let encoded = await canvas.convertToBlob({ type: 'image/webp', quality });
      if (encoded.size > 2_000_000) { quality = 0.85; encoded = await canvas.convertToBlob({ type: 'image/webp', quality }); }
      if (encoded.size > 2_000_000) continue;
      const bytes = new Uint8Array(await encoded.arrayBuffer()); let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      results.push({ contractVersion: 1, imageIndex: source.imageIndex, sourceUrl: source.sourceUrl, sourceType: source.sourceType, mediaType: 'image/webp', originalWidth, originalHeight, width, height, longEdge: Math.max(width, height), quality, byteLength: encoded.size, dataUrl: `data:image/webp;base64,${btoa(binary)}` });
    } catch { /* Skip individual photos that Facebook no longer serves. */ }
  }
  return results;
}

const formatMoney = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value) || 0);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
