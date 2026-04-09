import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

export function verifyGitHubSignature(rawBody, signatureHeader) {
  if (!config.githubWebhookSecret) {
    return true;
  }

  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", config.githubWebhookSecret)
    .update(rawBody)
    .digest("hex")}`;

  const actualBuffer = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

async function githubFetch(url, options = {}) {
  if (!config.githubToken) {
    throw new Error("GITHUB_TOKEN is required for GitHub API calls.");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.githubToken}`,
      "User-Agent": "ReviewPilot-AI-Reviewer",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body}`);
  }

  return response;
}

export async function fetchPullRequestDiff(diffUrl) {
  const response = await githubFetch(diffUrl, {
    headers: {
      Accept: "application/vnd.github.v3.diff",
    },
  });

  return response.text();
}

export async function postPullRequestComment(commentsUrl, body) {
  const response = await githubFetch(commentsUrl, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

  return response.json();
}
