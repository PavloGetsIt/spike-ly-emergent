// ============================================================================
// LVT PATCH R8: Preload Hook for Early Shadow Root Interception (document_start)  
// ============================================================================

// LVT PATCH R8: Immediately patch attachShadow before page scripts run
(function() {
  try {
    console.log('[VIEWER:INIT:HOOKED] Shadow interception active at document_start');
    
    // LVT PATCH R8: Create shadow registry as WeakSet
    if (!window.__spikely_shadow_registry) {
      window.__spikely_shadow_registry = new WeakSet();
      console.log('[VIEWER:INIT:HOOKED] Shadow registry WeakSet created');
    }
    
    // LVT PATCH R8: Patch Element.prototype.attachShadow immediately  
    if (Element.prototype.attachShadow && !window.__spikely_attachShadow_patched) {
      const originalAttachShadow = Element.prototype.attachShadow;
      
      Element.prototype.attachShadow = function(options) {
        const shadowRoot = originalAttachShadow.call(this, options);
        
        // LVT PATCH R8: Store roots as they're attached
        window.__spikely_shadow_registry.add(shadowRoot);
        console.log(`[VIEWER:INIT:HOOKED] captured shadow root on ${this.tagName} (${options.mode})`);
        
        return shadowRoot;
      };
      
      window.__spikely_attachShadow_patched = true;
      console.log('[VIEWER:INIT:HOOKED] attachShadow patch installed');
    }
    
    // LVT PATCH R8: Shadow Root Heartbeat (every 250ms × 8 = 2s)
    let heartbeatCount = 0;
    const maxHeartbeats = 8;
    let shadowRootCount = 0;
    
    const heartbeatInterval = setInterval(() => {
      heartbeatCount++;
      
      // LVT PATCH R8: Count registry entries by manual scan (WeakSet not iterable)
      const allElements = document.querySelectorAll('*');
      let currentRootCount = 0;
      
      for (const element of allElements) {
        if (element.shadowRoot) {
          currentRootCount++;
        }
      }
      
      console.log(`[VIEWER:HEARTBEAT] registry=${currentRootCount} (beat ${heartbeatCount}/${maxHeartbeats})`);
      
      // LVT PATCH R8: Once ≥1 root detected or timeout, stop heartbeat
      if (currentRootCount >= 1 || heartbeatCount >= maxHeartbeats) {
        clearInterval(heartbeatInterval);
        
        if (currentRootCount >= 1) {
          console.log(`[VIEWER:REGISTRY] count=${currentRootCount}`);
          shadowRootCount = currentRootCount;
        } else {
          console.log('[VIEWER:REGISTRY] no roots found, forcing manual rescan');
          
          // LVT PATCH R8: Force manual rescan of all elements for existing shadowRoots
          setTimeout(() => {
            for (const element of document.querySelectorAll('*')) {
              if (element.shadowRoot && window.__spikely_shadow_registry) {
                window.__spikely_shadow_registry.add(element.shadowRoot);
              }
            }
            console.log('[VIEWER:REGISTRY] manual rescan completed');
          }, 100);
        }
      }
    }, 250); // LVT PATCH R8: 250ms heartbeat interval
    
  } catch (error) {
    console.error('[VIEWER:INIT:HOOKED] Preload hook initialization failed:', error);
  }
})();