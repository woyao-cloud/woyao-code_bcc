# 优先级路线图

## 当前已实现 (文档化在 docs/gaps/ 中)

```
gaps/
├── 06-catchup-plan.md     ✅ 全部 5 Phase 完成
├── 07-query-engine-plan.md ✅ 全部 5 Phase 完成
└── 08-tool-system-plan.md  ✅ 全部 5 Phase 完成
```

## 推荐优先级 (P0-P5)

### P0 (核心差距 — 高用户价值, 低实现成本)

| 项目 | 估时 | 文件数 | 说明 |
|------|------|--------|------|
| query.ts + QueryEngine.ts 测试 | 2h | 2 | 核心循环零测试风险高 |
| agentMemory 测试 | 1h | 1 | 已有实现无测试 |
| Gemini 兼容层 | 3h | ~5 | 覆盖更多用户 (参考已有 OpenAI 模式) |
| Git 工具增强 (diff/log/blame) | 2h | ~3 | 日常高频使用 |
| 工具 isEnabled() 检查 | 1h | ~2 | 允许动态禁用工具 |

### P1 (重要 — 提升功能完整性)

| 项目 | 估时 | 文件数 | 说明 |
|------|------|--------|------|
| 命令自动注册系统 | 3h | ~5 | 从 commands/ 自动发现 handler |
| /mcp 命令 | 2h | ~3 | MCP 服务器管理 |
| /doctor 命令 | 2h | ~2 | 诊断健康状态 |
| /permissions 命令 | 2h | ~2 | 权限规则管理 UI |
| 编排引擎测试 | 1h | 2 | toolOrchestration + toolExecution |
| 通知系统测试 | 1h | 1 | notificationQueue |
| 集成测试 (CLI) | 3h | ~2 | 端到端对话链 |

### P2 (有价值 — 扩展功能)

| 项目 | 估时 | 说明 |
|------|------|------|
| 读取工具并发增强 | 2h | WebFetch/WebSearch 等加入并发池 |
| permissionsLoader 测试 | 1h | 规则加载/持久化 |
| Bash 错误级联 | 1h | 编排引擎增强 |
| 新增 ~5 个工具 | 5h | WebBrowser, LSP, Cron 等 |
| 打包插件支持 | 2h | plugins/bundled/ |
| MCP skill 构建器 | 3h | skills/mcpSkillBuilders |

### P3 (低优先级)

| 项目 | 说明 |
|------|------|
| SearchExtraTools + ExecuteTool | MCP 延迟加载 |
| 更多 API 提供商 | Bedrock, Vertex, Foundry |
| 流式工具执行 | StreamingToolExecutor |
| PostToolUse hooks | 编排引擎增强 |
| memdir 系统 | 增强记忆 |

### P4-P5 (远期)

| 项目 | 说明 |
|------|------|
| Bridge / Remote Control | 大功能特性 |
| Daemon 模式 | feature-gated |
| SSH/Server | 独立子系统 |
| Ink/React UI | 复杂性高 |
| Vim 模式 | niche |
| 语音模式 | 依赖硬件 |

## 评估方法

优先级公式：`价值 / 成本`

- **价值** = 用户影响 × 使用频率 × 完整性提升
- **成本** = 实现时间 × 依赖复杂度 × 维护负担
