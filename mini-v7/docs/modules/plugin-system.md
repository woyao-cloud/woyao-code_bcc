# 插件系统设计文档

## 概述

插件系统提供功能扩展机制，允许第三方开发者扩展 Claude Code Mini 的功能。插件可以贡献 Skills、MCP 服务器等。

**文件位置**: `src/plugins/`

---

## 系统架构

```
插件系统
├── 插件加载器 (pluginLoader.ts)
│   ├── 插件发现
│   ├── 插件加载
│   └── 插件激活
├── 插件安装器 (pluginInstaller.ts)
│   ├── 插件安装
│   ├── 插件卸载
│   └── 插件列表
├── 市场管理器 (marketplaceManager.ts)
│   ├── 市场列表
│   ├── 市场搜索
│   └── 市场更新
└── 类型定义 (types.ts)
    ├── Plugin
    ├── PluginManifest
    └── PluginMarketplace
```

---

## 插件类型

### 作用域 (Scope)

```typescript
type PluginScope = 'user' | 'project' | 'local' | 'bundled'
```

- **user**: 用户级插件，全局可用
- **project**: 项目级插件，仅在当前项目可用
- **local**: 本地开发插件
- **bundled**: 内置插件

### 安装位置

- **user**: `~/.claude-code-mini/plugins/`
- **project**: `.claude-code/plugins/`
- **local**: 本地开发目录

---

## 插件 Manifest

每个插件必须包含 `manifest.json` 文件：

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "A sample plugin",
  "author": "Your Name",
  "homepage": "https://example.com",
  "repository": "https://github.com/user/plugin",
  "license": "MIT",
  "category": "productivity",
  "tags": ["ai", "tools"],
  "minAppVersion": "7.0.0",
  "skills": [
    {
      "name": "my-skill",
      "path": "skills/my-skill/SKILL.md"
    }
  ],
  "mcpServers": [
    {
      "name": "my-mcp-server",
      "command": "node",
      "args": ["server.js"]
    }
  ]
}
```

### Manifest 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 插件名称 |
| `version` | string | ✅ | 版本号 (语义化版本) |
| `description` | string | ✅ | 插件描述 |
| `author` | string | ❌ | 作者 |
| `homepage` | string | ❌ | 主页 URL |
| `repository` | string | ❌ | 代码仓库 URL |
| `license` | string | ❌ | 许可证 |
| `category` | string | ❌ | 分类 |
| `tags` | string[] | ❌ | 标签 |
| `minAppVersion` | string | ❌ | 最低应用版本要求 |
| `skills` | SkillDef[] | ❌ | 贡献的 Skills |
| `mcpServers` | MCPServerDef[] | ❌ | MCP 服务器 |

---

## 插件接口

### 插件类型

```typescript
interface Plugin {
  pluginId: string
  manifest: PluginManifest
  installPath: string
  marketplace: string
  scope: PluginScope
  enabled: boolean
  errors: PluginError[]
}

interface PluginError {
  message: string
  fatal: boolean
}
```

### 市场类型

```typescript
interface PluginMarketplaceEntry {
  name: string
  version: string
  description: string
  author?: string
  homepage?: string
  repository: string
  license?: string
  category?: string
  tags?: string[]
  downloadUrl?: string
  dependencies?: Record<string, string>
  minAppVersion?: string
}

interface PluginMarketplace {
  name: string
  description?: string
  version: string
  plugins: PluginMarketplaceEntry[]
}

interface KnownMarketplace {
  source: string
  url?: string
  repo?: string
  ref?: string
  installLocation?: string
  autoUpdate?: boolean
  name?: string
  lastUpdated?: string
}
```

---

## 插件加载器 (pluginLoader.ts)

### 加载流程

```
启动
    ↓
扫描插件目录
    ↓
读取 manifest.json
    ↓
验证 manifest
    ↓
加载插件资源
    ├── Skills
    └── MCP 服务器
    ↓
激活插件
    ↓
