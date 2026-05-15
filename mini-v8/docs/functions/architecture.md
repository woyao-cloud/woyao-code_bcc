# mini-v8 功能架构分析

## 概述

mini-v8 是一个基于 AI 的命令行智能助手，提供代码理解、工具调用、会话管理等核心能力。本文档从功能角度系统分析其架构设计和实现机制。

---

## 一、核心架构

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLI 入口层                                   │
│  src/entrypoints/cli.ts                                            │
│  - 命令行交互入口                                                   │
│  - 主循环控制                                                       │
│  - 用户输入处理                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        核心服务层                                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                  │
│  │   API 服务   │ │  权限系统    │ │  会话记忆   │                  │
│  │  (claude.ts) │ │(permission) │ │(sessionMem)│                  │
│  └─────────────┘ └─────────────┘ └─────────────┘                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                  │
│  │   工具系统   │ │   代理系统   │ │  插件系统   │                  │
│  │  (Tool.ts)  │ │ (agentRun)  │ │ (plugins)   │                  │
│  └─────────────┘ └─────────────┘ └─────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        模型抽象层                                   │
│  src/utils/model/                                                  │
│  - model.ts          (模型定义与配置)                               │
│  - providers.ts      (API 提供者选择)                               │
│  - modelStrings.ts   (模型别名映射)                                 │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        外部 API                                     │
│  - Anthropic Claude API                                            │
│  - OpenAI 兼容 API (DeepSeek, Qwen, etc.)                          │
│  - MCP (Model Context Protocol)                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心组件关系

| 组件 | 职责 | 关键文件 |
|------|------|----------|
| CLI 入口 | 用户交互、主循环 | `src/entrypoints/cli.ts` |
| 工具系统 | 工具注册、执行、管理 | `src/Tool.ts`, `src/tools/` |
| API 服务 | AI 模型调用、流式响应 | `src/services/api/claude.ts` |
| 权限系统 | 安全审批、权限控制 | `src/services/permission/permissionManager.ts` |
| 会话记忆 | 上下文保存、摘要提取 | `src/services/memory/sessionMemory.ts` |
| 代理系统 | 子代理执行、任务分发 | `src/agents/agentRunner.ts` |
| 插件系统 | 扩展能力、技能加载 | `src/plugins/` |

---

## 二、工具系统 (Tool System)

### 2.1 工具架构

工具系统是 mini-v8 的核心能力之一，允许 AI 模型通过调用工具与外部世界交互。

```typescript
// 核心工具接口定义 (src/Tool.ts)
export interface Tool {
  name: string                    // 工具唯一标识
  description: string             // 模型可读描述
  inputSchema: ToolInputSchema    // 输入 JSON Schema 校验
  prompt: string                  // 使用提示
  execute(context, input): Promise<ToolResult>  // 执行函数
  canUse?(context, input): Promise<PermissionResult>  // 权限检查
  requiresConfirmation?: boolean  // 是否需要用户确认
  category?: ToolCategory         // 工具分类
}
```

### 2.2 内置工具列表

| 工具名称 | 分类 | 功能描述 | 权限要求 |
|----------|------|----------|----------|
| BashTool | 系统 | 执行 shell 命令 | 需要确认 |
| FileReadTool | 文件 | 读取文件内容 | 安全 |
| FileWriteTool | 文件 | 写入文件内容 | 需要确认 |
| FileEditTool | 文件 | 编辑文件内容 | 需要确认 |
| ApplyPatchTool | 文件 | 应用代码补丁 | 需要确认 |
| GrepTool | 搜索 | 文本搜索 | 安全 |
| GlobTool | 搜索 | 文件匹配 | 安全 |
| WebFetchTool | 网络 | 获取网页内容 | 需要确认 |
| WebSearchTool | 网络 | 网络搜索 | 安全 |
| TaskCreateTool | 任务 | 创建任务 | 安全 |
| TaskUpdateTool | 任务 | 更新任务 | 安全 |
| TaskListTool | 任务 | 列出任务 | 安全 |
| SkillTool | 技能 | 执行技能 | 安全 |
| AgentTool | 代理 | 调用子代理 | 安全 |
| TeamCreateTool | 团队 | 创建团队 | 安全 |
| TeamDeleteTool | 团队 | 删除团队 | 需要确认 |

