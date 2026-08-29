# Security and review notes

## Scope

This repository contains only the StoryForge Feishu/Lark Base sidebar plugin. It is a static React application and does not include backend credentials, payment code, databases, or provider secrets.

## Data flow

1. The user selects fields and records from the currently opened Base table through `@lark-base-open/js-sdk`.
2. The plugin sends the prompt and user-selected attachment URLs to the configured StoryForge API endpoint.
3. The plugin polls the StoryForge task endpoint.
4. When generation succeeds, the plugin downloads the generated video in the browser and uploads it to the configured attachment field.

The default StoryForge API origin is `https://www.storyforge.asia`. Users may change it in advanced settings for development or self-hosted deployments.

## Credentials

- The StoryForge API Key is entered by the user.
- It is stored in browser `localStorage` to preserve plugin configuration.
- It is sent only as an `Authorization: Bearer` header to the configured StoryForge API origin.
- No production API Key, email credential, payment credential, private key, or `.env` file is committed to this repository.

## Model allowlist

The UI has a fixed allowlist and does not accept arbitrary model IDs:

- `sz-sd25-r2-720p` — 8 points/request
- `sz-sd25-r2-480p` — 6 points/request
- `lec-seedance-2-0-933-stable` — 4.3 points/request
- `MiniMaxH3` — 2.5 points/request

Model-specific duration, resolution, aspect-ratio, and reference-asset constraints are validated before submission.

## Reproducible build

```bash
npm ci
npm run build
```

The build output is written to `dist/`. Generated output and dependencies are excluded from source control.

## Vulnerability reports

Please open a private security advisory on the GitHub repository or contact the StoryForge project owner. Do not include live API Keys or user data in a public issue.
