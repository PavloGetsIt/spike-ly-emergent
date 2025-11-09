// ============================================================================
// LVT PATCH R7: Preload Shadow Interception Hook (document_start)
// ============================================================================

// LVT PATCH R7: Early hook injection before TikTok creates shadow roots
(function() {
  try {
    // LVT PATCH R7: Initialize shadow registry immediately
    if (!window.__spikely_shadow_registry) {
      window.__spikely_shadow_registry = new Set(); // LVT PATCH R7: Use Set instead of WeakSet for persistence
      console.log('[VIEWER:INIT:HOOKED] Shadow interception registry initialized');
    }
    
    // LVT PATCH R7: Patch Element.prototype.attachShadow before TikTok runs
    const originalAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(options) {
      const shadowRoot = originalAttachShadow.call(this, options);
      
      // LVT PATCH R7: Store reference to all shadow roots (including closed)
      window.__spikely_shadow_registry.add(shadowRoot);
      console.log(`[VIEWER:INIT:HOOKED] captured shadow root on ${this.tagName} (${options.mode})`);
      
      return shadowRoot;
    };
    
    console.log('[VIEWER:INIT:HOOKED] Shadow interception active at document_start');
    
    // LVT PATCH R7: Late-stage retroactive catch-up after 1s
    setTimeout(() => {
      console.log('[VIEWER:INIT:CATCHUP] Starting retroactive shadow root scan...');
      
      const allElements = document.querySelectorAll('*');
      let retroactiveCount = 0;
      
      for (const element of allElements) {
        if (element.shadowRoot && !window.__spikely_shadow_registry.has(element.shadowRoot)) {
          window.__spikely_shadow_registry.add(element.shadowRoot);
          retroactiveCount++;
          console.log(`[VIEWER:INIT:CATCHUP] found pre-existing shadow root #${retroactiveCount} on ${element.tagName}`);
        }
      }
      
      console.log(`[VIEWER:REGISTRY] ${window.__spikely_shadow_registry.size} total roots captured (${retroactiveCount} retroactive)`);
      
    }, 1000); // LVT PATCH R7: 1s delay for retroactive scan
    
  } catch (error) {
    console.error('[VIEWER:INIT:HOOKED] Shadow interception failed:', error);
  }
})();