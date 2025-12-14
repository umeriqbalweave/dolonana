import { NextRequest, NextResponse } from "next/server";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

export async function POST(req: NextRequest) {
  try {
    if (!accountSid || !authToken || !fromNumber) {
      return NextResponse.json(
        { error: "Twilio is not configured" },
        { status: 500 },
      );
    }

    const { phones, groupName, appUrl, inviterName } = await req.json();

    if (!Array.isArray(phones) || phones.length === 0) {
      return NextResponse.json(
        { error: "phones must be a non-empty array" },
        { status: 400 },
      );
    }

    const inviterText = inviterName ? `${inviterName} invited you` : "You're invited";
    const bodyBase = appUrl
      ? `🦦 ${inviterText} to join "${groupName}" on Juggu! Tap to join: ${appUrl}`
      : `🦦 ${inviterText} to join "${groupName}" on Juggu!`;

    const basicAuth =
      "Basic " +
      Buffer.from(`${accountSid}:${authToken}`, "utf8").toString("base64");

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    await Promise.all(
      phones.map(async (to: string) => {
        const params = new URLSearchParams({
          From: fromNumber as string,
          To: to,
          Body: bodyBase,
        });

        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: basicAuth,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        });

        if (!res.ok) {
          const text = await res.text();
          console.error("Failed to send SMS to", to, text);
        }
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to send invites" },
      { status: 500 },
    );
  }
}
