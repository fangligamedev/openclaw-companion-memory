# 龙虾角色化记忆系统：实施检查清单（Implementation Checklist）

> 依据主规划 `LOBSTER_ROLE_MEMORY_MASTER_PLAN.md` 拆解的执行任务。
> 每个阶段完成对应打勾，便于跟踪进度。

## M0: 架构与规范冻结（已完成 ✅）

- [x] 确认真源规则：IM 正常通道 -> OpenClaw -> Skill 提炼 -> 桥接官方 `MEMORY.md`。
- [x] 冻结数据契约：`memory_item_id`, `scope`, `category`, `sync_state` 等字段。
- [x] 冻结冲突裁决：人工编辑优先，同级按时间戳覆盖，删除采用 tombstone。

## M1: 通道优先双轨最小闭环（核心入站/出站）

- [ ] **数据存储更新**：按契约新建/修改内部 JSONL 存储模型，支持 metadata 记录（游标、同步状态）。
- [ ] **改造入站 `record_dialogue`**：
  - 支持接收 `message_id`、`timestamp`、`channel`。
  - 支持更新处理游标 `last_processed_idx`。
- [ ] **桥接机制骨架**：
  - 编写将提炼结果推送到官方 `MEMORY.md` 或 `memory/YYYY-MM-DD.md` 的抽象逻辑（例如输出需追加的 Markdown 补丁，交由宿主执行）。
- [ ] **M1 验证**：
  - 聊天记录在 Skill 中成功入库，且能产出目标 Markdown 补丁。
  - 关闭 Skill 后，人工能查阅 OpenClaw 的 `MEMORY.md`。

## M2: L3 事件槽位与提炼治理

- [ ] **改造 `summarize_episodic`**：
  - 从“末尾取 N 条”改为“从游标起取满 `summary_interval` 批次”。
  - 不足阈值时中止执行。
- [ ] **事件抽取与去重**：
  - 增加 `dedup_events` 逻辑（比对新抽取事件与已有事件库）。
  - 处理更新（update）与跳过（skip）逻辑。
- [ ] **事件规模压缩**：
  - 增加超量（如 60 条）自动使用 LLM 压缩回 50 条的逻辑。
- [ ] **M2 验证**：
  - 发送大量冗余聊天，事件库不会无限制膨胀，会成功压缩/去重。

## M3: life_tick 全链路与防刷

- [ ] **静默与安全窗口更新**：
  - 完善 `companionMemoryConfig`，确保 `lifeTickQuietNightStartHour` 的哨兵规则（如 24 禁用）被正确解析。
- [ ] **防刷控制实现**：
  - 本地缓存 `last_proactive_ts` 与当日主动次数。
  - 增加与 `PROACTIVE_COOLDOWN`、`PROACTIVE_DAILY_MAX` 的对比拦截逻辑。
- [ ] **决策产出**：
  - 模型生成 JSON 后，分离“内部记录日志”与“返回给宿主的发送草稿”。
- [ ] **M3 验证**：
  - 连续调用 `life_tick`，前 N 次被拦截，只记日志不产出 message_intent。

## M4: L4 内心 OS（可选，活人感增强）

- [ ] **格式解析**：
  - 在 `record_dialogue(assistant)` 拦截器中，解析 `[内心OS]` 与 `[回复]`。
- [ ] **分离存储**：
  - `[内心OS]` 存入专用存储（如 `internal_monologue.jsonl`）。
- [ ] **低敏桥接**：
  - 将近期 OS 提炼为情绪倾向，作为桥接内容更新至官方日志。
- [ ] **M4 验证**：
  - 模型同时输出内外文案，用户不可见内心部分，但内心内容参与后续摘要。

## M5: 检索策略与注入（与宿主协作）

- [ ] **三级检索工具定义**：
  - 在 `SKILL.md` 中定义 `search_memory` 工具，带 `level`（summary/detail/thoughts）与 `query` 参数。
- [ ] **检索工具实现**：
  - 按关键词/子串扫描对应 L1/L2/L4 文件。
- [ ] **M5 验证**：
  - LLM 决定回忆具体细节时，成功调用并返回带时间戳的匹配片段。
