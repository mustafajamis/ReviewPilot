import { config } from "./config.js";

const HIGH_RISK_PATTERNS = [
  {
    label: "Possible hard-coded secret",
    pattern: /\b(api[_-]?key|secret|token|password)\b\s*[:=]\s*["'][^"']{8,}/i,
    advice: "Move secrets into environment variables or a managed secret store.",
  },
  {
    label: "Console logging added",
    pattern: /^\+.*console\.(log|debug|warn|error)\(/im,
    advice: "Check whether this logging is intentional and safe for production.",
  },
  {
    label: "Potential SQL injection",
    pattern: /^\+.*(SELECT|INSERT|UPDATE|DELETE).*\$\{|^\+.*(SELECT|INSERT|UPDATE|DELETE).* \+ /im,
    advice: "Use parameterized queries instead of interpolating user input into SQL.",
  },
  {
    label: "Unsafe eval usage",
    pattern: /^\+.*\beval\(/im,
    advice: "Avoid eval and use a safer parser or explicit dispatch table.",
  },
  {
    label: "Authentication code changed",
    pattern: /auth|jwt|session|oauth|password|permission|role/i,
    advice: "Ask for an extra security review and include focused tests.",
  },
];

function trimDiff(diff, maxChars = 18000) {
  if (diff.length <= maxChars) {
    return diff;
  }

  return `${diff.slice(0, maxChars)}\n\n[Diff truncated for review.]`;
}

export function runRuleChecks(diff) {
  const findings = HIGH_RISK_PATTERNS.filter((rule) => rule.pattern.test(diff)).map(
    (rule) => ({
      label: rule.label,
      advice: rule.advice,
    }),
  );

  const addedLines = diff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
  const removedLines = diff.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
  const filesChanged = diff.split("\n").filter((line) => line.startsWith("diff --git")).length;

  return {
    findings,
    stats: {
      filesChanged,
      addedLines,
      removedLines,
    },
  };
}

export async function askOpenAIForReview({ pullRequest, diff, ruleChecks }) {
  if (!config.openaiApiKey) {
    return {
      summary: "OpenAI review skipped because OPENAI_API_KEY is not configured.",
      risks: [],
      tests: ["Configure OPENAI_API_KEY to enable deeper AI review."],
      mergeConfidence: "unknown",
    };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openaiModel,
      input: [
        {
          role: "developer",
          content:
            "You are ReviewPilot, a concise senior code reviewer. Review only the provided pull request diff. Return strict JSON with keys summary, risks, tests, mergeConfidence. Keep risks actionable and avoid inventing files not present in the diff.",
        },
        {
          role: "user",
          content: JSON.stringify({
            pullRequest: {
              title: pullRequest.title,
              author: pullRequest.author,
              repository: pullRequest.repository,
              url: pullRequest.url,
            },
            ruleChecks,
            diff: trimDiff(diff),
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "reviewpilot_review",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              risks: {
                type: "array",
                items: { type: "string" },
              },
              tests: {
                type: "array",
                items: { type: "string" },
              },
              mergeConfidence: {
                type: "string",
                enum: ["low", "medium", "high", "unknown"],
              },
            },
            required: ["summary", "risks", "tests", "mergeConfidence"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API ${response.status}: ${body}`);
  }

  const result = await response.json();
  const outputText = result.output_text || result.output?.[0]?.content?.[0]?.text;

  return JSON.parse(outputText);
}

export function formatGitHubComment({ aiReview, ruleChecks }) {
  const risks = aiReview.risks?.length
    ? aiReview.risks.map((risk) => `- ${risk}`).join("\n")
    : "- No major AI-detected risks.";

  const tests = aiReview.tests?.length
    ? aiReview.tests.map((test) => `- ${test}`).join("\n")
    : "- No specific test suggestions.";

  const ruleFindings = ruleChecks.findings.length
    ? ruleChecks.findings.map((finding) => `- ${finding.label}: ${finding.advice}`).join("\n")
    : "- No rule-based warnings.";

  return `## ReviewPilot Review

**Summary**
${aiReview.summary}

**Rule Checks**
${ruleFindings}

**AI Risks**
${risks}

**Suggested Tests**
${tests}

**Merge Confidence**
${aiReview.mergeConfidence || "unknown"}

_Stats: ${ruleChecks.stats.filesChanged} files, +${ruleChecks.stats.addedLines} / -${ruleChecks.stats.removedLines}_`;
}