### 2.3 工具注册机制

```typescript
// 全局工具注册表
let globalRegistry: ToolRegistry = new Map()

export function registerTool(tool: Tool, enabled: boolean = true): void {
  globalRegistry.set(tool.name, {
    tool,
    enabled,
    registrationTime: Date.now(),
  })
  // 同时注册别名
  if (tool.aliases) {
    for (const alias of tool.aliases) {
      globalRegistry.set(alias, { tool, enabled, registrationTime: Date.now() })
    }
  }
}
```

### 2.4 工具执行流程

```
用户请求 → 模型生成 tool_use → 权限检查 → 工具执行 → 返回结果 → 模型总结
            ↓                                  ↓
       requestPermission()              tool.execute()
            ↓                                  ↓
        用户确认？                         ToolResult
```

---

## 三、权限系统 (Permission System)

### 3.1 权限模式

```typescript
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions'
```

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| `default` | 危险操作需要用户确认 | 正常交互 |
| `acceptEdits` | 自动允许写操作，其他危险操作仍需确认 | 批量编辑 |
| `bypassPermissions` | 跳过所有权限检查 | 自动化测试 |

### 3.2 危险工具列表

```typescript
const dangerousTools = ['Bash', 'Write', 'Edit', 'ApplyPatch', 'WebFetch']
```

### 3.3 权限检查流程

```typescript
export async function requestPermission(req: PermissionRequest): Promise<boolean> {
  // 1. 检查权限模式
  if (!needsPermission(req.toolName)) return true
  
  // 2. acceptEdits 模式特殊处理
  if (permissionMode === 'acceptEdits') {
    if (['Write', 'Edit', 'ApplyPatch'].includes(req.toolName)) return true
  }
  
  // 3. 会话缓存检查
  const cacheKey = req.toolName + ':' + JSON.stringify(req.input).slice(0, 200)
  if (sessionApprovals.has(cacheKey)) {
    return sessionApprovals.get(cacheKey)!
  }
  
  // 4. 交互式询问用户
  const answer = await askUser('  Allow? (y/n/always): ')
  if (answer === 'always' || answer === 'yes') {
    sessionApprovals.set(cacheKey, true)
    return true
  }
  return false
}
```

---

## 四、会话记忆系统 (Session Memory)

### 4.1 核心功能

会话记忆系统自动从对话中提取关键信息，保存为结构化笔记，用于：
- 长期上下文保留
- 对话摘要生成
- 跨会话知识复用

### 4.2 数据结构

```typescript
export interface SessionMemoryNote {
  id: string          // 唯一标识
  category: string    // 分类（如：需求、代码、问题、解决方案）
  content: string     // 笔记内容
  timestamp: string   // 创建时间
}

export interface SessionMemoryConfig {
  enabled: boolean           // 是否启用
  minTokensForInit: number   // 初始化所需最小 token 数
  minTokensBetweenUpdate: number // 更新间隔最小 token 数
  maxNotes: number           // 最大笔记数
}
```

### 4.3 工作流程

```
用户消息 → 检查 token 阈值 → 提取笔记 → 保存到文件 → 注入提示词
              ↓                        ↓
        minTokensForInit          sessionId.md
        minTokensBetweenUpdate
```

### 4.4 笔记提取机制

系统会自动从对话中提取以下类型的关键信息：
- 用户需求和目标
- 代码实现细节
- 问题描述和解决方案
- 技术决策和权衡

---

## 五、代理系统 (Agent System)

### 5.1 代理架构

代理系统允许创建子代理来处理特定任务，实现任务分解和并行执行。

```typescript
export interface AgentRunOptions {
  agent: AgentDefinition | string  // 代理定义或类型
  task: string                     // 任务描述
  parentMessages?: BetaMessageParam[]  // 父级消息上下文
  maxTurns?: number               // 最大轮数限制
  model?: string                  // 模型覆盖
  onMessage?: (text: string) => void  // 消息回调
  canUseTool?: (toolName: string, input: Record<string, unknown>) => Promise<boolean>
}
```

### 5.2 代理执行特性

