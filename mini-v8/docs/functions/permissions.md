# 权限系统详解

## 概述

权限系统是 mini-v8 的安全核心，负责管理工具执行的访问控制。该系统通过多级权限检查和用户确认机制，确保危险操作得到适当的审批。

---

## 一、权限模式

### 1.1 模式定义

```typescript
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions'
```

### 1.2 模式对比

| 模式 | 危险工具 | 文件编辑工具 | 适用场景 |
|------|----------|--------------|----------|
| `default` | 需要确认 | 需要确认 | 正常交互模式 |
| `acceptEdits` | 需要确认 | 自动允许 | 批量编辑任务 |
| `bypassPermissions` | 自动允许 | 自动允许 | 自动化测试、CI/CD |

---

## 二、危险工具识别

### 2.1 危险工具列表

```typescript
const dangerousTools = ['Bash', 'Write', 'Edit', 'ApplyPatch', 'WebFetch']
```

### 2.2 工具风险分类

| 分类 | 工具 | 风险等级 | 说明 |
|------|------|----------|------|
| **高风险** | Bash, Write | 高 | 可执行任意命令或覆盖文件 |
| **中风险** | Edit, ApplyPatch | 中 | 可修改文件内容 |
| **低风险** | WebFetch | 低 | 可访问外部网络 |
| **安全** | Read, Grep, Glob, TaskList | 无 | 只读操作 |

---

## 三、权限检查流程

### 3.1 核心流程

```typescript
export async function requestPermission(req: PermissionRequest): Promise<boolean> {
  // 阶段 1: 快速检查
  if (!needsPermission(req.toolName)) return true

  // 阶段 2: 模式特殊处理
  if (permissionMode === 'acceptEdits') {
    if (['Write', 'Edit', 'ApplyPatch'].includes(req.toolName)) return true
  }

  // 阶段 3: 会话缓存检查
  const cacheKey = req.toolName + ':' + JSON.stringify(req.input).slice(0, 200)
  if (sessionApprovals.has(cacheKey)) {
    return sessionApprovals.get(cacheKey)!
  }

  // 阶段 4: 交互式确认
  const answer = await askUser('  Allow? (y/n/always): ')
  
  if (answer === 'always' || answer === 'a') {
    sessionApprovals.set(cacheKey, true)
    return true
  }
  if (answer === 'yes' || answer === 'y') {
    sessionApprovals.set(cacheKey, true)
    return true
  }
  return false
}
```

### 3.2 流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                     requestPermission()                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                  ┌──────────────────────┐
                  │ needsPermission() ?   │
                  └──────────┬───────────┘
                    No       │       Yes
                    ▼        │        ▼
                直接允许       │   ┌─────────────────────┐
                             │   │ acceptEdits 模式？   │
                             │   └──────────┬──────────┘
                             │         Yes  │  No
                             │          ▼   │   ▼
                             │   ┌─────────────┐   │
                             │   │ 是编辑工具？ │   │
                             │   └──────┬──────┘   │
                             │      Yes │ No        │
                             │       ▼  │          │
                             │   允许   │          │
                             │          └────┬─────┘
                             │               ▼
                    ┌──────────────────────────────────┐
                    │ 检查会话缓存 (sessionApprovals)  │
                    └────────────────┬─────────────────┘
                             存在    │    不存在
                              ▼      │       ▼
                          返回缓存    │   交互式询问用户
                          结果        │       │
                                     │       ▼
                             ┌───────────────────────┐
                             │ 输入: y/n/always/a     │
                             └───────────┬───────────┘
                              y/a       │       n
                               ▼        │        ▼
                           允许并缓存    │    拒绝
                                        │
```

---

## 四、权限请求结构

### 4.1 请求接口

```typescript
export interface PermissionRequest {
  toolName: string          // 工具名称
  toolDescription: string   // 工具描述
  input: Record<string, unknown>  // 工具输入参数
}
```

### 4.2 缓存机制

```typescript
let sessionApprovals = new Map<string, boolean>()

