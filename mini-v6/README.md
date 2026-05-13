# Claude Code Mini v5

基于 Anthropic Claude Code CLI 逆向工程的裁剪版本 v5。

## 新增功能 (v5)

### MCP 协议支持
- 支持连接到本地 stdio-based MCP 服务器
- 配置文件: `~/.claude-code-mini/mcp.json`
- 支持 multiple MCP servers
- 每个 MCP server 的 tools 自动注册为 `mcp__<server>__<tool>` 格式

### 配置管理
- 持久化配置: `~/.claude-code-mini/config.json`
- 支持字段: model, maxTurns, permissionMode, theme, autoCompact
- REPL `/config` 命令查看当前配置

### 自动对话压缩
- 监测 token 用量，超过阈值自动压缩
- 保留最近 N 轮对话 + 首条上下文消息
- 生成压缩摘要注入对话

### API 重试机制
- 指数退避重试
- 自动识别可重试错误 (rate limit, timeout, 429, 503, 网络错误)
- 可配置最大重试次数和延迟

## 版本演进

| 指标 | v1 | v2 | v3 | v4 | v5 |
|------|----|----|----|----|----|
| TS 文件 | 49 | 68 | 79 | 85 | 89 |
| 测试数 | 0 | 130 | 147 | 161 | 213 |
| 工具数 | 6 | 8 | 13 | 15 | 15+ |
| REPL | ? | ? | ? | ? | ? |
| 权限系统 | ? | ? | ? | ? | ? |
| Plan 模式 | ? | ? | ? | ? | ? |
| MCP | ? | ? | ? | ? | ? |
| 重试 | ? | ? | ? | ? | ? |
| 压缩 | ? | ? | ? | ? | ? |
| 配置 | ? | ? | ? | ? | ? |

## 命令

```bash
bun install
bun run dev          # 启动 REPL
bun run build        # 构建
bun run typecheck    # 类型检查
bun test             # 运行测试
```

## MCP 配置示例

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["server.js"],
      "env": { "NODE_ENV": "production" }
    }
  }
}
```
