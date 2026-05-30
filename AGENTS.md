# AGENTS.md

This file is for AI coding agents working in this repository.

## Project Shape

- Package manager: `pnpm`.
- Library source: `src`.
- Tests: `test` with Vitest and `happy-dom`.
- Vue playground: `playground/vue`.
- Local upload/download API playground: `playground/server`.
- Large playground fixtures: `playground/fixtures`.
- Public package entrypoints:
  - `slice-upload-utils`
  - `slice-upload-utils/vue`
  - `slice-upload-utils/react`

## Development Flow

1. Inspect the current code and tests before editing.
2. Keep browser-facing library code framework-neutral unless the file is explicitly a React or Vue entry.
3. Prefer existing helpers such as `params.ajaxRequest`, `promisePool`, `getHashChunks`, `mergeFile`, and `saveFile`.
4. Keep upload/download protocol examples aligned across `README.md`, `playground/vue`, `playground/server`, and tests.
5. Use `apply_patch` for focused manual edits.
6. Do not revert user changes or unrelated local work.

## Upload/Download Protocol

The playground server exposes a small conventional API that mirrors the client library:

- `POST /api/upload/verify`
  - JSON body: `preHash`, `filename`, `chunkSize`, `chunkTotal`.
  - Response `data`: uploaded `chunkHash[]`, or `true` when all chunks are present.
- `POST /api/upload/chunk`
  - `multipart/form-data`: `chunk`, `index`, `chunkTotal`, `preHash`, `filename`, `chunkHash`, `chunkSize`.
  - Response `code: 200` means the chunk was accepted.
- `POST /api/upload/merge`
  - JSON body: upload finish params.
  - Merges chunks in index order into `playground/server/.data/files`.
- `GET /api/files/:filename/meta`
  - Response `data`: `filename`, `fileSize`, `fileType`, `url`.
- `GET /api/files/:filename/content`
  - Supports `Range: bytes=start-end` for sliced downloads.

## Verification Flow

Run these before handing work back:

```shell
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test -- --run
pnpm build
```

If any command fails, fix the smallest relevant cause and repeat the full verification flow until it passes.

## Playground

- `pnpm dev` runs both the Vue playground and the local server.
- `pnpm dev:vue` runs only the Vue app.
- `pnpm dev:server` runs only the local upload/download server.
- Vite proxies `/api` to `http://127.0.0.1:10010`, so examples should call relative `/api/...` URLs.

## Style Notes

- Keep TypeScript strict and exported types stable.
- Avoid adding runtime dependencies for the playground server unless there is a clear need.
- Keep large fixtures under `playground/fixtures`. They are for GitHub/playground/tests only and must stay out of the npm package.
- Keep examples modern: `fetch`, `FormData`, explicit framework sub-entry imports, and request helpers bound from `params.ajaxRequest`.
- Comments should explain non-obvious behavior only.
