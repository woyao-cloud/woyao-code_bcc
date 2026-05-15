# 代理系统详解

## 概述

代理系统是 mini-v8 的任务分解和协作模块，允许创建子代理来处理特定任务，实现任务并行执行和专业化分工。

---

## 一、核心架构

### 1.1 架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                        代理系统                                  │
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ 代理注册表   │    │ 代理执行器   │    │ 团队管理器   │      │
│  │ (Registry)   │    │  (Runner)    │    │ (TeamManager)│      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                    │                    │             │
│         ▼                    ▼                    ▼             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ 内置代理     │    │ 上下文隔离   │    │ 代理协作     │      │
│  │ (Built-in)   │    │  (Isolation) │    │ (Collab)     │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 核心组件

| 组件 | 职责 | 文件 |
|------|------|------|
| 代理注册表 | 管理代理定义 | `agentRegistry.ts` |
| 代理执行器 | 执行子代理任务 | `agentRunner.ts` |
| 团队管理器 | 管理代理团队 | `teamManager.ts` |
| 内置代理 | 预定义的专业代理 | `builtInAgents.ts` |

---

## 二、代理类型定义

### 2.1 代理定义

```typescript
export interface AgentDefinition {
  id: string                  // 代理唯一标识
  name: string                // 显示名称
  description: string         // 描述
  systemPrompt: string        // 系统提示词
  toolList?: string[]         // 可用工具列表（可选，默认所有）
  maxTurns?: number           // 最大轮数
  model?: string              // 模型选择
}
```

### 2.2 代理实例

```typescript
export interface AgentInstance {
  id: string                  // 实例 ID
  definition: AgentDefinition // 代理定义
  context: AgentRunContext    // 运行上下文
  status: AgentStatus         // 当前状态
}
```

### 2.3 代理状态

```typescript
export type AgentStatus = 'idle' | 'running' | 'completed' | 'error'
```

### 2.4 代理结果

```typescript
export interface AgentResult {
  success: boolean            // 是否成功
  content: string             // 结果内容
  turnCount: number           // 消耗轮数
  error?: string              // 错误信息
}
```

### 2.5 运行上下文

```typescript
export interface AgentRunContext {
  agentId: string             // 代理 ID
  task: string                // 任务描述
  messages: BetaMessageParam[] // 消息历史
  turnCount: number           // 当前轮数
  maxTurns: number            // 最大轮数
}
```

---

## 三、代理注册表

### 3.1 注册机制

```typescript
// 全局代理注册表
const agents = new Map<string, AgentDefinition>()

export function registerAgent(definition: AgentDefinition): void {
  agents.set(definition.id, definition)
}

export function getAgent(id: string): AgentDefinition | undefined {
  return agents.get(id)
}

export function getAllAgents(): AgentDefinition[] {
  return Array.from(agents.values())
}
```

### 3.2 内置代理

```typescript
// 代码助手代理
export const CodeAssistantAgent: AgentDefinition = {
  id: 'code-assistant',
  name: 'Code Assistant',
  description: '帮助编写和调试代码',
  systemPrompt: '你是一个专业的代码助手...',
  toolList: ['ReadFile', 'WriteFile', 'EditFile', 'Bash', 'Grep'],
}

// 问题解决代理
export const ProblemSolverAgent: AgentDefinition = {
  id: 'problem-solver',
  name: 'Problem Solver',
  description: '帮助分析和解决技术问题',
  systemPrompt: '你是一个问题解决专家...',
}

// 文档编写代理
export const DocWriterAgent: AgentDefinition = {
  id: 'doc-writer',
  name: 'Documentation Writer',
  description: '帮助编写技术文档',
  systemPrompt: '你是一个技术文档专家...',
}
```

---

## 四、代理执行器

### 4.1 执行选项

