type DebugEvent = {
  t: number;
  gate: string;
  data: any;
};

export const Debug = {
  enabled: true,
  ring: [] as DebugEvent[],
  
  emit(gate: string, data: any) {
    if (!this.enabled) return;
    
    const evt: DebugEvent = { 
      t: Date.now(), 
      gate, 
      data 
    };
    
    this.ring.push(evt);
    if (this.ring.length > 200) {
      this.ring.splice(0, this.ring.length - 200);
    }
    
    console.log(`[DBG ${gate}]`, data);
    window.dispatchEvent(new CustomEvent("spikely:dbg", { detail: evt }));
  },
  
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  },
  
  clear() {
    this.ring.length = 0;
  },
  
  getEvents() {
    return [...this.ring];
  }
};

// Expose globally for debugging
(window as any).__spikely = { debug: Debug };
