import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return (asUTC - date.getTime()) / 60000;
}

function getNyDayWindowUtc(now: Date) {
  const timeZone = "America/New_York";
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of dateParts) {
    map[p.type] = p.value;
  }
  const y = Number(map.year);
  const m = Number(map.month);
  const d = Number(map.day);

  // Iterate to find the UTC timestamp that corresponds to NY local midnight.
  let utc = Date.UTC(y, m - 1, d, 0, 0, 0);
  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMinutes(new Date(utc), timeZone);
    const nextUtc = Date.UTC(y, m - 1, d, 0, 0, 0) - offset * 60000;
    if (Math.abs(nextUtc - utc) < 1000) {
      utc = nextUtc;
      break;
    }
    utc = nextUtc;
  }

  const start = new Date(utc);
  const end = new Date(utc + 24 * 60 * 60 * 1000);
  return { start, end };
}

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
    const now = new Date();
    const nyParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(now);
    const nyHour = Number(nyParts.find((p) => p.type === "hour")?.value ?? "-1");
    const nyMinute = Number(nyParts.find((p) => p.type === "minute")?.value ?? "-1");

    // Only run at 12:00pm EST/EDT (allow a 0-9 minute window)
    if (!(nyHour === 12 && nyMinute >= 0 && nyMinute < 10)) {
      return NextResponse.json({ skipped: true, reason: "not_12pm_ny", nyHour, nyMinute });
    }

    const { start: nyDayStartUtc, end: nyDayEndUtc } = getNyDayWindowUtc(now);

    // Get all users with phone numbers who haven't muted notifications
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, phone_number, display_name, notifications_muted, daily_sms_enabled");

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

      // Skip if user has disabled daily reminder SMS
      if (profile.daily_sms_enabled === false) continue;

      // Skip if user already checked in today (NY day)
      const { count: checkinCount } = await supabase
        .from("checkins")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .gte("created_at", nyDayStartUtc.toISOString())
        .lt("created_at", nyDayEndUtc.toISOString());
      if ((checkinCount ?? 0) > 0) continue;

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
          Body: `How are you doing today? ${appUrl}/checkin`,
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
