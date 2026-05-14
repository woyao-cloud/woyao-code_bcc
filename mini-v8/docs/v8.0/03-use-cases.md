# Claude Code Mini v8 - 用例文档

> 版本: 8.0.0 | 日期: 2026-05-14

---

## 1. 用例总览

| ID | 用例名称 | 优先级 | 涉及模块 |
|----|---------|:------:|---------|
| UC-01 | 交互式代码查询 | P0 | entrypoints, context, api/claude |
| UC-02 | 文件读写编辑 | P0 | FileRead/Write/Edit/ApplyPatch |
| UC-03 | 代码搜索与探索 | P0 | Glob, Grep, Explore Agent |
| UC-04 | Shell 命令执行 | P0 | Bash, permission |
| UC-05 | 子 Agent 委派任务 | P1 | Agent, agentRunner, agentRegistry |
| UC-06 | 多 Agent 团队协作 | P1 | TeamCreate, TeamDelete, teamManager |
| UC-07 | 规划与验证工作流 | P1 | Plan/ExitPlan/Verify Agent |
| UC-08 | 会话记忆管理 | P1 | sessionMemory, memoryStore |
| UC-09 | 团队记忆同步 | P2 | teamMemorySync |
| UC-10 | 插件安装与管理 | P2 | pluginLoader, pluginInstaller |
| UC-11 | Skill 发现与安装 | P2 | skillLoader, skillStore |
| UC-12 | MCP 外部工具集成 | P2 | mcpClient, MCPTool |
| UC-13 | Pipe 模式批量处理 | P1 | entrypoints/cli.ts |
| UC-14 | 消息自动压缩 | P1 | autoCompact |
| UC-15 | API 重试容错 | P1 | retry |

---

## 2. UC-01: 交互式代码查询

**参与者**: 开发者

**前置条件**: API Key 已配置，终端支持 TTY

**主流程**:
1. 用户运行 `bun run dev` 启动 REPL
2. 系统加载插件、Agent、MCP、记忆系统
3. 显示提示符 `>`
4. 用户输入自然语言问题
5. 系统构建上下文 (Git, ClaudeMd, Skills, Memories, Agents)
6. 调用 API 获取流式响应
7. 实时打印 AI 回复
8. 如 AI 请求工具调用，弹出权限审批
9. 执行工具并返回结果
10. 循环直到 AI 完成回答

**后置条件**: 对话历史保留在当前会话中

**异常流程**:
- API Key 未设置: 退出并提示错误
- API 网络错误: 自动重试 2 次 (指数退避)
- 用户输入 Ctrl+C: 中断并退出

---

## 3. UC-02: 文件读写编辑

**参与者**: 开发者 / AI Agent

**前置条件**: 有文件系统访问权限

**Read 流程**:
1. AI 调用 Read 工具，传入 file_path
2. 系统检查文件是否存在
3. 返回文件内容 (支持 offset/limit)

**Write 流程**:
1. AI 调用 Write 工具，传入 file_path + content
2. 系统触发权限检查
3. 用户确认后创建/覆写文件

**Edit 流程**:
1. AI 调用 Edit 工具，传入 old_string + new_string
2. 系统读取文件，匹配 old_string
3. 替换为 new_string
4. 返回编辑后的文件片段

**ApplyPatch 流程**:
1. AI 调用 ApplyPatch 工具，传入 diff
2. 系统解析 unified diff
3. 验证 patch 可应用后执行

**后置条件**: 文件已修改

---

## 4. UC-03: 代码搜索与探索

**参与者**: 开发者 / AI Agent

**Glob 流程**:
1. AI 调用 Glob，传入 pattern
2. 系统递归匹配文件
3. 返回匹配文件列表 (最多 100 个)

**Grep 流程**:
1. AI 调用 Grep，传入 pattern + path
2. 系统正则搜索文件内容
3. 返回匹配行及上下文

**Explore Agent 流程**:
1. AI 调用 Agent 工具，subagent_type="Explore"
2. Explore Agent 启动，拥有 Read+Glob+Grep 权限
3. 执行全面代码库搜索
4. 返回结构化搜索结果

---

## 5. UC-04: Shell 命令执行

**参与者**: AI Agent

**主流程**:
1. AI 调用 Bash 工具，传入 command
2. 系统检查权限模式
3. default 模式弹窗请求审批
4. 确认后执行命令 (120s timeout)
5. 返回 exit code + stdout + stderr

**安全规则**:
- 命令以非交互模式运行
- 支持 Windows (cmd.exe) 和 Unix (/bin/bash)

**异常流程**:
- 用户拒绝: 返回 Permission denied
- 命令超时: 终止进程返回 timeout 错误

---

## 6. UC-05: 子 Agent 委派任务

**参与者**: AI (主 Agent)

**前置条件**: Agent Registry 已初始化

**主流程**:
1. 主 Agent 调用 Agent 工具
2. AgentTool 从 Registry 查找定义
3. 调用 agentRunner.runAgent()
4. Agent Runner 创建独立消息上下文
5. 根据定义过滤可用工具
6. 在 maxTurns 限制内执行循环
7. 收集结果文本和 token 用量
8. 返回聚合结果

