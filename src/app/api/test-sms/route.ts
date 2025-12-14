import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();

    if (!phone) {
      return NextResponse.json({ error: "Phone number required" }, { status: 400 });
    }

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!twilioSid || !twilioAuth || !twilioPhone) {
      return NextResponse.json({ 
        error: "Missing Twilio credentials",
        hasSid: !!twilioSid,
        hasAuth: !!twilioAuth,
        hasPhone: !!twilioPhone
      }, { status: 500 });
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    const body = new URLSearchParams({
      To: phone,
      From: twilioPhone,
      Body: "🦦 Hey! This is Juggu. Your SMS notifications are working! 🎉",
    });

    const smsResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioAuth}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const smsData = await smsResponse.json();

    if (!smsResponse.ok) {
      return NextResponse.json({ 
        error: "Twilio API error", 
        details: smsData 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: "Test SMS sent!",
      sid: smsData.sid
    });
  } catch (error) {
    console.error("Test SMS error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
