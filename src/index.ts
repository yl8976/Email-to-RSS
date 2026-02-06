import { Hono } from 'hono';
import { handle as handleInbound } from './routes/inbound';
import { handle as handleRSS } from './routes/rss';
import { handle as handleAdmin } from './routes/admin';
import { Env } from './types';

// Define allowed origins for CORS
const ALLOWED_ORIGINS = ['https://getmynews.app', 'https://www.getmynews.app'];

// Fallback ForwardEmail.net IP addresses in case API fetch fails
const FALLBACK_FORWARD_EMAIL_IPS = [
  '138.197.213.185', // mx1.forwardemail.net
  '121.127.44.56',   // mx1.forwardemail.net (alternate)
  '104.248.224.170'  // mx2.forwardemail.net
];

// Create the main Hono app
const app = new Hono();

// Cache for ForwardEmail.net IPs with expiration
let forwardEmailIpsCache: {
  ips: string[];
  expiresAt: number;
} | null = null;

// Function to fetch ForwardEmail.net IPs from their API
async function getForwardEmailIps(): Promise<string[]> {
  try {
    // Return from cache if available and not expired
    if (forwardEmailIpsCache && forwardEmailIpsCache.expiresAt > Date.now()) {
      return forwardEmailIpsCache.ips;
    }
    
    // Fetch the latest IPs from ForwardEmail.net
    const response = await fetch('https://forwardemail.net/ips/v4.json', {
      headers: {
        'User-Agent': 'Email-to-RSS/1.0',
      },
      cf: {
        cacheTtl: 3600, // Cache for 1 hour in Cloudflare's cache
        cacheEverything: true,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch IPs: ${response.status}`);
    }
    
    // Define the expected type for the API response
    interface IpEntry {
      hostname: string;
      ipv4: string[];
      updated: string;
    }
    
    const data = await response.json() as IpEntry[];
    
    // Extract IPs for mx1 and mx2 servers
    const mxIps = data
      .filter(entry => 
        entry.hostname === 'mx1.forwardemail.net' || 
        entry.hostname === 'mx2.forwardemail.net'
      )
      .flatMap(entry => entry.ipv4);
    
    // Store in cache for 24 hours
    forwardEmailIpsCache = {
      ips: mxIps,
      expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };
    
    console.log('Fetched ForwardEmail.net IPs:', mxIps);
    return mxIps;
  } catch (error) {
    console.error('Error fetching ForwardEmail.net IPs:', error);
    // Return fallback IPs if fetch fails
    return FALLBACK_FORWARD_EMAIL_IPS;
  }
}

// CORS middleware
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    c.header('Access-Control-Max-Age', '86400');
  }
  
  // Handle preflight requests
  if (c.req.method === 'OPTIONS') {
    return c.text('', 204);
  }
  
  await next();
});

// Group routes by functionality
const api = new Hono();
const rss = new Hono();
const admin = new Hono();

// Webhook security middleware for /inbound - verify ForwardEmail.net IP
api.use('/inbound', async (c, next) => {
  // Get the client IP
  const clientIP = c.req.header('CF-Connecting-IP') || // Cloudflare-specific header
                   c.req.header('X-Forwarded-For')?.split(',')[0].trim() ||
                   c.req.raw.headers.get('x-real-ip') ||
                   '0.0.0.0';
  
  // Get the latest ForwardEmail.net IPs
  const allowedIps = await getForwardEmailIps();
  
  // Check if the request is coming from ForwardEmail.net
  if (!allowedIps.includes(clientIP)) {
    console.error(`Unauthorized webhook request from IP: ${clientIP}`);
    return c.text('Unauthorized', 401);
  }
  
  console.log(`Authorized webhook request from ForwardEmail.net (${clientIP}`);
  await next();
});

// API routes (inbound webhook)
api.post('/inbound', handleInbound);

// RSS feed routes (public)
rss.get('/:feedId', handleRSS);

// Admin routes (protected)
admin.route('/', handleAdmin);

// Mount the route groups
app.route('/api', api);
app.route('/rss', rss);
app.route('/admin', admin);

// Root path redirects to admin dashboard
app.get('/', (c) => c.redirect('/admin'));

// Catch-all for 404s
app.all('*', (c) => c.text('Not Found', 404));

// Export the worker handler
export default app; 