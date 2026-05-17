# 测试与质量差距分析

## 现状

mini-v8 有 **31 测试文件** (在 `src/__tests__/` 下)。完整版约 **150+ 测试文件** (散布在各模块的 `__tests__/` 目录)。

### mini-v8 现有的测试

| 测试 | 断言数 | 覆盖内容 |
|------|--------|---------|
| agentContext.test.ts | ~20 | ALS 上下文隔离 |
| agentRunner.async.test.ts | ~25 | 异步执行 + AgentTaskStore |
| agentSystem.test.ts | ~15 | Agent 注册 + 团队 |
| applyPatch.test.ts | ~15 | 统一 diff 补丁 |
| autoCompact.test.ts | ~20 | 自动压缩 |
| bashTool.test.ts | ~10 | Bash 执行 |
| configManager.test.ts | ~10 | 配置管理 |
| context.test.ts | ~10 | 系统上下文 |
| fileTools.test.ts | ~15 | 文件读写/编辑/Glob/Grep |
| log.test.ts | ~5 | 日志 |
| mcpTool.test.ts | ~10 | MCP 工具包装器 |
| messages.test.ts | ~10 | 消息处理 |
| model.test.ts | ~10 | 模型解析 |
| permissionManager.test.ts | 9 | 权限管理 |
| permissionRuleParser.test.ts | 18 | 规则解析 + 匹配 |
| planMode.test.ts | ~5 | Plan 模式 |
| providers.test.ts | ~10 | 提供商选择 |
| retry.test.ts | ~5 | 重试逻辑 |
| taskStore.test.ts | ~15 | 任务存储 |
| toolsRegistry.test.ts | 12 (139 expect) | 工具注册表 |
| turnLimit.test.ts | ~10 | Turn 限制 |
| 其他 | ~20 | Crypto, errors, git, signal, 等 |

### 需要增加测试的模块

| 模块 | 优先级 | 说明 |
|------|--------|------|
| `query.ts` | **P0** | 核心查询循环 (当前 0 测试) |
| `QueryEngine.ts` | **P0** | 编排器 (当前 0 测试) |
| `agentRunner.ts` | **P0** | Agent 执行 (async.test 有基础，sync 无) |
| `agentMemory.ts` | **P0** | Memory 读写 |
| `toolOrchestration.ts` | **P1** | 工具编排 (当前 0 测试) |
| `notificationQueue.ts` | **P1** | 通知队列 |
| `cli.ts` | **P1** | CLI 入口 |
| `teammateMailbox.ts` | **P1** | Mailbox 通信 |
| `reactiveCompact.ts` | **P1** | 紧急压缩 |
| `permissions.ts` | **P1** | 权限决策引擎 |
| `toolExecution.ts` | **P2** | 单工具执行 |
| `toolResultStorage.ts` | **P2** | 结果持久化 |
| `permissionsLoader.ts` | **P2** | 权限规则加载 |
| 新增工具 | **P3** | 每个新工具应有 ~20 行测试 |

## 集成测试

完整版在 `tests/integration/` 有 4 个集成测试文件。mini-v8 完全缺失。

| 测试 | 说明 | 优先级 |
|------|------|--------|
| CLI 参数解析 | --resume, --version 等 | P2 |
| 对话循环 | 完整 query → tool → result 链 | P2 |
| 上下文构建 | system context + user context | P2 |
| 并发工具 | 只读并发 + 写入串行 | P3 |

## 代码质量

| 指标 | 完整版 | mini-v8 |
|------|--------|---------|
| TypeScript strict | ✅ | ✅ (bunx tsc --noEmit 通过) |
| Biome lint | ✅ | ✅ (bun run lint) |
| 测试覆盖率 | ~40% | ~10% (估) |
| 集成测试 | 4 文件 | 0 文件 |

## 推荐动作

1. **P0**: 为 `query.ts` 和 `QueryEngine.ts` 写测试 (核心循环)
2. **P0**: 完成 `agentMemory.ts` 测试 (已有文件但测试未写)
3. **P1**: 为编排引擎和通知系统写测试
4. **P1**: 添加 1-2 个集成测试
5. **P2**: 每个工具添加基础功能测试
