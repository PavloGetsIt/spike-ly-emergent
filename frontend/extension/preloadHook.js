// ============================================================================
// LVT PATCH R9: Early Shadow Interception Hook (document_start execution)
// ============================================================================

// LVT PATCH R9: Idempotent preload hook - safe for multiple executions
(function() {
  'use strict';
  
  // LVT PATCH R9: Skip if already initialized to prevent double-patching
  if (window.__spikely_attachShadow_patched) {
    return;
  }
  
  try {
    // LVT PATCH R9: Initialize single global registry as WeakSet
    if (!window.__spikely_shadow_registry) {
      window.__spikely_shadow_registry = new WeakSet();
    }
    
    // LVT PATCH R9: Patch Element.prototype.attachShadow exactly once
    if (Element.prototype.attachShadow) {
      const originalAttachShadow = Element.prototype.attachShadow;
      
      Element.prototype.attachShadow = function(options) {
        const shadowRoot = originalAttachShadow.call(this, options);
        
        // LVT PATCH R9: Add shadowRoot.host to registry (not shadowRoot itself for WeakSet)
        window.__spikely_shadow_registry.add(this); // Add the host element
        
        return shadowRoot;
      };
      
      // LVT PATCH R9: Mark patch as complete
      window.__spikely_attachShadow_patched = true;
    }
    
  } catch (error) {
    // Silent fail - don't break page if patch fails
  }
})();