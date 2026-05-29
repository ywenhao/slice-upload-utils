# Code Review

## Findings

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

## Changes

- Replaced legacy build/lint scripts with `tsdown`, `oxlint`, `oxfmt`, and Vitest.
- Added `tsdown.config.ts`, `.oxlintrc.json`, and `.oxfmtrc.json`.
- Added `slice-upload-utils/vue` and `slice-upload-utils/react` exports while keeping existing Vue hook exports on the main entry.
- Added React hooks matching the Vue hook surface.
- Refactored Vue hooks to avoid declaration-order hazards and destroy instances on unmount.
- Refactored request option typing into `src/request.ts`.
- Removed circular imports through `src/index.ts` inside core modules.

## Verification

- `pnpm typecheck`
- `pnpm lint`
- `pnpm exec oxfmt --check src test package.json tsconfig.json tsdown.config.ts .oxlintrc.json .oxfmtrc.json .vscode/settings.json`
- `pnpm test -- --run`
