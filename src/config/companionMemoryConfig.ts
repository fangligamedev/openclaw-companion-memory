import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

/**
 * 陪伴记忆技能 — 全部可调标量配置的 Schema（与 DEFAULT 一一对应）。
 * 使用 zod 在启动/每次 execute 时校验，避免 JSON 手滑写成字符串导致静默错误。
 */
export const CompanionMemoryConfigSchema = z.object({
  defaultSummarizeTranscriptLimit: z.number().int().positive().max(2000),
  querySnapshotCount: z.number().int().min(0).max(100),
  lifeTickAutonomousStateCount: z.number().int().min(0).max(50), // 0 = 不在 prompt 中附带历史自主状态
  /**
   * 本地时间小时；`getHours() >= 该值` 时进入夜间休眠。
   * **24** 表示不启用「夜间」这一支（仅保留清晨支路 `lifeTickQuietMorningEndHour`）。
   */
  lifeTickQuietNightStartHour: z.number().int().min(0).max(24),
  /** 本地时间小时 0–23；当前小时 < 该值时视为「清晨休眠」，不跑 life_tick 主逻辑 */
  lifeTickQuietMorningEndHour: z.number().int().min(0).max(23),
  temperatureEpisodicSummarize: z.number().min(0).max(2),
  temperatureSemanticExtract: z.number().min(0).max(2),
  temperatureConsolidateKnowledge: z.number().min(0).max(2),
  temperatureLifeTick: z.number().min(0).max(2),
  storageDefaultTranscriptLimit: z.number().int().positive().max(2000),
  storageDefaultSnapshotLimit: z.number().int().positive().max(500),
  storageDefaultMonologueLimit: z.number().int().positive().max(500),
  storageDefaultAutonomousStateLimit: z.number().int().positive().max(200),
});

export type CompanionMemoryConfig = z.infer<typeof CompanionMemoryConfigSchema>;

/**
 * 代码内默认值（与 `data/companion-memory.config.example.json`、SKILL.md 的 config 块应对齐）。
 * 每一项上方注释说明：**调大/调小对行为与成本的影响**。
 */
export const DEFAULT_COMPANION_MEMORY_CONFIG: CompanionMemoryConfig = {
  /**
   * `summarize_episodic` 在 **未** 传 `payload.limit` 时，从 `dialogue_transcript.jsonl` 末尾取多少条消息做「情景快照」。
   * - **调大**：单次归档看到的上下文更长，快照更易连贯，但 **Token 与费用上升**，且容易把多主题糊成一段。
   * - **调小**：更省、更快，但可能截断刚展开的剧情，长期记忆提取变「碎」。
   */
  defaultSummarizeTranscriptLimit: 50,

  /**
   * `query_cognitive_fs` 返回时，拼接多少条 **最近** 的 episodic 快照（按 jsonl 追加顺序取尾部）。
   * - **调大**：回忆近期剧情更全，**工具返回体积与上下文占用**明显上升；旧快照与语义 md 可能重复。
   * - **调小**：更省上下文，只保留最近几段「日记感」；设为 0 则只返回长期 md、不附带快照。
   */
  querySnapshotCount: 3,

  /**
   * `life_tick` 拼进系统提示里、代表「最近自主状态」的条数（从 `autonomous_state.jsonl` 尾部取）。
   * - **调大**：角色「最近在干嘛」的连续性更强，**prompt 更长**；过久的状态可能干扰当前决策。
   * - **调小**：更聚焦当下，但容易丢掉刚发生过的小情绪链。
   */
  lifeTickAutonomousStateCount: 3,

  /**
   * **夜间休眠起点**（含）：`getHours() >= lifeTickQuietNightStartHour` 时视为休眠，只写一条 dormant 占位，不调用大模型。
   * 默认 23 表示 23:00–23:59 不跑主 tick（与清晨支路一起覆盖「深夜」）。
   * 设为 **24** 可关闭夜间支路（自动化测试或希望全天候跑 tick 时使用）。
   * - **调小**（如 21）：晚上更早进入休眠，**更少夜间主动消息 / 更少夜间费用**。
   */
  lifeTickQuietNightStartHour: 23,

  /**
   * **清晨休眠结束点前**均休眠：`getHours() < lifeTickQuietMorningEndHour` 时不跑主 tick。
   * 默认 7 表示 0–6 点为休眠。
   * - **调大**：早上更晚才允许 life_tick，适合「角色睡懒觉」或减少晨间打扰。
   * - **调小**：更早开始允许后台思考（**费用可能增加**）。
   */
  lifeTickQuietMorningEndHour: 7,

  /**
   * 生成 **情景快照**（第三人称日记）时的采样温度。
   * - **调高**：措辞更飘、细节更「编」，活人感可能增强，但 **事实稳定性下降**。
   * - **调低**：更稳、更贴对话原文，但可能略「报告体」。
   */
  temperatureEpisodicSummarize: 0.3,

  /**
   * 从快照 **抽取结构化语义事实**（写入 md 前的 JSON 推理）的温度。
   * - **调高**：可能多提、提偏类别，需靠下游 consolidate 纠偏；**JSON 解析失败率**可能升。
   * - **调低**：更保守，可能漏掉微妙情绪类事实。
   */
  temperatureSemanticExtract: 0.2,

  /**
   * **合并进 semantic_knowledge.md** 时的温度（整树重写）。
   * - **调高**：Markdown 结构或措辞波动大，偶发改坏标题层级。
   * - **调低**：更 Deterministic，适合长期稳定存档（**推荐保持较低**）。
   */
  temperatureConsolidateKnowledge: 0.1,

  /**
   * `life_tick` 决策 JSON（activity / should_message 等）的采样温度。
   * - **调高**：主动发言意图更「跳」、更戏剧化；**不符合人设风险**上升。
   * - **调低**：更稳、重复套路感可能增强。
   */
  temperatureLifeTick: 0.7,

  /**
   * `StorageService.getTranscript()` **未传 limit** 时的默认条数（内部或未来调用兜底）。
   * - **调大**：默认拉更长历史；若误调用未传 limit，**单次 IO/内存**变大。
   * - **调小**：更短；与 `defaultSummarizeTranscriptLimit` 无强制相等，二者语义不同（一个为存储层默认，一个为归档动作默认）。
   */
  storageDefaultTranscriptLimit: 20,

  /**
   * `getRecentSnapshots()` **未传 limit** 时的默认条数（当前主路径一般由 `querySnapshotCount` 显式传入）。
   * - 保留给未来「只读最近快照」类 API 或遗漏传参时的行为定义。
   */
  storageDefaultSnapshotLimit: 10,

  /**
   * `getRecentMonologues()` 未传 limit 时的默认条数（主流程尚未使用，预留给内心 OS）。
   */
  storageDefaultMonologueLimit: 10,

  /**
   * `getRecentAutonomousStates()` 未传 limit 时的默认条数（life_tick 主路径使用 `lifeTickAutonomousStateCount` 覆盖）。
   */
  storageDefaultAutonomousStateLimit: 5,
};

