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

  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!twilioSid || !twilioAuth || !twilioPhone) {
    return NextResponse.json({ error: "Twilio not configured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dolo.app";

  try {
    // Get all users with phone numbers who haven't muted notifications
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, phone_number, display_name, notifications_muted");

    if (profilesError) {
      console.error("Failed to fetch profiles:", profilesError);
      return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
    }

    // Also get phone numbers from auth.users as fallback
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) {
      console.error("Failed to list auth users:", authError);
    }

    const authPhoneMap = new Map<string, string>();
    authUsers?.users?.forEach((u) => {
      if (u.phone) authPhoneMap.set(u.id, u.phone);
    });

    // Build list of users to notify
    const usersToNotify: { phone: string; name: string }[] = [];

    for (const profile of profiles || []) {
      // Skip if notifications muted
      if (profile.notifications_muted) continue;

      // Get phone from profile or auth
      const phone = profile.phone_number || authPhoneMap.get(profile.id);
      if (!phone) continue;

      usersToNotify.push({
        phone,
        name: profile.display_name || "there",
      });
    }

    // Send SMS to each user
    let sentCount = 0;
    const errors: string[] = [];

    for (const user of usersToNotify) {
      try {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
        const body = new URLSearchParams({
          To: user.phone,
          From: twilioPhone,
          Body: `How was your day today? ${appUrl}/checkin`,
        });

        const smsResponse = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioAuth}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        });

        if (smsResponse.ok) {
          sentCount++;
        } else {
          const errorText = await smsResponse.text();
          console.error("SMS failed for", user.phone, errorText);
          errors.push(`${user.phone}: ${errorText}`);
        }
      } catch (smsError) {
        console.error("SMS error for", user.phone, smsError);
        errors.push(`${user.phone}: ${String(smsError)}`);
      }
    }

    return NextResponse.json({
      success: true,
      totalUsers: usersToNotify.length,
      sentCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Daily reminder error:", error);
    return NextResponse.json({ error: "Failed to send daily reminders" }, { status: 500 });
  }
}
