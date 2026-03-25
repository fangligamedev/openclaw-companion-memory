import {
  DEFAULT_COMPANION_MEMORY_CONFIG,
  buildRuntimeMemoryOverrides,
  loadAndResolveCompanionMemoryConfig,
  resolveCompanionDataDir,
} from './config/companionMemoryConfig';
import { StorageService } from './services/StorageService';
import { CognitiveProcessor } from './services/CognitiveProcessor';
import { AutonomousManager } from './services/AutonomousManager';
// 由于 @openclaw/sdk 在开发环境中缺失，我们在这里定义占位的接口类型以保证编译通过
export interface SkillContext {
    params: any;
    llm: any;
}
export interface SkillResult {
    success: boolean;
    message?: string;
    data?: any;
    error?: string;
}
export interface Skill {
    name: string;
    description: string;
    execute(ctx: SkillContext): Promise<SkillResult>;
}


/**
 * OpenClaw Cognitive Companion Memory System
 * 
 * 这是一套完全重构的基于文件系统的长短期记忆体系。
 * 核心目标在于为 OpenClaw 赋予超强的“活人感”与长周期的恋爱陪伴/游戏沉浸感体验：
 * 
 * 1. 自动对长对话进行情景切片（Summarize Episodic）。
 * 2. 提取出深刻的身份认同、双方承诺与作息偏好，合并进长效 Markdown 知识树中。
 * 3. 拥有后台运行的独立意识（Autonomous Manager），模拟 AI 自己在看视频、思考对方说过的话，从而自主发起真实的聊天邀约或小情绪。
 */
export default class CognitiveMemorySkill implements Skill {
  name = 'openclaw-him-memory';
  description = 'A cognitive, file-based memory system supporting semantic and episodic memory.';

  private storage: StorageService;
  private cognitive: CognitiveProcessor;
  private autonomous: AutonomousManager;

  constructor() {
    // 默认存放在项目的 data 目录下；真实 dataDir / 配置在每次 execute 时按 ctx 解析
    this.storage = new StorageService(undefined, DEFAULT_COMPANION_MEMORY_CONFIG);
    this.cognitive = new CognitiveProcessor(null, DEFAULT_COMPANION_MEMORY_CONFIG);
    this.autonomous = new AutonomousManager(
      this.storage,
      this.cognitive,
      null,
      DEFAULT_COMPANION_MEMORY_CONFIG,
    );
  }

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const { action, payload } = ctx.params;

    const dataDir = resolveCompanionDataDir(ctx.params);
    const memoryConfig = loadAndResolveCompanionMemoryConfig({
      dataDir,
      runtimeOverrides: buildRuntimeMemoryOverrides(ctx.params),
    });

    this.storage = new StorageService(dataDir, memoryConfig);
    this.cognitive = new CognitiveProcessor(ctx.llm, memoryConfig);
    this.autonomous = new AutonomousManager(this.storage, this.cognitive, ctx.llm, memoryConfig);

    switch (action) {
      case 'record_dialogue':
        this.storage.appendTranscript(payload.role, payload.content);
        return { success: true, message: 'Dialogue recorded.' };

      case 'summarize_episodic':
        // 定期打包历史对话（payload.limit 优先于配置 defaultSummarizeTranscriptLimit）
        const transcriptLimit = payload?.limit ?? memoryConfig.defaultSummarizeTranscriptLimit;
        const recentMessages = this.storage.getTranscript(transcriptLimit);
        const snapshotStr = await this.cognitive.summarizeEpisodic(recentMessages);
        this.storage.appendSnapshot({
            timestamp: new Date().toISOString(),
            snapshot: snapshotStr
        });
        
        // 同时提取语义知识并合并到 Markdown 知识库
        let finalSemanticMd = '';
        const newFacts = await this.cognitive.extractSemanticKnowledge(snapshotStr);
        if (newFacts.length > 0) {
            const existingMd = this.storage.readSemanticKnowledge();
            finalSemanticMd = await this.cognitive.consolidateKnowledgeTree(existingMd, newFacts);
            this.storage.writeSemanticKnowledge(finalSemanticMd);
        } else {
            finalSemanticMd = this.storage.readSemanticKnowledge();
        }

        // 方案A桥接写入：同步到官方工作区
        if (memoryConfig.enableWorkspaceBridge && memoryConfig.openclawWorkspaceDir) {
            try {
                this.storage.appendToWorkspaceDailyMemory(memoryConfig.openclawWorkspaceDir, snapshotStr);
                // 仅在有新知识更新时才重写全局 MEMORY.md
                if (newFacts.length > 0) {
                    this.storage.syncToWorkspaceGlobalMemory(memoryConfig.openclawWorkspaceDir, finalSemanticMd);
                }
            } catch (err) {
                console.error('[openclaw-him-memory] Workspace bridge sync error:', err);
            }
        }
        
        return { 
            success: true, 
            message: 'Snapshot and semantic knowledge updated.', 
            data: {
                snapshot: snapshotStr,
                semanticKnowledge: finalSemanticMd
            }
        };

      case 'life_tick':
        // 由 Cron 调用的自主思考与消息发送决策
        const decision = await this.autonomous.lifeTick(
            new Date(),
            new Date(payload.lastInteractionTime || Date.now()),
            payload.lastMessage || ''
        );
        return { success: true, data: decision };

      case 'query_cognitive_fs':
        // 提供给 Agent 的检索工具（payload.snapshotCount 优先于配置 querySnapshotCount）
        const knowledgeTree = this.storage.readSemanticKnowledge();
        const snapshotCount = payload?.snapshotCount ?? memoryConfig.querySnapshotCount;
        const recentSnaps = this.storage
          .getRecentSnapshots(snapshotCount)
          .map((s) => s.snapshot)
          .join('\n\n');
        return { 
            success: true, 
            data: { 
                longTermKnowledge: knowledgeTree, 
                shortTermSnapshots: recentSnaps 
            }
        };

      default:
        return { success: false, error: 'Unknown action type.' };
    }
  }
}
