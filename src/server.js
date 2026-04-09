import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { fetchPullRequestDiff, postPullRequestComment, verifyGitHubSignature } from "./github.js";
import { askOpenAIForReview, formatGitHubComment, runRuleChecks } from "./reviewer.js";
import { listReviews, saveReview } from "./storage.js";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(rootDir, "public");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function pullRequestFromWebhook(payload) {
  return {
    title: payload.pull_request.title,
    author: payload.pull_request.user.login,
    repository: payload.repository.full_name,
    url: payload.pull_request.html_url,
    diffUrl: payload.pull_request.diff_url,
    commentsUrl: payload.issue.comments_url,
    number: payload.pull_request.number,
  };
}

async function reviewPullRequest(pullRequest, diff, { postToGitHub = false } = {}) {
  const ruleChecks = runRuleChecks(diff);
  const aiReview = await askOpenAIForReview({ pullRequest, diff, ruleChecks });
  const comment = formatGitHubComment({ aiReview, ruleChecks });
  let postedToGitHub = false;

  if (postToGitHub && config.githubToken) {
    await postPullRequestComment(pullRequest.commentsUrl, comment);
    postedToGitHub = true;
  }

  const review = await saveReview({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    pullRequest,
    ruleChecks,
    aiReview,
    comment,
    postedToGitHub,
  });

  return review;
}

async function handleWebhook(request, response) {
  const rawBody = await readBody(request);
  const event = request.headers["x-github-event"];
  const signature = request.headers["x-hub-signature-256"];

  if (!verifyGitHubSignature(rawBody, signature)) {
    return sendJson(response, 401, { error: "Invalid GitHub webhook signature." });
  }

  if (event !== "pull_request") {
    return sendJson(response, 202, { ok: true, ignored: `Unsupported event: ${event}` });
  }

  const payload = JSON.parse(rawBody.toString("utf8"));
  const supportedActions = new Set(["opened", "synchronize", "reopened", "ready_for_review"]);

  if (!supportedActions.has(payload.action) || payload.pull_request.draft) {
    return sendJson(response, 202, { ok: true, ignored: `Pull request action: ${payload.action}` });
  }

  const pullRequest = pullRequestFromWebhook(payload);
  const diff = await fetchPullRequestDiff(pullRequest.diffUrl);
  const review = await reviewPullRequest(pullRequest, diff, { postToGitHub: true });

  return sendJson(response, 200, { ok: true, reviewId: review.id, postedToGitHub: review.postedToGitHub });
}

async function handleManualReview(request, response) {
  const rawBody = await readBody(request);
  const body = JSON.parse(rawBody.toString("utf8"));

  if (!body.diff?.trim()) {
    return sendJson(response, 400, { error: "A diff is required." });
  }

  const pullRequest = {
    title: body.title || "Manual Review",
    author: body.author || "local-user",
    repository: body.repository || "local/demo",
    url: body.url || config.appBaseUrl,
  };

  const review = await reviewPullRequest(pullRequest, body.diff, { postToGitHub: false });
  return sendJson(response, 200, review);
}

async function serveStatic(request, response) {
  const url = new URL(request.url, config.appBaseUrl);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = requestedPath.replaceAll("..", "").replace(/^\/+/, "");
  const filePath = join(publicDir, safePath);

  try {
    const body = await readFile(filePath);
    response.writeHead(200, { "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream" });
    response.end(body);
  } catch (error) {
    sendJson(response, 404, { error: "Not found." });
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, config.appBaseUrl);

    if (request.method === "GET" && url.pathname === "/api/reviews") {
      return sendJson(response, 200, await listReviews());
    }

    if (request.method === "POST" && url.pathname === "/api/review") {
      return handleManualReview(request, response);
    }

    if (request.method === "POST" && url.pathname === "/webhooks/github") {
      return handleWebhook(request, response);
    }

    if (request.method === "GET") {
      return serveStatic(request, response);
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: error.message });
  }
});

server.listen(config.port, () => {
  console.log(`ReviewPilot running at ${config.appBaseUrl}`);
  console.log(`GitHub webhook URL: ${config.appBaseUrl}/webhooks/github`);
});
