import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { groupName } = await req.json();

    if (!groupName || typeof groupName !== "string") {
      return NextResponse.json(
        { error: "Group name is required" },
        { status: 400 },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured" },
        { status: 500 },
      );
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
          {
            role: "system",
            content: `You generate a brief, fun prompt suggestion for a friend group chat based on their group name. The prompt should describe what kind of daily questions they'd enjoy. Keep it short (under 12 words), casual, and fun. No quotes or punctuation at the end. Examples:
- Group "midnight snack squad" → late night cravings and guilty pleasures
- Group "gym bros" → fitness wins, workout fails, and motivation
- Group "book club babes" → reading habits, book recs, and literary hot takes
- Group "work wives" → office drama, career wins, and coworker stories
- Group "chaos coordinators" → chaotic life moments and questionable decisions`,
          },
          {
            role: "user",
            content: `Generate a prompt suggestion for a group called "${groupName}"`,
          },
        ],
        max_tokens: 50,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", errorText);
      return NextResponse.json(
        { error: "Failed to generate suggestion" },
        { status: 500 },
      );
    }

    const data = await response.json();
    const suggestion = data.choices?.[0]?.message?.content?.trim() || "";

    return NextResponse.json({ suggestion });
  } catch (error) {
    console.error("Error generating prompt suggestion:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
