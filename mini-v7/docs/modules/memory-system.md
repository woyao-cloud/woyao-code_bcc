# 记忆系统 (Memory System) 设计文档

## 概述

记忆系统是 Claude Code Mini v7 的核心特性，提供多层级的记忆管理能力，包括会话记忆、本地记忆存储、云端记忆商店和团队记忆同步。

**文件位置**: `src/services/memory/`

---

## 系统架构

```
记忆系统
├── 会话记忆 (Session Memory)
│   ├── 自动提取
│   ├── 分类存储
│   └── 上下文注入
├── 本地记忆存储 (Local Memory Store)
│   ├── CRUD 操作
│   ├── 标签和分类
│   ├── 搜索功能
│   └── 导入/导出
├── 云端记忆商店 (Memory Stores Client)
│   └── 云端同步
└── 团队记忆同步 (Team Memory Sync)
    ├── Delta 上传
    └── 双向同步
```

---

## 会话记忆 (Session Memory)

### 功能特性

- **自动提取**: 对话过程中自动提取关键信息
- **智能分类**: 分为用户请求、决策、上下文三类
- **阈值触发**: 基于 token 数量自动触发提取
- **Markdown 存储**: 保存为易读的 Markdown 格式
- **上下文注入**: 自动注入到系统提示词中

### 核心接口

```typescript
interface SessionMemoryNote {
  id: string
  category: string
  content: string
  timestamp: string
}

interface SessionMemoryConfig {
  enabled: boolean
  minTokensForInit: number        // 首次提取阈值 (默认 2000)
  minTokensBetweenUpdate: number   // 后续提取间隔 (默认 1000)
  maxNotes: number                 // 最大笔记数 (默认 30)
}
```

### 主要函数

| 函数 | 说明 |
|------|------|
| `initSession()` | 初始化会话记忆 |
| `shouldExtractMemory(messages)` | 判断是否需要提取记忆 |
| `extractSessionNotes(messages)` | 从对话中提取笔记 |
| `persistSessionMemory(notes)` | 保存会话记忆 |
| `readSessionMemory(id)` | 读取会话记忆 |
| `getSessionMemoryForPrompt(id)` | 获取用于提示词的记忆 |

### 提取规则

#### 用户请求提取

从最近的用户消息中提取，每条消息取前 150 字符预览。

```typescript
// 示例输出
- "修改用户认证模块，添加 JWT 支持"
  _2024-05-13T10:30:00.000Z_
```

#### 决策提取

使用正则表达式匹配助手的决策语句：

- `I will ...`
- `I'll ...`
- `Let's ...`
- `We should ...`
- `The plan is ...`

```typescript
// 示例输出
- "重构数据库访问层使用 ORM"
  _2024-05-13T10:35:00.000Z_
```

#### 文件路径提取

从对话中提取提到的文件路径：

```typescript
// 示例输出
- File: src/services/auth.ts
  _2024-05-13T10:40:00.000Z_
```

### 存储格式

保存为 Markdown 文件，路径：`~/.claude-code-mini/session-memory/{sessionId}.md`

```markdown
# Session Memory

Session: session-1715604600000-abc123

## User Requests

- "修改用户认证模块，添加 JWT 支持"
  _2024-05-13T10:30:00.000Z_

## Decisions Made

- "重构数据库访问层使用 ORM"
  _2024-05-13T10:35:00.000Z_

## Context & Files

- File: src/services/auth.ts
  _2024-05-13T10:40:00.000Z_
```

---

## 本地记忆存储 (Local Memory Store)

### 功能特性

- **CRUD 操作**: 创建、读取、更新、删除记忆
- **标签系统**: 支持多标签
- **分类管理**: 自定义分类
- **搜索功能**: 全文搜索
- **导入/导出**: JSON 和 Markdown 格式

### 核心接口

```typescript
interface Memory {
  id: string
  content: string
  tags: string[]
  category: string
  createdAt: string
  updatedAt: string
}

interface MemoryStore {
  version: number
  memories: Memory[]
}
```

### 主要函数

| 函数 | 说明 |
|------|------|
| `addMemory(content, tags, category)` | 添加记忆 |
| `getMemories(options)` | 获取记忆列表 |
| `getMemoryById(id)` | 根据 ID 获取记忆 |
| `updateMemory(id, updates)` | 更新记忆 |
| `deleteMemory(id)` | 删除记忆 |
| `searchMemories(query)` | 搜索记忆 |
| `getAllTags()` | 获取所有标签 |
| `getAllCategories()` | 获取所有分类 |
| `exportMemories(format)` | 导出记忆 |
| `importMemories(data)` | 导入记忆 |
| `formatMemoriesForPrompt()` | 格式化记忆用于提示词 |

