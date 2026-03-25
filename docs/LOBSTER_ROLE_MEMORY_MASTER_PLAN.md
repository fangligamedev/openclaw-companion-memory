# 龙虾角色化记忆系统：完整规划（主方案 V2）

> 文档性质：实施蓝图（不含代码实现）。
> 目标：在复用 OpenClaw 官方记忆系统的前提下，实现游戏/RP 场景的高活人感、双轨记忆、可持续回忆。
> 参考：OpenClaw 仓库与官方 docs（memory / workspace / memory-config）。

---

## 0. 一句话架构

**IM/WebChat 正常对话通道作为事实主入口**，先进入 OpenClaw 原生会话与记忆链路；
Skill 负责角色化提炼（事件槽位、情绪状态、内心OS、自主 life tick）；
再把可长期保留的结果桥接到 OpenClaw 工作区记忆（`MEMORY.md` + `memory/YYYY-MM-DD.md`）。

---

## 1. 目标与非目标

### 1.1 目标

- 活人感：角色有连续的情绪、关系事实、阶段性剧情、可选内心独白。
- 游戏可玩性：支持 RPG/陪玩多轮剧情，并可按“世界线/存档位”管理。
- 可持续回忆：关闭或卸载 Skill 后，OpenClaw 仍能通过 `memory_search` 召回关键设定。
- 安全可控：多会话不串档，群聊不泄露，主动消息防刷。

### 1.2 非目标

- 本阶段不追求复杂向量检索替换官方 memory_search。
- 本阶段不做 UI 产品化，仅定义宿主编排与数据契约。

---

## 2. 真源模型（必须先定）

### 2.1 三类“权威”

1. **Authoritative for Ingestion（事实入口主通道）**
   - IM/WebChat 正常消息流（用户/助手每条消息都先过 OpenClaw 标准会话）。
2. **Authoritative for Recall（对外回忆主源）**
   - OpenClaw 工作区记忆：`MEMORY.md`、`memory/YYYY-MM-DD.md`（由官方机制索引/检索）。
3. **Authoritative for Role Dynamics（角色行为主源）**
   - Skill 的结构化记忆（事件槽位、情绪状态、life tick 状态、可选内心OS）。

> 解释：Skill 不是“原始事实真源”，而是“角色化提炼与控制层”。

### 2.2 冲突裁决矩阵

- **人工编辑 > 自动归档**（最高优先级）。
- **同级自动冲突**：`updated_at` 新者优先。
- **生活态 vs 游戏态**：默认不可互相覆盖；仅同 scope 下覆盖。
- **删除策略**：默认 tombstone（墓碑），不直接硬删；支持回溯。

### 2.3 作用域（scope）

- `global`：长期稳定身份与关系锚点。
- `game_profile`：某个游戏世界线/存档位专属记忆。
- `channel_session`：某渠道/会话上下文短期记忆。

---

## 3. 目标架构（双轨）

### 3.1 数据层

- OpenClaw 官方层（可检索主层）
  - `MEMORY.md`：长期策展。
  - `memory/YYYY-MM-DD.md`：日记流、阶段记录。
- Skill 层（角色化增强层）
  - L1：对话归档（append-only）
  - L2：情景快照（episodic）
  - L3：关键事件槽位（key_events）
  - L4：内心OS（可选）
  - Life：自主状态与主动消息决策日志

### 3.2 处理层

- 宿主编排（OpenClaw）
  - 每条消息后触发：记录 -> 条件摘要 -> 桥接
  - Cron 触发：life_tick -> 防刷判断 -> 可选发送
- Skill 引擎
  - 提炼、去重、事件槽位合并、角色状态更新

### 3.3 检索层

- 默认回忆：`memory_search` / `memory_get`（官方）
- 角色细节：Skill `search_memory` / `query`（补充路径）

---

## 4. 数据契约（建议最小字段）

为避免“写得进但管不住”，统一 MemoryItem 契约（文本规范即可）：

- `memory_item_id`：稳定唯一ID（幂等与更新必需）
- `scope`：`global|game_profile|channel_session`
- `source`：`channel_ingest|skill_extract|manual`
- `category`：关系里程碑/偏好/承诺/情绪事件/剧情节点等
- `content`：可检索文本（短而具体）
- `confidence`：提取置信度（0-1）
- `sensitivity`：`safe_dm|private|never_group`
- `updated_at` / `created_at`
- `status`：`active|tombstone`
- `sync_state`：`NEW|BRIDGED|INDEXED|VERIFIED|FAILED`
- `sync_hash`：防重复写入

---

## 5. 通道优先的处理流水线（核心）

### 5.1 入站（每条用户消息）

1. 用户经 IM/WebChat 发消息 -> OpenClaw 会话接收
2. 消息写入会话与官方日记（按既有机制）
3. 宿主调用 Skill：`record_dialogue(user)`
4. 判断是否达摘要触发条件（见 6）

### 5.2 出站（每条助手回复）

1. 模型产出回复（可含内心OS标记）
2. 对外发送前/后，宿主调用 Skill：`record_dialogue(assistant)`
3. 若启用 L4：解析内心OS，写入 L4 存储
4. 触发桥接任务（异步）

### 5.3 桥接（Skill -> 官方记忆）

- 仅桥接“可长期保留”的内容：关键事件、稳定偏好、剧情节点
- `memory/YYYY-MM-DD.md`：追加“当日剧情摘要”
- `MEMORY.md`：合并“长期稳定事实”
- 采用 `memory_item_id + sync_hash` 幂等，避免重复写入

