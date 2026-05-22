现在我已经完整地跟踪了整个工具调用流程，发现了几个关键问题。让我查看一下关键的 createConversationBuffers 调用点来确认。

  Read 1 file (ctrl+o to expand)

● 找到 3 个问题，其中 1 个是关键的流程 bug。

  关键 Bug：数据流分裂（Critical）

  位置: query.ts:60 和 query.ts:423/548 之间的数据流不一致

  query() 接收 messages 参数（即 QueryEngine.messages = cli.conversation.fullMessages），但第 60 行创建了一个本地副本：

  // query.ts:60 — 创建本地副本
  const conversation = createConversationBuffers(messages)  // fullMessages: [...messages] 浅拷贝

  后续所有新消息却 push 到了原始数组 messages，而不是本地副本：

  - 第 423 行: messages.push({ role: 'assistant', ... })
  - 第 548 行: messages.push({ role: 'user', content: persistedResults })

  而下一轮 API 调用（第 97 行）使用的是本地副本：
  const { messagesForAPI } = projectMessagesForAPI(conversation, ...)
  // conversation.fullMessages 没有 tool_result，没有 assistant 消息！

  后果: 多轮工具调用的场景中（比如天气查询 → WebSearch → 返回结果 → 需要再用结果调用 LLM），模型无法看到之前工具的返回结果，会反复调用同一个工具，直到达到 max_turns。

  修复方案: 将 messages.push(...) 改为 conversation.fullMessages.push(...)，或者直接推送至本地 conversation 的 fullMessages。

  问题 2：Spinner 在纯工具响应时永不停止（Medium）

  位置: cli.ts:312-321

  gotFirstToken 只在 text_delta 事件中被设为 true。当模型只返回 tool_use（无文本）时，spinner 一直旋转，覆盖 stderr 上的   WebSearch... 等工具状态消息。

  问题 3：tool_start 事件在 streaming 结束后才 yield（Low）

  位置: query.ts:394-401

  tool_start 事件在 streaming 完成之后、工具执行之前才 yield 给调用方，导致 CLI 对事件的处理顺序混乱——看起来 spinner 还没停，工具就已经在跑了。

  ---
  要修复吗？问题 1 是最严重的，直接影响多轮工具调用的正确性。让我直接修。除此之外，messages（原始数组）和 conversation.fullMessages（本地副本）的分裂，还影响 reactiveCompact  后的状态一致性（第 279-295 行只更新了本地副本）。