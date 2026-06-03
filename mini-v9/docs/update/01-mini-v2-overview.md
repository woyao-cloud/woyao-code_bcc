# mini-v2 版本分析

## 基本信息

- **版本**: 2.0.0
- **描述**: Minimal Claude Code CLI v2 - Anthropic + OpenAI compat, 8 core tools
- **文件数**: 73
- **测试文件**: 14

## 架构概况

mini-v2 是整个系列的**基础起点版本**，从更复杂的 mini-v1 精简而来，保留了最核心的 CLI 骨架：

```
src/
├── bootstrap/state.ts        # 模块级状态（sessionId, CWD 等）
├── constants/                # 常量定义（betas, common, product, prompts）
├── entrypoints/cli.ts        # CLI 入口
├── services/api/             # API 层
│   ├── claude.ts             # Anthropic Claude API 客户端
│   └── openai/               # OpenAI 兼容层（client, modelMap, streamAdapter）
├── tools/
│   ├── tools.ts              # 工具注册中心
│   └── builtin/              # 8 个内置工具
├── types/                    # 类型定义
├── utils/                    # 工具函数
├── context.ts                # Context 构建
└── Tool.ts                   # Tool 接口定义
```

## 核心功能

1. **8 个内置工具**: BashTool, FileEditTool, FileReadTool, FileWriteTool, GlobTool, GrepTool, WebFetchTool, WebSearchTool
2. **Anthropic Claude API 客户端** — 流式调用
3. **OpenAI 兼容层** — 支持 OpenAI Chat Completions 协议（含流适配器 + 模型映射）
4. **CLI 入口** — 仅基本参数解析（--version, --help, pipe mode）
5. **Context 构建** — 系统提示词组装（含 git 状态、CLAUDE.md 内容、日期）

## 工程基础

- 已具备完整的工程骨架：类型定义（global.d.ts, message.ts, permissions.ts, ids.ts, internal-modules.d.ts）
- 工具函数完整：log/debug/errors/crypto/auth/shell/signal/tokens/git/config 等
- 测试体系：14 个测试文件覆盖工具函数和集成测试
- 构建：Bun.build 输出到 dist/

## 缺失（与 v1 相比已移除）

- 无 Agent 系统
- 无 Plugin/Skill 系统
- 无命令系统（commands/）
- 无 Memory 系统
- 无 MCP 支持
- 无 Plan Mode
- 无权限管理器
- 无 UI 渲染层