const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    }).on('error', reject);
  });
}

async function test() {
  const port = 3001; // The running dev server port
  const url = `http://localhost:${port}/api/preview?symbol=NIFTY&range=5`;
  console.log(`Sending GET request to ${url}...`);

  try {
    const result = await get(url);
    console.log('Response Status:', result.status);
    if (result.status !== 200) {
      console.error('Error response body:', result.body);
      return;
    }

    const { symbol, underlyingValue, atmStrike, strikeCount, timestamp, ohlcError, ohlcMapKeysCount, ohlcMap, strikes } = result.body;
    console.log('SUCCESS!');
    console.log('Symbol:', symbol);
    console.log('Underlying Value:', underlyingValue);
    console.log('ATM Strike:', atmStrike);
    console.log('Strikes count returned:', strikeCount);
    console.log('Timestamp:', timestamp);
    console.log('ohlcError:', ohlcError);
    console.log('ohlcMapKeysCount:', ohlcMapKeysCount);
    console.log('ohlcMap:', JSON.stringify(ohlcMap, null, 2));
    
    if (strikes && strikes.length > 0) {
      console.log('\nSample Strike Details (ATM):');
      const atmData = strikes.find(s => s.strikePrice === atmStrike) || strikes[0];
      console.log(JSON.stringify(atmData, null, 2));
    }
  } catch (err) {
    console.error('Fetch failed:', err.message);
  }
}

test();
