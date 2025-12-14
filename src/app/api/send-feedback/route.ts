import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { feedback, userName, userPhone } = await req.json();

    if (!feedback) {
      return NextResponse.json({ error: "Feedback is required" }, { status: 400 });
    }

    // Twilio credentials
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
    const adminPhone = "+16177589693";

    if (!twilioSid || !twilioAuth || !twilioFrom) {
      console.error("Missing Twilio credentials");
      return NextResponse.json({ error: "SMS service not configured" }, { status: 500 });
    }

    // Send SMS to admin
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    const authHeader = Buffer.from(`${twilioSid}:${twilioAuth}`).toString("base64");

    const messageBody = `📬 Dolo Feedback from ${userName} (${userPhone}):\n\n"${feedback}"`;

    const smsResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: twilioFrom,
        To: adminPhone,
        Body: messageBody.slice(0, 1600), // SMS limit
      }),
    });

    if (smsResponse.ok) {
      console.log("Feedback SMS sent successfully");
      return NextResponse.json({ success: true });
    } else {
      const errorData = await smsResponse.text();
      console.error("Failed to send feedback SMS:", errorData);
      return NextResponse.json({ error: "Failed to send feedback" }, { status: 500 });
    }
  } catch (error) {
    console.error("Error sending feedback:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
