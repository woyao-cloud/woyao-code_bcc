全部 P0 + P1 完成。558 全通过，0 失败。
最终状态
| 优先级 | 项目 | 状态 |
|--------|------|------|
| P0 | query + QueryEngine 测试 | ✅ |
| P0 | agentMemory + snapshot 测试 | ✅ |
| P0 | Gemini 兼容层 | ✅ |
| P1 | 命令自动注册系统 | ✅ |
| P1 | /mcp 命令 | ✅ |
| P1 | /doctor 命令 | ✅ |
| P1 | /permissions 命令 | ✅ |
| P1 | 编排引擎测试 | ✅ |
| P1 | 通知系统测试 | ✅ |
| P1 | 集成测试 (CLI) | ✅ |
测试总数: 558 tests / 1341 expect / 45 files / 6.44s
命令系统: 15 个注册命令 (/help, /exit, /clear, /model, /compact, /plugin, /skill, /memory, /session-memory, /memory-stores, /sync-memory, /agent, /team, /swarm, /mcp, /doctor, /permissions)
API providers: 3 (Anthropic firstParty, OpenAI-compatible, Gemini)

