# 修复 38 个 TypeScript 错误计划

## 错误分类

| 类别 | 文件 | 数量 | 根因 |
|------|------|------|------|
| A | `context.ts` | 4 | `gitStatus` 变量提升 + `EnhancedContext` 缺少 `timestamp` |
| B | `query.test.ts`, `QueryEngine.test.ts` | 20 | `mock.module` 类型推断 + `toBeNull` + `BetaMessageParam` 字面量 |
| C | `toolExecution.test.ts`, `toolOrchestration.test.ts` | 13 | `mock.module` 类型 + `toHaveBeenCalledWith` + `ContentItem.is_error` |
| D | `agentRunner.async.test.ts` | 2 | `toThrow`, `toBeTruthy` 不存在于基础类型 |

## 修复策略

### 类别 A: `context.ts` (4 errors)

**文件**: `src/context.ts`
**错误**: `gitStatus` 使用前声明 + `EnhancedContext` 缺 `timestamp`
**修复**:
1. 将 `gitStatus` 声明移到使用之前 (const/let 提升问题)
2. 修复 `EnhancedContext` 返回值增加 `timestamp` 字段

### 类别 B: 测试 mock 类型 (20 errors)

**文件**: `src/__tests__/query.test.ts`, `src/__tests__/QueryEngine.test.ts`
**错误**: `mock` is `unknown`, `toBeNull`, `BetaMessageParam` 类型
**修复**:
1. 在文件顶部添加 `/* eslint-disable */` 或类型断言
2. 对 `mock(...)` 返回值添加 `as jest.Mock` 或 `as any` 类型断言
3. 修复消息数组类型：`as BetaMessageParam[]`
4. `toBeNull` 改为 `toBe(null)`

### 类别 C: 编排测试 (13 errors)

**文件**: `src/__tests__/toolExecution.test.ts`, `src/__tests__/toolOrchestration.test.ts`
**错误**: `mock` is `unknown`, `toHaveBeenCalledWith`, `ContentItem.is_error`
**修复**:
1. `mock(...)` → `as any`
2. `toHaveBeenCalledWith(...)` → 用 `expect(mockFn).toHaveBeenCalledWith(...)` 但需要 Bun 类型
3. `tr.is_error` → `(tr as any).is_error`

### 类别 D: agentRunner 测试 (2 errors)

**文件**: `src/__tests__/agentRunner.async.test.ts`
**错误**: `toThrow`, `toBeTruthy`
**修复**: 这些是 Bun 测试匹配器，添加类型断言或用替代匹配器

## 预估工作量

| 类别 | 修复方式 | 估时 |
|------|---------|------|
| A | 修 context.ts 源代码 | 15min |
| B | test 文件顶部 `// @ts-nocheck` 或 `as any` | 10min |
| C | `as any` + 替代匹配器 | 10min |
| D | `as any` 或替代匹配器 | 5min |
| **总计** | | **~40min** |

## 推荐方案

**方案 1: `// @ts-nocheck`** — 在 5 个测试文件中添加 `// @ts-nocheck` 注释。最简单，但这些测试文件有真实类型问题。

**方案 2: 精确修复** — 逐个修复类型错误。对生产代码 (context.ts) 精确修复，对测试文件用 `as any`。

**推荐: 方案 2**

- `context.ts` — 精确修复 (真正 bug)
- 测试文件 — 用 `as unknown as` / `as any` 处理 `mock.module` 和 Bun 特定匹配器
- 测试文件 — `toBeNull()` → `toBeNull() as any` 或用 `.toBeNull` 替代... 实际上 Bun 的类型定义中不包含 `toBeNull`，可能是 bun 版本问题。使用 `toBe(null)` 替代。
