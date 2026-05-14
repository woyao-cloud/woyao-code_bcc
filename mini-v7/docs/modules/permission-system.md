# 权限系统设计文档

## 概述

权限系统控制工具执行的安全性，确保用户了解并同意每个工具的执行。系统提供多种权限模式，适应不同的使用场景。

**文件位置**: `src/services/permission/`

---

## 系统架构

```
权限系统
├── 权限模式 (PermissionMode)
│   ├── default
│   ├── acceptEdits
│   ├── bypassPermissions
│   ├── dontAsk
│   └── plan
├── 权限管理器 (permissionManager.ts)
│   ├── 权限请求
│   ├── 会话缓存
│   └── 用户交互
├── 权限类型 (permissions.ts)
│   ├── PermissionResult
│   ├── ToolPermissionContext
│   └── 相关类型
└── 权限工具函数 (utils/permissions.ts)
    ├── shouldAskPermission
    └── isBypassPermissions
```

---

## 权限模式

### 模式定义

```typescript
type PermissionMode =
  | 'default'           // 默认模式，所有危险工具需要询问
  | 'acceptEdits'      // 接受编辑类工具，其他仍需询问
  | 'bypassPermissions' // 绕过所有权限检查
  | 'dontAsk'          // 不询问，直接拒绝
  | 'plan'             // 计划模式
```

### 模式对比

| 模式 | Write | Edit | ApplyPatch | Bash | WebFetch | 其他工具 |
|------|-------|------|------------|------|----------|----------|
| `default` | ❓询问 | ❓询问 | ❓询问 | ❓询问 | ❓询问 | ✅允许 |
| `acceptEdits` | ✅允许 | ✅允许 | ✅允许 | ❓询问 | ❓询问 | ✅允许 |
| `bypassPermissions` | ✅允许 | ✅允许 | ✅允许 | ✅允许 | ✅允许 | ✅允许 |
| `dontAsk` | ❌拒绝 | ❌拒绝 | ❌拒绝 | ❌拒绝 | ❌拒绝 | ✅允许 |
| `plan` | ❓询问 | ❓询问 | ❓询问 | ❓询问 | ❓询问 | ✅允许 |

---

## 危险工具列表

以下工具被认为是危险工具，需要权限检查：

```typescript
const dangerousTools = [
  'Bash',         // 执行系统命令
  'Write',        // 写入文件
  'Edit',         // 编辑文件
  'ApplyPatch',   // 应用补丁
  'WebFetch'      // 抓取网页
]
```

---

## 权限管理器 (permissionManager.ts)

### 核心接口

```typescript
interface PermissionRequest {
  toolName: string
  toolDescription: string
  input: Record<string, unknown>
}
```

### 主要函数

| 函数 | 说明 |
|------|------|
| `setPermissionMode(mode)` | 设置权限模式 |
| `getPermissionMode()` | 获取当前权限模式 |
| `needsPermission(toolName)` | 判断工具是否需要权限 |
| `requestPermission(req)` | 请求用户授权 |

### 权限请求流程

```
工具执行请求
    ↓
检查是否需要权限 (needsPermission)
    ↓
检查权限模式
    ├── bypassPermissions → ✅ 允许
    ├── acceptEdits + (Write/Edit/ApplyPatch) → ✅ 允许
    └── 其他 → 继续
    ↓
检查会话缓存
    ├── 已授权 → ✅ 允许
    └── 未授权 → 继续
    ↓
询问用户
    ├── y/yes → ✅ 允许并缓存
    ├── always/a → ✅ 允许并永久缓存 (会话内)
    └── n/no → ❌ 拒绝
    ↓
返回结果
```

### 用户交互

权限请求通过标准错误输出显示：

```
  Permission required: Write
  Write content to a file, creating it if it does not exist or overwriting if it does.
  Input: {"file_path": "test.txt", "content": "Hello"}
  Allow? (y/n/always):
```

### 会话缓存

