export interface ExtensionViewerUpdate {
  platform: 'tiktok' | 'twitch' | 'kick' | 'youtube';
  count: number;
  timestamp: number;
  rawText: string;
  confidence: number;
  tabId?: number;
}

export interface TranscriptUpdate {
  text: string;
  timestamp: number;
  confidence: number;
  isFinal: boolean;
}

class ExtensionService {
  private ws: WebSocket | null = null;
  private onViewerUpdate: ((data: ExtensionViewerUpdate) => void) | null = null;
  private onTranscriptUpdate: ((data: TranscriptUpdate) => void) | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT = 10;
  private reconnectTimer: number | null = null;
  private extensionReadyResolve: (() => void) | null = null;

  // Check if extension is available
  async isExtensionAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const testWs = new WebSocket('wss://hnvdovyiapkkjrxcxbrv.supabase.co/functions/v1/websocket-relay/spikely-webapp');
      
      const timeout = setTimeout(() => {
        testWs.close();
        resolve(false);
      }, 3000);
      
      testWs.onopen = () => {
        clearTimeout(timeout);
        testWs.close();
        resolve(true);
      };
      
      testWs.onerror = () => {
        clearTimeout(timeout);
        resolve(false);
      };
    });
  }

  // Connect to extension via WebSocket
  async connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[Extension] Already connected');
      return;
    }

    try {
      console.log('[Extension] Connecting to extension...');
      
      this.ws = new WebSocket('wss://hnvdovyiapkkjrxcxbrv.supabase.co/functions/v1/websocket-relay/spikely-webapp');

      this.ws.onopen = () => {
        console.log('[Extension] ✅ Connected');
        this.reconnectAttempts = 0;
        
        // Send ready message
        this.ws?.send(JSON.stringify({
          type: 'WEBAPP_READY',
          timestamp: Date.now()
        }));
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'EXTENSION_READY') {
            console.log('[Extension] Extension ready signal received');
            if (this.extensionReadyResolve) {
              this.extensionReadyResolve();
              this.extensionReadyResolve = null;
            }
          } else if (data.type === 'VIEWER_COUNT' && this.onViewerUpdate) {
            this.onViewerUpdate({
              platform: data.platform,
              count: data.count,
              timestamp: data.timestamp,
              rawText: data.rawText,
              confidence: data.confidence,
              tabId: data.tabId
            });
          } else if (data.type === 'TRANSCRIPT') {
            console.log('[Extension] 📝 Transcript received:', data.text, 'isFinal:', data.isFinal);
            if (this.onTranscriptUpdate) {
              console.log('[Extension] 📝 Calling onTranscriptUpdate callback');
              this.onTranscriptUpdate({
                text: data.text,
                timestamp: data.timestamp,
                confidence: data.confidence,
                isFinal: data.isFinal !== undefined ? data.isFinal : true
              });
            } else {
              console.warn('[Extension] ⚠️ No onTranscriptUpdate callback registered!');
            }
          }
        } catch (error) {
          console.error('[Extension] Error parsing message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('[Extension] ❌ Disconnected');
        this.ws = null;
        
        // Attempt reconnection with exponential backoff
        if (this.reconnectAttempts < this.MAX_RECONNECT) {
          this.reconnectAttempts++;
          const delay = 2000 * Math.pow(1.5, this.reconnectAttempts);
          console.log(`[Extension] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
          
          this.reconnectTimer = window.setTimeout(() => {
            this.connect();
          }, delay);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[Extension] WebSocket error:', error);
      };
    } catch (error) {
      console.error('[Extension] Failed to connect:', error);
      throw error;
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    console.log('[Extension] Disconnected');
  }

  onViewerCount(callback: (data: ExtensionViewerUpdate) => void) {
    this.onViewerUpdate = callback;
  }

  onTranscript(callback: (data: TranscriptUpdate) => void) {
    this.onTranscriptUpdate = callback;
  }

  // Send command to extension
  sendCommand(command: 'START_TRACKING' | 'STOP_TRACKING') {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: command,
        timestamp: Date.now()
      }));
    }
  }

  // Send any message type to extension/sidepanel
  send(type: string, payload: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type,
        ...payload,
        timestamp: payload.timestamp || Date.now()
      }));
    }
  }

  // Check if connected
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // Wait for extension ready signal
  awaitExtensionReady(timeoutMs = 3000): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.extensionReadyResolve) {
        // Already waiting
        return resolve(false);
      }

      const timeout = setTimeout(() => {
        this.extensionReadyResolve = null;
        resolve(false);
      }, timeoutMs);

      this.extensionReadyResolve = () => {
        clearTimeout(timeout);
        resolve(true);
      };
    });
  }
}

export const extensionService = new ExtensionService();
