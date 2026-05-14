 mini-v8 现在的降 token 方案还停留在“固定阈值后直接截断消息数组”，而 src 已经是“分层压缩 + 预算控制 + API 视图投影”的思
  路。对 mini-v8 来说，最值得迁移的不是整套大系统，而是 4 个核心能力：model-aware token budget、tool_result
  microcompact、session-memory compact、API history / full history 分离。

  主要差距

  1. mini-v8 的 compact 过于粗糙，只看固定 100_000 * 0.7，再保留“首条 + 最后 3 轮” /D:/claude-code-project/claude-code-
     best/woyao-code_bcc/mini-v8/src/services/compact/autoCompact.ts:8。src 则是 snip -> microcompact -> autocompact 的
     多层链路 /D:/claude-code-project/claude-code-best/woyao-code_bcc/src/query.ts:569、/D:/claude-code-project/claude-
     code-best/woyao-code_bcc/src/services/compact/microCompact.ts:257。
  2. mini-v8 的 compact 阈值和模型窗口脱节。模型表明明有 8k / 128k / 200k 差异 /D:/claude-code-project/claude-code-best/
     woyao-code_bcc/mini-v8/src/utils/model/model.ts:11，但 compact 仍然写死在 100k /D:/claude-code-project/claude-code-
     best/woyao-code_bcc/mini-v8/src/services/compact/autoCompact.ts:9。
  3. mini-v8 没有清理旧 tool_result。这通常是最大 token 消耗源，尤其是 Read/Grep/Glob/Bash/WebFetch。src 已经把这块做成
     了 microcompact /D:/claude-code-project/claude-code-best/woyao-code_bcc/src/services/compact/microCompact.ts:40。
  4. mini-v8 已经有 session memory 提取 /D:/claude-code-project/claude-code-best/woyao-code_bcc/mini-v8/src/services/
     memory/sessionMemory.ts:99，但没有进入真正的 compact 闭环。src 会优先尝试用 session memory 做 compact，再保留最近尾
     部消息 /D:/claude-code-project/claude-code-best/woyao-code_bcc/src/services/compact/sessionMemoryCompact.ts:516。
  5. mini-v8 每轮都会重建完整系统上下文 /D:/claude-code-project/claude-code-best/woyao-code_bcc/mini-v8/src/
     context.ts:67，并注入最近 20 条 memory /D:/claude-code-project/claude-code-best/woyao-code_bcc/mini-v8/src/
     services/memory/memoryStore.ts:261。src 这部分是 memoized 的 /D:/claude-code-project/claude-code-best/woyao-
     code_bcc/src/context.ts:116。
  6. mini-v8 没有把“UI 全历史”和“发给模型的历史”分开；src 已经明确区分了 full history 和 projected view /D:/claude-code-
     project/claude-code-best/woyao-code_bcc/src/QueryEngine.ts:173。
  7. mini-v8 还有两个先要修的正确性问题，不修会影响后面的压缩设计：
      - /compact 现在的 splice 会把尾部消息重复一遍 /D:/claude-code-project/claude-code-best/woyao-code_bcc/mini-v8/src/
        entrypoints/cli.ts:246、/D:/claude-code-project/claude-code-best/woyao-code_bcc/mini-v8/src/agents/
        agentRunner.ts:160。
      - 最终 assistant 文本在“无 tool_use”时根本没写回 history，后续轮次上下文是不完整的 /D:/claude-code-project/claude-
        code-best/woyao-code_bcc/mini-v8/src/entrypoints/cli.ts:491、/D:/claude-code-project/claude-code-best/woyao-
        code_bcc/mini-v8/src/agents/agentRunner.ts:267。

  建议路线

  1. 先做 P0：修正 history 正确性。修掉 splice 重复尾部消息，补上最终 assistant 文本落盘/入内存；把 token 统计统一成一个
     入口，别再让 autoCompact.ts 和 sessionMemory.ts 各算各的。
  2. 再做 c
  3. 然后做 P2：把 compactMessages() 升级成真正的 compactConversation()。输出应该是“compact boundary + summary + kept
     tail”，而不是直接改数组。保留尾部时要保证 tool_use/tool_result 不被拆开，参考 src 的 session-memory compact 逻辑。
  4. 再做 P3：让 session memory 真正参与 compact。现在 mini-v8 只是写了 .md 文件；应该改成“达到阈值后提炼 session
     memory，compact 时优先用它总结旧历史，只保留最近 10k 到 20k tokens 的尾巴”。
  5. 再做 P4：把 messages 分成两层。fullMessages 用于 REPL 展示、调试、resume；messagesForAPI 每轮按预算投影生成。这个改
     动会让你后面做裁剪、stub、summary 都更稳。
  6. 再做 P5：收紧上下文注入。CLAUDE.md / skills / memories / agents / teams 不要每轮全量拼进去；至少要加 memoization、
     token budget、top-k memory 检索。session memory 和 team memory 也应该按需注入，不是常驻大块 prompt。
  7. contextCollapse 先别迁。当前仓库里的这部分还是 stub /D:/claude-code-project/claude-code-best/woyao-code_bcc/src/
     services/contextCollapse/index.ts:1，现在迁过去收益不如前几项明确。

  我建议的实施顺序
  先做 3 步就够看到明显收益：修 history 正确性、加 microcompact、把 compact 改成“summary + kept tail”。这三步做完，mini-
  v8 的 token 消耗会比现在稳定很多，也更接近 src 的主干设计。

  如果你要我继续，我建议下一步直接在 mini-v8 落 P0 + P1：我可以先给你出一版补丁，把会话裁剪和旧 tool 结果压缩真正做起
  来。


