import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { prompt, count = 3 } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required" },
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
            content: `You generate sample prompts for a group based on their description.

BANNED NAMES (NEVER USE):
Alex, Sam, John, Sarah, Mike, Emily, Chris, Jessica, David, Lisa, Matt, Amy, Jake, Emma, Ryan, Mia, Tyler, Olivia, Brandon, Ashley, Jordan, Taylor, Casey, Morgan, Jamie, Riley, or ANY generic placeholder name.

RULES:
1. ONLY use names that are EXPLICITLY mentioned in the group description.
2. If no names are provided, use: "someone here", "one of us", "the person reading this", etc.
3. NEVER invent names. If unsure, don't use names.
4. Options must NEVER contain made-up names - use "me", "not me", "guilty", "innocent", etc.

VARIETY - pick creative angles like:
- Confessions, predictions, hot takes, memories, hypotheticals, challenges, votes, secrets

STYLE:
- Fun, playful, engaging
- Short prompts (1-2 sentences)
- 3 distinct answer options per prompt

FORMAT (JSON array):
[{"prompt": "...", "options": ["opt1", "opt2", "opt3"]}]`,
          },
          {
            role: "user",
            content: `Group description: "${prompt}"\n\nGenerate ${count} daily prompts with 3 answer options each. Return ONLY valid JSON array.`,
          },
        ],
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `OpenAI error: ${text}` },
        { status: 500 },
      );
    }

    const json = await response.json();
    const content: string =
      json.choices?.[0]?.message?.content ?? "[]";

    // Try to parse as JSON, fallback to old format
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        // VALIDATION: Filter out any questions with names not in the group description
        const commonNames = /\b(Alex|Sam|John|Sarah|Mike|Emily|Chris|Jessica|David|Lisa|Matt|Amy|Jake|Emma|Ryan|Mia|Tyler|Olivia|Brandon|Ashley|Jordan|Taylor|Casey|Morgan|Jamie|Riley|Avery|Drew|Pat|Kim|Ben|Tom|Joe|Bob|Dan|Steve|James|Michael|Nick|Kevin|Brian|Eric|Mark|Jeff|Scott|Andrew|Adam|Josh|Kyle|Zach|Sean|Jason|Justin|Aaron|Derek|Chad|Greg|Tony|Pete|Bill|Will|Jack|Luke|Ethan|Noah|Liam|Mason|Jacob|Logan|Daniel|Henry|Max|Leo|Owen|Eli|Ian|Evan|Gavin|Caleb|Nathan|Dylan|Hunter|Connor|Aiden|Jayden|Carter|Lucas|Sophia|Ava|Isabella|Mia|Charlotte|Amelia|Harper|Evelyn|Abigail|Ella|Avery|Scarlett|Grace|Chloe|Camila|Aria|Luna|Lily|Layla|Riley|Zoey|Nora|Hazel|Hannah|Natalie|Leah|Stella|Penelope|Maya|Aubrey|Victoria|Claire|Lucy|Anna|Skylar|Paisley|Bella|Aurora|Violet|Savannah|Audrey|Brooklyn|Genesis|Aaliyah|Kennedy|Madelyn|Ellie|Piper)\b/gi;
        const groupDescription = prompt?.toLowerCase() || "";
        const filtered = parsed.map((item: any) => {
          const fullText = (item.prompt || "") + " " + (item.options || []).join(" ");
          const usedNames = fullText.match(commonNames) || [];
          const hasUnauthorizedName = usedNames.some((name: string) => 
            !groupDescription.includes(name.toLowerCase())
          );
          if (hasUnauthorizedName) {
            console.warn("Filtered out question with unauthorized name:", item.prompt);
            return {
              prompt: "What's one thing that surprised someone here recently?",
              options: ["Me! Something good", "Me! Something weird", "Not me this time"]
            };
          }
          return item;
        });
        return NextResponse.json({ 
          questions: filtered.map((p: any) => p.prompt || p),
          questionsWithOptions: filtered.slice(0, count)
        });
      }
    } catch {
      // Fallback: parse as newline-separated
      const questions = content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^\d+\.\s*/, ""))
        .slice(0, count);
      return NextResponse.json({ 
        questions,
        questionsWithOptions: questions.map(q => ({ prompt: q, options: [] }))
      });
    }

    return NextResponse.json({ questions: [], questionsWithOptions: [] });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to generate sample questions" },
      { status: 500 },
    );
  }
}
