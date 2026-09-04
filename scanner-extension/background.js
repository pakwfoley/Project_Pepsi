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
  await chrome.storage.local.set(next); await resetAlarm(next); await runScan();
  return { ok: true };
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
    await chrome.storage.local.set({ lastScanAt: new Date().toISOString(), pausedReason: '' });
    return { ok: true, count: response.count };
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
  const records = { ...settings.listings }; let newCount = 0; let flaggedCount = 0;
  for (const listing of incoming) {
    const prior = records[listing.id]; const scored = scoreListing(listing, settings);
    records[listing.id] = { ...prior, ...listing, ...scored, firstSeenAt: prior?.firstSeenAt || new Date().toISOString(), lastSeenAt: new Date().toISOString() };
    if (!prior) newCount += 1;
    if (!prior?.notifiedAt && scored.eligible && scored.score >= Number(settings.minimumScore)) {
      records[listing.id].notifiedAt = new Date().toISOString(); flaggedCount += 1;
      await chrome.notifications.create(`pepsi-${listing.id}`, { type: 'basic', iconUrl: 'icon.svg', title: `Project Pepsi · ${scored.score}/100`, message: `${listing.title}${listing.price ? ` · ${formatMoney(listing.price)}` : ''}${listing.distanceMiles != null ? ` · ${Math.round(listing.distanceMiles)} mi` : ' · location unknown'}` });
    }
  }
  const trimmed = Object.fromEntries(Object.entries(records).sort((a, b) => String(b[1].lastSeenAt).localeCompare(String(a[1].lastSeenAt))).slice(0, 500));
  await chrome.storage.local.set({ listings: trimmed, lastNewCount: newCount, lastFlaggedCount: flaggedCount });
  return { ok: true, newCount, flaggedCount };
}

const formatMoney = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value) || 0);
