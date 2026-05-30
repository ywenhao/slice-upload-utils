# Code Review

## Findings

- `src/upload.ts:L324`: `chunkHash` is not unique when `realChunkHash=true` and duplicate chunk contents exist. Bind upload requests by `index` and keep `chunkHash` as compatibility metadata.
- `src/upload.ts:L243`: `pause()` / `cancel()` during hash or pre-verify could be overwritten by `start()` and continue scheduling uploads. Clear stop flags before starting and return after long awaits when stopped.
- `src/upload.ts:L220` / `src/download.ts:L361`: delayed `params.ajaxRequest()` calls after pause/cancel created unsent XHR promises that never settled. Reject immediately when stopped, including delayed retry callbacks.
- `src/download.ts:L128`: changing download file options after a successful download reused the old success chunks and made the next `start()` return early. Reset chunks when filename, size, or type changes.
- `src/upload.ts:L189` / `src/download.ts:L327`: XHR failures emitted both the original request error and a generic outer error. Keep the original error and emit once from the outer request task.
- `src/download.ts:L302`: spreading `Headers` into an object dropped custom headers before adding `Range`. Clone `Headers` and set `Range` explicitly.
- `src/download.ts:L406`: last download chunk used `fileSize` as the inclusive HTTP Range end byte. Use `fileSize - 1`.
- `src/vueHooks.ts:L37`: `watch(status, () => setChunk())` referenced `setChunk` before declaration in the old implementation. Move instance/setup helpers before watchers and keep hook-only options out of the core constructor.
- `playground/vue/src/example/Upload.vue:L10`: `request` closed over `instance` before the hook return value existed. Prefer `params.ajaxRequest()` so the request is bound to the current chunk without declaration-order coupling.
- `src/upload.ts:L153`: `ajaxRequest()` depended on shared `currentRequestChunkHash`; concurrent or delayed request code could bind to the wrong chunk. Add per-call `chunkHash` binding and expose it through non-enumerable `UploadParams.ajaxRequest`.
- `src/download.ts:L289`: pause/cancel path called `request()` instead of `abort()`, which could restart a request while stopping. Abort the active XHR when stopped.
- `src/download.ts:L269`: download `ajaxRequest()` depended on shared `currentRequestChunkIndex`; concurrent calls could address the wrong chunk. Add per-call `chunkIndex` binding and expose `DownloadParams.ajaxRequest`.
- `src/utils/pool.ts:L20`: `promisePool()` returned without waiting for the last active batch. Wait for the remaining pool before resolving.
- `src/utils/ajax.ts:L80`: `typeof data !== null` was a constant expression, so object detection was wrong. Use `data !== null && typeof data === 'object'`.
- `src/index.ts:L1`: React/Vue 调用缺少明确子入口。新增 `./vue` 和 `./react` exports；主入口保留 Vue hooks 以兼容旧用法。
- `tsconfig.json:L1`: typecheck scanned `playground/vue` without Vue SFC declarations and failed before library code was checked. Limit the root typecheck to library/test/config files.
- `test/index.test.ts:L1`: previous test suite only asserted `1 === 1`. Add upload, download, merge, error, pre-verify, and pool behavior coverage.
- `src/upload.ts:L306` / `src/download.ts:L232`: active pause/cancel could abort XHR but still let the rejected request path mark the chunk as `error`. Return early while stopped so the public status stays `pause` or `cancel`.
- `playground/vue/src/components/ChunkBox.vue:L2`: Vue SFC type checking caught stale `UploadStatus` / `DownloadStatus` imports. Use the exported `SliceUploadStatus` and `SliceDownloadStatus` names.
- `.github/workflows/ci.yml:L20`: CI still targeted Node 16/18/18.x and used the removed `ni` flow. Pin CI and release workflows to Node 22 with direct `pnpm` commands.

## Changes

- Rebound upload chunk requests with `chunkIndex` while keeping `chunkHash` compatibility.
- Added stop-state guards for upload hash/pre-verify, delayed ajax requests, and retry timers.
- Reset download state when file options change and fixed final Range end-byte calculation.
- Preserved `Headers` instances when adding download Range headers.
- Removed duplicate XHR/outer error emissions while retaining the original request error.
- Added regression tests for duplicate real chunk hashes, delayed pause/cancel, retry cancel, download file option changes, final Range headers, and custom `Headers`.
- Replaced legacy build/lint scripts with `tsdown`, `oxlint`, `oxfmt`, and Vitest.
- Added `tsdown.config.ts`, `.oxlintrc.json`, and `.oxfmtrc.json`.
- Added `slice-upload-utils/vue` and `slice-upload-utils/react` exports while keeping existing Vue hook exports on the main entry.
- Added React hooks matching the Vue hook surface.
- Refactored Vue hooks to avoid declaration-order hazards and destroy instances on unmount.
- Refactored request option typing into `src/request.ts`.
- Removed circular imports through `src/index.ts` inside core modules.
- Expanded tests into focused suites for core upload/download behavior, XHR handling, concurrent chunk-bound requests, package entrypoints, and React/Vue hooks.
- Added Vue SFC type checking through `pnpm typecheck:vue` and `playground/vue`'s `vue-tsc --noEmit` script.
- Updated GitHub Actions to Node 22, `pnpm/action-setup@v4`, `actions/setup-node@v4`, and single-threaded Vitest runs for CI stability.

## Verification

- `pnpm typecheck`
- `pnpm lint`
- `pnpm exec oxfmt --check .github test src package.json playground/vue/package.json playground/vue/src tsconfig.json tsdown.config.ts .oxlintrc.json .oxfmtrc.json .vscode/settings.json CODE_REVIEW.md README.md`
- `pnpm test -- --run`
- `pnpm build`
