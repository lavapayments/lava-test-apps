'use strict';
require('dotenv').config();
const http = require('http');
const https = require('https');

// ===========================================
// CONFIGURATION
// ===========================================
const LAVA_FORWARD_TOKEN = process.env.LAVA_FORWARD_TOKEN;
const PORT = process.env.PORT || 3001;

if (!LAVA_FORWARD_TOKEN) {
  console.error('❌ LAVA_FORWARD_TOKEN is not set in .env file');
  console.error('   Generate a forward token from your Lava dashboard or SDK');
  process.exit(1);
}

// ===========================================
// SERVER
// ===========================================
const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/grade') {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const requestData = JSON.parse(body);

        const postData = JSON.stringify({
          model: requestData.model,
          messages: requestData.messages,
          max_tokens: requestData.max_tokens,
        });

        const options = {
          hostname: 'api.lavapayments.com',
          path: '/v1/forward?u=https://api.openai.com/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${LAVA_FORWARD_TOKEN}`,
            'Content-Length': Buffer.byteLength(postData),
          },
        };

        const apiReq = https.request(options, (apiRes) => {
          let responseData = '';

          apiRes.on('data', (chunk) => {
            responseData += chunk;
          });

          apiRes.on('end', () => {
            res.writeHead(apiRes.statusCode, {
              'Content-Type': 'application/json',
            });
            res.end(responseData);
          });
        });

        apiReq.on('error', (error) => {
          console.error('Error calling Lava API:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        });

        apiReq.write(postData);
        apiReq.end();
      } catch (error) {
        console.error('Error parsing request:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log('\n🧮 Math Practice Backend Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 Server running at: http://localhost:${PORT}`);
  console.log(`📚 Grade endpoint: http://localhost:${PORT}/api/grade`);
  console.log(`🔑 Forward Token: ${LAVA_FORWARD_TOKEN ? '✓ Configured' : '✗ Missing'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});
