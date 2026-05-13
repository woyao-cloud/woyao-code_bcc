# Claude Code Mini v6

基于 Anthropic Claude Code CLI 逆向工程的裁剪版本 v6。

## 新增功能 (v6)

### 插件生态系统
- **插件管理**: `/plugin install`、`/plugin uninstall`、`/plugin list`、`/plugin enable/disable`
- **市场支持**: `/plugin marketplace add/remove/list/update`
- **插件发现**: 自动加载 `~/.claude-code-mini/plugins/` 和 `.codex/plugins/` 下的插件
- **插件清单**: `.codex-plugin/plugin.json` 格式，支持 commands、skills、mcpServers
- **技能发现**: 插件可通过 skills 字段贡献 SKILL.md 文件

### Skill 生态
- **Skill 商店**: `/skill-store list/search/install/uninstall`
- **Skill 搜索**: `/skill-search start/stop/status` - 基于 TF 的自动技能匹配
- **多源加载**: project `.agents/skills/`、user `~/.claude-code-mini/skills/`、plugin skills
- **缓存支持**: Skill 商店结果本地缓存，离线可用

## 版本演进

| 指标 | v1 | v2 | v3 | v4 | v5 | v6 |
|------|----|----|----|----|----|----|
| TS 文件 | 49 | 68 | 79 | 85 | 89 | 95 |
| 测试数 | 0 | 130 | 147 | 161 | 213 | 213+ |
| 工具数 | 6 | 8 | 13 | 15 | 15+ | 15+ |
| REPL | - | - | - | - | - | - |
| 权限系统 | - | - | - | - | - | - |
| Plan 模式 | - | - | - | - | - | - |
| MCP | - | - | - | - | - | - |
| 重试 | - | - | - | - | - | - |
| 压缩 | - | - | - | - | - | - |
| 配置 | - | - | - | - | - | - |
| 插件市场 | - | - | - | - | - | - |
| Skill 商店 | - | - | - | - | - | - |
| Skill 搜索 | - | - | - | - | - | - |

## 命令

```bash
bun install
bun run dev          # 启动 REPL
bun run build        # 构建
bun run typecheck    # 类型检查
bun test             # 运行测试
```

## REPL 命令

```
/help /exit /clear /tools /config
/plugin [install|uninstall|list|enable|disable|marketplace]
/skill-store [list|search|install|uninstall|installed]
/skill-search [start|stop|status]
```

## 插件清单示例

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "My custom plugin",
  "skills": [
    { "name": "my-skill", "description": "A skill", "path": "skills/SKILL.md" }
  ],
  "mcpServers": [
    { "name": "my-server", "command": "node", "args": ["server.js"] }
  ]
}
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
