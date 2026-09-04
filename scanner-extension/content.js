chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'SCAN_PAGE') return;
  try {
    const listings = extractListings();
    chrome.runtime.sendMessage({ type: 'LISTINGS_FOUND', listings });
    if (message.autoScroll) gentleScroll();
    sendResponse({ ok: true, count: listings.length });
  } catch (error) { sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Could not read this page.' }); }
});

function extractListings() {
  const anchors = [...document.querySelectorAll('a[href*="/marketplace/item/"]')];
  const seen = new Set(); const results = [];
  for (const anchor of anchors) {
    const match = anchor.href.match(/\/marketplace\/item\/(\d+)/); if (!match || seen.has(match[1])) continue;
    seen.add(match[1]);
    const card = findCard(anchor); const cardText = card?.innerText || anchor.innerText || ''; const rawText = clean(cardText);
    const image = card?.querySelector('img') || anchor.querySelector('img');
    const price = parsePrice(rawText);
    const lines = cardText.split('\n').map(clean).filter(Boolean);
    const title = lines.find((line) => !/^\$|^free$/i.test(line) && line.length > 3) || image?.alt || 'Marketplace watch listing';
    const location = parseLocation(lines); const distanceMiles = location ? distanceFromNevadaCity(location.coordinates) : null;
    results.push({ id: match[1], url: `https://www.facebook.com/marketplace/item/${match[1]}/`, title: clean(title), rawText: rawText.slice(0, 1800), price, image: image?.src || '', locationText: location?.name || '', distanceMiles, locationStatus: distanceMiles == null ? 'unknown' : distanceMiles <= 100 ? 'local' : 'outside_radius', capturedAt: new Date().toISOString() });
  }
  return results;
}

function findCard(anchor) {
  let node = anchor;
  for (let depth = 0; depth < 7 && node?.parentElement; depth += 1) {
    node = node.parentElement;
    const text = clean(node.innerText || '');
    if (node.querySelector('img') && text.length > 12 && text.length < 2200) return node;
  }
  return anchor;
}

function parsePrice(text) {
  const match = text.match(/\$\s*((?:[1-9]\d{0,2}(?:,\d{3})+)|(?:[1-9]\d{1,6}))/);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

function parseLocation(lines) {
  for (const line of lines) {
    const match = line.match(/([A-Za-z][A-Za-z .'-]{1,45}),?\s+(?:CA|California)\b/i);
    if (!match) continue;
    const candidate = clean(match[1]).toLowerCase(); const coordinates = CALIFORNIA_PLACES[candidate];
    if (coordinates) return { name: `${titleCase(candidate)}, CA`, coordinates };
  }
  return null;
}

function distanceFromNevadaCity([latitude, longitude]) {
  const radians = (degrees) => degrees * Math.PI / 180; const earthMiles = 3958.8;
  const dLat = radians(latitude - 39.3017); const dLon = radians(longitude - (-120.9717));
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(39.3017)) * Math.cos(radians(latitude)) * Math.sin(dLon / 2) ** 2;
  return Number((earthMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
}

const titleCase = (value) => value.replace(/\b\w/g, (character) => character.toUpperCase());

function gentleScroll() {
  const key = 'projectPepsiScrollSteps'; const steps = Number(sessionStorage.getItem(key) || 0);
  if (steps >= 18 || window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 200) {
    window.scrollTo({ top: 0, behavior: 'smooth' }); sessionStorage.setItem(key, '0');
  } else {
    window.scrollBy({ top: Math.round(window.innerHeight * 0.75), behavior: 'smooth' }); sessionStorage.setItem(key, String(steps + 1));
  }
}

const clean = (value) => String(value).replace(/\s+/g, ' ').trim();
