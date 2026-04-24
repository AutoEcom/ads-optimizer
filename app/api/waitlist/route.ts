import { NextResponse } from "next/server";

type WaitlistBody = {
  email: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as WaitlistBody;
    const email = body.email?.trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Моля, въведете валиден имейл." }, { status: 400 });
    }

    const apiKey = process.env.MAILERLITE_API_KEY;
    const groupId = process.env.MAILERLITE_GROUP_ID;

    if (!apiKey || !groupId) {
      // Placeholder mode for local development before real MailerLite credentials are set.
      return NextResponse.json({ success: true, mode: "placeholder" });
    }

    const response = await fetch("https://connect.mailerlite.com/api/subscribers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        email,
        groups: [groupId]
      }),
      cache: "no-store"
    });

    if (!response.ok) {
      const payload = await response.text();
      return NextResponse.json(
        { error: `MailerLite грешка: ${payload || "Неуспешен запис в списъка."}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Временен проблем. Опитайте отново." }, { status: 500 });
  }
}