#  P0 + P1

 已继续做完 P0 + P1，改动落在 mini-v8，重点是把会话裁剪从“粗暴截断”升级成“先清理旧 tool result，再按模型窗口做摘要
  compact”。

  核心改动有三块。第一，修了历史正确性问题：CLI 和 agent runner 现在都会把“无 tool_use 的最终 assistant 文本”写回
  messages，不再丢上下文；同时把原来错误的 splice(0, messages.length - 2, ...) 替换成整数组替换，避免 /compact 和自动
  compact 复制尾部消息。/D:/claude-code-project/claude-code-best/woyao-code_bcc/mini-v8/src/entrypoints/cli.ts:98 /D:/
  claude-code-project/claude-code-best/woyao-code_bcc/mini-v8/src/entrypoints/cli.ts:532 /D:/claude-code-project/claude-
  code-best/woyao-code_bcc/mini-v8/src/agents/agentRunner.ts:80 /D:/claude-code-project/claude-code-best/woyao-code_bcc/
  mini-v8/src/agents/agentRunner.ts:290

  第二，重写了 autoCompact.ts 的策略。needsCompaction() 现在支持按模型窗口判断，不再只盯死 100k；compactMessages() 会插
  入一条简短 summary，并在保留尾部时回补必要的 tool_use/tool_result 配对，避免截断后上下文失真；另外新增了
  microcompactToolResults()，会优先把旧的 Read/Grep/Glob/Bash/WebFetch/WebSearch 结果内容替换成短 stub，只保留最近几条完
  整结果，这一层通常能省掉最多 token。/D:/claude-code-project/claude-code-best/woyao-code_bcc/mini-v8/src/services/
  compact/autoCompact.ts:7 /D:/claude-code-project/claude-code-best/woyao-code_bcc/mini-v8/src/services/compact/
  autoCompact.ts:194 /D:/claude-code-project/claude-code-best/woyao-code_bcc/mini-v8/src/services/compact/
  autoCompact.ts:206

  第三，补了针对性测试，覆盖模型感知阈值、summary compact、tool pair 保留和 microcompact 行为，bun test src/__tests__/
  autoCompact.test.ts 已通过 19/19。/D:/claude-code-project/claude-code-best/woyao-code_bcc/mini-v8/src/__tests__/
  autoCompact.test.ts:43 /D:/claude-code-project/claude-code-best/woyao-code_bcc/mini-v8/src/__tests__/
  autoCompact.test.ts:194

  bun run typecheck 仍然失败，但看起来是 mini-v8 里原本就存在的旧问题，不是这次改动新引入的：src/__tests__/
  turnLimit.test.ts 的 toBeCloseTo 类型声明缺失，以及 src/utils/turnLimit.ts 的几处已有严格空值错误。