// 缓存键生成
const cacheKey = req.toolName + ':' + JSON.stringify(req.input).slice(0, 200)
```

**缓存策略**:
- 缓存键 = 工具名 + 输入参数的前 200 字符
- 有效期 = 当前会话
- 用户选择 `always` 或 `yes` 时缓存
- `always` 和 `yes` 行为相同（都是永久缓存到会话结束）

---

## 五、权限管理 API

### 5.1 设置权限模式

```typescript
let permissionMode: PermissionMode = 'default'

export function setPermissionMode(mode: PermissionMode): void {
  permissionMode = mode
}

export function getPermissionMode(): PermissionMode {
  return permissionMode
}
```

### 5.2 检查是否需要权限

```typescript
export function needsPermission(toolName: string): boolean {
  if (permissionMode === 'bypassPermissions') return false
  const dangerousTools = ['Bash', 'Write', 'Edit', 'ApplyPatch', 'WebFetch']
  return dangerousTools.includes(toolName)
}
```

### 5.3 请求权限

```typescript
export async function requestPermission(req: PermissionRequest): Promise<boolean>
```

---

## 六、安全设计原则

### 6.1 最小权限原则

- 默认拒绝所有危险操作
- 只在明确允许时执行
- 每次操作都需要显式授权

### 6.2 透明性

```typescript
// 权限请求时显示详细信息
process.stderr.write('\n  Permission required: ' + req.toolName + '\n')
process.stderr.write('  ' + req.toolDescription.slice(0, 100) + '\n')
process.stderr.write('  Input: ' + inputPreview + '\n')
```

### 6.3 会话隔离

- 权限缓存仅限当前会话
- 会话结束后缓存清空
- 不同会话之间权限独立

---

## 七、工具级权限控制

### 7.1 工具级权限检查

工具可以实现自定义的 `canUse` 方法：

```typescript
export interface Tool {
  canUse?(
    context: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<PermissionResult>
}
```

### 7.2 优先级

1. **工具级检查** (`tool.canUse`) - 最先执行
2. **系统级检查** (`requestPermission`) - 全局策略
3. **用户确认** - 最终决策

---

## 八、使用场景

### 8.1 正常交互模式

```bash
# 默认模式 - 所有危险操作需要确认
bun run cli.ts

# 输出示例
Permission required: Bash
Execute shell command
Input: {"command":"rm -rf /"}
Allow? (y/n/always): n
```

### 8.2 批量编辑模式

```bash
# 设置为 acceptEdits 模式
export CLAUDE_CODE_ACCEPT_EDITS=1
bun run cli.ts

# 文件编辑操作自动允许，Bash 仍需确认
```

### 8.3 自动化测试模式

```bash
# 跳过所有权限检查
export CLAUDE_CODE_BYPASS_PERMISSIONS=1
bun run cli.ts

# 所有操作直接执行，无需确认
```

---

## 九、安全边界

### 9.1 限制措施

| 限制 | 实现 |
|------|------|
| 命令长度限制 | 输入预览截断 |
| 参数记录 | 缓存键包含参数摘要 |
| 会话隔离 | 缓存仅在当前会话有效 |
| 模式限制 | bypassPermissions 需要显式设置 |

### 9.2 潜在风险

| 风险 | 缓解措施 |
|------|----------|
| 命令注入 | 依赖用户确认 |
| 路径遍历 | 文件工具应有路径检查 |
| 网络访问 | WebFetch 需要确认 |

---

## 十、最佳实践

### 10.1 开发建议

| 场景 | 建议 |
|------|------|
| 只读工具 | 无需权限检查 |
| 修改工具 | 设置 `requiresConfirmation: true` |
| 删除工具 | 必须确认 |
| 网络工具 | 需要确认 |

### 10.2 部署建议

| 环境 | 权限模式 |
|------|----------|
| 开发环境 | `default` 或 `acceptEdits` |
| 生产环境 | `default` |
| CI/CD | `bypassPermissions` |

---

**文档版本**: v1.0  
**生成时间**: 2026-05-15