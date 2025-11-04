// Test Transcript Library for Smoke Testing
// 10 RICH (high noun count, specific topics) + 10 WEAK (filler words, generic)

const TEST_TRANSCRIPTS = {
  rich: [
    {
      id: "RICH-001",
      text: "I'm playing Valorant on my brand new RTX 4090 gaming PC with dual 4K monitors and custom RGB lighting setup. Just hit Diamond rank yesterday after grinding ranked mode for six hours straight.",
      expectedNouns: ["Valorant", "RTX 4090", "PC", "monitors", "RGB", "Diamond", "ranked"],
      nounCount: 7,
      category: "gaming",
      viewerDelta: 15
    },
    {
      id: "RICH-002",
      text: "Showing you my everyday makeup routine using the Huda Beauty Desert Dusk eyeshadow palette, Fenty Beauty foundation in shade 340, and MAC lipstick in Ruby Woo red.",
      expectedNouns: ["makeup", "Huda Beauty", "Desert Dusk", "palette", "Fenty", "foundation", "MAC", "lipstick", "Ruby Woo"],
      nounCount: 9,
      category: "makeup",
      viewerDelta: 12
    },
    {
      id: "RICH-003",
      text: "Cooking my grandmother's authentic Italian pasta carbonara with guanciale, pecorino romano cheese, farm fresh eggs, and black pepper. The secret is tempering the eggs properly.",
      expectedNouns: ["pasta", "carbonara", "guanciale", "pecorino", "cheese", "eggs", "pepper"],
      nounCount: 7,
      category: "cooking",
      viewerDelta: 18
    },
    {
      id: "RICH-004",
      text: "Unboxing the brand new iPhone 15 Pro Max in titanium blue color. Testing the 48 megapixel camera with ProRAW mode and the new Action button feature.",
      expectedNouns: ["iPhone 15 Pro Max", "titanium blue", "camera", "ProRAW", "Action button"],
      nounCount: 5,
      category: "tech",
      viewerDelta: 10
    },
    {
      id: "RICH-005",
      text: "Starting my leg day workout routine - five sets of barbell back squats at 225 pounds, then Romanian deadlifts, and finishing with Bulgarian split squats.",
      expectedNouns: ["leg day", "squats", "barbell", "225 pounds", "deadlifts", "Bulgarian split squats"],
      nounCount: 6,
      category: "fitness",
      viewerDelta: 8
    },
    {
      id: "RICH-006",
      text: "Telling you the crazy story about when I got kicked out of Target for accidentally setting off the fire alarm while testing the air horn in the camping section.",
      expectedNouns: ["Target", "fire alarm", "air horn", "camping section"],
      nounCount: 4,
      category: "personal",
      viewerDelta: 20
    },
    {
      id: "RICH-007",
      text: "Reviewing the Logitech G Pro X Superlight 2 wireless gaming mouse with the new HERO 2 sensor at 32000 DPI and only 60 grams weight. Comparing it to the Razer Viper.",
      expectedNouns: ["Logitech G Pro X Superlight 2", "mouse", "HERO 2 sensor", "32000 DPI", "60 grams", "Razer Viper"],
      nounCount: 6,
      category: "gaming",
      viewerDelta: 14
    },
    {
      id: "RICH-008",
      text: "Demonstrating my skincare routine with CeraVe foaming facial cleanser, The Ordinary niacinamide serum, and La Roche-Posay moisturizer with SPF 50 sunscreen.",
      expectedNouns: ["skincare", "CeraVe", "cleanser", "The Ordinary", "niacinamide", "serum", "La Roche-Posay", "moisturizer", "SPF 50"],
      nounCount: 9,
      category: "makeup",
      viewerDelta: 11
    },
    {
      id: "RICH-009",
      text: "Making homemade chocolate chip cookies from scratch using Belgian dark chocolate, vanilla bean paste, brown butter, and sea salt flakes for that gourmet touch.",
      expectedNouns: ["chocolate chip cookies", "Belgian chocolate", "vanilla bean", "brown butter", "sea salt"],
      nounCount: 5,
      category: "cooking",
      viewerDelta: 16
    },
    {
      id: "RICH-010",
      text: "Setting up my new streaming setup with the Sony A7S III mirrorless camera as webcam, Shure SM7B microphone on boom arm, and Elgato Stream Deck for scene switching.",
      expectedNouns: ["streaming setup", "Sony A7S III", "camera", "Shure SM7B", "microphone", "Elgato Stream Deck"],
      nounCount: 6,
      category: "tech",
      viewerDelta: 22
    }
  ],
  
  weak: [
    {
      id: "WEAK-001",
      text: "yeah um like okay cool so yeah I mean like you know what I'm saying guys um yeah so basically like yeah",
      expectedNouns: [],
      nounCount: 0,
      category: "filler",
      viewerDelta: -3
    },
    {
      id: "WEAK-002",
      text: "thank you thank you so much oh my god you guys are amazing I can't even thank you guys so much for real",
      expectedNouns: [],
      nounCount: 0,
      category: "thanks",
      viewerDelta: 2
    },
    {
      id: "WEAK-003",
      text: "um hold on one second let me just yeah okay sorry about that guys hold on hold on wait wait",
      expectedNouns: [],
      nounCount: 0,
      category: "filler",
      viewerDelta: -5
    },
    {
      id: "WEAK-004",
      text: "like literally I'm just sitting here and like yeah okay so anyway um like what should I do you guys",
      expectedNouns: [],
      nounCount: 0,
      category: "filler",
      viewerDelta: -2
    },
    {
      id: "WEAK-005",
      text: "oh my god oh my god you guys oh my gosh thank you thank you I can't believe this is happening right now",
      expectedNouns: [],
      nounCount: 0,
      category: "excitement",
      viewerDelta: 4
    },
    {
      id: "WEAK-006",
      text: "yeah so basically um I don't know like what should we talk about guys any suggestions in the chat or anything",
      expectedNouns: ["chat"],
      nounCount: 1,
      category: "question",
      viewerDelta: -1
    },
    {
      id: "WEAK-007",
      text: "okay okay hold on hold on wait wait let me see um yeah give me a second here guys one sec",
      expectedNouns: [],
      nounCount: 0,
      category: "filler",
      viewerDelta: -4
    },
    {
      id: "WEAK-008",
      text: "literally though like for real like I can't even right now you guys are so sweet I love you all so much",
      expectedNouns: [],
      nounCount: 0,
      category: "appreciation",
      viewerDelta: 1
    },
    {
      id: "WEAK-009",
      text: "um yeah so like I was thinking like maybe we could um yeah I don't know what do you guys think about that",
      expectedNouns: [],
      nounCount: 0,
      category: "filler",
      viewerDelta: -2
    },
    {
      id: "WEAK-010",
      text: "oh wow okay so yeah that's crazy that's wild oh my god I didn't expect that to happen at all guys",
      expectedNouns: [],
      nounCount: 0,
      category: "reaction",
      viewerDelta: 3
    }
  ]
};

// Export for use in testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TEST_TRANSCRIPTS;
}
