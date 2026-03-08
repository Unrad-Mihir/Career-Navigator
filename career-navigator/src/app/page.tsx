"use client";

import { useState, useEffect, useRef } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SkillWithQuestions {
  skill: string;
  questions: string[];
}

interface RoadmapStep {
  id: string;
  skill: string;
  order: number;
  suggestedAction: string;
}

interface SkillMatch {
  skill: string;
  matchPercent: number;
}

interface AnalysisResult {
  score: number;
  summary: string;
  gaps: string[];
  skillBreakdown?: SkillMatch[];
  skillsToWorkOn: SkillWithQuestions[];
  recommendedJobs: string[];
  relatedJobs: string[];
  roadmap: RoadmapStep[];
  usedFallback?: boolean;
}

const STORAGE_KEY = "career-navigator-checklist";

async function safeParseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (res.headers.get("content-type")?.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return { error: "Invalid response from server." };
    }
  }
  return { error: "Server returned an error. Check that the dev server is running." };
}

function loadCheckedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveCheckedIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

export default function Home() {
  const [jobDescription, setJobDescription] = useState("");
  const [resume, setResume] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCheckedIds(loadCheckedIds());
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function sendChatMessage() {
    const trimmed = chatInput.trim();
    if (!trimmed || chatLoading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    try {
      const skills =
        result?.skillsToWorkOn?.map((s) => s.skill) ?? result?.gaps ?? [];
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...chatMessages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          skills: skills.length > 0 ? skills : undefined,
        }),
      });

      const data = (await safeParseJson(res)) as { content?: string; error?: string };

      if (!res.ok) {
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.error ?? "Something went wrong. Please try again.",
          },
        ]);
        return;
      }

      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.content ?? "No response." },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Network error. Please try again.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  function startInterview() {
    setInterviewOpen(true);
    if (chatMessages.length === 0) {
      setChatMessages([
        {
          role: "assistant",
          content:
            "Hi! I'm your interview practice coach. I'll ask you questions and give feedback. Ready? Reply with anything to begin, or ask me to start with a question.",
        },
      ]);
    }
  }

  function toggleCheck(id: string) {
    const next = new Set(checkedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setCheckedIds(next);
    saveCheckedIds(next);
  }

  async function handleAnalyze() {
    if (!jobDescription.trim() || !resume.trim()) {
      setError("Please enter both a job description and your resume.");
      return;
    }
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDescription: jobDescription.trim(),
          resume: resume.trim(),
        }),
      });

      const data = (await safeParseJson(res)) as AnalysisResult & { error?: string };

      if (!res.ok || data.error) {
        setError(data.error ?? "Analysis failed.");
        return;
      }

      setResult(data);
      if (data.skillsToWorkOn?.length > 0) {
        setExpandedSkill(data.skillsToWorkOn[0].skill);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-emerald-400 mb-2">
            Career Navigator
          </h1>
          <p className="text-slate-400 text-lg">
            Compare your resume to any job description. Get a score, gaps,
            interview prep questions, job suggestions, and a learning roadmap.
          </p>
        </header>

        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Job Description
            </label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the full job description here..."
              rows={12}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Your Resume
            </label>
            <textarea
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              placeholder="Paste your resume text here..."
              rows={12}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none"
            />
          </div>
        </div>

        <div className="flex justify-center mb-12">
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="px-8 py-3 rounded-xl bg-emerald-500 text-slate-950 font-semibold hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Analyzing..." : "Analyze match"}
          </button>
        </div>

        {error && (
          <div className="mb-8 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-center">
            {error}
          </div>
        )}

        {result && (
          <section className="space-y-8">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="rounded-2xl bg-slate-800/80 border border-slate-700 px-6 py-4">
                <div className="text-sm text-slate-400 mb-1">Match score</div>
                <div className="text-4xl font-bold text-emerald-400">
                  {result.score}
                  <span className="text-2xl text-slate-400">/100</span>
                </div>
              </div>
              {result.usedFallback && (
                <div className="text-sm text-amber-400/90 self-center">
                  Using keyword fallback (add OPENAI_API_KEY for AI analysis)
                </div>
              )}
            </div>

            {result.skillBreakdown && result.skillBreakdown.length > 0 && (
              <div className="rounded-2xl bg-slate-800/80 border border-slate-700 p-6">
                <h2 className="text-lg font-semibold text-slate-200 mb-4">
                  Per-skill match
                </h2>
                <div className="space-y-3">
                  {result.skillBreakdown.map(({ skill, matchPercent }) => (
                    <div key={skill} className="flex items-center gap-3">
                      <span className="w-32 text-sm text-slate-300 truncate">
                        {skill}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-slate-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            matchPercent >= 70
                              ? "bg-emerald-500"
                              : matchPercent >= 40
                                ? "bg-amber-500"
                                : "bg-red-500/80"
                          }`}
                          style={{ width: `${matchPercent}%` }}
                        />
                      </div>
                      <span className="w-10 text-sm text-slate-400 tabular-nums">
                        {matchPercent}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl bg-slate-800/80 border border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-slate-200 mb-2">
                Summary
              </h2>
              <p className="text-slate-300">{result.summary}</p>
            </div>

            {(result.recommendedJobs?.length > 0 || result.relatedJobs?.length > 0) && (
              <div className="grid md:grid-cols-2 gap-6">
                {result.recommendedJobs?.length > 0 && (
                  <div className="rounded-2xl bg-slate-800/80 border border-slate-700 p-6">
                    <h2 className="text-lg font-semibold text-slate-200 mb-2">
                      Recommended for you (based on resume)
                    </h2>
                    <p className="text-sm text-slate-400 mb-3">
                      Roles that match your current skills
                    </p>
                    <ul className="space-y-2">
                      {result.recommendedJobs.map((job) => (
                        <li
                          key={job}
                          className="text-emerald-400 pl-4 border-l-2 border-emerald-500/50"
                        >
                          {job}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.relatedJobs?.length > 0 && (
                  <div className="rounded-2xl bg-slate-800/80 border border-slate-700 p-6">
                    <h2 className="text-lg font-semibold text-slate-200 mb-2">
                      Related to ideal role (based on job description)
                    </h2>
                    <p className="text-sm text-slate-400 mb-3">
                      Similar roles to explore
                    </p>
                    <ul className="space-y-2">
                      {result.relatedJobs.map((job) => (
                        <li
                          key={job}
                          className="text-emerald-400 pl-4 border-l-2 border-emerald-500/50"
                        >
                          {job}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {result.roadmap?.length > 0 && (
              <div className="rounded-2xl bg-slate-800/80 border border-slate-700 p-6">
                <h2 className="text-lg font-semibold text-slate-200 mb-2">
                  Learning roadmap
                </h2>
                <p className="text-sm text-slate-400 mb-4">
                  Track your progress. Check off items as you complete them.
                </p>
                <div className="space-y-3">
                  {result.roadmap
                    .sort((a, b) => a.order - b.order)
                    .map((step) => {
                      const isChecked = checkedIds.has(step.id);
                      return (
                        <label
                          key={step.id}
                          className={`flex gap-3 items-start p-3 rounded-xl border cursor-pointer transition-colors ${
                            isChecked
                              ? "bg-emerald-500/10 border-emerald-500/30"
                              : "bg-slate-900/80 border-slate-700 hover:border-slate-600"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCheck(step.id)}
                            className="mt-1.5 size-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
                          />
                          <div>
                            <span
                              className={
                                isChecked
                                  ? "text-slate-400 line-through"
                                  : "font-medium text-slate-200"
                              }
                            >
                              {step.skill}
                            </span>
                            <p className="text-sm text-slate-400 mt-1">
                              {step.suggestedAction}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                </div>
                {result.roadmap.length > 0 && (
                  <p className="text-sm text-slate-500 mt-4">
                    {result.roadmap.filter((s) => checkedIds.has(s.id)).length} of{" "}
                    {result.roadmap.length} completed
                  </p>
                )}
              </div>
            )}

            {result.gaps.length > 0 && (
              <div className="rounded-2xl bg-slate-800/80 border border-slate-700 p-6">
                <h2 className="text-lg font-semibold text-slate-200 mb-3">
                  Skills to strengthen
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {result.gaps.map((g) => (
                    <li
                      key={g}
                      className="px-3 py-1 rounded-lg bg-slate-700/80 text-slate-300"
                    >
                      {g}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.skillsToWorkOn.length > 0 && (
              <div className="rounded-2xl bg-slate-800/80 border border-slate-700 p-6">
                <h2 className="text-lg font-semibold text-slate-200 mb-4">
                  Practice questions by skill
                </h2>
                <div className="space-y-3">
                  {result.skillsToWorkOn.map(({ skill, questions }) => (
                    <div
                      key={skill}
                      className="rounded-xl bg-slate-900/80 border border-slate-700 overflow-hidden"
                    >
                      <button
                        onClick={() =>
                          setExpandedSkill(expandedSkill === skill ? null : skill)
                        }
                        className="w-full px-4 py-3 text-left flex justify-between items-center hover:bg-slate-800/50 transition-colors"
                      >
                        <span className="font-medium text-emerald-400">
                          {skill}
                        </span>
                        <span className="text-slate-400 text-sm">
                          {expandedSkill === skill ? "−" : "+"}
                        </span>
                      </button>
                      {expandedSkill === skill && (
                        <ul className="px-4 pb-4 space-y-2 border-t border-slate-700 pt-3 mt-0">
                          {questions.map((q, i) => (
                            <li
                              key={i}
                              className="text-slate-300 pl-4 border-l-2 border-emerald-500/50"
                            >
                              {q}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Interview Practice Bot */}
        <div className="fixed bottom-6 right-6 z-50">
          {interviewOpen ? (
            <div className="w-[380px] max-h-[520px] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/80">
                <h3 className="font-semibold text-emerald-400">
                  Interview Practice
                </h3>
                <button
                  onClick={() => setInterviewOpen(false)}
                  className="text-slate-400 hover:text-slate-200"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[280px] max-h-[360px]">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-4 py-2 ${
                        msg.role === "user"
                          ? "bg-emerald-500/20 text-slate-100"
                          : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800 rounded-xl px-4 py-2 text-slate-400">
                      Thinking...
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="p-3 border-t border-slate-700">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendChatMessage();
                  }}
                  className="flex gap-2"
                >
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type your response..."
                    disabled={chatLoading}
                    className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={chatLoading || !chatInput.trim()}
                    className="rounded-lg bg-emerald-500 px-4 py-2 text-slate-950 font-medium hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Send
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <button
              onClick={startInterview}
              className="flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-slate-950 font-semibold shadow-lg hover:bg-emerald-400 transition-colors"
            >
              Interview practice
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
