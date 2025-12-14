import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env vars - URL:", !!supabaseUrl, "KEY:", !!supabaseKey);
    return NextResponse.json({ 
      error: "Missing Supabase credentials",
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey 
    }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  try {
    // Use EST date to match the client
    const now = new Date();
    const today = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD format
    console.log("Generating daily questions for date:", today);
    const results: { group: string; question: string; smsCount: number }[] = [];

    // Get all groups
    const { data: groups, error: groupsError } = await supabase
      .from("groups")
      .select("id, name, question_prompt");

    if (groupsError || !groups) {
      return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    for (const group of groups) {
      // Check if question already exists for today
      const { data: existingQuestion } = await supabase
        .from("daily_questions")
        .select("id")
        .eq("group_id", group.id)
        .eq("date_et", today)
        .single();

      if (existingQuestion) continue; // Already has a question

      // Default to 3 chips, but increase if prompt mentions more names (detected by counting capitalized words that could be names)
      const prompt = group.question_prompt || "";
      const nameMatches = prompt.match(/\b[A-Z][a-z]+\b/g) || [];
      const uniqueNames = new Set(nameMatches.filter((n: string) => n.length > 2 && !["The", "What", "Who", "How", "When", "Where", "Why", "Would", "Could", "Should", "Daily", "Fun", "Group"].includes(n)));
      const optionCount = Math.min(5, Math.max(3, uniqueNames.size > 3 ? uniqueNames.size : 3));

      // Generate new question using the group's prompt
      let questionText = "What's something that made you smile today?";
      let answerOptions: string[] = [];

      if (apiKey && group.question_prompt) {
        try {
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
                  content: `You generate ONE daily group prompt that feels fresh, unique, and grounded in the group's description.

BANNED NAMES (NEVER USE THESE IN PROMPTS OR OPTIONS):
Alex, Sam, John, Sarah, Mike, Emily, Chris, Jessica, David, Lisa, Matt, Amy, Jake, Emma, Ryan, Mia, Tyler, Olivia, Brandon, Ashley, Jordan, Taylor, Casey, Morgan, Jamie, Riley, Avery, Drew, Pat, Kim, or ANY generic placeholder name.

ABSOLUTE RULES:
1. Extract ONLY real names/nicknames explicitly mentioned in the group description. Use ONLY those.
2. If NO names are in the description, use phrases like: "someone here", "one of us", "the person reading this", "whoever answers first", etc.
3. NEVER invent or assume names. If unsure, don't use names at all.
4. Each question must feel COMPLETELY DIFFERENT from common templates.
5. Options must NEVER contain made-up names.

VARIETY REQUIREMENT:
Rotate through these creative angles (pick ONE that fits):
- Confessions: "Admit something embarrassing..."
- Predictions: "What will happen by end of week..."
- Hot takes: "Unpopular opinion about..."
- Memories: "Best/worst moment when..."
- Hypotheticals: "If you could only..."
- Challenges: "Today's dare is..."
- Votes: "Rate/rank something..."
- Secrets: "Something you've never told the group..."
- Observations: "Who noticed that..."
- Time-based: "By tonight, I will..."

GENERATE THE PROMPT:
- Must feel written specifically for THIS group, not copy-pasted.
- Be creative, playful, unexpected.
- Avoid overused phrases like "most likely to", "would you rather" unless HEAVILY customized.

GENERATE ${optionCount} OPTIONS:
- Short, distinct, fun choices.
- NO generic names in options ever.
- Use "me", "not me", "definitely guilty", "I plead the fifth", etc.

OUTPUT (STRICT JSON ONLY):
{"prompt": "string", "options": ["opt1", "opt2", ...]}`,
                },
                {
                  role: "user",
                  content: `Group description: "${group.question_prompt}"\n\nGenerate one daily prompt with exactly ${optionCount} answer options. Return ONLY valid JSON.`,
                },
              ],
              temperature: 0.9,
              max_tokens: 200,
            }),
          });

          if (response.ok) {
            const json = await response.json();
            const generated = json.choices?.[0]?.message?.content?.trim();
            if (generated) {
              // Try to parse as JSON for prompt + options
              try {
                const parsed = JSON.parse(generated);
                if (parsed.prompt) {
                  questionText = parsed.prompt;
                  answerOptions = parsed.options || [];
                  
                  // VALIDATION: Check for any names not in the group description
                  const commonNames = /\b(Alex|Sam|John|Sarah|Mike|Emily|Chris|Jessica|David|Lisa|Matt|Amy|Jake|Emma|Ryan|Mia|Tyler|Olivia|Brandon|Ashley|Jordan|Taylor|Casey|Morgan|Jamie|Riley|Avery|Drew|Pat|Kim|Ben|Tom|Joe|Bob|Dan|Steve|James|Michael|Nick|Kevin|Brian|Eric|Mark|Jeff|Scott|Andrew|Adam|Josh|Kyle|Zach|Sean|Jason|Justin|Aaron|Derek|Chad|Greg|Tony|Pete|Bill|Will|Jack|Luke|Ethan|Noah|Liam|Mason|Jacob|Logan|Daniel|Henry|Max|Leo|Owen|Eli|Ian|Evan|Gavin|Caleb|Nathan|Dylan|Hunter|Connor|Aiden|Jayden|Carter|Lucas|Sophia|Ava|Isabella|Mia|Charlotte|Amelia|Harper|Evelyn|Abigail|Ella|Avery|Scarlett|Grace|Chloe|Camila|Aria|Luna|Lily|Layla|Riley|Zoey|Nora|Hazel|Hannah|Natalie|Leah|Stella|Penelope|Maya|Aubrey|Victoria|Claire|Lucy|Anna|Skylar|Paisley|Bella|Aurora|Violet|Savannah|Audrey|Brooklyn|Genesis|Aaliyah|Kennedy|Madelyn|Ellie|Piper)\b/gi;
                  const fullText = questionText + " " + answerOptions.join(" ");
                  const groupDescription = group.question_prompt?.toLowerCase() || "";
                  
                  // Find all names used in the question/options
                  const usedNames = fullText.match(commonNames) || [];
                  // Check if any used name is NOT in the group description
                  const hasUnauthorizedName = usedNames.some(name => 
                    !groupDescription.includes(name.toLowerCase())
                  );
                  
                  if (hasUnauthorizedName) {
                    console.warn("Rejected question with unauthorized name:", questionText, "Used names:", usedNames);
                    // Fall back to generic question without names
                    questionText = "What's something unexpected that happened to someone here this week?";
                    answerOptions = ["Something good!", "Something awkward...", "Nothing worth mentioning", "Too much to explain"];
                  }
                }
              } catch {
                // Not JSON, use as plain text
                questionText = generated;
              }
            }
          }
        } catch (e) {
          console.error("Question generation failed for", group.name, e);
        }
      }

      // Insert the new question with answer options
      const { error: insertError } = await supabase.from("daily_questions").insert({
        group_id: group.id,
        date_et: today,
        question_text: questionText,
        answer_options: answerOptions.length > 0 ? answerOptions : null,
      });

      if (insertError) {
        console.error("Failed to insert question for", group.name, insertError);
        continue;
      }

      // Send SMS notifications to group members (respecting notification preferences)
      let smsCount = 0;

      if (twilioSid && twilioAuth && twilioPhone) {
        // Get group members with phone numbers
        const { data: memberships } = await supabase
          .from("group_memberships")
          .select("user_id")
          .eq("group_id", group.id);

        if (memberships && memberships.length > 0) {
          const userIds = memberships.map((m) => m.user_id);

          // Get notification settings for these users
          const { data: notifSettings } = await supabase
            .from("group_notification_settings")
            .select("user_id, daily_question_sms")
            .eq("group_id", group.id)
            .in("user_id", userIds);

          // Get master mute settings from profiles
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, notifications_muted")
            .in("id", userIds);

          const mutedUsers = new Set(
            profiles?.filter((p) => p.notifications_muted).map((p) => p.id) || []
          );
          const disabledDailyUsers = new Set(
            notifSettings?.filter((n) => n.daily_question_sms === false).map((n) => n.user_id) || []
          );

          // Get phone numbers from auth.users
          const { data: users } = await supabase.auth.admin.listUsers();

          const eligibleUsers = users?.users?.filter(
            (u) => userIds.includes(u.id) && 
                   u.phone && 
                   !mutedUsers.has(u.id) && 
                   !disabledDailyUsers.has(u.id)
          ) || [];

          const appUrl = "https://questionswithfriends.app";

          for (const user of eligibleUsers) {
            try {
              const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
              const body = new URLSearchParams({
                To: user.phone!,
                From: twilioPhone,
                Body: `Your group "${group.name}" has a new question! 🦦\n\n${appUrl}/groups/${group.id}`,
              });

              const smsResponse = await fetch(twilioUrl, {
                method: "POST",
                headers: {
                  Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioAuth}`).toString("base64")}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: body.toString(),
              });

              if (smsResponse.ok) smsCount++;
            } catch (smsError) {
              console.error("SMS failed for", user.phone, smsError);
            }
          }
        }
      }

      results.push({
        group: group.name,
        question: questionText,
        smsCount,
      });
    }

    return NextResponse.json({
      success: true,
      date: today,
      questionsGenerated: results.length,
      details: results,
    });
  } catch (error) {
    console.error("Daily questions error:", error);
    return NextResponse.json({ error: "Failed to generate daily questions" }, { status: 500 });
  }
}