```typescript
export interface AgentRunOptions {
  agent: AgentDefinition | string  // 代理定义或类型字符串
  task: string                     // 任务描述
  parentMessages?: BetaMessageParam[]  // 父消息上下文
  parentToolResultReplacements?: ReadonlyMap<string, string>
  maxTurns?: number               // 最大轮数
  model?: string                  // 模型覆盖
  onMessage?: (text: string) => void  // 消息回调
  canUseTool?: (toolName: string, input: Record<string, unknown>) => Promise<boolean>
}
```

### 4.2 执行流程

```typescript
export async function runAgent(options: AgentRunOptions): Promise<AgentResult> {
  // 1. 解析代理定义
  const agentDef = typeof agentOrType === 'string' ? getAgent(agentOrType) : agentOrType
  
  // 2. 设置上下文
  const context: AgentRunContext = {
    agentId: agentDef.id,
    task: task,
    messages: [...parentMessages],
    turnCount: 0,
    maxTurns: maxTurnsOverride ?? agentDef.maxTurns ?? DEFAULT_MAX_TURNS,
  }
  
  // 3. 注册活动代理
  activeAgents.set(context.agentId, context)
  
  try {
    // 4. 执行代理循环
    while (context.turnCount < context.maxTurns) {
      // 调用 API
      // 处理工具调用
      // 更新状态
    }
    
    // 5. 返回结果
    return { success: true, content: result, turnCount: context.turnCount }
  } finally {
    // 6. 清理上下文
    activeAgents.delete(context.agentId)
  }
}
```

### 4.3 上下文隔离

```typescript
// 活动代理跟踪
const activeAgents = new Map<string, AgentRunContext>()

export function getCurrentAgentContext(): AgentRunContext | undefined {
  const values = Array.from(activeAgents.values())
  return values[values.length - 1]  // 返回最内层代理
}

export function getAgentContext(agentId: string): AgentRunContext | undefined {
  return activeAgents.get(agentId)
}
```

---

## 五、团队管理器

### 5.1 团队定义

```typescript
export interface TeamDefinition {
  id: string                  // 团队 ID
  name: string                // 团队名称
  agents: string[]            // 代理 ID 列表
  description?: string        // 描述
}
```

### 5.2 团队操作

```typescript
// 创建团队
export function createTeam(definition: TeamDefinition): string

// 删除团队
export function deleteTeam(teamId: string): boolean

// 获取团队
export function getTeam(teamId: string): TeamDefinition | undefined

// 列出所有团队
export function listTeams(): TeamDefinition[]

// 运行团队协作任务
export async function runTeam(teamId: string, task: string): Promise<AgentResult>
```

### 5.3 团队协作模式

| 模式 | 说明 |
|------|------|
| **串行** | 代理依次执行 |
| **并行** | 代理同时执行 |
| **协作** | 代理相互沟通协作 |

---

## 六、内置代理详解

### 6.1 Code Assistant

```typescript
{
  id: 'code-assistant',
  name: 'Code Assistant',
  description: '专业代码助手，帮助编写、调试和优化代码',
  systemPrompt: `你是一个专业的代码助手。
  擅长：
  - 编写高质量代码
  - 调试和修复 bug
  - 代码审查和优化
  - 技术文档编写
  
  可用工具：ReadFile, WriteFile, EditFile, Bash, Grep`,
  toolList: ['ReadFile', 'WriteFile', 'EditFile', 'Bash', 'Grep'],
  maxTurns: 30,
}
```

### 6.2 Problem Solver

```typescript
{
  id: 'problem-solver',
  name: 'Problem Solver',
  description: '问题解决专家，帮助分析和解决技术问题',
  systemPrompt: `你是一个问题解决专家。
  擅长：
  - 分析技术问题
  - 提供解决方案
  - 调试和故障排除
  - 性能优化建议`,
  maxTurns: 20,
}
```

### 6.3 Doc Writer

```typescript
{
  id: 'doc-writer',
  name: 'Documentation Writer',
  description: '技术文档专家，帮助编写专业文档',
  systemPrompt: `你是一个技术文档专家。
  擅长：
  - API 文档编写
  - 技术规范文档
  - 用户指南
  - README 文档
  
  可用工具：ReadFile, WriteFile`,
  toolList: ['ReadFile', 'WriteFile'],
  maxTurns: 15,
}
```

