import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const { userId, userName, checkinNumber, groupIds } = await req.json();

    if (!userId || checkinNumber === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!twilioSid || !twilioAuth || !twilioPhone) {
      return NextResponse.json({ error: "Twilio not configured" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dolo.app";

    // If no groups specified, nothing to notify
    if (!groupIds || groupIds.length === 0) {
      return NextResponse.json({ sent: 0, reason: "no_groups" });
    }

    // Get all members from the specified groups (excluding the user who checked in)
    const memberIds = new Set<string>();

    for (const groupId of groupIds) {
      const { data: memberships } = await supabase
        .from("group_memberships")
        .select("user_id")
        .eq("group_id", groupId)
        .neq("user_id", userId);

      memberships?.forEach((m) => memberIds.add(m.user_id));
    }

    if (memberIds.size === 0) {
      return NextResponse.json({ sent: 0, reason: "no_other_members" });
    }

    const memberIdArray = Array.from(memberIds);

    // Get notification settings - check if message_sms is disabled for any group
    const { data: notifSettings } = await supabase
      .from("group_notification_settings")
      .select("user_id, message_sms, group_id")
      .in("group_id", groupIds)
      .in("user_id", memberIdArray);

    // Build set of users who have disabled message SMS for ALL their groups
    const disabledUsers = new Set<string>();
    const userGroupCount = new Map<string, number>();
    const userDisabledCount = new Map<string, number>();

    // Count how many groups each user is in
    for (const memberId of memberIdArray) {
      let groupCount = 0;
      for (const groupId of groupIds) {
        const { data: membership } = await supabase
          .from("group_memberships")
          .select("id")
          .eq("group_id", groupId)
          .eq("user_id", memberId)
          .maybeSingle();
        if (membership) groupCount++;
      }
      userGroupCount.set(memberId, groupCount);
    }

    // Count disabled groups per user
    notifSettings?.forEach((n) => {
      if (n.message_sms === false) {
        userDisabledCount.set(n.user_id, (userDisabledCount.get(n.user_id) || 0) + 1);
      }
    });

    // User is disabled only if ALL their groups have message_sms = false
    for (const [userId, disabledCount] of userDisabledCount) {
      const totalGroups = userGroupCount.get(userId) || 0;
      if (disabledCount >= totalGroups) {
        disabledUsers.add(userId);
      }
    }

    // Get profiles with phone numbers
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, phone_number, notifications_muted")
      .in("id", memberIdArray);

    // Get phone numbers from auth.users as fallback
    const authPhoneMap = new Map<string, string>();
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    authUsers?.users?.forEach((u) => {
      if (u.phone) authPhoneMap.set(u.id, u.phone);
    });

    // Build list of eligible users
    // Checks: has phone, not muted (master toggle), not disabled per-group (message_sms)
    const eligibleUsers = memberIdArray
      .map((id) => {
        const profile = profiles?.find((p) => p.id === id);
        const phone = profile?.phone_number || authPhoneMap.get(id);
        const muted = profile?.notifications_muted;
        return { id, phone, muted };
      })
      .filter((u) => u.phone && !u.muted && !disabledUsers.has(u.id));

    // Send SMS to each eligible user
    let sentCount = 0;
    const displayName = userName || "Someone";

    for (const user of eligibleUsers) {
      try {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
        const body = new URLSearchParams({
          To: user.phone!,
          From: twilioPhone,
          Body: `${displayName} is at a ${checkinNumber} today. ${appUrl}/groups/${groupIds[0]}`,
        });

        const smsResponse = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioAuth}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        });

        if (smsResponse.ok) sentCount++;
      } catch (smsError) {
        console.error("SMS failed for", user.phone, smsError);
      }
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      eligible: eligibleUsers.length,
    });
  } catch (error) {
    console.error("Notify checkin error:", error);
    return NextResponse.json({ error: "Failed to send notifications" }, { status: 500 });
  }
}
