// Spikely Template Bank - 30 Micro-Action Templates
// Used as fallback for medium-quality transcripts or when Claude fails

const TEMPLATE_BANK = {
  gaming: [
    {
      id: "GAMING-001",
      emotionalLabel: "gaming chat works",
      nextMove: "Ask 'What's your main game?'. Poll top 3",
      triggerType: ["spike", "flatline"],
      specificity: "high"
    },
    {
      id: "GAMING-002",
      emotionalLabel: "setup interest high",
      nextMove: "Show your gaming setup. Point at monitor",
      triggerType: ["spike", "flatline"],
      specificity: "high"
    },
    {
      id: "GAMING-003",
      emotionalLabel: "input preference",
      nextMove: "Ask 'Controller or keyboard?'. Count hands raised",
      triggerType: ["flatline"],
      specificity: "high"
    },
    {
      id: "GAMING-004",
      emotionalLabel: "rank curiosity",
      nextMove: "Ask 'What rank are you?'. Read top answers",
      triggerType: ["spike", "flatline"],
      specificity: "high"
    },
    {
      id: "GAMING-005",
      emotionalLabel: "gameplay interest",
      nextMove: "Share your best play. Describe the moment",
      triggerType: ["drop", "flatline"],
      specificity: "high"
    }
  ],

  makeup: [
    {
      id: "MAKEUP-001",
      emotionalLabel: "product interest",
      nextMove: "Hold product to camera. Show label closeup",
      triggerType: ["spike", "flatline"],
      specificity: "high"
    },
    {
      id: "MAKEUP-002",
      emotionalLabel: "finish preference",
      nextMove: "Ask 'Matte or shimmer?'. Poll the chat",
      triggerType: ["flatline"],
      specificity: "high"
    },
    {
      id: "MAKEUP-003",
      emotionalLabel: "technique curiosity",
      nextMove: "Demonstrate blending technique. Go slow motion",
      triggerType: ["spike", "flatline"],
      specificity: "high"
    },
    {
      id: "MAKEUP-004",
      emotionalLabel: "budget question",
      nextMove: "Ask 'Drugstore or luxury?'. Count votes live",
      triggerType: ["flatline"],
      specificity: "high"
    },
    {
      id: "MAKEUP-005",
      emotionalLabel: "shade comparison",
      nextMove: "Swatch two shades. Ask which wins",
      triggerType: ["spike", "flatline"],
      specificity: "high"
    }
  ],

  cooking: [
    {
      id: "COOKING-001",
      emotionalLabel: "recipe interest",
      nextMove: "Show ingredients lineup. Name each one",
      triggerType: ["spike", "flatline"],
      specificity: "high"
    },
    {
      id: "COOKING-002",
      emotionalLabel: "taste curiosity",
      nextMove: "Taste test on camera. React honestly",
      triggerType: ["spike", "flatline"],
      specificity: "high"
    },
    {
      id: "COOKING-003",
      emotionalLabel: "technique question",
      nextMove: "Demonstrate knife skill. Go slow motion",
      triggerType: ["spike"],
      specificity: "high"
    },
    {
      id: "COOKING-004",
      emotionalLabel: "preference poll",
      nextMove: "Ask 'Sweet or savory?'. Count responses",
      triggerType: ["flatline"],
      specificity: "high"
    },
    {
      id: "COOKING-005",
      emotionalLabel: "secret reveal",
      nextMove: "Share secret ingredient. Hold it up",
      triggerType: ["drop", "flatline"],
      specificity: "high"
    }
  ],

  fitness: [
    {
      id: "FITNESS-001",
      emotionalLabel: "form check interest",
      nextMove: "Demonstrate proper form. Side angle view",
      triggerType: ["spike", "flatline"],
      specificity: "high"
    },
    {
      id: "FITNESS-002",
      emotionalLabel: "workout preference",
      nextMove: "Ask 'Cardio or weights?'. Poll the chat",
      triggerType: ["flatline"],
      specificity: "high"
    },
    {
      id: "FITNESS-003",
      emotionalLabel: "rep count challenge",
      nextMove: "Count reps out loud. Race the timer",
      triggerType: ["spike", "flatline"],
      specificity: "high"
    },
    {
      id: "FITNESS-004",
      emotionalLabel: "goal curiosity",
      nextMove: "Ask 'Bulk or cut?'. Read answers aloud",
      triggerType: ["flatline"],
      specificity: "high"
    },
    {
      id: "FITNESS-005",
      emotionalLabel: "technique tips",
      nextMove: "Share your top 3 tips. Number them",
      triggerType: ["drop", "flatline"],
      specificity: "high"
    }
  ],

  tech: [
    {
      id: "TECH-001",
      emotionalLabel: "specs interest",
      nextMove: "Show specs screen. Read key numbers",
      triggerType: ["spike", "flatline"],
      specificity: "high"
    },
    {
      id: "TECH-002",
      emotionalLabel: "comparison curiosity",
      nextMove: "Compare two options. List 3 differences",
      triggerType: ["spike", "flatline"],
      specificity: "high"
    },
    {
      id: "TECH-003",
      emotionalLabel: "brand preference",
      nextMove: "Ask 'Apple or Android?'. Count the votes",
      triggerType: ["flatline"],
      specificity: "high"
    },
    {
      id: "TECH-004",
      emotionalLabel: "feature demo",
      nextMove: "Test main feature live. Show the results",
      triggerType: ["spike", "flatline"],
      specificity: "high"
    },
    {
      id: "TECH-005",
      emotionalLabel: "setup reveal",
      nextMove: "Show full setup. Pan camera slowly",
      triggerType: ["spike", "flatline"],
      specificity: "high"
    }
  ],

  general: [
    {
      id: "GENERAL-001",
      emotionalLabel: "viewer interaction",
      nextMove: "Call out top 3 usernames. Thank them personally",
      triggerType: ["flatline"],
      specificity: "high"
    },
    {
      id: "GENERAL-002",
      emotionalLabel: "location curiosity",
      nextMove: "Ask 'Where you watching from?'. Read top 5",
      triggerType: ["flatline"],
      specificity: "high"
    },
    {
      id: "GENERAL-003",
      emotionalLabel: "yes no poll",
      nextMove: "Start poll: Yes or No. Count votes live",
      triggerType: ["drop", "flatline"],
      specificity: "high"
    },
    {
      id: "GENERAL-004",
      emotionalLabel: "question time",
      nextMove: "Ask viewers a question. Read top 5 answers",
      triggerType: ["drop", "flatline"],
      specificity: "high"
    },
    {
      id: "GENERAL-005",
      emotionalLabel: "shoutout energy",
      nextMove: "Give shoutout to new followers. Wave at camera",
      triggerType: ["flatline"],
      specificity: "high"
    }
  ]
};