**Agent 类型选择**:
- 代码探索: Explore
- 任务规划: Plan
- 通用任务: general-purpose
- 代码审查: Verify
- 协调委派: coordinator
- 执行任务: worker

**后置条件**: 子 Agent 结果返回给主 Agent

---

## 7. UC-06: 多 Agent 团队协作

**参与者**: AI (Coordinator)

**前置条件**: Swarm 模式已启用

**主流程**:
1. Coordinator 调用 TeamCreate 创建团队
2. teamManager 创建 TeamDefinition 持久化
3. Coordinator 通过 Agent 生成多个 worker
4. Worker 并行执行各自任务
5. 结果汇总到 Coordinator
6. Coordinator 调用 TeamDelete 清理

```
Coordinator
    |-- TeamCreate --> team.json
    |-- Agent(worker1) --> task1
    |-- Agent(worker2) --> task2
    |-- Agent(worker3) --> task3
    |-- 汇总结果
    |-- TeamDelete
```

---

## 8. UC-07: 规划与验证工作流

**参与者**: AI Agent

**主流程**:
1. AI 调用 EnterPlanMode
2. 系统切换到规划模式 (只读工具)
3. AI 进行代码探索和需求分析
4. AI 调用 ExitPlanMode，提交计划
5. 系统退出规划模式
6. AI 按计划执行实现
7. (可选) AI 调用 Verify Agent 审查

---

## 9. UC-08: 会话记忆管理

**参与者**: 系统自动

**前置条件**: 会话记忆已启用

**主流程**:
1. initSession() 开始新会话
2. 对话中监控 token 量
3. 达到阈值触发 extractSessionNotes()
4. 提取用户请求、决策、文件路径
5. persistSessionMemory() 写入 .md
6. 后续会话自动注入历史记忆

**记忆格式**:
```
# Session Memory
## User Requests
- 用户请求摘要
## Decisions Made
- AI 决策记录
## Context & Files
- 涉及的文件路径
```

---

## 10. UC-09: 团队记忆同步

**参与者**: 系统 / 用户

**Pull**:
1. 执行 /team-memory pull
2. 调用 API 获取服务端记忆
3. 写入本地 team-memory/ 目录

**Push**:
1. 执行 /team-memory push
2. 扫描本地 file 计算 SHA256
3. 仅上传变更的条目

**Sync**: 先 Pull 再 Push

---

## 11. UC-10: 插件安装与管理

**参与者**: 开发者

**安装流程**:
1. /plugin install plugin@marketplace
2. 从 Marketplace 获取元数据
3. 下载解压到 scope 目录
4. 验证 manifest 后启用

**管理命令**:
```
/plugin list | install | uninstall | enable | disable
/plugin marketplace list | add <url> | remove <name>
```

---

## 12. UC-11: Skill 发现与安装

**参与者**: 开发者

**主流程**:
1. /skill search "docker"
2. 调用 Skill Store API
3. 返回匹配列表
4. /skill install <skillId>
5. 下载到 ~/.claude-code-mini/skills/

**技能来源**:
- 项目级 (.agents/skills/, .codex/skills/)
- 用户级 (~/.claude-code-mini/skills/)
- 插件贡献
- Skill Store

---

## 13. UC-12: MCP 外部工具集成

**参与者**: 系统自动

**前置条件**: mcp.json 已配置

**主流程**:
1. connectMCPServers() 读取配置
2. 对每个服务器 spawn 子进程
3. JSON-RPC 握手 (initialize + initialized)
4. tools/list 获取工具
5. MCPToolWrapper 包装注册

**协议**:
```
Client                  Server
  |-- initialize() ------>|
  |<-- capabilities ------|
  |-- initialized ------->|
  |-- tools/list() ------>|
  |<-- tool list ---------|
```

---

## 14. UC-13: Pipe 模式批量处理

**参与者**: 系统 / 脚本

**主流程**:
1. 检测 !isTTY 或 args > 0
2. 从 stdin 或 args 读取内容
3. 构建消息调用 API
4. 执行工具循环
5. 输出结果后退出

**示例**:
```bash
echo "explain this code" | bun run src/entrypoints/cli.ts
bun run src/entrypoints/cli.ts "find TODO comments"
```

---

## 15. UC-14: 消息自动压缩

**参与者**: 系统自动

**触发条件**: tokens > 70000

**主流程**:
1. estimateTokens() 估算 token 量
2. 超过阈值触发 compactMessages()
3. 保留首条 + 最后 6 条 (3 pairs)
4. 生成压缩摘要

---

## 16. UC-15: API 重试容错

**参与者**: 系统自动

**主流程**:
1. 拦截 API 错误
2. isRetryableError() 检查
3. 可重试: rate limit, timeout, 429, 502, 503
4. 最多 2 次重试 (指数退避 1s, 2s)
5. 仍失败则抛出错误