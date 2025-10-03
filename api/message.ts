// api/message.ts - Message handling endpoint
import type { VercelRequest, VercelResponse } from '@vercel/node';

const CHATMI_ENDPOINT = process.env.CHATMI_ENDPOINT || 
  'https://admin.chatme.ai/connector/webim/webim_message/a7e28b914256ab13395ec974e7bb9548/bot_api_webhook';

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

interface ChatmiRequest {
  event: 'new_message';
  chat: { id: string };
  text: string;
}

interface ChatmiResponse {
  has_answer: boolean;
  messages: Array<{
    kind: string;
    text: string;
  }>;
}

async function callChatmi(inputString: string): Promise<string> {
  const payload: ChatmiRequest = {
    event: 'new_message',
    chat: { id: 'mcp-session' },
    text: inputString
  };

  const response = await fetch(CHATMI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Chatmi API error: ${response.status} ${response.statusText}`);
  }

  const data: ChatmiResponse = await response.json();
  
  if (data.has_answer && data.messages.length > 0) {
    return data.messages[0].text;
  }
  
  throw new Error('No response from Chatmi');
}

function createSSEMessage(data: string): string {
  return `data: ${data}\n\n`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST to send messages.' });
  }

  try {
    const mcpRequest: MCPRequest = req.body;

    console.log('[MCP Request]', JSON.stringify(mcpRequest));

    // Validate JSON-RPC format
    if (mcpRequest.jsonrpc !== '2.0' || !mcpRequest.method) {
      console.error('[Validation Error] Invalid MCP request format');
      return res.status(400).json({
        jsonrpc: '2.0',
        id: mcpRequest.id || null,
        error: {
          code: -32600,
          message: 'Invalid Request'
        }
      });
    }

    // Convert MCP request to Chatmi INPUT_STRING format (stringified JSON)
    const inputObject = {
      method: mcpRequest.method,
      params: mcpRequest.params || {},
      id: mcpRequest.id
    };
    const inputString = JSON.stringify(inputObject);

    console.log('[Chatmi Input]', inputString);

    // Call Chatmi synchronously
    const outputString = await callChatmi(inputString);

    console.log('[Chatmi Output]', outputString);

    // Parse Chatmi's OUTPUT_STRING
    let result: any;
    try {
      const parsed = JSON.parse(outputString);
      result = parsed;
    } catch (parseError) {
      console.error('[Parse Error]', parseError);
      result = outputString;
    }

    // Create MCP response
    const mcpResponse: MCPResponse = {
      jsonrpc: '2.0',
      id: mcpRequest.id,
      result
    };

    console.log('[MCP Response]', JSON.stringify(mcpResponse));

    // Return as JSON (not SSE) since this is direct request-response
    return res.status(200).json(mcpResponse);
    
  } catch (error) {
    console.error('[Error]', error);
    const errorResponse: MCPResponse = {
      jsonrpc: '2.0',
      id: (req.body as MCPRequest)?.id || null,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error'
      }
    };
    return res.status(500).json(errorResponse);
  }
}

export const config = {
  api: {
    bodyParser: true,
  },
};
