import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const storePath = fileURLToPath(new URL("../data/reviews.json", import.meta.url));

function normalizeReview(review) {
  if (typeof review.comment !== "string") {
    return review;
  }

  return {
    ...review,
    comment: review.comment.replaceAll("CleanPR", "ReviewPilot"),
  };
}

async function readStore() {
  try {
    const raw = await readFile(storePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeStore(reviews) {
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(reviews, null, 2));
}

export async function listReviews() {
  const reviews = await readStore();
  return reviews.map(normalizeReview).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function saveReview(review) {
  const reviews = await readStore();
  reviews.unshift(normalizeReview(review));
  await writeStore(reviews.slice(0, 50));
  return review;
}
