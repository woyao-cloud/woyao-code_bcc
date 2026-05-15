# 插件系统详解

## 概述

插件系统是 mini-v8 的扩展机制，允许用户通过安装插件来增强功能。插件可以提供新的工具、技能和代理定义。

---

## 一、核心架构

### 1.1 架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                        插件系统                                  │
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ 插件加载器   │    │ 插件安装器   │    │ 技能管理器   │      │
│  │ (Loader)     │    │ (Installer)  │    │ (SkillMgr)   │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                    │                    │             │
│         ▼                    ▼                    ▼             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ plugin.json  │    │ 插件市场     │    │ 技能文件     │      │
│  │  (Manifest)  │    │ (Marketplace)│    │ (.skill)     │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 核心组件

| 组件 | 职责 | 文件 |
|------|------|------|
| 插件加载器 | 加载和解析插件 | `pluginLoader.ts` |
| 插件安装器 | 安装和卸载插件 | `pluginInstaller.ts` |
| 市场管理器 | 管理插件市场 | `marketplaceManager.ts` |
| 技能管理器 | 管理技能文件 | `skillLoader.ts`, `skillStore.ts` |

---

## 二、插件结构

### 2.1 插件清单

```typescript
export interface PluginManifest {
  name: string                // 插件名称
  version: string             // 版本号
  description: string         // 描述
  author: string              // 作者
  license?: string            // 许可证
  skills?: string[]           // 技能文件列表
  dependencies?: string[]     // 依赖插件
  tools?: PluginTool[]        // 自定义工具
  agents?: PluginAgent[]      // 自定义代理
}

export interface PluginTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: string             // 处理程序路径
}

export interface PluginAgent {
  id: string
  name: string
  description: string
  systemPrompt: string
}
```

### 2.2 插件目录结构

```
my-plugin/
├── plugin.json              # 插件清单
├── skills/                  # 技能目录
│   ├── skill1.skill         # 技能文件
│   └── skill2.skill
├── tools/                   # 工具目录（可选）
│   └── myTool.ts
└── agents/                  # 代理目录（可选）
    └── myAgent.ts
```

---

## 三、插件加载器

### 3.1 加载流程

```typescript
export interface LoadedPlugin {
  manifest: PluginManifest
  path: string
  loadedAt: number
}

export async function loadPlugin(pluginPath: string): Promise<LoadedPlugin | null> {
  // 1. 读取 plugin.json
  const manifestPath = join(pluginPath, 'plugin.json')
  if (!existsSync(manifestPath)) return null
  
  // 2. 解析清单
  const manifestContent = readFileSync(manifestPath, 'utf-8')
  const manifest = JSON.parse(manifestContent) as PluginManifest
  
  // 3. 验证清单
  if (!manifest.name || !manifest.version) {
    console.warn(`Invalid plugin manifest: ${pluginPath}`)
    return null
  }
  
  // 4. 加载技能
  await loadPluginSkills(manifest, pluginPath)
  
  // 5. 加载工具（如果有）
  await loadPluginTools(manifest, pluginPath)
  
  // 6. 加载代理（如果有）
  await loadPluginAgents(manifest, pluginPath)
  
  return { manifest, path: pluginPath, loadedAt: Date.now() }
}
```

### 3.2 批量加载

```typescript
export async function loadAllPlugins(): Promise<LoadedPlugin[]> {
  const plugins: LoadedPlugin[] = []
  const pluginDirs = await getPluginDirectories()
  
  for (const dir of pluginDirs) {
    const plugin = await loadPlugin(dir)
    if (plugin) {
      plugins.push(plugin)
    }
  }
  
  return plugins
}
```

---

## 四、插件安装器

### 4.1 安装流程

```typescript
export async function installPlugin(source: string): Promise<boolean> {
  // 1. 解析插件规格
  const spec = parsePluginSpec(source)
  
  // 2. 检查是否已安装
  if (isPluginInstalled(spec.name)) {
    console.warn(`Plugin ${spec.name} is already installed`)
    return false
  }
  
  // 3. 从市场获取插件
  const pluginInfo = await getPluginFromMarketplace(spec.name, spec.marketplace)
  
  // 4. 下载插件包
  const downloadPath = await downloadPlugin(pluginInfo)
  
  // 5. 解压到插件目录
  await extractPlugin(downloadPath, getPluginInstallDir(spec.name))
  
  // 6. 加载插件
  const plugin = await loadPlugin(getPluginInstallDir(spec.name))
  
  return plugin !== null
}
```

