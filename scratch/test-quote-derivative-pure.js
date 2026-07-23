const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Connection': 'keep-alive',
};

const API_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/option-chain',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'X-Requested-With': 'XMLHttpRequest',
  'Connection': 'keep-alive',
};

function mergeCookies(existing, setCookieHeaders) {
  const map = new Map();
  if (existing) {
    existing.split(';').forEach(part => {
      const trimmed = part.trim();
      const idx = trimmed.indexOf('=');
      if (idx > 0) map.set(trimmed.slice(0, idx).trim(), trimmed.slice(idx + 1).trim());
    });
  }
  setCookieHeaders.forEach(header => {
    const nameValue = header.split(';')[0].trim();
    const idx = nameValue.indexOf('=');
    if (idx > 0) map.set(nameValue.slice(0, idx).trim(), nameValue.slice(idx + 1).trim());
  });
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function test() {
  try {
    let cookies = '';
    console.log("Step 1: Fetching base URL...");
    const r1 = await fetch('https://www.nseindia.com', { headers: BASE_HEADERS });
    const c1 = typeof r1.headers.getSetCookie === 'function' ? r1.headers.getSetCookie() : [r1.headers.get('set-cookie')].filter(Boolean);
    cookies = mergeCookies(cookies, c1);
    await new Promise(r => setTimeout(r, 500));

    console.log("Step 2: Fetching option chain page...");
    const r2 = await fetch('https://www.nseindia.com/option-chain', {
      headers: { ...BASE_HEADERS, Referer: 'https://www.nseindia.com/', 'Sec-Fetch-Site': 'same-origin' }
    });
    const c2 = typeof r2.headers.getSetCookie === 'function' ? r2.headers.getSetCookie() : [r2.headers.get('set-cookie')].filter(Boolean);
    cookies = mergeCookies(cookies, c2);
    await new Promise(r => setTimeout(r, 500));

    console.log("Step 2.5: Fetching derivatives quote page...");
    const r25 = await fetch('https://www.nseindia.com/get-quotes/derivatives?symbol=RELIANCE', {
      headers: { ...BASE_HEADERS, Referer: 'https://www.nseindia.com/', 'Sec-Fetch-Site': 'same-origin', Cookie: cookies }
    });
    const c25 = typeof r25.headers.getSetCookie === 'function' ? r25.headers.getSetCookie() : [r25.headers.get('set-cookie')].filter(Boolean);
    cookies = mergeCookies(cookies, c25);
    await new Promise(r => setTimeout(r, 500));

    console.log("Step 3: Fetching quote-derivative for RELIANCE...");
    const r3 = await fetch('https://www.nseindia.com/api/quote-derivative?symbol=RELIANCE', {
      headers: { ...API_HEADERS, Cookie: cookies }
    });
    
    console.log("Status:", r3.status);
    const text = await r3.text();
    console.log("Text (first 200 chars):", text.slice(0, 200));
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
