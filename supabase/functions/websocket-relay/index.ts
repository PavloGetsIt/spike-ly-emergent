import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const clients = new Map<string, { socket: WebSocket; type: 'extension' | 'webapp' }>();

serve(async (req) => {
  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400 });
  }

  try {
    const { socket, response } = Deno.upgradeWebSocket(req);
    const clientId = crypto.randomUUID();
    const url = new URL(req.url);
    const clientType = url.pathname.includes('extension') ? 'extension' : 'webapp';

    console.log(`[WebSocket Relay] ${clientType} connecting... (${clientId})`);

    socket.onopen = () => {
      clients.set(clientId, { socket, type: clientType });
      console.log(`[WebSocket Relay] ✅ ${clientType} connected (${clients.size} total clients)`);
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log(`[WebSocket Relay] Message from ${clientType}:`, message.type);

        // Broadcast to all other clients
        clients.forEach((client, id) => {
          if (id !== clientId && client.socket.readyState === WebSocket.OPEN) {
            client.socket.send(event.data);
          }
        });

        // Log viewer count updates
        if (message.type === 'VIEWER_COUNT') {
          console.log(`[WebSocket Relay] 📊 ${message.platform}: ${message.count} viewers`);
        }
      } catch (error) {
        console.error('[WebSocket Relay] Error parsing message:', error);
      }
    };

    socket.onclose = () => {
      clients.delete(clientId);
      console.log(`[WebSocket Relay] ❌ ${clientType} disconnected (${clients.size} remaining)`);
    };

    socket.onerror = (error) => {
      console.error('[WebSocket Relay] Socket error:', error);
      clients.delete(clientId);
    };

    return response;
  } catch (error) {
    console.error('[WebSocket Relay] Failed to upgrade connection:', error);
    return new Response("Failed to upgrade to WebSocket", { status: 500 });
  }
});