| 特性 | 说明 |
|------|------|
| 消息隔离 | 子代理有独立的消息列表，从父上下文 fork |
| 工具过滤 | 根据代理定义过滤可用工具 |
| 轮数限制 | 防止无限循环 |
| 结果聚合 | 自动收集和总结代理执行结果 |

### 5.3 代理上下文跟踪

```typescript
const activeAgents = new Map<string, AgentRunContext>()

export function getCurrentAgentContext(): AgentRunContext | undefined {
  const values = Array.from(activeAgents.values())
  return values[values.length - 1]  // 返回最内层代理
}
```

---

## 六、插件与技能系统 (Plugin & Skill System)

### 6.1 插件架构

```typescript
// src/plugins/types.ts
export interface PluginManifest {
  name: string
  version: string
  description: string
  author: string
  skills?: string[]
  dependencies?: string[]
}
```

### 6.2 技能加载机制

```typescript
// src/services/skill/skillLoader.ts
export function discoverSkills(): Skill[] {
  // 1. 扫描内置技能目录
  // 2. 扫描插件技能目录
  // 3. 加载技能元数据
  // 4. 返回技能列表
}

export function formatSkillsForPrompt(skills: Skill[]): string {
  // 将技能列表格式化为模型可读的提示词格式
}
```

### 6.3 技能调用流程

```
用户请求 → 模型选择技能 → SkillTool 执行 → 技能结果 → 模型总结
```

---

## 七、API 服务层

### 7.1 双 API 支持

mini-v8 同时支持 Anthropic 和 OpenAI 兼容的 API：

```typescript
// src/services/api/claude.ts
export async function* streamClaudeAPI(params: QueryParams): AsyncGenerator<BetaRawMessageStreamEvent> {
  if (isOpenAIProvider()) {
    // OpenAI 兼容路径
    const openAIStream = streamOpenAIAPI({...})
    yield* openAIToAnthropicStream(openAIStream)
  } else {
    // Anthropic 原生路径
    const stream = await client.beta.messages.create({..., stream: true})
    for await (const event of stream) {
      yield event
    }
  }
}
```

### 7.2 提供者选择策略

```typescript
// src/utils/model/providers.ts
export function getAPIProvider(): APIProvider {
  // 优先级:
  // 1. ANTHROPIC_BASE_URL + Anthropic auth → firstParty
  // 2. CLAUDE_CODE_USE_OPENAI=1 → openai
  // 3. OPENAI_API_KEY 且无 ANTHROPIC_API_KEY → openai
  // 4. 默认 → firstParty
}
```

### 7.3 模型映射

```typescript
// src/services/api/openai/modelMap.ts
export const OPENAI_MODEL_MAP: Record<string, string> = {
  'claude-sonnet-4-20250514': 'gpt-4o',
  'claude-opus-4-20250514': 'gpt-4o',
  'qwen-max': 'qwen-max',
  'qwen-plus': 'qwen-plus',
  // ... 其他映射
}
```

---

## 八、模型管理

### 8.1 模型配置

```typescript
// src/utils/model/model.ts
export const MODELS: Record<string, { maxTokens: number; displayName: string }> = {
  'claude-sonnet-4-20250514': { maxTokens: 128000, displayName: 'Claude Sonnet 4' },
  'claude-opus-4-20250514': { maxTokens: 200000, displayName: 'Claude Opus 4' },
  'qwen-max': { maxTokens: 32000, displayName: 'Qwen Max' },
  'deepseek-v4-flash:cloud': { maxTokens: 128000, displayName: 'DeepSeek V4 Flash' },
  // ...
}
```

### 8.2 模型别名

```typescript
// src/utils/model/modelStrings.ts
export const MODEL_ALIASES: Record<string, string> = {
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
  haiku: 'claude-3-5-haiku-20241022',
  qwen: 'qwen-max',
  // ...
}
```

---

## 九、核心工作流程

### 9.1 主循环流程

