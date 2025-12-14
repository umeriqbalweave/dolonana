import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Missing Supabase credentials" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  try {
    // Get all groups with juggu enabled
    const { data: groups, error: groupsError } = await supabase
      .from("groups")
      .select("id, name, question_prompt, juggu_enabled, juggu_personality")
      .eq("juggu_enabled", true);

    if (groupsError || !groups) {
      return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
    }

    const interventions: string[] = [];

    for (const group of groups) {
      // Get today's question for this group
      const today = new Date().toISOString().split("T")[0];
      const { data: question } = await supabase
        .from("daily_questions")
        .select("id, question_text")
        .eq("group_id", group.id)
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!question) continue;

      // Get answers for today's question
      const { data: answers } = await supabase
        .from("answers")
        .select("id, answer_text, user_id, created_at")
        .eq("question_id", question.id)
        .order("created_at", { ascending: false });

      // Get recent messages for this question
      const { data: messages } = await supabase
        .from("messages")
        .select("id, text, user_id, is_juggu, created_at")
        .eq("question_id", question.id)
        .order("created_at", { ascending: false })
        .limit(20);

      // Skip if no answers yet
      if (!answers || answers.length === 0) continue;

      // Check if juggu already intervened recently (last 3 hours)
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const recentJugguMessages = (messages || []).filter(
        (m) => m.is_juggu && m.created_at > threeHoursAgo
      );
      if (recentJugguMessages.length > 0) continue;

      // Check if conversation is "dead" - no activity in last 2 hours
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const recentActivity = [
        ...(answers || []).filter((a) => a.created_at > twoHoursAgo),
        ...(messages || []).filter((m) => m.created_at > twoHoursAgo),
      ];

      // Randomly decide whether to intervene (40% chance if dead, 15% chance otherwise)
      const isDead = recentActivity.length === 0;
      const interventionChance = isDead ? 0.4 : 0.15;
      if (Math.random() > interventionChance) continue;

      // Pick a random answer to react to or spark conversation
      const randomAnswer = answers[Math.floor(Math.random() * answers.length)];

      // Generate juggu message
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) continue;

      const customInstructions = group.juggu_personality
        ? `\n\nCUSTOM PERSONALITY OVERRIDE FROM GROUP OWNER:\n${group.juggu_personality}\nFollow these instructions while keeping your core juggu energy.`
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

      const userPrompt = isDead
        ? `The group chat has been quiet for a while. Drop a spicy take or provocative comment to spark conversation.

Question of the day: ${question.question_text}
A recent answer someone gave: ${randomAnswer.answer_text}

One sentence. No emojis. Make people want to respond. Be juggu about it.`
        : `Someone answered the question and it deserves a reaction. Give them a sassy, memorable response.

Question: ${question.question_text}
Their answer: ${randomAnswer.answer_text}

One sentence. No emojis. Classic juggu energy - could be a light roast, a hot take, or just calling it like you see it.`;

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
          temperature: 0.95,
        }),
      });

      if (!response.ok) continue;

      const json = await response.json();
      const jugguText = json.choices?.[0]?.message?.content?.trim();

      if (!jugguText) continue;

      // Insert juggu's message
      const { error: insertError } = await supabase.from("messages").insert({
        group_id: group.id,
        question_id: question.id,
        user_id: null,
        text: jugguText,
        is_juggu: true,
      });

      if (!insertError) {
        interventions.push(`${group.name}: "${jugguText}"`);
      }
    }

    return NextResponse.json({
      success: true,
      interventions: interventions.length,
      details: interventions,
    });
  } catch (error) {
    console.error("Juggu intervene error:", error);
    return NextResponse.json({ error: "Failed to run interventions" }, { status: 500 });
  }
}