### 存储格式

JSON 文件，路径：`~/.claude-code-mini/memories-v2.json`

```json
{
  "version": 1,
  "memories": [
    {
      "id": "mem_1715604600000",
      "content": "项目使用 TypeScript + Bun",
      "tags": ["tech", "setup"],
      "category": "project",
      "createdAt": "2024-05-13T10:00:00.000Z",
      "updatedAt": "2024-05-13T10:00:00.000Z"
    }
  ]
}
```

### 查询选项

```typescript
{
  category?: string        // 按分类筛选
  tags?: string[]          // 按标签筛选
  limit?: number           // 限制数量
}
```

---

## 云端记忆商店 (Memory Stores Client)

### 功能特性

- **云端存储**: 将记忆保存到 Anthropic 云端
- **版本管理**: 支持记忆版本历史
- **共享能力**: 可以与团队共享记忆
- **完整 CRUD**: 商店和记忆的完整操作

### 主要功能

- 列出记忆商店
- 创建记忆商店
- 获取商店详情
- 归档商店
- 管理商店中的记忆

---

## 团队记忆同步 (Team Memory Sync)

### 功能特性

- **双向同步**: 本地和云端记忆同步
- **Delta 上传**: 只上传变化的部分
- **冲突解决**: 智能处理同步冲突
- **本地缓存**: `~/.claude-code-mini/team-memory/`

### 同步策略

- **Pull**: 从云端拉取最新记忆
- **Push**: 将本地记忆推送到云端
- **Sync**: 双向同步，智能合并

---

## 上下文注入机制

记忆系统自动将相关记忆注入到对话上下文中：

```typescript
// 系统提示词中的记忆部分

## User Memories

- "项目使用 TypeScript + Bun" [tech, setup]
- "数据库采用 PostgreSQL" [database, tech]

## Session Memory (auto-extracted)

### User Requests

- "修改用户认证模块，添加 JWT 支持"

### Decisions Made

- "重构数据库访问层使用 ORM"

### Context & Files

- File: src/services/auth.ts
```

---

## REPL 命令

### 会话记忆命令

```
/session-memory on|off|status|config|view
```

- `on`: 启用会话记忆
- `off`: 禁用会话记忆
- `status`: 查看当前状态
- `config`: 查看/修改配置
- `view`: 查看当前会话记忆

### 记忆管理命令

```
/memory add|list|search|delete|categories|tags|export|import|extract
```

- `add`: 添加新记忆
- `list`: 列出记忆
- `search`: 搜索记忆
- `delete`: 删除记忆
- `categories`: 管理分类
- `tags`: 管理标签
- `export`: 导出记忆
- `import`: 导入记忆
- `extract`: 手动提取会话记忆

### 云端记忆商店命令

```
/memory-stores list|create|get|archive|memories
```

### 团队同步命令

```
/sync-memory pull|push|sync
```

---

## 测试支持

### 路径覆盖

两个模块都支持测试环境的路径覆盖：

```typescript
// sessionMemory.ts
setSessionMemoryDir(dir: string): void

// memoryStore.ts
setMemoryDir(dir: string): void
```

### 测试覆盖

- `sessionMemory.test.ts`: 会话记忆测试
- `memoryStore.test.ts`: 本地记忆存储测试
- `teamMemorySync.test.ts`: 团队同步测试

---

## 设计模式

### 单例模式

两个模块都使用模块级变量管理状态：

```typescript
let config: SessionMemoryConfig = { ...DEFAULT_CONFIG }
let sessionId: string | null = null
let extractedNotes: SessionMemoryNote[] = []
```

### 策略模式

提取规则使用策略模式，便于扩展：

```typescript
extractUserMessages()
extractAssistantDecisions()
extractFilePaths()
```

### 存储抽象

存储层抽象，便于切换存储后端：

```typescript
loadStore()
saveStore()
```

---

## 性能考虑

1. **增量提取**: 只处理新消息
2. **去重检查**: 避免重复笔记
3. **数量限制**: 限制最大笔记数
4. **延迟写入**: 批量持久化

---

## 扩展点

1. **自定义提取规则**: 添加新的笔记提取策略
2. **自定义分类**: 支持更多笔记分类
3. **存储后端**: 支持 SQLite、MongoDB 等
4. **AI 增强**: 使用 AI 进行更智能的记忆提取和总结