### 6.4 DevOps Agent

```typescript
{
  id: 'devops',
  name: 'DevOps Agent',
  description: 'DevOps 专家，帮助部署和运维',
  systemPrompt: `你是一个 DevOps 专家。
  擅长：
  - CI/CD 配置
  - Docker 容器化
  - 云服务部署
  - 监控和日志分析`,
  toolList: ['Bash'],
  maxTurns: 25,
}
```

---

## 七、代理调用流程

### 7.1 完整流程

```
┌─────────────────────────────────────────────────────────────────┐
│                        代理调用流程                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                  ┌──────────────────────┐
                  │  用户请求调用代理    │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │  解析代理类型        │
                  │  getAgent(id)        │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │  创建执行上下文      │
                  │  AgentRunContext     │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │  注册活动代理        │
                  │  activeAgents.set()  │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │  执行代理循环        │
                  │  while (turn < max)  │
                  └──────────┬───────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
        ┌─────────────┐              ┌─────────────┐
        │ 调用 API    │              │ 工具执行    │
        │ streamAPI   │              │ executeTool │
        └─────────────┘              └─────────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │  收集结果并总结      │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │  清理代理上下文      │
                  │  activeAgents.delete │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │  返回 AgentResult    │
                  └──────────────────────┘
```

### 7.2 工具过滤

```typescript
// 根据代理定义过滤工具
function filterToolsForAgent(agentDef: AgentDefinition, allTools: Tool[]): Tool[] {
  if (!agentDef.toolList) return allTools
  
  return allTools.filter(tool => agentDef.toolList!.includes(tool.name))
}
```

---

## 八、API 参考

### 8.1 代理注册表 API

| 函数 | 说明 |
|------|------|
| `initAgentRegistry()` | 初始化代理注册表 |
| `registerAgent()` | 注册代理 |
| `getAgent()` | 获取代理定义 |
| `getAllAgents()` | 获取所有代理 |

### 8.2 代理执行器 API

| 函数 | 说明 |
|------|------|
| `runAgent()` | 运行代理 |
| `getCurrentAgentContext()` | 获取当前代理上下文 |
| `getAgentContext()` | 获取指定代理上下文 |

### 8.3 团队管理器 API

| 函数 | 说明 |
|------|------|
| `createTeam()` | 创建团队 |
| `deleteTeam()` | 删除团队 |
| `getTeam()` | 获取团队 |
| `listTeams()` | 列出团队 |
| `runTeam()` | 运行团队协作 |

---

## 九、扩展能力

### 9.1 添加自定义代理

```typescript
import { AgentDefinition, registerAgent } from './agentRegistry.js'

const MyAgent: AgentDefinition = {
  id: 'my-agent',
  name: 'My Custom Agent',
  description: 'My custom agent description',
  systemPrompt: 'You are a specialized agent...',
  toolList: ['ReadFile', 'WriteFile'],
  maxTurns: 20,
}

registerAgent(MyAgent)
```

### 9.2 创建代理团队

```typescript
createTeam({
  id: 'dev-team',
  name: 'Development Team',
  agents: ['code-assistant', 'doc-writer', 'devops'],
  description: 'A team for software development tasks',
})
```

---

## 十、最佳实践

### 10.1 代理设计原则

| 原则 | 说明 |
|------|------|
| **专业化** | 每个代理专注于一个领域 |
| **工具限制** | 根据需求限制可用工具 |
| **轮数控制** | 设置合理的 maxTurns |
| **提示词优化** | 编写针对性的系统提示词 |

### 10.2 使用场景

| 场景 | 推荐代理 |
|------|----------|
| 代码编写 | code-assistant |
| Bug 修复 | problem-solver |
| 文档编写 | doc-writer |
| 部署运维 | devops |
| 复杂任务 | 团队协作 |

---

**文档版本**: v1.0  
**生成时间**: 2026-05-15