注册到插件列表
```

### 主要函数

| 函数 | 说明 |
|------|------|
| `loadAllPlugins(projectRoot)` | 加载所有插件 |
| `getPluginSkillFiles(plugins)` | 获取插件贡献的 Skills |
| `getLoadedPlugins()` | 获取已加载的插件 |

---

## 插件安装器 (pluginInstaller.ts)

### 主要函数

| 函数 | 说明 |
|------|------|
| `installPluginFromUrl(url, scope, projectRoot)` | 从 URL 安装插件 |
| `installPluginFromRepo(repo, scope, projectRoot)` | 从仓库安装插件 |
| `uninstallPlugin(name, scope, projectRoot)` | 卸载插件 |
| `listInstalledPlugins(projectRoot)` | 列出已安装的插件 |
| `updatePlugin(name, scope, projectRoot)` | 更新插件 |

### 安装流程

```
用户请求安装
    ↓
下载插件包
    ↓
解压到临时目录
    ↓
验证 manifest
    ↓
检查依赖
    ↓
检查版本兼容性
    ↓
移动到目标目录
    ↓
加载插件
```

---

## 市场管理器 (marketplaceManager.ts)

### 主要函数

| 函数 | 说明 |
|------|------|
| `listMarketplaces()` | 列出已知市场 |
| `getMarketplace(marketplaceId)` | 获取市场详情 |
| `searchMarketplace(marketplaceId, query)` | 搜索市场 |
| `refreshMarketplace(marketplaceId)` | 刷新市场 |
| `addMarketplace(config)` | 添加市场 |
| `removeMarketplace(marketplaceId)` | 移除市场 |

### 市场配置

市场可以是：
- **URL**: 远程 JSON manifest
- **Git 仓库**: GitHub/GitLab 仓库
- **本地目录**: 本地开发市场

---

## 插件可以贡献什么

### 1. Skills

插件可以在 `skills/` 目录下提供 Skills：

```
my-plugin/
├── manifest.json
└── skills/
    └── my-skill/
        └── SKILL.md
```

### 2. MCP 服务器

插件可以提供 Model Context Protocol 服务器：

```json
{
  "mcpServers": [
    {
      "name": "my-server",
      "command": "python",
      "args": ["server.py"],
      "env": {
        "API_KEY": "placeholder"
      }
    }
  ]
}
```

### 3. 自定义工具

通过 MCP 服务器提供自定义工具。

---

## REPL 命令

```
/plugin install|uninstall|list|enable|disable|marketplace
```

- `install`: 安装插件
- `uninstall`: 卸载插件
- `list`: 列出已安装插件
- `enable`: 启用插件
- `disable`: 禁用插件
- `marketplace`: 浏览插件市场

---

## 命令处理 (pluginCommands.ts)

### 主要函数

| 函数 | 说明 |
|------|------|
| `handlePluginCommand(args, getPlugins, cwd)` | 处理插件命令 |

---

## 设计模式

### 插件模式

标准的插件架构，通过 manifest 定义扩展点。

### 策略模式

不同的安装源使用统一接口：

```typescript
installPluginFromUrl()
installPluginFromRepo()
```

### 注册表模式

插件注册到中央注册表：

```typescript
let loadedPlugins: LoadedPlugin[] = []
```

---

## 安全考虑

1. **Manifest 验证**: 验证插件 manifest 的完整性
2. **版本兼容性**: 检查最低版本要求
3. **沙箱执行**: MCP 服务器在隔离环境中运行
4. **权限控制**: 插件操作需要用户授权
5. **签名验证**: 市场插件可选签名验证

---

## 性能考虑

1. **延迟加载**: 插件按需加载
2. **缓存**: 市场列表缓存
3. **并行加载**: 多个插件并行加载
4. **按需激活**: 插件功能按需激活

---

## 测试覆盖

- `pluginLoader.test.ts`: 插件加载器测试
- `marketplaceManager.test.ts`: 市场管理器测试

---

## 最佳实践

### 插件开发

1. **清晰的 Manifest**: 提供完整的 manifest 信息
2. **语义化版本**: 使用语义化版本号
3. **良好的文档**: 包含 README 和使用示例
4. **测试**: 包含插件自身的测试
5. **错误处理**: 优雅处理错误

### 插件发布

1. **选择合适的分类**: 帮助用户发现
2. **使用标签**: 添加相关标签
3. **提供演示**: 截图或视频演示
4. **维护更新**: 定期更新插件
5. **响应反馈**: 回应用户问题和建议

---

## 扩展点

1. **新的扩展点**: 添加更多插件扩展点
2. **插件依赖**: 支持插件之间的依赖
3. **插件配置**: 支持插件配置界面
4. **插件更新检查**: 自动检查更新
5. **插件评分**: 用户评分和评论系统
