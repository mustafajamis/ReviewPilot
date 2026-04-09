const form = document.querySelector("#review-form");
const output = document.querySelector("#review-output");
const statusLabel = document.querySelector("#status");
const reviewList = document.querySelector("#review-list");

function renderReviewList(reviews) {
  if (!reviews.length) {
    reviewList.innerHTML = '<p class="empty">No reviews yet.</p>';
    return;
  }

  reviewList.innerHTML = reviews
    .map(
      (review) => `
        <article class="review-item">
          <strong>${review.pullRequest.title}</strong>
          <span>${review.pullRequest.repository} / ${new Date(review.createdAt).toLocaleString()}</span>
        </article>
      `,
    )
    .join("");
}

async function loadReviews() {
  const response = await fetch("/api/reviews");
  const reviews = await response.json();
  renderReviewList(reviews);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusLabel.textContent = "Reviewing...";
  output.textContent = "ReviewPilot is reading the diff.";

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await fetch("/api/review", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const review = await response.json();

    if (!response.ok) {
      throw new Error(review.error || "Review failed.");
    }

    output.textContent = review.comment;
    statusLabel.textContent = review.postedToGitHub ? "Posted" : "Preview";
    await loadReviews();
  } catch (error) {
    statusLabel.textContent = "Error";
    output.textContent = error.message;
  }
});

loadReviews();
