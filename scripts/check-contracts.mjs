import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "README.md",
  "docs/api.md",
  "docs/erd.md",
  "docs/algorithm.md",
  "docs/state-machine.md",
  "docs/test-plan.md",
  "docs/ai-retrospective.md",
  "prisma/schema.prisma",
  "src/app/api/sessions/route.ts",
  "src/app/api/assessments/[sessionId]/progress/route.ts",
  "src/app/api/assessments/[sessionId]/steps/[stepKey]/route.ts",
  "src/app/api/assessments/[sessionId]/submit/route.ts",
  "src/app/api/results/[sessionId]/route.ts",
  "src/app/api/pay/route.ts"
];

const requiredApiText = [
  "POST /api/sessions",
  "GET /api/assessments/{sessionId}/progress",
  "PATCH /api/assessments/{sessionId}/steps/{stepKey}",
  "POST /api/assessments/{sessionId}/submit",
  "GET /api/results/{sessionId}",
  "POST /api/pay"
];

const missing = requiredFiles.filter((file) => !existsSync(file));
if (missing.length) {
  console.error("Missing required files:");
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

const apiDoc = readFileSync("docs/api.md", "utf8");
const missingApi = requiredApiText.filter((text) => !apiDoc.includes(text));
if (missingApi.length) {
  console.error("Missing API contracts:");
  for (const text of missingApi) console.error(`- ${text}`);
  process.exit(1);
}

console.log("Contract scaffold check passed.");