### 4.2 规格解析

```typescript
export interface PluginSpec {
  name: string
  marketplace?: string
  version?: string
}

export function parsePluginSpec(spec: string): PluginSpec {
  // 支持格式:
  // - name
  // - name@marketplace
  // - name@marketplace@version
  
  const parts = spec.split('@')
  
  if (parts.length === 1) {
    return { name: parts[0] }
  }
  
  if (parts.length === 2) {
    return { name: parts[0], marketplace: parts[1] }
  }
  
  return { name: parts[0], marketplace: parts[1], version: parts[2] }
}
```

### 4.3 卸载插件

```typescript
export async function uninstallPlugin(name: string): Promise<boolean> {
  const pluginDir = getPluginInstallDir(name)
  
  if (!existsSync(pluginDir)) {
    console.warn(`Plugin ${name} is not installed`)
    return false
  }
  
  // 删除插件目录
  await fs.rm(pluginDir, { recursive: true, force: true })
  
  // 从技能注册表中移除相关技能
  await removePluginSkills(name)
  
  return true
}
```

---

## 五、插件市场

### 5.1 市场定义

```typescript
export interface MarketplaceDefinition {
  id: string                  // 市场 ID
  name: string                // 显示名称
  url: string                 // API 地址
  description?: string        // 描述
}

export interface PluginInfo {
  name: string
  version: string
  description: string
  author: string
  downloads: number
  stars: number
  marketplace: string
  url: string
}
```

### 5.2 市场管理

```typescript
// 加载已知市场列表
export function loadKnownMarketplaces(): Record<string, MarketplaceDefinition>

// 添加自定义市场
export function addMarketplace(definition: MarketplaceDefinition): void

// 删除市场
export function removeMarketplace(id: string): boolean

// 搜索插件
export async function searchMarketplacePlugins(query: string): Promise<PluginInfo[]>

// 获取插件详情
export async function getPluginInfo(name: string, marketplace?: string): Promise<PluginInfo | null>
```

---

## 六、技能系统

### 6.1 技能文件格式

技能文件采用 YAML 格式：

```yaml
# example.skill
name: "Example Skill"
description: "An example skill"
category: "utility"
parameters:
  - name: "input"
    type: "string"
    description: "Input text"
    required: true
prompt: |
  Use this skill to do something.
  
  Parameters:
  - input: The input text
  
  Example:
  ```
  {"input": "hello"}
  ```
handler: |
  // JavaScript handler
  async function execute(input) {
    return {
      content: `Processed: ${input.input}`,
      success: true
    }
  }
```

### 6.2 技能接口

```typescript
export interface Skill {
  id: string                  // 技能 ID
  name: string                // 显示名称
  description: string         // 描述
  category: string            // 分类
  parameters: SkillParameter[] // 参数定义
  prompt: string              // 使用提示
  handler: SkillHandler       // 处理函数
  pluginName?: string         // 所属插件
}

export interface SkillParameter {
  name: string
  type: string
  description: string
  required: boolean
}

export type SkillHandler = (input: Record<string, unknown>) => Promise<SkillResult>

export interface SkillResult {
  content: string
  success: boolean
  error?: string
}
```

### 6.3 技能加载

