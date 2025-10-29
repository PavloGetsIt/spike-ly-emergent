// Niche-Specific Template Banks for Personalized Insights
// Each niche has targeted templates for better relevance

const NICHE_TEMPLATE_BANKS = {
  justChatting: {
    usaGrowth: [
      "Ask 'What state are you from?'. Pin USA responses",
      "Call out USA cities in chat. React excited", 
      "Ask 'East Coast or West Coast?'. Count votes",
      "Shoutout USA viewers only. Wave at camera",
      "Ask 'What time zone?'. Build USA map"
    ],
    engagement: [
      "Ask 'Would you rather' question. React to answers",
      "Start 'This or That' game. Point at choices",
      "Ask viewers to rate your outfit. Count scores",
      "Dance challenge: 'Copy my moves'. React big",
      "Ask 'Describe me in 3 words'. Read best ones",
      "Poll chat: 'Yes or No?'. Count hands raised",
      "Ask 'What should I do next?'. Take requests"
    ],
    telegramFunnel: [
      "Share Telegram link. Say 'Private chat time'",
      "Ask 'Who wants exclusive content?'. Tease Telegram",
      "Mention VIP Telegram group. Build FOMO",
      "Ask chat to DM for Telegram invite",
      "Tease: 'Special content in Telegram only'"
    ],
    generalGrowth: [
      "Ask viewers to follow. Say why they should",
      "Ask 'How did you find me?'. Build discovery",
      "Shoutout new followers. Thank them personally",
      "Ask 'What brings you here?'. Connect with them",
      "Challenge: 'Bring a friend next stream'. Reward referrals"
    ]
  },
  
  gaming: {
    generalGrowth: [
      "Ask 'What's your main game?'. Connect over shared games",
      "Show your gaming setup. Point at each component",
      "Ask 'What rank are you?'. Compare skills"
    ],
    engagement: [
      "Ask 'Controller or keyboard?'. Count votes",
      "Share your worst gaming fail. Be vulnerable",
      "Ask 'What game should I try?'. Take requests"
    ]
  },
  
  makeup: {
    generalGrowth: [
      "Ask 'Drugstore or luxury?'. Connect with budget",
      "Show before/after. Build transformation hype",
      "Ask 'What look should I try?'. Take requests"
    ],
    engagement: [
      "Ask 'Matte or shimmer?'. Count preferences",
      "Rate my blending skills. Ask for scores",
      "Ask 'What's your signature look?'. Share stories"
    ]
  },
  
  cooking: {
    generalGrowth: [
      "Ask 'What's your comfort food?'. Connect over food",
      "Show ingredient closeups. Build anticipation",
      "Ask 'Sweet or savory person?'. Find your tribe"
    ],
    engagement: [
      "Taste test on camera. React honestly",
      "Ask 'Rate this dish 1-10'. Count scores",
      "Ask 'What should I add next?'. Take suggestions"
    ]
  },
  
  general: {
    generalGrowth: [
      "Ask 'How did you find my stream?'. Learn discovery",
      "Shoutout new followers. Thank them by name",
      "Ask viewers to bring friends. Reward referrals"
    ],
    engagement: [
      "Ask 'This or That' question. Count votes",
      "Call out interesting usernames. React to them",
      "Start countdown for surprise. Build suspense"
    ]
  }
};

// Niche-aware template selector
class NicheTemplateSelector {
  constructor() {
    this.selectedNiche = 'general';
    this.selectedGoal = 'generalGrowth';
    this.recentTemplates = [];
    
    // Load saved preferences
    this.loadPreferences();
  }
  
  // Load niche/goal preferences from storage
  loadPreferences() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['selectedNiche', 'selectedGoal'], (result) => {
        this.selectedNiche = result.selectedNiche || 'general';
        this.selectedGoal = result.selectedGoal || 'generalGrowth';
        console.log('[NicheSelector] Loaded preferences:', this.selectedNiche, this.selectedGoal);
      });
    }
  }
  
  // Update niche/goal selection
  updateSelection(niche, goal) {
    this.selectedNiche = niche;
    this.selectedGoal = goal;
    
    console.log('[NicheSelector] Updated to:', niche, goal);
    
    // Save to storage
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({
        selectedNiche: niche,
        selectedGoal: goal
      });
    }
    
    // Clear recent templates to allow fresh selection with new niche
    this.recentTemplates = [];
  }
  
  // Select template based on niche and goal
  selectTemplate(keywords, delta, fallbackToGeneral = true) {
    console.log('[NicheSelector] Selecting template for:', this.selectedNiche, this.selectedGoal);
    
    // Get templates for current niche and goal
    const nicheBank = NICHE_TEMPLATE_BANKS[this.selectedNiche];
    if (!nicheBank) {
      console.warn('[NicheSelector] No templates for niche:', this.selectedNiche);
      return fallbackToGeneral ? this.selectFromGeneral(delta) : null;
    }
    
    const goalTemplates = nicheBank[this.selectedGoal];
    if (!goalTemplates || goalTemplates.length === 0) {
      console.warn('[NicheSelector] No templates for goal:', this.selectedGoal);
      return fallbackToGeneral ? this.selectFromGeneral(delta) : null;
    }
    
    // Filter out recently used templates
    const availableTemplates = goalTemplates.filter(template => 
      !this.recentTemplates.includes(template)
    );
    
    // If all used, reset and use all
    const pool = availableTemplates.length > 0 ? availableTemplates : goalTemplates;
    
    // Select random template
    const selectedTemplate = pool[Math.floor(Math.random() * pool.length)];
    
    // Track usage
    this.recentTemplates.push(selectedTemplate);
    if (this.recentTemplates.length > 5) {
      this.recentTemplates.shift();
    }
    
    console.log('[NicheSelector] ✅ Selected:', selectedTemplate);
    
    // Build response format matching existing system
    return {
      delta: delta,
      emotionalLabel: this.selectedNiche + ' engagement',
      nextMove: selectedTemplate,
      text: '',
      source: 'niche-template',
      niche: this.selectedNiche,
      goal: this.selectedGoal
    };
  }
  
  // Fallback to general templates
  selectFromGeneral(delta) {
    const generalTemplates = NICHE_TEMPLATE_BANKS.general.generalGrowth;
    const randomTemplate = generalTemplates[Math.floor(Math.random() * generalTemplates.length)];
    
    return {
      delta: delta,
      emotionalLabel: 'general engagement',
      nextMove: randomTemplate,
      text: '',
      source: 'general-template'
    };
  }
}

// Export for use
if (typeof window !== 'undefined') {
  window.NICHE_TEMPLATE_BANKS = NICHE_TEMPLATE_BANKS;
  window.NicheTemplateSelector = NicheTemplateSelector;
}

export { NICHE_TEMPLATE_BANKS, NicheTemplateSelector };