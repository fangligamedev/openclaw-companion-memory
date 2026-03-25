# OpenClaw 宿主侧：编排与配置蓝图（Host Config Plan）

> 依据主规划，Skill 只负责“算”，OpenClaw 宿主必须配合负责“跑”。
> 本文件定义了在 OpenClaw (网关/路由) 层需要设置的自动化与配置。

## 1. 拦截器与路由配置 (Webhook / Middleware)

### 1.1 入站消息拦截（User）
- **触发时机**：每条用户消息进入 OpenClaw 并完成官方存储后。
- **宿主动作**：
  1. 调用 Skill：`record_dialogue(role="user", ...)`。
  2. 调用 Skill：`check_and_summarize()`（触发批处理检查）。

### 1.2 出站消息拦截（Assistant）
- **触发时机**：模型生成完成，**发送给通信渠道前**。
- **宿主动作**：
  1. 获取生成全文。
  2. 若启用了 L4，执行拆分（或交由 Skill 拆分），提取 `[内心OS]` 与 `[回复]`。
  3. 调用 Skill：`record_dialogue(role="assistant", ...)`，将完整上下文入档。
  4. 仅将 `[回复]` 发送至 Telegram/微信/WebChat。

## 2. 系统提示词拼装 (AGENTS.md / Context Builder)

为保证模型每轮都有“双轨”知识，宿主必须在消息上下文中编排以下块：

### 2.1 Block 1：稳定层 (Cacheable)
- **来源**：OpenClaw 官方 `MEMORY.md`。
- **内容**：角色身份、长期设定、已桥接的里程碑事件。
- **配置**：对支持 Prompt Caching 的模型标记 `ephemeral`。

### 2.2 Block 2：动态层
- **来源**：调用 Skill 获取（或读工作区）。
- **内容**：最近的 `episodic` 剧情摘要 + 最近几次的 `life_tick` 状态 + 最近内心。

### 2.3 Block 3：时态层
- **来源**：宿主环境变量。
- **内容**：当前具体时间（如 2026-03-22 14:00）、本地时区。

## 3. 定时任务配置 (Cron)

### 3.1 主动 Life Tick
- **调度**：建议 `0 * * * *` (每小时触发) 或每 30 分钟。
- **宿主动作**：
  1. 调用 Skill `life_tick` 接口。
  2. 若返回 `should_message == true` 且有文案，宿主负责将文案投递至活跃的聊天渠道。

### 3.2 官方 Memory Flush
- **调度**：按官方上下文压缩前（`agents.defaults.compaction.memoryFlush`）。
- **宿主动作**：
  - 确保该官方机制正常运作，将耐久短句写进当日 Markdown。

## 4. 工具暴露配置 (SKILL.md)

确保以下工具在工作区内被 OpenClaw 识别且不冲突：

- `memory_search` (官方工具：用于大范围语义回忆)
- `skill_search_memory` (如果你们提供，用于具体游戏档的精确匹配)

## 5. 多会话隔离 (Sandboxing & Namespacing)

- 若在一个 OpenClaw 网关上跑多用户：
  - **路径映射**：`dataDir` 必须动态绑定到 `~/.openclaw/workspace/user_A/skills/...`。
  - **键控**：在传参时带入 `session_id`，防止张三的事件混进李四的快照中。

## 6. 模型策略配置 (openclaw.json)

- `modelMain`：如 Opus / 强力大模型（用于聊天主链路与内心模拟）。
- `modelSummary`：如 Sonnet / 高效性价比模型（用于摘要、去重、事件抽取）。
- `modelTick`：Life_tick 决策（通常与 Summary 相同）。
- `modelCheap`：如 Haiku（预留：辅助清理、搜索结果整理）。
