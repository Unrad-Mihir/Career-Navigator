import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are a friendly, professional interview coach conducting a mock technical/behavioral interview. Your goals:
- Ask one question at a time
- When the candidate says they're ready or asks to begin, start with your first question immediately
- After the candidate responds, give brief positive feedback and 1-2 specific improvement tips (if applicable), then ask the next question
- Keep responses concise (2-4 sentences max)
- Be supportive but constructive
- Mix technical and behavioral questions
- If no specific skills are provided, ask general interview questions (intro, strengths/weaknesses, past projects, problem-solving)
- Never lecture or write long paragraphs`;

export async function POST(request: NextRequest) {
  try {
    const { messages, skills } = (await request.json()) as {
      messages: { role: "user" | "assistant"; content: string }[];
      skills?: string[];
    };

    if (!messages?.length || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Messages are required." },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Interview practice requires an OpenAI API key. Add OPENAI_API_KEY to .env.local.",
        },
        { status: 503 }
      );
    }

    const skillsContext =
      skills && skills.length > 0
        ? `Focus your questions on these skills the candidate is working on: ${skills.join(", ")}.`
        : "";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT} ${skillsContext}` },
          ...messages,
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenAI API error:", err);
      return NextResponse.json(
        { error: "Interview service unavailable. Please try again." },
        { status: 502 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return NextResponse.json(
        { error: "No response from interview coach." },
        { status: 500 }
      );
    }

    return NextResponse.json({ content });
  } catch (error) {
    console.error("Interview error:", error);
    return NextResponse.json(
      { error: "Interview failed. Please try again." },
      { status: 500 }
    );
  }
}
