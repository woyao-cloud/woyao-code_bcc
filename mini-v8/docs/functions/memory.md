# 会话记忆系统详解

## 概述

会话记忆系统是 mini-v8 的智能上下文管理模块，自动从对话中提取关键信息并保存为结构化笔记，实现长期上下文保留和智能摘要。

---

## 一、核心架构

### 1.1 架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                    会话记忆系统                                  │
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ 笔记提取器   │───→│ 笔记存储     │───→│ 提示词注入   │      │
│  │ (Extractor)  │    │  (Storage)   │    │  (Injector)  │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                    │                    │             │
│         ▼                    ▼                    ▼             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ token 阈值   │    │  sessionId   │    │ 上下文缓存   │      │
│  │   检查       │    │   .md 文件   │    │  (Cache)     │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 核心组件

| 组件 | 职责 | 文件 |
|------|------|------|
| 笔记提取器 | 从对话中提取关键信息 | `sessionMemory.ts` |
| 笔记存储 | 持久化存储到文件 | `sessionMemory.ts` |
| 提示词注入器 | 将笔记注入系统提示词 | `sessionMemory.ts` |
| 上下文缓存 | 缓存系统上下文 | `contextCacheState.ts` |

---

## 二、数据结构

### 2.1 笔记结构

```typescript
export interface SessionMemoryNote {
  id: string          // 唯一标识（UUID）
  category: string    // 分类（需求、代码、问题、解决方案等）
  content: string     // 笔记内容
  timestamp: string   // 创建时间（ISO 格式）
}
```

### 2.2 配置结构

```typescript
export interface SessionMemoryConfig {
  enabled: boolean           // 是否启用记忆系统
  minTokensForInit: number   // 初始化所需最小 token 数
  minTokensBetweenUpdate: number // 更新间隔最小 token 数
  maxNotes: number           // 最大笔记数
}
```

### 2.3 提示词选项

```typescript
export interface SessionMemoryPromptOptions {
  maxNotesPerCategory?: number  // 每类最大笔记数
  maxChars?: number             // 最大字符数
}
```

### 2.4 提示词模式

```typescript
export type SessionMemoryPromptMode = 'never' | 'auto' | 'always'
```

---

## 三、配置管理

### 3.1 默认配置

```typescript
const DEFAULT_CONFIG: SessionMemoryConfig = {
  enabled: false,              // 默认禁用
  minTokensForInit: 2000,      // 2000 token 后开始提取
  minTokensBetweenUpdate: 1000, // 每 1000 token 更新一次
  maxNotes: 30,                // 最多 30 条笔记
}
```

### 3.2 提示词参数

```typescript
const DEFAULT_PROMPT_MAX_NOTES_PER_CATEGORY = 3
const DEFAULT_PROMPT_MAX_CHARS = 900
const COMPACT_PROMPT_MAX_NOTES_PER_CATEGORY = 5
const COMPACT_PROMPT_MAX_CHARS = 2000
```

### 3.3 配置 API

```typescript
export function getSessionMemoryConfig(): SessionMemoryConfig
export function setSessionMemoryConfig(updates: Partial<SessionMemoryConfig>): void
```

---

## 四、核心流程

### 4.1 会话生命周期

```typescript
// 初始化会话
export function initSession(): void {
  sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  lastExtractionTokenCount = 0
  extractedNotes = []
  invalidateSystemContextCache()
}

// 结束会话
export function endSession(): void {
  sessionId = null
  lastExtractionTokenCount = 0
  extractedNotes = []
  invalidateSystemContextCache()
}
```

### 4.2 笔记提取流程

```
┌─────────────────────────────────────────────────────────────────┐
│                      笔记提取流程                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                  ┌──────────────────────┐
                  │ 检查 token 数量      │
                  │ >= minTokensForInit? │
                  └──────────┬───────────┘
                    No       │       Yes
                    ▼        │        ▼
                跳过提取       │   ┌─────────────────────┐
                             │   │ >= minTokensBetween  │
                             │   │    Update?          │
                             │   └──────────┬──────────┘
                             │         Yes  │  No
                             │          ▼   │   ▼
                             │   ┌─────────────┐   │
                             │   │ 提取笔记    │   │
                             │   └──────┬──────┘   │
                             │       ▼  │          │
                             │   保存到文件    │    │
                             │              │    │
                             │              └────┘
```

### 4.3 笔记分类

系统自动识别并分类以下类型的笔记：

| 分类 | 描述 | 示例 |
|------|------|------|
| `requirement` | 用户需求 | "用户想要创建一个 REST API" |
| `code` | 代码相关 | "使用 TypeScript 实现" |
| `problem` | 问题描述 | "构建失败，错误信息是..." |
| `solution` | 解决方案 | "修复了 package.json 中的依赖" |
| `decision` | 技术决策 | "选择使用 SQLite 作为数据库" |
| `note` | 通用笔记 | "项目结构已更新" |

---

## 五、存储机制

### 5.1 文件存储

```typescript
// 默认存储路径
let sessionMemDir = join(homedir(), '.claude-code-mini', 'session-memory')

// 获取文件路径
function getSessionMemoryPath(id: string): string {
  return join(getSessionMemoryDir(), id + '.md')
}
```

### 5.2 文件格式

会话记忆以 Markdown 格式存储：

```markdown
# Session Memory: session-1778735129674-i5vj9v

## Requirements
- [2024-01-15T10:30:00] 用户想要创建一个 REST API

## Code
- [2024-01-15T10:35:00] 使用 TypeScript 实现

## Problems
- [2024-01-15T11:00:00] 构建失败，错误信息是...

## Solutions
- [2024-01-15T11:15:00] 修复了 package.json 中的依赖
```

