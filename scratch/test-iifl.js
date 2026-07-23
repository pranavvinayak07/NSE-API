const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

async function test() {
  const url = 'https://www.indiainfoline.com/cms-api/v1/public/get-options-detail?symbol=nifty&expiry=02-06-2026&callPutIndicator=ce&strikePrice=23550';
  console.log(`Fetching: ${url}`);
  try {
    const result = await get(url);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Fetch failed:', err);
  }
}

test();
