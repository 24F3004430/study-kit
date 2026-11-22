/**
 * Run with: node examples/algebra.ts   (Node 22.18+ strips the types)
 *       or: bun examples/algebra.ts
 */
import { createSubjectKit, type Subject } from "../src/index.ts";

const algebra: Subject = {
  name: "Algebra Refresher",
  courses: [
    {
      id: 1,
      code: "ALG-101",
      title: "Linear equations",
      subtitle: "Lines and their graphs",
      description: "Straight lines, slope, and where they cross the axes.",
      objectives: ["Read a slope off a graph", "Find the y-intercept from an equation"],
      exitCriteria: ["Explain what slope measures"],
      sections: [
        { title: "Slope", content: "The slope of a line measures how steep it is. It is rise over run." },
        { title: "Intercept", content: "The y-intercept is where the line crosses the vertical axis." },
        {
          title: "Plotting a line",
          content: "1. Mark the y-intercept.\n2. Move by the slope: up for a positive rise, right for the run.\n3. Join the two points.",
          type: "list",
        },
      ],
    },
    {
      id: 2,
      code: "ALG-102",
      title: "Simultaneous equations",
      subtitle: "Two unknowns, two lines",
      description: "Solving pairs of linear equations by substitution and elimination.",
      objectives: ["Solve by substitution", "Recognise parallel lines with no solution"],
      exitCriteria: ["Explain when a system has no solution"],
      sections: [
        {
          title: "Elimination",
          content: "Multiply one equation until a variable has the same coefficient, then subtract the equations.",
        },
      ],
    },
  ],
  cards: [
    { id: "c1", course: 1, question: "Slope is rise over _____.", answer: "run" },
    { id: "c2", course: 2, question: "Parallel lines have _____ solutions.", answer: "no" },
  ],
  questions: [
    {
      id: "q1",
      course: 1,
      question: "What gives the slope of a line?",
      options: ["Rise over run", "Run over rise", "The intercept"],
      correctAnswer: 0,
      explanation: "Slope is the vertical change divided by the horizontal change.",
    },
  ],
  terms: [{ id: 1, startWeek: 1, startDate: "2026-09-07" }],
  milestones: [
    { id: "m1", code: "MS-1", title: "Quiz 1", termId: 1, week: 4, weightPercent: 20 },
    { id: "m2", code: "MS-2", title: "Midterm", termId: 1, week: 8, weightPercent: 30 },
  ],
};

const kit = createSubjectKit(algebra);

const heading = (text: string) => console.log(`\n── ${text} ${"─".repeat(Math.max(0, 52 - text.length))}`);

heading("tutor");
const reply = kit.answer(1, "Explain slope like I'm 12");
console.log(reply.title);
reply.body.forEach((line) => console.log(`  ${line}`));
reply.citations.forEach((cite) => console.log(`  [${cite.courseTitle} · ${cite.section}]`));

heading("cross-course search");
kit.search("elimination").forEach((match) => console.log(`  ${match.courseId} · ${match.section.title} (${match.score})`));

heading("practice");
kit.quiz(1, 3).forEach((question) => console.log(`  ${question.kind}: ${question.prompt}`));

heading("marking");
const written = kit.written(1, 1)[0];
const grade = kit.grade(written, "Slope is how steep a line is, rise over run.");
console.log(`  ${grade.score}% — ${grade.feedback}`);

heading("review");
console.log("  ", kit.mastery(4, 5), kit.mastery(1, 5));
console.log("  ", kit.mastery(0, 0));

heading("progress");
console.log(
  "   activity",
  kit.activityPercent({ lessonDone: true, labsDone: 1, labsTotal: 2, projectsDone: 0, projectsTotal: 1 }),
  "%",
);
console.log("   projection", kit.projectedTermScore({ m1: 72 }, 1));

heading("deadlines");
const next = kit.nextMilestone([], new Date("2026-09-07"));
console.log("  ", next?.milestone.title, next?.date.toDateString(), `${next?.days} days`);
console.log(kit.milestonesToIcs().split("\r\n").slice(0, 6).join("\n"));