### 5.3 读写操作

```typescript
// 读取会话记忆
export function readSessionMemory(id: string): SessionMemoryNote[]

// 持久化会话记忆
export async function persistSessionMemory(messages: BetaMessageParam[]): Promise<string | null>
```

---

## 六、提示词注入

### 6.1 注入时机

| 模式 | 行为 |
|------|------|
| `never` | 从不注入 |
| `auto` | 根据 token 阈值自动注入 |
| `always` | 始终注入 |

### 6.2 注入格式

```typescript
export function getSessionMemoryForPrompt(options?: SessionMemoryPromptOptions): string
```

注入示例：

```
## Session Notes

**Requirements:**
- 用户想要创建一个 REST API

**Code:**
- 使用 TypeScript 实现

**Solutions:**
- 修复了 package.json 中的依赖
```

### 6.3 压缩机制

```typescript
const SESSION_MEMORY_COMPACTION_MARKER = '[Earlier conversation summarized from session memory]'
const SESSION_MEMORY_TRUNCATED_MESSAGE = '[Session memory truncated to reduce token usage.]'
```

---

## 七、团队记忆同步

### 7.1 团队记忆结构

```typescript
export interface TeamMemory {
  id: string
  teamId: string
  content: string
  timestamp: string
  tags: string[]
}
```

### 7.2 同步机制

```typescript
// 写入团队记忆
export async function writeTeamMemory(teamId: string, content: string): Promise<string>

// 扫描本地团队记忆
export async function scanLocalTeamMemories(teamId: string): Promise<TeamMemory[]>

// 获取团队记忆用于提示词
export function getTeamMemoryForPrompt(teamId: string): string
```

### 7.3 配置管理

```typescript
export interface TeamSyncConfig {
  enabled: boolean
  syncInterval: number
  maxMemories: number
}

export function setTeamSyncConfig(config: Partial<TeamSyncConfig>): void
export function getTeamSyncConfig(): TeamSyncConfig
```

---

## 八、记忆存储客户端

### 8.1 存储接口

```typescript
export interface MemoryStore {
  addMemory(memory: Omit<StoredMemory, 'id' | 'timestamp'>): Promise<string>
  getMemories(filter?: MemoryFilter): Promise<StoredMemory[]>
  searchMemories(query: string): Promise<StoredMemory[]>
  deleteMemory(id: string): Promise<boolean>
}
```

### 8.2 存储实现

| 存储类型 | 说明 |
|----------|------|
| 文件存储 | 基于文件系统的存储 |
| SQLite | 基于 SQLite 的存储（可选） |
| Redis | 基于 Redis 的缓存（可选） |

---

## 九、API 参考

### 9.1 会话记忆 API

| 函数 | 说明 |
|------|------|
| `initSession()` | 初始化新会话 |
| `endSession()` | 结束当前会话 |
| `getSessionId()` | 获取当前会话 ID |
| `setSessionMemoryConfig()` | 设置配置 |
| `getSessionMemoryConfig()` | 获取配置 |
| `persistSessionMemory()` | 持久化会话记忆 |
| `readSessionMemory()` | 读取会话记忆 |
| `getSessionMemoryForPrompt()` | 获取提示词格式的记忆 |
| `shouldExtractMemory()` | 是否应该提取记忆 |
| `extractSessionNotes()` | 提取会话笔记 |

### 9.2 团队记忆 API

| 函数 | 说明 |
|------|------|
| `setTeamSyncConfig()` | 设置团队同步配置 |
| `writeTeamMemory()` | 写入团队记忆 |
| `scanLocalTeamMemories()` | 扫描本地团队记忆 |
| `removeTeamMemory()` | 删除团队记忆 |
| `getTeamMemoryForPrompt()` | 获取团队记忆提示词 |

---

## 十、使用场景

### 10.1 长对话上下文

```
用户: 我需要创建一个 Todo 应用
助手: 好的，我来帮你创建。首先...
(多次对话后)
用户: 之前说的那个应用，数据库用什么？
助手: 根据之前的对话，你想要创建一个 Todo 应用，我们之前讨论过使用 SQLite 作为数据库。
```

### 10.2 任务分解

```
用户: 我需要构建一个电商平台
助手: 好的，让我规划一下：
1. 创建项目结构
2. 设置数据库
3. 实现用户认证
4. 实现商品管理
5. 实现订单系统

(执行多个步骤后)
助手: 根据会话记录，我们已经完成了步骤 1-3，接下来实现商品管理模块。
```

### 10.3 跨会话知识复用

```
会话 1: 用户讨论了一个技术方案
会话 2: 用户再次提到相关话题
助手: 根据之前的会话，你之前讨论过这个技术方案，当时的结论是...
```

---

## 十一、性能优化

### 11.1 Token 阈值控制

- `minTokensForInit`: 避免频繁提取
- `minTokensBetweenUpdate`: 控制更新频率

### 11.2 缓存策略

```typescript
// 缓存系统上下文
invalidateSystemContextCache()

// 延迟写入
debounce(persistSessionMemory, 1000)
```

### 11.3 笔记数量限制

```typescript
const maxNotes = 30

// 超出限制时保留最新的
if (notes.length > maxNotes) {
  notes = notes.slice(-maxNotes)
}
```

---

**文档版本**: v1.0  
**生成时间**: 2026-05-15