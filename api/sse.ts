// api/sse.ts - SSE connection endpoint
import type { VercelRequest, VercelResponse } from '@vercel/node';

const CHATMI_ENDPOINT = process.env.CHATMI_ENDPOINT || 
  'https://admin.chatme.ai/connector/webim/webim_message/a7e28b914256ab13395ec974e7bb9548/bot_api_webhook';

// In-memory store for pending requests (NOTE: Won't work across Vercel instances)
const pendingRequests = new Map<string, any>();

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

function createSSEMessage(data: string): string {
  return `data: ${data}\n\n`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept GET requests for SSE
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET for SSE connection.' });
  }

  const sessionId = (req.query.session as string) || 'default';
  
  console.log(`[SSE Connected] Session: ${sessionId}`);

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Send initial connection event
  res.write(createSSEMessage(JSON.stringify({
    type: 'connection',
    sessionId,
    timestamp: new Date().toISOString()
  })));

  // Store this connection
  pendingRequests.set(sessionId, res);

  // Keep-alive ping every 15 seconds
  const keepAliveInterval = setInterval(() => {
    res.write(':ping\n\n');
  }, 15000);

  // Clean up after 50 seconds (Vercel limit is 60s)
  const timeout = setTimeout(() => {
    console.log(`[SSE Timeout] Session: ${sessionId}`);
    clearInterval(keepAliveInterval);
    pendingRequests.delete(sessionId);
    res.end();
  }, 50000);

  // Handle client disconnect
  req.on('close', () => {
    console.log(`[SSE Disconnected] Session: ${sessionId}`);
    clearInterval(keepAliveInterval);
    clearTimeout(timeout);
    pendingRequests.delete(sessionId);
  });
}

export const config = {
  api: {
    bodyParser: true,
  },
};
