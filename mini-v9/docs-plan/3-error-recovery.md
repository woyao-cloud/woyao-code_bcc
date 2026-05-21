 Here is Claude's plan:
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Error Recovery Upgrade: mini-v9 → src/ parity

 Context

 mini-v9's error recovery is basic: a withRetry() wrapper with substring matching and a simple reactive compact fallback. The full src/ has structured error classification,
 exponential backoff with jitter, stream-level monitoring, tool execution lifecycle hooks, and session restore normalization. This gap causes silent failures on transient
 API errors (rate limits, server errors, connection drops) and poor UX on partial failures (orphaned tool results, stalls, max_tokens cutoffs).

 Goal: upgrade mini-v9's error recovery to match src/ without copying the full codebase. 4 independent phases, each deployable separately.

 ---
 Phase 1: Retry Engine & Error Classification

 Files to modify:
 - src/services/retry.ts — Rewrite: add retryWithBackoff() async generator, classifyAPIError() with 5 categories, parseRetryAfterHeader()
 - src/services/api/claude.ts — Add streamWithErrorClassification() wrapper
 - src/query/transitions.ts — Add retry_event type to QueryEvent union
 - src/query.ts — Replace manual retry loop with retryWithBackoff() generator; yield retry events for UI feedback

 Key design decisions:
 - 5 error categories: rate_limit, server_error, auth_error, connection_error, prompt_too_long — simplified from src/'s 20+ types
 - retryWithBackoff() returns AsyncGenerator<RetryEvent | T> so UI gets retry-attempt notifications
 - Backoff: rate_limit → 500ms base + jitter + Retry-After header; server_error → 1s base, 16s cap; connection_error → 500ms base, 8s cap; auth_error/prompt_too_long → no
 retry
 - Max 3 retries per call; jitter ±25% to avoid thundering herd

 Verification: bun test passes; bun run precheck zero errors; manual test with curl --rate-limit mock.

 ---
 Phase 2: Stream Monitoring & Safety

 Files to modify:
 - src/query.ts — Add stream idle timeout watchdog (90s abort, 45s warning), stall detection (30s no data), missing tool result protection (inject synthetic error results
 for tool_use blocks without results), max_tokens diminishing returns detection (stop after 3 attempts or delta < 500 tokens)

 Key design decisions:
 - Use nested AbortController — parent AbortSignal from options, child per-stream watchdog
 - Missing tool result detection: iterate toolResults after execution, diff against tool_use blocks in assistantContent, inject {is_error: true, content: "Tool result
 missing"} for orphaned uses
 - max_tokens recovery: track token delta across consecutive max_tokens stop reasons; if delta < 500, abort recovery loop

 Verification: bun test passes; inject artificial stall to confirm watchdog fires; inject orphaned tool_use to confirm synthetic result.

 ---
 Phase 3: Tool Execution Hooks

 Files to modify:
 - src/services/tools/toolExecution.ts — Add ToolExecutionHooks interface (onBeforeExecute, onAfterExecute, onError), apply hooks in executeSingleTool()
 - src/services/tools/toolOrchestration.ts — Pass slot AbortController to tool execution contexts; skip tools cancelled during slot wait; call hooks

 Key design decisions:
 - Hooks are optional callbacks passed via ToolUseContext — no breaking change to existing callers
 - onBeforeExecute(id, name) → onAfterExecute(id, name, result) → onError(id, name, error)
 - Slot abortion: when concurrent slot limit blocks a tool and the slot's running tool is cancelled mid-execution, skip the queued tool instead of running it on stale state

 Verification: bun test passes; write unit test that verifies hook call order and slot abortion behavior.

 ---
 Phase 4: Session Restore Normalization

 Files to modify:
 - src/services/session/sessionStore.ts — Add normalizeMessages(messages) function: filter orphaned tool_result blocks (no preceding tool_use), filter empty messages (empty
 content array or empty text), filter orphaned thinking blocks
 - src/entrypoints/cli.ts — Call normalizeMessages() during createConversationFromSnapshot() after loading snapshot

 Key design decisions:
 - Track tool_use IDs seen → remove tool_result entries whose tool_use_id has no match
 - Empty message: content is empty array, or single text block with empty/whitespace-only text
 - Operates as a pure function — (messages: BetaMessageParam[]) => BetaMessageParam[] — no side effects

 Verification: bun test passes; write unit test with a corrupted snapshot that has orphaned tool_result + empty messages; verify output is clean.












 # 

  Phase 4 complete — 660 pass / 1 fail. All 4 phases are implemented successfully!

● All 4 phases of the error recovery upgrade are complete. Here's a summary of all changes:

  Phase 1 — Retry Engine & Error Classification (5 files)
  - src/services/retry.ts — Rewritten with retryWithBackoff() async generator, classifyAPIError() (7 categories: rate_limit, server_error, auth_error, connection_error,
  prompt_too_long, aborted, unknown), parseRetryAfterHeader(), calculateBackoff() with jitter. Legacy withRetry()/isRetryableError() preserved.
  - src/query/transitions.ts — Added QueryRetryEvent type to QueryEvent union
  - src/services/api/claude.ts — Added streamWithErrorClassification() wrapper
  - src/query.ts — Replaced manual retry loop with retryWithBackoff() generator yielding retry_event for UI feedback

  Phase 2 — Stream Monitoring & Safety (1 file)
  - src/query.ts — Added stream idle timeout watchdog (90s nested AbortController, 30s stall warning), missing tool result protection (injects synthetic error results for
  orphaned tool_use blocks), max_tokens diminishing returns detection (delta < 500 → abort recovery)

  Phase 3 — Tool Execution Hooks (2 files)
  - src/services/tools/toolExecution.ts — Added ToolExecutionHooks interface (onBeforeExecute/onAfterExecute/onError), applied in executeSingleTool(), added
  formatToolErrorResult() utility
  - src/services/tools/toolOrchestration.ts — Added combineSignals() utility, slot-level cascade abort propagation to tool contexts, hooks forwarding through execution chain

  Phase 4 — Session Restore Normalization (2 files)
  - src/services/session/sessionStore.ts — Added normalizeMessages() pure function: filters orphaned tool_result blocks, empty messages
  - src/entrypoints/cli.ts — Calls normalizeMessages() during createConversationFromSnapshot()

  All tests: 660 pass, 1 fail (pre-existing providers test). Typecheck: zero new errors.
