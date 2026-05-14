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