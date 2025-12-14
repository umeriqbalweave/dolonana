import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: NextRequest) {
  try {
    const { groupId, answerUserId, answerUserName, questionText } = await req.json();

    if (!groupId || !answerUserId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Debug: log which keys are available
    console.log("ENV Debug - hasUrl:", !!supabaseUrl, "hasServiceKey:", !!supabaseServiceKey, "hasAnonKey:", !!supabaseAnonKey);
    
    const supabaseKey = supabaseServiceKey || supabaseAnonKey;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ 
        error: "Supabase not configured", 
        hasUrl: !!supabaseUrl, 
        hasServiceKey: !!supabaseServiceKey,
        hasAnonKey: !!supabaseAnonKey
      }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!twilioSid || !twilioAuth || !twilioPhone) {
      return NextResponse.json({ error: "Twilio not configured" }, { status: 500 });
    }

    // Get group info
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .select("id, name")
      .eq("id", groupId)
      .maybeSingle();

    if (groupError || !group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Get all group members except the one who answered
    const { data: memberships } = await supabase
      .from("group_memberships")
      .select("user_id")
      .eq("group_id", groupId)
      .neq("user_id", answerUserId);

    if (!memberships || memberships.length === 0) {
      // Debug: also get ALL members to see who's in the group
      const { data: allMembers } = await supabase
        .from("group_memberships")
        .select("user_id")
        .eq("group_id", groupId);
      return NextResponse.json({ 
        sent: 0, 
        reason: "no_other_members",
        answerUserId,
        allMemberIds: allMembers?.map(m => m.user_id) || []
      });
    }

    const memberIds = memberships.map((m) => m.user_id);

    // Get notification settings for these members (only those with message_sms enabled)
    const { data: notifSettings } = await supabase
      .from("group_notification_settings")
      .select("user_id, message_sms")
      .eq("group_id", groupId)
      .in("user_id", memberIds);

    // Build set of users who have disabled message SMS
    const disabledUsers = new Set(
      (notifSettings || [])
        .filter((n) => n.message_sms === false)
        .map((n) => n.user_id)
    );

    // Get profiles with phone numbers for eligible users
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, phone_number, notifications_muted")
      .in("id", memberIds);

    // Also get phone numbers from auth.users as fallback (requires service role key)
    const authPhoneMap = new Map<string, string>();
    if (supabaseServiceKey) {
      const adminClient = createClient(supabaseUrl!, supabaseServiceKey);
      const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers();
      if (authError) {
        console.error("Failed to list auth users:", authError);
      }
      authUsers?.users?.forEach((u) => {
        if (u.phone) authPhoneMap.set(u.id, u.phone);
      });
    }
    
    console.log("SMS Debug - memberIds:", memberIds);
    console.log("SMS Debug - profiles with phone:", profiles?.filter(p => p.phone_number).map(p => p.id));
    console.log("SMS Debug - auth phones found:", Array.from(authPhoneMap.keys()));

    // Merge: prefer profiles.phone_number, fallback to auth.users.phone
    const eligibleUsers = memberIds
      .map((id) => {
        const profile = profiles?.find((p) => p.id === id);
        const phoneFromProfile = profile?.phone_number;
        const phoneFromAuth = authPhoneMap.get(id);
        const phone = phoneFromProfile || phoneFromAuth;
        const muted = profile?.notifications_muted;
        return { id, phone, muted };
      })
      .filter((u) => u.phone && !u.muted && !disabledUsers.has(u.id));

    console.log("SMS Debug - eligible users:", eligibleUsers.map(u => ({ id: u.id, hasPhone: !!u.phone, muted: u.muted })));
    
    if (eligibleUsers.length === 0) {
      return NextResponse.json({ 
        sent: 0, 
        reason: "no_eligible_users",
        memberCount: memberIds.length,
        profilesWithPhone: profiles?.filter(p => p.phone_number).length || 0,
        authPhonesCount: authPhoneMap.size,
        disabledCount: disabledUsers.size
      });
    }

    // Send SMS to each eligible user
    const appUrl = "https://questionswithfriends.app";
    let sentCount = 0;

    for (const user of eligibleUsers) {
      try {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
        const displayName = answerUserName && answerUserName !== "Someone" ? answerUserName : "Someone";
        const body = new URLSearchParams({
          To: user.phone!,
          From: twilioPhone,
          Body: `🦦 ${displayName} answered today's poll in ${group.name}!\n\n${appUrl}/groups/${groupId}`,
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
          console.log("SMS sent successfully to", user.phone);
        } else {
          const errorText = await smsResponse.text();
          console.error("SMS failed for", user.phone, "Status:", smsResponse.status, "Error:", errorText);
        }
      } catch (err) {
        console.error("SMS exception for", user.phone, err);
      }
    }

    return NextResponse.json({ 
      sent: sentCount, 
      totalEligible: eligibleUsers.length,
      memberIds,
      debug: {
        profilesFound: profiles?.length || 0,
        authUsersFound: authPhoneMap.size
      }
    });
  } catch (error) {
    console.error("Notify answer error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