```
┌────────────────────────────────────────────────────────────────┐
│                        主循环开始                              │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  读取用户输入                                                  │
│  (createInterface + readline)                                 │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  检查命令前缀 (/help, /model, /plugin, etc.)                  │
│  如果是命令，直接执行对应的命令处理器                            │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (非命令)
┌────────────────────────────────────────────────────────────────┐
│  调用 streamClaudeAPI()                                       │
│  - 构建系统提示词                                              │
│  - 准备消息历史                                                │
│  - 注册工具列表                                                │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  处理流式响应                                                  │
│  - 文本内容：直接输出                                          │
│  - tool_use：调用工具执行                                      │
│    → 权限检查                                                  │
│    → 工具执行                                                  │
│    → 返回结果到模型                                            │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  检查 turn limit                                               │
│  如果达到限制，提示用户                                         │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                        循环结束                                │
└────────────────────────────────────────────────────────────────┘
```

### 9.2 工具调用详细流程

```
模型生成 tool_use → 解析工具名称和参数 → canUse 检查 → requestPermission
                                                      │
                              ┌───────────────────────┴───────────────────────┐
                              ▼ (允许)                                        ▼ (拒绝)
                    tool.execute()                                    返回错误结果
                              │
                              ▼
                    处理 ToolResult
                              │
            ┌─────────────────┴─────────────────┐
            ▼ (成功)                             ▼ (失败)
      返回成功内容                          返回错误信息
            │                                     │
            └─────────────────┬─────────────────┘
                              ▼
                    结果注入消息历史
                              │
                              ▼
                    继续对话循环
```

---

## 十、配置与环境变量

### 10.1 API 相关

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 | - |
| `OPENAI_API_KEY` | OpenAI 兼容 API 密钥 | - |
| `OPENAI_BASE_URL` | OpenAI 兼容 API 地址 | `http://localhost:11434/v1` |
| `OPENAI_MODEL` | 默认 OpenAI 模型 | `deepseek-v4-flash:cloud` |
| `CLAUDE_CODE_USE_OPENAI` | 强制使用 OpenAI 兼容模式 | - |
| `ANTHROPIC_BASE_URL` | 自定义 Anthropic 端点 | - |

### 10.2 行为相关

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `ANTHROPIC_MODEL` | 默认模型 | `claude-sonnet-4-20250514` |
| `MAX_TURNS` | 最大对话轮数 | `50` |

---

## 十一、目录结构总结

```
src/
├── __tests__/           # 测试文件
├── agents/              # 代理系统
│   ├── agentRegistry.ts # 代理注册表
│   ├── agentRunner.ts   # 代理执行器
│   └── agentTypes.ts    # 类型定义
├── bootstrap/           # 启动引导
├── commands/            # 命令处理器
├── constants/           # 常量定义
├── entrypoints/         # 入口文件
│   └── cli.ts           # 主 CLI 入口
├── plugins/             # 插件系统
├── services/            # 核心服务
│   ├── api/             # API 调用服务
│   ├── config/          # 配置管理
│   ├── context/         # 上下文管理
│   ├── memory/          # 记忆系统
│   ├── mcp/             # MCP 协议
│   ├── permission/      # 权限系统
│   └── skill/           # 技能系统
├── tools/               # 工具定义
│   └── builtin/         # 内置工具
├── types/               # 类型定义
├── utils/               # 工具函数
│   ├── model/           # 模型管理
│   └── settings/        # 设置管理
├── Tool.ts              # 工具核心接口
└── context.ts           # 上下文模块
```

---

## 十二、扩展能力

### 12.1 添加新工具

1. 在 `src/tools/builtin/` 目录创建新目录
2. 实现 `Tool` 接口
3. 在 `src/tools/tools.ts` 中注册

### 12.2 添加新模型

1. 在 `src/utils/model/model.ts` 添加模型定义
2. 在 `src/utils/model/modelStrings.ts` 添加别名
3. 在 `src/services/api/openai/modelMap.ts` 添加映射

### 12.3 添加新插件

1. 创建插件目录
2. 编写 `plugin.json` 清单
3. 实现技能文件
4. 使用 `/plugin install` 命令安装

---

## 十三、安全性设计

| 安全机制 | 实现方式 |
|----------|----------|
| 权限审批 | 危险操作需要用户确认 |
| 会话缓存 | 同一会话中相同操作自动通过 |
| 路径限制 | 文件操作限制在工作目录内 |
| 环境隔离 | 代理有独立的上下文空间 |
| 输入校验 | JSON Schema 验证工具输入 |

---

**文档版本**: v1.0  
**生成时间**: 2026-05-15  
**项目版本**: mini-v8.0.0