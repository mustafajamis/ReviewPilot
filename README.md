# ReviewPilot - AI Pull Request Reviewer

ReviewPilot is a GitHub pull request reviewer. It receives GitHub pull request webhooks, fetches the diff, runs rule-based risk checks, optionally asks OpenAI for a structured review, and can post the final comment back to the pull request.

## What It Does

- Accepts GitHub `pull_request` webhooks at `/webhooks/github`
- Verifies the GitHub `X-Hub-Signature-256` webhook signature
- Fetches the pull request diff through the GitHub API
- Runs deterministic checks for risky patterns like secrets, SQL string interpolation, auth changes, logging, and `eval`
- Uses the OpenAI Responses API for a structured review when `OPENAI_API_KEY` is configured
- Posts a Markdown review comment back to GitHub when `GITHUB_TOKEN` is configured
- Includes a local dashboard and manual diff-review demo at `/`

## Run Locally

```powershell
Copy-Item .env.example .env
npm run dev
```

Open:

```text
http://localhost:3000
```

The manual demo works without any API keys. If `OPENAI_API_KEY` is missing, ReviewPilot returns rule-based findings and a message that AI review was skipped.

## Environment Variables

```text
PORT=3000
APP_BASE_URL=http://localhost:3000
GITHUB_WEBHOOK_SECRET=replace-with-a-random-secret
GITHUB_TOKEN=replace-with-github-token
OPENAI_API_KEY=replace-with-openai-api-key
OPENAI_MODEL=gpt-5.4
```

## GitHub Webhook Setup

1. Run the app locally.
2. Expose it with a tunnel such as ngrok or GitHub Codespaces port forwarding.
3. In your GitHub repository, go to `Settings > Webhooks > Add webhook`.
4. Payload URL: `https://your-public-url/webhooks/github`
5. Content type: `application/json`
6. Secret: same value as `GITHUB_WEBHOOK_SECRET`
7. Events: select `Pull requests`

For posting comments, create a GitHub token with permission to read pull requests and write issues/comments for the test repository, then set `GITHUB_TOKEN`.

## OpenAI Notes

The implementation calls the OpenAI Responses API at `/v1/responses` and uses structured output through `text.format` with a JSON schema. OpenAI's docs show `gpt-5.4` as the latest model in the API navigation and the Responses API as the current text-generation path.

Sources:

- [OpenAI text generation guide](https://developers.openai.com/api/docs/guides/text)
- [OpenAI structured outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)

## Next Upgrades

- Replace JSON file storage with PostgreSQL
- Add GitHub OAuth and repository installation flow
- Add inline PR review comments instead of only issue-level comments
- Add a queue for webhook processing
- Add per-repository rule configuration
- Add CI with unit tests for `runRuleChecks` and webhook signature validation