const CONFIG_FILENAME = 'companion-memory.config.json';

export type CompanionMemoryConfigInput = Partial<CompanionMemoryConfig> | undefined;

/** 与 SKILL.md `config` 块、JSON 文件字段名一致（供宿主扁平注入 ctx.params） */
export const COMPANION_MEMORY_FLAT_KEYS = [
  'defaultSummarizeTranscriptLimit',
  'querySnapshotCount',
  'lifeTickAutonomousStateCount',
  'lifeTickQuietNightStartHour',
  'lifeTickQuietMorningEndHour',
  'temperatureEpisodicSummarize',
  'temperatureSemanticExtract',
  'temperatureConsolidateKnowledge',
  'temperatureLifeTick',
  'storageDefaultTranscriptLimit',
  'storageDefaultSnapshotLimit',
  'storageDefaultMonologueLimit',
  'storageDefaultAutonomousStateLimit',
] as const satisfies readonly (keyof CompanionMemoryConfig)[];

/**
 * 从 `ctx.params` 上剥离 13 个标量（若宿主把 SKILL 的 config 摊平到与 action 同级）。
 * 优先级低于 `ctx.params.companionMemory` 对象（后者适合一次性实验性覆盖）。
 */
export function extractCompanionMemoryFromFlatParams(
  params: Record<string, unknown> | undefined,
): Partial<CompanionMemoryConfig> {
  if (!params) return {};
  const out: Partial<CompanionMemoryConfig> = {};
  for (const key of COMPANION_MEMORY_FLAT_KEYS) {
    const v = params[key];
    if (v !== undefined && v !== null) {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}

/** 扁平 SKILL 字段 + `companionMemory` 对象合并为一次运行时覆盖（后者覆盖前者） */
export function buildRuntimeMemoryOverrides(ctxParams: Record<string, unknown> | undefined): CompanionMemoryConfigInput {
  if (!ctxParams) return undefined;
  const flat = extractCompanionMemoryFromFlatParams(ctxParams);
  const rawNested = ctxParams.companionMemory;
  const nested =
    rawNested && typeof rawNested === 'object' && !Array.isArray(rawNested)
      ? stripUndefined(rawNested as Record<string, unknown>)
      : {};
  return { ...flat, ...nested };
}

/**
 * 合并顺序（后者覆盖前者）：
 * 1. DEFAULT_COMPANION_MEMORY_CONFIG
 * 2. `{dataDir}/companion-memory.config.json`（若存在且可解析）
 * 3. runtimeOverrides：`ctx.params` 上 **扁平的 13 个字段**（与 SKILL config 同名）与/或 `ctx.params.companionMemory` 对象（**后者覆盖前者**）
 *
 * **加载时机**：本技能在 **每次 `execute()`** 时重新解析（并读 JSON），
 * 便于你改配置文件后立即生效、调试记忆效果，无需重启进程。
 * 若日后需要优化性能，可改为按 `mtime` 缓存。
 */
export function loadAndResolveCompanionMemoryConfig(options: {
  dataDir: string;
  runtimeOverrides?: CompanionMemoryConfigInput;
}): CompanionMemoryConfig {
  const filePath = path.join(options.dataDir, CONFIG_FILENAME);
  let fromFile: CompanionMemoryConfigInput = undefined;
  if (fs.existsSync(filePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
      fromFile = raw as CompanionMemoryConfigInput;
    } catch (e) {
      console.error(`[openclaw-him-memory] Failed to read or parse ${filePath}:`, e);
    }
  }

  const merged = {
    ...DEFAULT_COMPANION_MEMORY_CONFIG,
    ...stripUndefined(fromFile),
    ...stripUndefined(options.runtimeOverrides),
  };

  return CompanionMemoryConfigSchema.parse(merged);
}

function stripUndefined<T extends Record<string, unknown>>(obj: T | undefined): Partial<T> {
  if (!obj || typeof obj !== 'object') return {};
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** 解析 data 目录：优先 `ctx.params.dataDir`，否则 `process.cwd()/data` */
export function resolveCompanionDataDir(ctxParams: { dataDir?: string } | undefined): string {
  const raw = ctxParams?.dataDir;
  if (raw && typeof raw === 'string' && raw.trim() !== '') {
    return path.resolve(raw.trim());
  }
  return path.join(process.cwd(), 'data');
}
