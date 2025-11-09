// ============================================================================
// LVT PATCH R8: Preload Hook for Early Shadow Root Interception (document_start)
// ============================================================================

// LVT PATCH R8: Immediately patch attachShadow before any page scripts run
(function() {
  try {
    console.log('[VIEWER:INIT:HOOKED] Shadow interception starting at document_start');
    
    // LVT PATCH R8: Initialize shadow registry with WeakSet for memory safety
    if (!window.__spikely_shadow_registry) {
      window.__spikely_shadow_registry = new WeakSet();
      console.log('[VIEWER:INIT:HOOKED] Shadow registry initialized');
    }
    
    // LVT PATCH R8: Patch Element.prototype.attachShadow immediately
    if (Element.prototype.attachShadow && !window.__spikely_attachShadow_patched) {
      const originalAttachShadow = Element.prototype.attachShadow;
      
      Element.prototype.attachShadow = function(options) {
        const shadowRoot = originalAttachShadow.call(this, options);
        
        // LVT PATCH R8: Store reference to all shadow roots (including closed)
        window.__spikely_shadow_registry.add(shadowRoot);
        console.log(`[VIEWER:INIT:HOOKED] captured shadow root on ${this.tagName} (${options.mode})`);
        
        return shadowRoot;
      };
      
      window.__spikely_attachShadow_patched = true;
      console.log('[VIEWER:INIT:HOOKED] attachShadow patch active');
    }
    
    // LVT PATCH R8: Shadow Root Heartbeat - monitor registry population
    let heartbeatCount = 0;
    const maxHeartbeats = 8; // 250ms × 8 = 2 seconds
    
    const heartbeatInterval = setInterval(() => {
      heartbeatCount++;
      const registrySize = window.__spikely_shadow_registry?.size || 0;
      
      console.log(`[VIEWER:HEARTBEAT] registry=${registrySize} (beat ${heartbeatCount}/${maxHeartbeats})`);
      
      // LVT PATCH R8: Stop heartbeat once roots detected or timeout reached
      if (registrySize >= 1 || heartbeatCount >= maxHeartbeats) {
        clearInterval(heartbeatInterval);
        
        if (registrySize >= 1) {
          console.log(`[VIEWER:REGISTRY] ${registrySize} roots captured successfully`);
        } else {
          console.log('[VIEWER:REGISTRY] no roots captured, starting manual rescan');
          
          // LVT PATCH R8: Force manual rescan if no roots captured
          setTimeout(() => {
            const allElements = document.querySelectorAll('*');
            let manualCount = 0;
            
            for (const element of allElements) {
              if (element.shadowRoot) {
                window.__spikely_shadow_registry.add(element.shadowRoot);
                manualCount++;
              }
            }
            
            console.log(`[VIEWER:REGISTRY] manual rescan found ${manualCount} existing shadow roots`);
          }, 100);
        }
      }
    }, 250); // LVT PATCH R8: 250ms heartbeat interval
    
  } catch (error) {
    console.error('[VIEWER:INIT:HOOKED] Preload hook failed:', error);
  }
})();