# 双轨记忆与 OpenClaw 官方记忆协同方案

> **文档性质**：设计说明与实施路线（**不含代码实现**）。  
> **依据来源**：（1）本仓库 `OpenClaw-him-memory` 既有 Skill 设计；（2）与 `telegrambot_template` 的对照结论；（3）Cursor 对话中关于「同构模板 / 13 项配置 / L1–L4」的讨论；（4）OpenClaw 官方文档所描述的工作区与记忆工具（仓库：[openclaw/openclaw](https://github.com/openclaw/openclaw)）。

---

## 1. 背景与目标（对话上下文摘要）

### 1.1 你要同时满足的三件事

| 诉求 | 含义 |
|------|------|
| **活人感** | 有情景摘要、长期关系事实、可选内心与自主 life tick，而不是「只有当前窗口」。 |
| **陪你玩游戏** | 通过 **Skill** 维护**角色扮演 / 游戏档**专用数据（与日常聊天可隔离）。 |
| **后续 OpenClaw 还记得** | 不仅存在于 Skill 的 `data/`，还要进入 **OpenClaw 默认会索引、会 `memory_search` / 会话注入** 的那套 **工作区记忆**（`MEMORY.md`、`memory/YYYY-MM-DD.md` 等），避免「卸了 Skill 就失忆」。 |

### 1.2 已识别的核心矛盾

- **Skill 的 `data/`** 对 OpenClaw **不是**默认真源；官方记忆真源在 **Agent workspace** 下的 Markdown（见官方 [Memory 概念](https://github.com/openclaw/openclaw/blob/main/docs/concepts/memory.md) 与 [Agent workspace](https://github.com/openclaw/openclaw/blob/main/docs/concepts/agent-workspace.md)）。
- **仅依赖** `query_cognitive_fs` 属于 **工具返回**，不等价于「已进入官方索引」；要与 **`memory_search`** 打通，必须把内容 **写入** 官方记忆路径或 `memorySearch.extraPaths` 所配置的范围（见 [Memory configuration reference](https://github.com/openclaw/openclaw/blob/main/docs/reference/memory-config.md)）。

### 1.3 本方案要回答的一句话

> **如何在「服用」OpenClaw 自带记忆系统的前提下，用 Skill 打游戏/RP，并让日后官方记忆里仍能检索到这些内容？**

答案是：**双轨写入 + 定期/事件驱动桥接 + 宿主编排**（见下文）。

---

## 2. OpenClaw 官方记忆：你需要「服用」的能力

以下与官方文档一致（实现细节以 [openclaw/openclaw](https://github.com/openclaw/openclaw) 为准）：

### 2.1 真源与布局

- **`memory/YYYY-MM-DD.md`**：按日追加；会话开始常读「今天 + 昨天」。
- **`MEMORY.md`**：策展长期记忆；**仅在主会话、私聊** 等上下文加载（群组策略不同）。
- 工作区另有 **`AGENTS.md` / `SOUL.md` / `USER.md`** 等启动注入文件，大文件有 **`bootstrapMaxChars`** 等截断（见 workspace 文档）。

### 2.2 工具

- **`memory_search`**：对已索引的 Markdown 片段做语义检索（可配向量/混合检索、QMD 等）。
- **`memory_get`**：按路径与行范围读取具体文件。

### 2.3 自动化

- 接近压缩时有 **memory flush**，提醒把耐久内容写入 `memory/YYYY-MM-DD.md`（见 Memory 概念页）。

**结论**：若你希望「以后 OpenClaw 还记得游戏与羁绊」，**最终要有可索引的 Markdown** 落在上述范围内（或 `extraPaths` 指向的目录）。

---

## 3. 本 Skill（OpenClaw-him-memory）在架构中的位置

### 3.1 Skill 当前强项

- **L1 式**：`dialogue_transcript.jsonl`（需稳定调用 `record_dialogue`）。
- **L2 式**：`episodic_snapshots.jsonl`（`summarize_episodic`，第三人称情景快照）。
- **L3 式**：`semantic_knowledge.md`（从快照抽取事实并合并为长期 md）。
- **自主**：`life_tick` + `autonomous_state.jsonl`（可配置静默时段；配置见 `companion-memory.config.json` / `CONFIG.md`）。
- **检索**：`query_cognitive_fs`（整份长期 md + 最近 N 条快照，**非**按 query 的智能检索）。

### 3.2 Skill 天然短板（与官方记忆的关系）

- **不会自动**把内容写进 `~/.openclaw/workspace` 下的 `MEMORY.md` / `memory/`。
- **`memory_search` 搜不到** Skill `data/` 里的文件，除非额外配置索引路径或桥接写入。

---

## 4. 推荐总体架构：「Skill 游戏档 + 官方记忆策展」

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway / Agent                       │
│  ┌──────────────┐    ┌─────────────────────────────────────────┐ │
│  │ 官方记忆层    │    │ Skill：openclaw-him-memory（游戏/RPG 档）  │ │
│  │ MEMORY.md    │◄───┤ 桥接：同步摘要/事实 → workspace MD        │ │
│  │ memory/*.md  │    │ data/: transcript / snapshots / semantic  │ │
│  │ memory_search│    │ query_cognitive_fs / life_tick / …        │ │
│  └──────────────┘    └─────────────────────────────────────────┘ │
│         ▲                              ▲                          │
│         │                              │                          │
│   索引 / 注入                    Cron / 每轮钩子调用               │
└─────────────────────────────────────────────────────────────────┘
```

**原则**：

1. **游戏进行时**：Skill 继续作为 **高频、结构化、可配置** 的「戏档大脑」。
2. **同一时期**：把「需要跨 Skill 生命周期保留」的内容 **蒸馏** 成短文，写入 **官方记忆 Markdown**。
3. **日常对话**：模型优先用 **`memory_search` + `memory_get`** 回忆；需要游戏细节时再调 Skill（或已同步后只搜官方层即可）。

---

## 5. 桥接策略（三选一或组合）

### 方案 A：同步写入工作区（推荐默认）

**做法**（逻辑描述）：

- 在每次 `summarize_episodic` **成功**后，或按 Cron（例如每小时），由 **宿主** 读取 Skill 返回的 `semantic_knowledge.md` 片段与/或「本轮新快照一句摘要」，**追加**到当日 `memory/YYYY-MM-DD.md`，并把「稳定设定」**合并**进 `MEMORY.md`（或让模型按 AGENTS 约定自己 `write` 文件——与官方「想记住就写下来」一致）。

**优点**：与官方 **`memory_search`** 路径一致；卸 Skill 后仍有 md。  
**缺点**：要控制 **重复写入**；需约定 **模板**（例如一节 `## RPG 档 · 当前世界状态`）。

### 方案 B：`memorySearch.extraPaths` 索引 Skill 的 md

**做法**：在 `openclaw.json` 中将 Skill 的 `data/`（或其中导出的 `*.md`）配入 **`agents.defaults.memorySearch.extraPaths`**（见官方 memory-config）。

**优点**：少一次复制，索引直达 Skill 目录。  
**缺点**：路径与权限要稳定；**jsonl 不会被默认 memory_search 索引**（官方默认 Markdown）；仍以 **导出 md** 为宜。

### 方案 C：仅游戏档用 Skill，日常只用官方

**做法**：两套 `dataDir`（配置里切换），游戏结束做一次 **「结业导出」** 长文写入 `MEMORY.md`。

**优点**：日常上下文干净。  
**缺点**：依赖你记得跑「结业」动作。

**建议**：**A 为主，B 可选（若你希望少一层复制）**，C 适合强分档用户。

---

## 6. 宿主层（OpenClaw）需要补齐的「自动化」

以下对应模板里「单进程写死」、在 OpenClaw 里要由 **规则 + Cron + 提示词** 承担的部分（**仍不写具体代码**，只列职责）：

| 自动化点 | 目的 |
|----------|------|
| **每轮或每条用户消息后** | 调用 `record_dialogue`；满足条数/时间条件时触发 `summarize_episodic`。 |
| **Cron** | `life_tick`；与 Skill `schedule` 对齐；多用户时 **每会话 `dataDir` 隔离**。 |
| **模型回复后** | 若实现「内心 OS」同构：解析内心与对外回复，调用 Skill 写 L4（见下文扩展）并只把对外回复发到频道。 |
| **桥接任务** | 将 Skill 产出 **同步**到 `MEMORY.md` / `memory/日期.md`（或触发 Agent 用 `write` 工具写入）。 |
| **系统提示（AGENTS.md / SOUL.md）** | 写明：**何时 `memory_search`、何时调本 Skill、游戏档命名规则、哪些内容必须写入官方记忆**。 |

官方仓库提供的 **Cron、webhook、多通道、skills** 等能力见 [README](https://github.com/openclaw/openclaw) 与文档索引；具体绑定方式以你本机 `openclaw.json` 与路由为准。

---

## 7. 「活人感」在双轨下的分工

| 能力 | 放 Skill | 放官方记忆 / 宿主 |
|------|-----------|-------------------|
| 高频内心 OS | ✅（若接好 L4 流水线） | 可选：摘要进当日 md |
| 第三人称情景快照 | ✅ `episodic_snapshots` | 桥接：一句「昨日剧情」进 `memory/*.md` |
| 长期关系事实 | ✅ `semantic_knowledge.md` | 桥接：同步到 `MEMORY.md` 对应章节 |
| 语义回忆 | ⚠️ 仅 `query_cognitive_fs` 整包 | ✅ **`memory_search` 为主** |
| 压缩前耐久写入 | — | ✅ 官方 **memory flush** 行为 |

---

## 8. 与「模板同构」路线图的关系（对话中已定方案，仅作索引）

此前在对话中整理的 **功能同构** 方向（L4 流水线、游标式摘要、`key_events` 级 L3、`search_memory`、life_tick 全链路+防刷+联网、分块注入、模型分工）见：

- 实施时应 **单独里程碑** 推进；  
- **本文件** 侧重 **OpenClaw 官方记忆与 Skill 的并存与桥接**；  
- 二者叠加后，才接近「模板级」体验 + 「OpenClaw 原生可检索」。

---

## 9. 风险与验收

| 风险 | 缓解 |
|------|------|
| 双真源漂移 | 规定 **唯一策展源**（建议：`MEMORY.md` 为对外回忆主源，Skill md 为游戏过程主源 + 定期合并） |
| Token 爆炸 | 桥接用 **短摘要**；全文留在 Skill；官方层只存 **可检索要点** |
| 忘记调 Skill | 宿主自动化 + AGENTS 强提示 |
| 群组泄露 | 官方文档：**`MEMORY.md` 不加载进群组**；游戏设定若敏感，桥接时 **分会话/分文件** |

**验收建议**：

1. 关闭或禁用 Skill 后，仅用 **`memory_search`** 仍能搜到游戏关键设定（说明桥接成功）。  
2. 新开会话，Block1/工作区加载后角色仍能 **接续** 关系事实。  
3. `life_tick` 不刷屏（冷却/上限在宿主或 Skill 扩展中落实）。

---

## 10. 文档维护

- **OpenClaw 版本升级**：核对 `docs/concepts/memory.md`、`docs/reference/memory-config.md` 是否有行为变更。  
- **本 Skill 升级**：核对 `SKILL.md`、`CONFIG.md` 与桥接字段名。

---

## 参考链接

- OpenClaw 仓库：<https://github.com/openclaw/openclaw>  
- 官方文档入口：仓库内 `docs/`（Memory、Agent workspace、Memory configuration、Skills 等）。

---

*本文档由项目维护者根据设计讨论整理，用于指导后续实现与宿主配置，非 OpenClaw 官方文档。*
