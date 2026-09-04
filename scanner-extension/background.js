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
  backendUrl: 'https://project-pepsi-trade-intelligence.patrickfoley2017.chatgpt.site',
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
});

async function startScanner(settings) {
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
  for (const listing of incoming) {
    const prior = records[listing.id]; const scored = scoreListing(listing, settings);
    records[listing.id] = { ...prior, ...listing, ...scored, firstSeenAt: prior?.firstSeenAt || new Date().toISOString(), lastSeenAt: new Date().toISOString() };
    if (!prior) newCount += 1;
    if (!prior?.aiAnalysis && !prior?.aiRequestedAt && scored.score >= 35 && aiCount < 3) {
      records[listing.id].aiRequestedAt = new Date().toISOString();
      try {
        const detail = await scrapeDetailListing(listing);
        const imageData = await prepareImages(detail.images || (listing.images || []).map((sourceUrl, imageIndex) => ({ imageIndex, sourceUrl, sourceType: 'facebook_search_card' })));
        const packageForAnalysis = { ...listing, rawText: detail.rawText || listing.rawText, images: imageData };
        const response = await fetch(`${settings.backendUrl}/api/analyze`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(packageForAnalysis) });
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
  }
  const trimmed = Object.fromEntries(Object.entries(records).sort((a, b) => String(b[1].lastSeenAt).localeCompare(String(a[1].lastSeenAt))).slice(0, 500));
  await chrome.storage.local.set({ listings: trimmed, lastNewCount: newCount, lastFlaggedCount: flaggedCount });
  return { ok: true, newCount, flaggedCount };
}

async function scrapeDetailListing(listing) {
  let detailTab;
  try {
    detailTab = await chrome.tabs.create({ url: listing.url, active: false });
    await waitForTab(detailTab.id); await delay(2200);
    let response;
    try { response = await chrome.tabs.sendMessage(detailTab.id, { type: 'SCRAPE_DETAIL' }); }
    catch { await chrome.scripting.executeScript({ target: { tabId: detailTab.id }, files: ['locations.js', 'content.js'] }); response = await chrome.tabs.sendMessage(detailTab.id, { type: 'SCRAPE_DETAIL' }); }
    return response?.ok ? response : listing;
  } finally { if (detailTab?.id) await chrome.tabs.remove(detailTab.id).catch(() => undefined); }
}

function waitForTab(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 12000);
    const listener = (updatedId, info) => { if (updatedId === tabId && info.status === 'complete') { clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve(); } };
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

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const formatMoney = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value) || 0);