---

## 6. 摘要与事件提取策略（同构模板能力）

### 6.1 摘要触发（游标语义）

- 使用 `last_processed_idx` 或等效游标
- 达阈值 `summary_interval`（建议初始 60）才触发一批摘要
- 不足阈值不提炼，防止碎片化

### 6.2 L3 关键事件槽位

- 从批次摘要抽取 key_events（结构化）
- 去重/更新：同义事件合并，信息增量覆盖旧版本
- 条数治理：超过上限（如 60）自动压缩至目标（如 50）

### 6.3 L4 内心OS（可分期）

- V1 可先关闭；V2 再启用
- 启用时明确：内心OS默认不桥接到公开记忆，仅提炼为低敏摘要

---

## 7. 检索策略与注入策略

### 7.1 检索优先级

1. 官方 `memory_search`（默认）
2. 命中不足时调用 Skill 补充检索
3. 仍不足时向用户澄清

### 7.2 主对话注入分块

- Block A（稳定层）：角色身份 + 长期关键事件（来自 `MEMORY.md`）
- Block B（动态层）：最近剧情摘要 + 最近 life 状态
- Block C（时态层）：当前时间/时区、会话上下文

### 7.3 预算控制

- 每块设置字符/token上限
- 过长时优先保留近期剧情和高置信事件

---

## 8. life_tick 全链路（含防刷）

### 8.1 决策链

- 定时触发 -> 读取最近状态 -> 生成活动与情绪 -> 判断是否主动消息
- 若有 `search_query`，可选联网补充活动细节

### 8.2 防刷规则

- 最小冷却间隔（如 90 分钟）
- 每日主动上限（如 3~5）
- 深夜静默窗口（可配置）
- 达限制时只记日志不发消息

### 8.3 安全策略

- 群聊默认不主动打扰
- 高敏内容不经主动消息发送

---

## 9. OpenClaw 宿主层职责清单

- 路由：确保游戏对话走正常 IM/WebChat 通道
- 自动化：每条消息后的 Skill 调用链
- 定时：Cron 驱动 life_tick
- 桥接：将 Skill 的长期结果写入官方记忆
- 提示词：在 AGENTS/SOUL 中声明检索与写记忆策略
- 多会话隔离：按 agent/channel/peer/game_profile 生成独立键

---

## 10. 配置分层建议

### 10.1 Skill 层（角色化控制）

- 13 个现有标量（摘要窗口、快照条数、温度、静默时段等）
- 补充：summary_interval、key_event_cap、dedup_mode、l4_enabled

### 10.2 宿主层（平台控制）

- 通道路由策略、Cron、群聊策略
- memorySearch 配置（provider、extraPaths、limits）
- 安全策略（DM/群组访问）

---

## 11. 分阶段实施计划（只计划）

### 阶段 M0：规范冻结（1~2 天）

- 冻结真源规则、冲突矩阵、scope 规则、契约字段
- 产出：本文件 + 配置字段清单

### 阶段 M1：通道优先双轨最小闭环（3~5 天）

- 打通“正常消息 -> Skill记录 -> 官方记忆桥接（最小）”
- 验收：禁用 Skill 后仍可在官方 `memory_search` 召回关键事件

### 阶段 M2：L3 事件槽位治理（3~5 天）

- 去重、更新、上限压缩
- 验收：重复剧情不会无限膨胀

### 阶段 M3：life_tick 防刷与可选联网（3~4 天）

- 冷却/上限/静默生效
- 验收：7天运行不刷屏

### 阶段 M4：L4 内心OS（可选，4~6 天）

- 内心抽取、隔离存储、低敏桥接策略
- 验收：活人感提升且无隐私越界

### 阶段 M5：优化与观测（持续）

- 指标、报警、回滚、成本优化

---

## 12. 验收指标（上线前必须达标）

### 12.1 功能指标

- 关键设定召回成功率 >= 85%
- 桥接幂等重复率 <= 1%
- 多会话串档率 = 0

### 12.2 体验指标

- 用户“你还记得吗”场景命中率持续提升
- 主动消息打扰率可控（被用户标记“打扰”的比例下降）

### 12.3 运维指标

- 桥接失败重试成功率 >= 99%
- 关键任务失败可观测（日志 + 失败队列）

---

## 13. 风险、回滚、应急

- 风险：双真源漂移、重复写入、群聊泄露、token 失控
- 回滚：可关闭桥接，仅保留通道入档；可关闭 life_tick 主动发送
- 应急：桥接任务失败时进入 dead-letter 队列，人工重放

---

## 14. 本文档之后应补的附录（建议）

- 附录 A：字段字典（每字段含义、示例）
- 附录 B：冲突矩阵详细表（字段级）
- 附录 C：测试用例清单（happy path / fail path）
- 附录 D：运营手册（如何查看桥接状态、如何手动修复）

---

## 15. 关键结论

你提出的“**IM/WebChat 正常通道先入 OpenClaw，再 Skill 做角色化提炼**”是正确方向。
这会把“官方可检索记忆”与“游戏活人感增强”统一到一个可持续体系里，避免后期记忆分裂。

---

## 参考

- OpenClaw 仓库与文档：
  - https://github.com/openclaw/openclaw
  - 仓库内 docs（memory / agent-workspace / memory-config）
