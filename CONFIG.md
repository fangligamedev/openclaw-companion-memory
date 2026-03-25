# 陪伴记忆技能 — 配置说明

## TypeScript / Node 项目里「配置文件」常见惯例

| 形式 | 典型用途 |
|------|----------|
| `*.config.ts` / `*.config.mts` | 构建工具链（Vite、Vitest、Playwright）——**可执行**、可引用类型与常量。 |
| `*.config.json` / `name.config.json` | 运行时或工具（Prettier、部分 ESLint）——**纯数据**、易手写、无注释。 |
| `.env` / `.env.local` | **密钥与部署差异**，不宜进 Git；不适合存一长串结构化调参。 |
| `config/default.json` 等 | 服务端常见分层默认 + 环境覆盖。 |

本技能选用 **`{dataDir}/companion-memory.config.json`** 的原因：

1. **与数据同源**：记忆文件（`semantic_knowledge.md`、各 `.jsonl`）已在 `dataDir`；把调参 JSON 放在同一目录，备份/迁移/多档角色时 **一整文件夹带走** 即可。
2. **无需编译**：Skill 分发后用户只改 JSON 就能调试，不必改 TS 再 `npm run build`。
3. **可被 JSON Schema / zod 校验**：启动或每次 `execute` 时解析，打错字段会报错而不是静默跑偏。

## 为什么之前提到过 SKILL.md 的 `config` 块？

OpenClaw 的 Skill 清单（`SKILL.md` 前置 YAML）里的 **`config:`** 是 **给宿主/控制面用的声明**：有哪些可配项、类型、说明，便于 **安装向导或 UI** 生成表单，并把值注入运行时。

它与磁盘上的 `companion-memory.config.json` **不是二选一**，而是两层：

- **SKILL.md `config`**：告诉 OpenClaw「这些键存在、含义是什么」（**契约 / 文档化**）。
- **`companion-memory.config.json`**：在你机器上 **真实生效的数值**（尤其方便本地反复改、做 A/B）。

运行时合并顺序见 `src/config/companionMemoryConfig.ts` 内 `loadAndResolveCompanionMemoryConfig` 注释。

宿主若将 Skill 配置以 `ctx.params.companionMemory`（部分字段）传入，会 **覆盖** JSON 文件中的同名字段，便于单次会话实验。

## 配置何时加载？

- **每次** `execute()` 都会调用 `loadAndResolveCompanionMemoryConfig`：会重新读取 `{dataDir}/companion-memory.config.json`（若存在）。
- 因此 **不是**「进程启动只读一次」；你改 JSON 后 **下一次技能调用** 即生效（无需重启 Gateway），适合调记忆效果。
- 若将来调用极频繁且需要优化，可再改为按文件 `mtime` 缓存。

## 全部 15 个标量

字段含义与调参影响以源码为准：`src/config/companionMemoryConfig.ts` 中 `DEFAULT_COMPANION_MEMORY_CONFIG` 的 JSDoc。

**补充1（睡眠设置）**：`lifeTickQuietNightStartHour` 设为 **24** 表示关闭「到点进入夜间休眠」这一支（`getHours()` 最大为 23，条件永不成立）；配合 `lifeTickQuietMorningEndHour: 0`（没有小时 &lt; 0）可在测试或特殊场景下让 `life_tick` 全天候可执行。

**补充2（官方记忆桥接）**：`enableWorkspaceBridge` 设为 `true` 且配置 `openclawWorkspaceDir` 后，`summarize_episodic` 执行完毕会自动向 OpenClaw 官方 Workspace 同步写入 `memory/YYYY-MM-DD.md`（日记快照）以及 `MEMORY.md`（长期语义记忆块），实现双轨记忆无缝衔接（方案 A）。

示例拷贝：`data/companion-memory.config.example.json` → 复制为 `data/companion-memory.config.json` 后按需修改。