缓存键格式：`{toolName}:{inputPreview}`

```typescript
const cacheKey = req.toolName + ':' + JSON.stringify(req.input).slice(0, 200)
```

- 输入预览截取前 200 字符
- 相同工具 + 相似输入自动授权
- 缓存仅在当前会话有效

---

## 权限类型 (permissions.ts)

### ToolPermissionContext

```typescript
interface ToolPermissionContext {
  readonly mode: PermissionMode
  readonly additionalWorkingDirectories: ReadonlyMap<string, AdditionalWorkingDirectory>
  readonly alwaysAllowRules: Record<string, string[]>
  readonly alwaysDenyRules: Record<string, string[]>
  readonly isBypassPermissionsModeAvailable: boolean
}
```

### PermissionResult

```typescript
type PermissionResult =
  | {
      behavior: 'allow'
      updatedInput: Record<string, unknown>
      rationale?: string
    }
  | {
      behavior: 'deny'
      rationale?: string
    }
```

### 辅助函数

```typescript
function getEmptyToolPermissionContext(): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    isBypassPermissionsModeAvailable: false
  }
}
```

---

## 权限工具函数 (utils/permissions.ts)

```typescript
function shouldAskPermission(mode: PermissionMode): boolean {
  return mode === 'default' || mode === 'plan'
}

function isBypassPermissions(mode: PermissionMode): boolean {
  return mode === 'bypassPermissions'
}
```

---

## 在 CLI 中的集成

### 执行流程

```typescript
// src/entrypoints/cli.ts

for (const toolUse of toolUses) {
  const tool = toolsMap.get(toolUse.name)

  // 1. 请求权限
  const allowed = await requestPermission({
    toolName: tool.name,
    toolDescription: tool.description,
    input: toolUse.input
  })

  if (!allowed) {
    toolResults.push({
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: 'Permission denied.',
      is_error: true
    })
    process.stderr.write(' (denied)\n')
    continue
  }

  // 2. 执行工具
  const result = await tool.execute(ctx, toolUse.input)
  process.stderr.write(` (${result.success ? 'ok' : 'fail'})\n`)
}
```

### 全局状态

权限模式存储在全局状态中：

```typescript
// src/bootstrap/state.ts

export const state = {
  // ...
  permissionMode: 'default' as const
  // ...
}
```

---

## 计划模式 (Plan Mode)

计划模式是一个特殊的权限模式，用于先规划再执行：

```typescript
// 工具
EnterPlanModeTool  // 进入计划模式
ExitPlanModeTool   // 退出计划模式
```

在计划模式下：
- 工具执行被记录但不实际执行
- 用户可以审查计划
- 确认后一次性执行所有操作

---

## 最佳实践

### 用户体验

1. **清晰的描述**: 工具描述应该清晰说明做什么
2. **输入预览**: 显示关键输入参数
3. **快速选择**: 提供 `always` 选项避免重复询问
4. **默认安全**: 默认模式保持保守

### 开发建议

1. **正确分类**: 确保新工具正确分类为危险/安全
2. **描述清晰**: 工具描述要准确且易懂
3. **测试覆盖**: 测试各种权限场景

---

## 安全考虑

1. **最小权限**: 默认模式要求所有危险工具显式授权
2. **会话隔离**: 缓存仅在当前会话有效
3. **透明操作**: 用户清楚看到每个工具将要做什么
4. **审计痕迹**: 权限请求和决策都有记录

---

## 测试覆盖

- `permissionManager.test.ts`: 权限管理器测试

测试用例包括：
- 默认模式下的权限检查
- 各种权限模式的行为
- 会话缓存功能

---

## 扩展点

1. **规则系统**: 支持基于规则的自动授权
2. **目录白名单**: 特定目录自动允许文件操作
3. **工具白名单**: 特定工具自动允许
4. **历史记录**: 查看历史权限决策
5. **权限配置**: 持久化权限偏好
