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
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OpenAI API key" });
    }

    // Fetch 3 random cards from the Tarot API
    const tarotApiUrl = "https://tarot-api-3hv5.onrender.com/api/v1/cards/random?n=3";
    const tarotResponse = await fetch(tarotApiUrl);
    
    if (!tarotResponse.ok) {
      return res.status(500).json({ error: "Failed to fetch tarot cards" });
    }

    const cards = await tarotResponse.json();
    
    // Extract card info
    const pastCard = cards.cards[0];
    const presentCard = cards.cards[1];
    const futureCard = cards.cards[2];

    // Build context
    const today = new Date().toLocaleDateString("en-US", { 
      weekday: "long",
      month: "long",
      day: "numeric"
    });
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

    const systemPrompt = `
You are an insightful tarot reader who blends traditional card meanings with modern, grounded wisdom.

Given 3 cards (Past, Present, Future), provide a cohesive reading that:
- Explains each card's meaning in context of its position
- Weaves them into a narrative arc
- Feels personal and relevant to the moment
- Is encouraging but honest
- Avoids generic fortune-telling clichés
- Uses clear, accessible language

Structure your response as:
1. Brief intro sentence
2. PAST: [Card name] - What this reveals about your journey
3. PRESENT: [Card name] - Where you are now
4. FUTURE: [Card name] - What's emerging

Keep the total reading to 150-200 words.

Tone: Warm, wise, slightly mystical but grounded, like a trusted friend with cosmic insight.
`.trim();

    const userPrompt = `
I drew these three cards for a Past/Present/Future spread:

PAST: ${pastCard.name}${pastCard.reversed ? ' (Reversed)' : ''}
PRESENT: ${presentCard.name}${presentCard.reversed ? ' (Reversed)' : ''}
FUTURE: ${futureCard.name}${futureCard.reversed ? ' (Reversed)' : ''}

It's ${timeOfDay} on ${today}.

Give me a three-card reading that feels insightful and relevant to this moment.
`.trim();

    // Call OpenAI
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 300,
      }),
    });

    if (!openaiResponse.ok) {
      let errorMessage = "OpenAI API error";
      try {
        const errorData = await openaiResponse.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch {}
      return res.status(500).json({ error: errorMessage });
    }

    const aiData = await openaiResponse.json();
    const reading = aiData.choices?.[0]?.message?.content?.trim();

    if (!reading) {
      return res.status(500).json({ error: "No reading generated" });
    }

    // Return cards and reading
    res.status(200).json({
      cards: [
        {
          name: pastCard.name,
          image: pastCard.image,
          reversed: pastCard.reversed || false,
          position: "Past"
        },
        {
          name: presentCard.name,
          image: presentCard.image,
          reversed: presentCard.reversed || false,
          position: "Present"
        },
        {
          name: futureCard.name,
          image: futureCard.image,
          reversed: futureCard.reversed || false,
          position: "Future"
        }
      ],
      reading: reading
    });

  } catch (err) {
    console.error("API Error:", err);
    res.status(500).json({ error: err.message });
  }
};