// Template selection logic
class TemplateSelector {
  constructor() {
    this.recentTemplates = []; // Track last 5 used templates
  }

  selectTemplate(keywords, delta) {
    // Determine category from keywords
    let category = 'general';
    if (keywords.includes('gaming')) category = 'gaming';
    else if (keywords.includes('makeup')) category = 'makeup';
    else if (keywords.includes('cooking')) category = 'cooking';
    else if (keywords.includes('fitness')) category = 'fitness';
    else if (keywords.includes('tech')) category = 'tech';
    else if (keywords.includes('product')) category = 'tech';
    
    console.log(`[Template] Category: ${category} | Delta: ${delta}`);
    
    // Get templates for category
    const templates = TEMPLATE_BANK[category];
    if (!templates || templates.length === 0) {
      console.warn('[Template] No templates found for category:', category);
      return null;
    }
    
    // Determine trigger type
    let triggerType;
    if (delta > 10) triggerType = 'spike';
    else if (delta < -10) triggerType = 'drop';
    else triggerType = 'flatline';
    
    // Filter by trigger type
    const filtered = templates.filter(t => t.triggerType.includes(triggerType));
    
    // Exclude recently used templates
    const available = filtered.filter(t => !this.recentTemplates.includes(t.id));
    
    // If all used, reset and use all filtered
    const pool = available.length > 0 ? available : filtered;
    
    // Select random template
    const selected = pool[Math.floor(Math.random() * pool.length)];
    
    // Track usage
    this.recentTemplates.push(selected.id);
    if (this.recentTemplates.length > 5) {
      this.recentTemplates.shift();
    }
    
    console.log(`[Template] Selected: ${selected.id} | Move: ${selected.nextMove}`);
    
    return {
      delta: delta,
      emotionalLabel: selected.emotionalLabel,
      nextMove: selected.nextMove,
      text: '',
      source: 'template',
      templateId: selected.id,
      category: category,
      triggerType: triggerType
    };
  }
}

// Export for use in correlationEngine
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TEMPLATE_BANK, TemplateSelector };
}

// Make available globally for Chrome extension
if (typeof window !== 'undefined') {
  window.TEMPLATE_BANK = TEMPLATE_BANK;
  window.TemplateSelector = TemplateSelector;
}

export { TEMPLATE_BANK, TemplateSelector };
