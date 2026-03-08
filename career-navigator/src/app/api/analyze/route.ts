import { NextRequest, NextResponse } from "next/server";

export interface SkillWithQuestions {
  skill: string;
  questions: string[];
}

export interface RoadmapStep {
  id: string;
  skill: string;
  order: number;
  suggestedAction: string;
}

export interface SkillMatch {
  skill: string;
  matchPercent: number;
}

export interface AnalysisResult {
  score: number;
  summary: string;
  gaps: string[];
  skillBreakdown: SkillMatch[];
  skillsToWorkOn: SkillWithQuestions[];
  recommendedJobs: string[];
  relatedJobs: string[];
  roadmap: RoadmapStep[];
  usedFallback: boolean;
}

// Simple fallback when AI is unavailable - keyword-based analysis
function fallbackAnalysis(jobDescription: string, resume: string): AnalysisResult {
  const jobLower = jobDescription.toLowerCase();
  const resumeLower = resume.toLowerCase();

  // Extract potential skills from job (common tech/soft skill patterns)
  const skillPatterns = [
    /\b(?:python|javascript|java|typescript|react|node\.?js|aws|docker|kubernetes|sql|git)\b/gi,
    /\b(?:leadership|communication|problem.?solving|teamwork|agile|scrum)\b/gi,
    /\b(?:machine learning|data analysis|api|rest|graphql)\b/gi,
    /\b(\d+)\+?\s*years?\s+(?:of\s+)?(?:experience\s+in\s+)?([a-z\s]+)/gi,
  ];

  const jobSkills = new Set<string>();
  skillPatterns.forEach((pattern) => {
    const matches = jobDescription.matchAll(pattern);
    for (const m of matches) {
      const skill = m[0].toLowerCase().replace(/\s+/g, " ").trim();
      if (skill.length > 2 && !/^\d+$/.test(skill)) jobSkills.add(skill);
    }
  });

  // Also extract capitalized phrases that look like skills
  const words = jobDescription.split(/\s+/);
  words.forEach((w, i) => {
    if (w.length > 4 && /^[A-Z]/.test(w) && !words[i - 1]?.endsWith(".")) {
      jobSkills.add(w.toLowerCase());
    }
  });

  const gaps: string[] = [];
  const matchedSkills: string[] = [];
  jobSkills.forEach((skill) => {
    if (skill.length > 3) {
      if (resumeLower.includes(skill)) {
        matchedSkills.push(skill);
      } else {
        gaps.push(skill);
      }
    }
  });

  const skillBreakdown: SkillMatch[] = [
    ...matchedSkills.map((s) => ({ skill: s, matchPercent: 100 })),
    ...gaps.map((s) => ({ skill: s, matchPercent: 0 })),
  ];

  const total = Math.max(jobSkills.size, 1);
  const matched = total - Math.min(gaps.length, total);
  const score = Math.round((matched / total) * 100);

  const skillsToWorkOn: SkillWithQuestions[] = gaps.slice(0, 8).map((skill) => ({
    skill,
    questions: [
      `How have you used ${skill} in a project?`,
      `What challenges did you face while working with ${skill}?`,
      `Describe a situation where ${skill} was critical to success.`,
    ],
  }));

  const roadmap: RoadmapStep[] = gaps.slice(0, 8).map((s, i) => ({
    id: s.toLowerCase().replace(/\s+/g, "-"),
    skill: s,
    order: i + 1,
    suggestedAction: `Learn and practice ${s} - take a course or build a small project`,
  }));

  // Fallback: generic job suggestions based on common skills
  const resumeSkills = ["python", "javascript", "react", "aws", "data", "devops"];
  const matchedFromResume = resumeSkills.filter((s) => resumeLower.includes(s));
  const recommendedJobs = matchedFromResume.length > 0
    ? [
        `${matchedFromResume[0]} Developer`,
        "Software Engineer",
        "Full Stack Developer",
      ]
    : ["Software Engineer", "Junior Developer", "Technical Support"];

  const relatedJobs = [
    "Similar roles at other companies",
    "Senior-level version of this role",
    "Adjacent roles in the same industry",
  ];

  return {
    score: Math.min(score, 95),
    summary: gaps.length > 0
      ? `We identified ${gaps.length} skills from the job description that may need strengthening in your resume.`
      : "Your resume appears to cover the key skills mentioned in the job description.",
    gaps,
    skillBreakdown,
    skillsToWorkOn,
    recommendedJobs,
    relatedJobs,
    roadmap,
    usedFallback: true,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { jobDescription, resume } = (await request.json()) as {
      jobDescription?: string;
      resume?: string;
    };

    if (!jobDescription?.trim() || !resume?.trim()) {
      return NextResponse.json(
        { error: "Both job description and resume are required." },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        fallbackAnalysis(jobDescription.trim(), resume.trim())
      );
    }

    const prompt = `You are a career coach. Compare this job description with this resume.

JOB DESCRIPTION:
${jobDescription}

RESUME:
${resume}

Respond with ONLY valid JSON in this exact structure (no markdown, no extra text):
{
  "score": <number 0-100, how well the resume matches the job>,
  "summary": "<2-3 sentence summary of the match>",
  "gaps": ["<skill1>", "<skill2>", ...],
  "skillBreakdown": [
    { "skill": "<skill name>", "matchPercent": <0-100> }
  ],
  "skillsToWorkOn": [
    {
      "skill": "<skill name>",
      "questions": ["<interview question 1>", "<interview question 2>", "<interview question 3>"]
    }
  ],
  "recommendedJobs": ["<job title 1>", "<job title 2>", "<job title 3>"],
  "relatedJobs": ["<job title 1>", "<job title 2>", "<job title 3>"],
  "roadmap": [
    {
      "id": "<slug e.g. python>",
      "skill": "<skill name>",
      "order": 1,
      "suggestedAction": "<1-2 sentence concrete action: course, project, certification>"
    }
  ]
}

Rules:
- skillBreakdown: list ALL key skills from the job with matchPercent 0-100 (how well resume covers each). Include both matched and gap skills.
- List 3-8 gaps (skills/requirements in the job that appear weak or missing in the resume)
- For each gap, provide 3 specific technical/behavioral interview questions
- recommendedJobs: 3-5 job titles/roles that fit the user's RESUME (roles they could apply to now)
- relatedJobs: 3-5 job titles similar to the ideal JOB DESCRIPTION (roles like the one they want)
- roadmap: ordered learning steps to fill gaps, each with id, skill, order, suggestedAction (be specific: "Complete AWS Cloud Practitioner cert", "Build a REST API with Node.js")
- Be concise and actionable`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenAI API error:", err);
      return NextResponse.json(
        fallbackAnalysis(jobDescription.trim(), resume.trim())
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return NextResponse.json(
        fallbackAnalysis(jobDescription.trim(), resume.trim())
      );
    }

    let parsed: Partial<AnalysisResult>;
    try {
      const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
      parsed = JSON.parse(cleaned) as Partial<AnalysisResult>;
    } catch {
      return NextResponse.json(
        fallbackAnalysis(jobDescription.trim(), resume.trim())
      );
    }

    const fallback = fallbackAnalysis(jobDescription.trim(), resume.trim());
    const result: AnalysisResult = {
      score: parsed.score ?? fallback.score,
      summary: parsed.summary ?? fallback.summary,
      gaps: parsed.gaps ?? fallback.gaps,
      skillBreakdown: parsed.skillBreakdown ?? fallback.skillBreakdown,
      skillsToWorkOn: parsed.skillsToWorkOn ?? fallback.skillsToWorkOn,
      recommendedJobs: parsed.recommendedJobs ?? fallback.recommendedJobs,
      relatedJobs: parsed.relatedJobs ?? fallback.relatedJobs,
      roadmap: parsed.roadmap ?? fallback.roadmap,
      usedFallback: false,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { error: "Analysis failed. Please try again." },
      { status: 500 }
    );
  }
}
