import { describe, expect, it } from "vitest";
import {
  activityPercent,
  createSubjectKit,
  gradeShortAnswer,
  mentions,
  projectedTermScore,
  readinessPercent,
  type Subject,
} from "./index";

/**
 * A deliberately tiny, throwaway subject: if anything in the kit assumed a
 * particular curriculum, these tests would fail.
 */
const algebra: Subject = {
  name: "Algebra Refresher",
  courses: [
    {
      id: 1,
      code: "ALG-101",
      title: "Linear equations",
      subtitle: "Lines and their graphs",
      description: "Straight lines, their slope and where they cross the axes.",
      objectives: ["Read a slope off a graph", "Find the y-intercept"],
      exitCriteria: ["Explain what slope measures", "Find the intercept from an equation"],
      sections: [
        {
          title: "Slope",
          content: "The slope of a line measures how steep it is. It is rise over run.",
        },
        {
          title: "Intercept",
          content: "The y-intercept is the point where the line crosses the vertical axis.",
        },
      ],
    },
    {
      id: 2,
      code: "ALG-201",
      title: "Quadratics",
      subtitle: "Curves and roots",
      description: "Parabolas, their roots and the discriminant.",
      objectives: ["Use the discriminant", "Sketch a parabola"],
      exitCriteria: ["State what the discriminant tells you"],
      sections: [
        {
          title: "Discriminant",
          content: "The discriminant of a quadratic tells how many real roots it has. A negative value means no real roots.",
        },
      ],
    },
  ],
  cards: [
    {
      id: "c1",
      course: 1,
      question: "The slope of a line is rise over _____.",
      answer: "run",
    },
    {
      id: "c2",
      course: 2,
      question: "The _____ tells how many real roots a quadratic has.",
      answer: "discriminant",
    },
  ],
  questions: [
    {
      id: "q1",
      course: 1,
      question: "Which expression gives the slope of a line?",
      options: ["Rise over run", "Run over rise", "Rise times run", "Run minus rise"],
      correctAnswer: 0,
      explanation: "Slope is vertical change divided by horizontal change.",
    },
  ],
  terms: [
    { id: 1, startWeek: 1, startDate: "2026-09-07" },
    { id: 2, startWeek: 13, startDate: "2027-01-04" },
  ],
  milestones: [
    { id: "m1", code: "MS-1", title: "Quiz 1 — Lines", termId: 1, week: 4, weightPercent: 20 },
    { id: "m2", code: "MS-2", title: "End term — Algebra", termId: 1, week: 12, weightPercent: 80 },
  ],
};

describe("subject kit is content-agnostic", () => {
  const kit = createSubjectKit(algebra);

  it("answers from the right section and cites it", () => {
    const reply = kit.answer(1, "What does the slope measure?");
    expect(reply.citations[0]?.section).toBe("Slope");
    expect(reply.body.join(" ")).toMatch(/steep/i);
  });

  it("reaches into another course when this one has nothing", () => {
    const reply = kit.answer(1, "What is the discriminant?");
    expect(reply.citations.some((citation) => citation.courseId === 2)).toBe(true);
    expect(reply.body[0]).toMatch(/Quadratics/);
  });

  it("builds auto-marked and written practice", () => {
    const quiz = kit.quiz(1, 3);
    expect(quiz.length).toBeGreaterThan(0);
    expect(quiz.every((question) => question.course === 1)).toBe(true);
    expect(kit.written(2, 1)[0]?.prompt).toMatch(/discriminant/i);
  });

  it("marks a short answer by keyword coverage with one-edit tolerance", () => {
    const question = {
      id: "manual",
      kind: "short" as const,
      course: 2,
      prompt: "State what the discriminant tells you",
      answer: "It tells how many real roots a quadratic has.",
      explanation: "",
      keywords: ["discriminant", "roots", "quadratic"],
    };
    const good = gradeShortAnswer(question, "The discriminantt says how many real roots the quadratic has.");
    const poor = gradeShortAnswer(question, "It is a number.");
    expect(good.matched).toContain("discriminant");
    expect(good.score).toBeGreaterThan(poor.score);
    expect(mentions("the discriminant", "discriminant")).toBe(true);
    expect(mentions("a different word", "discriminant")).toBe(false);
  });

  it("produces a study guide and a matching game", () => {
    const guide = kit.studyGuide(1);
    expect(guide.sections.length).toBe(2);
    expect(guide.keyTerms.some((term) => term.term === "Slope")).toBe(true);
    const pairs = kit.matchPairs(1);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs[0]).toHaveProperty("definition");
  });

  it("computes activity and readiness independently", () => {
    expect(activityPercent({ lessonDone: true, labsDone: 1, labsTotal: 2, projectsDone: 0, projectsTotal: 0 })).toBe(79);
    expect(readinessPercent({ milestones: [{ weight: 80, score: 50 }, { weight: 20, score: 100 }] })).toBe(60);
  });

  it("projects a term and dates its milestones from the bundle's calendar", () => {
    const projection = projectedTermScore(algebra, { m1: 60, m2: 80 }, 1);
    expect(projection.score).toBe(76);
    expect(projection.recordedWeight).toBe(100);
    expect(projection.complete).toBe(true);

    const date = kit.milestoneDate(algebra.milestones![0]);
    expect(`${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`).toBe("2026-9-28");
  });

  it("exports every milestone as an all-day calendar event", () => {
    const ics = kit.milestonesToIcs(new Date("2026-09-01T09:00:00Z"));
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(2);
    expect(ics).toContain("SUMMARY:MS-1 — Quiz 1 — Lines");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260928");
  });
});