```typescript
export async function discoverSkills(): Promise<Skill[]> {
  const skills: Skill[] = []
  
  // 1. 扫描内置技能目录
  const builtinSkills = await scanDirectory(getBuiltinSkillsDir())
  skills.push(...builtinSkills)
  
  // 2. 扫描插件技能目录
  const plugins = await loadAllPlugins()
  for (const plugin of plugins) {
    const pluginSkills = await getPluginSkillFiles(plugin)
    skills.push(...pluginSkills)
  }
  
  return skills
}

export function formatSkillsForPrompt(skills: Skill[]): string {
  return skills.map(skill => {
    return `## ${skill.name}\n${skill.description}\n\n${skill.prompt}`
  }).join('\n\n')
}
```

---

## 七、插件命令

### 7.1 命令列表

| 命令 | 说明 | 示例 |
|------|------|------|
| `/plugin list` | 列出已安装插件 | `/plugin list` |
| `/plugin install` | 安装插件 | `/plugin install my-plugin` |
| `/plugin uninstall` | 卸载插件 | `/plugin uninstall my-plugin` |
| `/plugin search` | 搜索插件 | `/plugin search code` |
| `/plugin info` | 查看插件信息 | `/plugin info my-plugin` |

### 7.2 技能命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/skill list` | 列出可用技能 | `/skill list` |
| `/skill search` | 搜索技能 | `/skill search format` |
| `/skill enable` | 启用技能搜索 | `/skill start` |
| `/skill disable` | 禁用技能搜索 | `/skill stop` |
| `/skill status` | 查看技能状态 | `/skill status` |

---

## 八、扩展机制

### 8.1 创建插件步骤

1. **创建插件目录**

```bash
mkdir my-plugin
cd my-plugin
```

2. **创建 `plugin.json`**

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "My first plugin",
  "author": "John Doe",
  "skills": ["hello.skill"]
}
```

3. **创建技能文件**

```yaml
# skills/hello.skill
name: "Hello World"
description: "Say hello to the world"
category: "fun"
parameters:
  - name: "name"
    type: "string"
    description: "Your name"
    required: false
prompt: "Use this skill to say hello."
handler: |
  async function execute(input) {
    const name = input.name || 'World'
    return {
      content: `Hello, ${name}!`,
      success: true
    }
  }
```

4. **安装插件**

```bash
/plugin install /path/to/my-plugin
```

### 8.2 添加自定义工具

```typescript
// my-plugin/tools/myTool.ts
import { buildStandardTool } from '../../Tool.js'

export const MyTool = buildStandardTool({
  name: 'MyTool',
  description: 'My custom tool',
  inputSchema: {
    type: 'object',
    properties: {
      param: { type: 'string' }
    }
  },
  prompt: 'Use this tool for something',
  async execute(context, input) {
    return {
      content: JSON.stringify(input),
      success: true
    }
  }
})
```

---

## 九、安全性考虑

### 9.1 权限隔离

| 限制 | 说明 |
|------|------|
| 文件系统访问 | 限制在插件目录内 |
| 网络访问 | 需要用户确认 |
| 命令执行 | 需要用户确认 |

### 9.2 沙箱机制

- 插件代码在隔离环境中执行
- 禁止访问敏感系统资源
- 限制文件系统访问范围

---

## 十、API 参考

### 10.1 插件加载器 API

| 函数 | 说明 |
|------|------|
| `loadPlugin()` | 加载单个插件 |
| `loadAllPlugins()` | 加载所有插件 |
| `getLoadedPlugins()` | 获取已加载插件 |
| `parsePluginSpec()` | 解析插件规格 |

### 10.2 插件安装器 API

| 函数 | 说明 |
|------|------|
| `installPlugin()` | 安装插件 |
| `uninstallPlugin()` | 卸载插件 |
| `isPluginInstalled()` | 检查插件是否安装 |

### 10.3 市场管理器 API

| 函数 | 说明 |
|------|------|
| `loadKnownMarketplaces()` | 加载市场列表 |
| `addMarketplace()` | 添加市场 |
| `removeMarketplace()` | 删除市场 |
| `searchMarketplacePlugins()` | 搜索插件 |
| `getAllMarketplacePlugins()` | 获取所有插件 |

### 10.4 技能管理器 API

| 函数 | 说明 |
|------|------|
| `discoverSkills()` | 发现所有技能 |
| `formatSkillsForPrompt()` | 格式化技能提示词 |
| `executeSkill()` | 执行技能 |
| `searchLocalSkills()` | 搜索本地技能 |

---

**文档版本**: v1.0  
**生成时间**: 2026-05-15