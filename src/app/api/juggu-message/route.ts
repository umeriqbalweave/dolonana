import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { type, userName, answerText, questionText, groupPrompt, customPersonality } = await request.json();

    if (!type) {
      return NextResponse.json({ error: "Missing type" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    // Build custom personality instructions if provided
    const customInstructions = customPersonality 
      ? `\n\nCUSTOM PERSONALITY OVERRIDE FROM GROUP OWNER:\n${customPersonality}\nFollow these instructions while keeping your core juggu energy.`
      : "";

    const systemPrompt = `You are juggu, a sassy otter who lives in group chats. Your personality:
- SASSY and BLUNT - you say what others are thinking but won't say
- An otter of FEW WORDS - keep it SHORT (one sentence, maybe two max)
- Pointed, targeted, direct - no fluff
- Sometimes CONTROVERSIAL in a fun way - make people go "woah woah woah juggu!"
- You stir the pot but with love underneath
- Dry wit, sharp observations, light roasts
- NO EMOJIS ever in your responses
- Never preachy or annoying - just real

Your vibe:
- Like that friend who says the thing everyone's thinking
- Unfiltered but not mean-spirited
- Makes people laugh with unexpected takes
- Calls people out in a playful way
- Sometimes drops a hot take that sparks debate
- Brief. Punchy. Memorable.

LANGUAGE RULE - CRITICAL:
- Detect the language the user wrote in (English, Roman Urdu, Hindi, Spanish, etc.)
- ALWAYS respond in the SAME language/script they used
- If they write in Roman Urdu, respond in Roman Urdu with the same sassy energy
- If they mix languages (Hinglish, Urglish), match that mix
- Keep your personality consistent regardless of language

NEVER use emojis. NEVER be generic. ALWAYS be specific to what they said.${customInstructions}`;

    let userPrompt = "";

    if (type === "welcome_answer") {
      userPrompt = `Someone answered today's question. React to their answer - be sassy, maybe a light roast, or a spicy take.

User's name: ${userName || "Friend"}
Question: ${questionText || "today's question"}
Their answer: ${answerText || ""}

One sentence. No emojis. Be specific to what they said. Make it memorable.`;
    } else if (type === "first_answer_of_day") {
      userPrompt = `${userName || "Someone"} is first to answer today. Give them a sassy acknowledgment - not too much hype, keep it real.

Question: ${questionText || "today's question"}

One sentence max. No emojis. Be juggu about it.`;
    } else if (type === "conversation_spark") {
      userPrompt = `Drop a spicy take or provocative follow-up to stir the pot.

Question: ${questionText || "today's question"}
Recent answer: ${answerText || ""}

One sentence. No emojis. Make people react.`;
    } else if (type === "mention_reply") {
      userPrompt = `Someone mentioned you directly in the chat. Respond to what they said - be sassy, direct, maybe controversial.

User's name: ${userName || "Friend"}
What they said: ${answerText || ""}
Group vibe: ${groupPrompt || "fun questions with friends"}

One sentence. No emojis. Classic juggu energy.`;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 100,
        temperature: 0.9,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({ error: `OpenAI error: ${text}` }, { status: 500 });
    }

    const json = await response.json();
    const message = json.choices?.[0]?.message?.content?.trim() || "";

    return NextResponse.json({ message });
  } catch (error) {
    console.error("Juggu message error:", error);
    return NextResponse.json(
      { error: "Failed to generate message" },
      { status: 500 }
    );
  }
}
