/**
 * Notifications Service
 * 
 * Minimal webhook receiver that forwards MeshCentral events
 * to the admin dashboard for processing.
 * 
 * This service acts as a bridge between MeshCentral webhooks
 * and the admin dashboard's notification modules.
 */

const http = require('http');

const PORT = process.env.PORT || 3000;
const ADMIN_URL = process.env.ADMIN_URL || 'http://admin:3001';

/**
 * Forward webhook to admin dashboard
 */
async function forwardToAdmin(eventType, payload) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ event: eventType, ...payload });
        
        const url = new URL(`${ADMIN_URL}/api/webhook/meshcentral`);
        
        const options = {
            hostname: url.hostname,
            port: url.port || 3001,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };
        
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, body });
            });
        });
        
        req.on('error', reject);
        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.write(data);
        req.end();
    });
}

/**
 * Parse request body
 */
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                resolve({ raw: body });
            }
        });
        req.on('error', reject);
    });
}

/**
 * HTTP Server
 */
const server = http.createServer(async (req, res) => {
    const url = req.url;
    const method = req.method;
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Health check
    if (url === '/health' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        return;
    }
    
    // Webhook endpoint
    if (url === '/webhook' && method === 'POST') {
        try {
            const payload = await parseBody(req);
            const eventType = payload.action || payload.event || 'unknown';
            
            console.log(`[${new Date().toISOString()}] Received webhook: ${eventType}`);
            
            // Forward to admin dashboard
            try {
                const result = await forwardToAdmin(eventType, payload);
                console.log(`[${new Date().toISOString()}] Forwarded to admin: ${result.status}`);
            } catch (err) {
                console.error(`[${new Date().toISOString()}] Failed to forward: ${err.message}`);
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, event: eventType }));
        } catch (error) {
            console.error('Webhook error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
        return;
    }
    
    // MeshCentral specific endpoints
    if (url.startsWith('/meshcentral') && method === 'POST') {
        try {
            const payload = await parseBody(req);
            const eventType = url.replace('/meshcentral/', '').replace('/', '') || payload.action || 'meshcentral';
            
            console.log(`[${new Date().toISOString()}] MeshCentral event: ${eventType}`);
            
            // Forward to admin
            try {
                await forwardToAdmin(eventType, payload);
            } catch (err) {
                console.error(`Forward failed: ${err.message}`);
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
        return;
    }
    
    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('  Notifications Service');
    console.log('═══════════════════════════════════════════');
    console.log(`  Port:    ${PORT}`);
    console.log(`  Admin:   ${ADMIN_URL}`);
    console.log('  Status:  Running');
    console.log('═══════════════════════════════════════════');
    console.log('');
});
