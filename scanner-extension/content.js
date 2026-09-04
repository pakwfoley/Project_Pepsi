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
    const card = findCard(anchor); const rawText = clean(card?.innerText || anchor.innerText || '');
    const image = card?.querySelector('img') || anchor.querySelector('img');
    const price = parsePrice(rawText);
    const lines = rawText.split('\n').map(clean).filter(Boolean);
    const title = lines.find((line) => !/^\$|^free$/i.test(line) && line.length > 3) || image?.alt || 'Marketplace watch listing';
    results.push({ id: match[1], url: `https://www.facebook.com/marketplace/item/${match[1]}/`, title: clean(title), rawText: rawText.slice(0, 1800), price, image: image?.src || '', capturedAt: new Date().toISOString() });
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

function gentleScroll() {
  const key = 'projectPepsiScrollSteps'; const steps = Number(sessionStorage.getItem(key) || 0);
  if (steps >= 18 || window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 200) {
    window.scrollTo({ top: 0, behavior: 'smooth' }); sessionStorage.setItem(key, '0');
  } else {
    window.scrollBy({ top: Math.round(window.innerHeight * 0.75), behavior: 'smooth' }); sessionStorage.setItem(key, String(steps + 1));
  }
}

const clean = (value) => String(value).replace(/\s+/g, ' ').trim();
