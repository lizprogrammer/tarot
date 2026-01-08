module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.error("Missing GROQ_API_KEY");
      return res.status(500).json({ error: "Missing GROQ API key" });
    }

    console.log("Fetching tarot cards...");
    
    // Fetch 3 random cards from the Tarot API
    const tarotApiUrl = "https://tarot-api-3hv5.onrender.com/api/v1/cards/random?n=3";
    const tarotResponse = await fetch(tarotApiUrl);
    
    console.log("Tarot API status:", tarotResponse.status);
    
    if (!tarotResponse.ok) {
      const errorText = await tarotResponse.text();
      console.error("Tarot API error:", errorText);
      return res.status(500).json({ error: "Failed to fetch tarot cards" });
    }

    const data = await tarotResponse.json();
    console.log("Tarot API response received");
    
    // Check if cards exist in response
    if (!data.cards || !Array.isArray(data.cards) || data.cards.length < 3) {
      console.error("Invalid tarot response format:", data);
      return res.status(500).json({ error: "Invalid tarot card data" });
    }
    
    const cards = data.cards;
    
    // Extract card info and use more reliable image URLs
    const pastCard = cards[0];
    const presentCard = cards[1];
    const futureCard = cards[2];

    // Function to get working image URL
    const getImageUrl = (card) => {
      // Try to use the API's image first, but fallback to a CDN version
      if (card.image && card.image.includes('sacred-texts.com')) {
        return card.image;
      }
      // Fallback: construct image URL from card name_short if available
      return card.image || `https://www.sacred-texts.com/tarot/pkt/img/${card.name_short || 'ar00'}.jpg`;
    };

    // Build context
    const today = new Date().toLocaleDateString("en-US", { 
      weekday: "long",
      month: "long",
      day: "numeric"
    });
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

    const systemPrompt = `
You are a practical tarot reader who gives clear, actionable insights.

Your readings are:
- Short and direct (2-3 sentences per card)
- Focused on what the person can DO or UNDERSTAND
- Written in simple, conversational language
- Honest but encouraging
- Free of mystical jargon

Structure:
PAST: [Card] - What happened or what you learned
PRESENT: [Card] - What's happening now and what to notice
FUTURE: [Card] - What's likely coming and how to navigate it

Keep each section brief. Total reading: 100-150 words maximum.
`.trim();

    const userPrompt = `
Cards drawn:
PAST: ${pastCard.name}${pastCard.reversed ? ' (Reversed)' : ''}
PRESENT: ${presentCard.name}${presentCard.reversed ? ' (Reversed)' : ''}
FUTURE: ${futureCard.name}${futureCard.reversed ? ' (Reversed)' : ''}

Time: ${timeOfDay}, ${today}

Give a brief, practical reading. What should I know about these three cards?
`.trim();

    console.log("Calling Groq API...");

    // Call Groq API
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 250,
      }),
    });

    console.log("Groq API status:", groqResponse.status);

    if (!groqResponse.ok) {
      let errorMessage = "Groq API error";
      try {
        const errorData = await groqResponse.json();
        console.error("Groq error data:", errorData);
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        const errorText = await groqResponse.text();
        console.error("Groq error text:", errorText);
      }
      return res.status(500).json({ error: errorMessage });
    }

    const aiData = await groqResponse.json();
    const reading = aiData.choices?.[0]?.message?.content?.trim();

    if (!reading) {
      console.error("No reading in Groq response:", aiData);
      return res.status(500).json({ error: "No reading generated" });
    }

    console.log("Success! Returning reading.");

    // Return cards and reading with working image URLs
    res.status(200).json({
      cards: [
        {
          name: pastCard.name,
          image: getImageUrl(pastCard),
          reversed: pastCard.reversed || false,
          position: "Past"
        },
        {
          name: presentCard.name,
          image: getImageUrl(presentCard),
          reversed: presentCard.reversed || false,
          position: "Present"
        },
        {
          name: futureCard.name,
          image: getImageUrl(futureCard),
          reversed: futureCard.reversed || false,
          position: "Future"
        }
      ],
      reading: reading
    });

  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ error: err.message || "Unknown error" });
  }
};