# P2

   P2 已接上，mini-v8 现在的 full compact 会优先消费 session memory，不再只是把 notes 写到磁盘里却不用。

  具体来说，我把 session memory 补成了一个可被 compact 消费的闭环：updateSessionMemoryFromMessages() 会先从当前消息提炼
  并持久化 notes，同时更新提取基线；getSessionMemorySummaryForCompact() 则返回给 compact 用的摘要文本。/D:/claude-code-
  project/claude-code-best/woyao-code_bcc/mini-v8/src/services/memory/sessionMemory.ts:164 /D:/claude-code-project/
  claude-code-best/woyao-code_bcc/mini-v8/src/services/memory/sessionMemory.ts:207 /D:/claude-code-project/claude-code-
  best/woyao-code_bcc/mini-v8/src/services/memory/sessionMemory.ts:237

  compactMessages() 也升级了：现在支持传 sessionMemorySummary，如果有内容，就会优先生成 "[Earlier conversation
  summarized from session memory]" 这类 summary；没有时才退回原来的 removed-messages 摘要。/D:/claude-code-project/
  claude-code-best/woyao-code_bcc/mini-v8/src/services/compact/autoCompact.ts:206 主线程和 agent runner 都已经改成 full
  compact 前先拉 session memory summary 再 compact。/D:/claude-code-project/claude-code-best/woyao-code_bcc/mini-v8/src/
  entrypoints/cli.ts:121 /D:/claude-code-project/claude-code-best/woyao-code_bcc/mini-v8/src/agents/agentRunner.ts:100

  验证方面，bun test src/__tests__/autoCompact.test.ts src/services/memory/__tests__/sessionMemory.test.ts 已通过，
  30/30。新增测试覆盖了 session memory 刷新、compact 优先使用 session memory summary，以及原有 tool pair / microcompact
  行为没有回退。/D:/claude-code-project/claude-code-best/woyao-code_bcc/mini-v8/src/__tests__/autoCompact.test.ts:154 /
  D:/claude-code-project/claude-code-best/woyao-code_bcc/mini-v8/src/services/memory/__tests__/sessionMemory.test.ts:129

  还有一个事实需要单独说明：mini-v8 全量 bun run typecheck 之前就有未解决错误，仍然卡在 turnLimit 相关测试和实现上，不是
  这次 session-memory compact 改动新引入的。

  下一步最自然的是做 P3 的后半段：把 session memory 注入系统 prompt 的策略也收紧，避免它既参与 compact summary、又在常规
  prompt 里长期重复注入，造成二次 token 浪费。

  #  已完成 P3 后半段。

  在 mini-v8/src/services/memory/sessionMemory.ts:27 和 mini-v8/src/context.ts:324 里加了一套更紧的注入策略：session
  memory 现在支持按 maxNotesPerCategory 和 maxChars 裁剪；auto 模式只会在“fresh/reset”的会话切片里注入，一旦当前消息里已
  经有 session-memory-based compact summary，就停止继续往常规 system prompt 重复注入，避免双重 token 消耗。

  同时把 compact 标记统一到了 mini-v8/src/services/compact/autoCompact.ts:257，并让 mini-v8/src/entrypoints/cli.ts:418
  和 mini-v8/src/agents/agentRunner.ts:219 每轮都把当前 messages 传给 getSystemContext()，这样 full compact 写进去的
  summary 会立刻反向抑制后续 prompt 注入，形成闭环。

  测试已补在 mini-v8/src__tests__/context.test.ts:56 和 mini-v8/src/services/memory__tests__/sessionMemory.test.ts:182。
  验证结果：

  - bun test src/__tests__/context.test.ts src/services/memory/__tests__/sessionMemory.test.ts src/__tests__/
    autoCompact.test.ts 通过，38/38
  - bun run typecheck 仍失败，但只剩仓库原有的 src/__tests__/turnLimit.test.ts 和 src/utils/turnLimit.ts 报错，没有新增
    本次改动相关类型错误

    # P4

    P4已落地。核心改动是把会话拆成了“原始全量历史”和“每轮 API 投影”两层。

  新增的 mini-v8/src/services/messages/apiProjection.ts:29 提供了 ConversationBuffers、一次性 forceCompactNextProjection
  标志，以及 projectMessagesForAPI()。它会从 fullMessages 现算 messagesForAPI，在投影层做 microcompact/full compact，但
  不再改写原始历史。

  CLI 现在改成围绕 conversation.fullMessages 运作，在 mini-v8/src/entrypoints/cli.ts:195 初始化，在 mini-v8/src/
  entrypoints/cli.ts:248 把 /compact 改成“强制下一轮 API 投影 compact 一次”，并在 mini-v8/src/entrypoints/cli.ts:395 每
  轮先生成 messagesForAPI，再用于 getSystemContext() 和 streamClaudeAPI()。这样 REPL 展示、调试、手动 /memory extract、
  未来 resume 都保留 full history，而 API 侧仍能稳态裁剪。agent runner 也同步切到了同一模型，见 mini-v8/src/agents/
  agentRunner.ts:139 和 mini-v8/src/agents/agentRunner.ts:157。

  测试补在 mini-v8/src/services/messages__tests__/apiProjection.test.ts:13，覆盖了一次性强制 compact 标志、full history
  不被 compact 破坏、以及 microcompact 只作用于 API 投影。验证结果：

  - bun test src/services/messages/__tests__/apiProjection.test.ts src/__tests__/context.test.ts src/services/memory/
    __tests__/sessionMemory.test.ts src/__tests__/autoCompact.test.ts 通过，42/42
  - bun run typecheck 通过

  下一步做 P5 时，就可以直接在 projectMessagesForAPI() 上继续叠加更细的 stub/summary/token budget 策略，不会再伤到 full
  history。