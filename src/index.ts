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
    // 默认存放在项目的 data 目录下
    this.storage = new StorageService();
    // 占位，等待 execute 时注入真实的 llm 供应商
    this.cognitive = new CognitiveProcessor(null);
    this.autonomous = new AutonomousManager(this.storage, this.cognitive, null);
  }

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const { action, payload } = ctx.params;

    // 注入当前上下文的 LLM 实例
    this.cognitive = new CognitiveProcessor(ctx.llm);
    this.autonomous = new AutonomousManager(this.storage, this.cognitive, ctx.llm);

    switch (action) {
      case 'record_dialogue':
        this.storage.appendTranscript(payload.role, payload.content);
        return { success: true, message: 'Dialogue recorded.' };

      case 'summarize_episodic':
        // 定期打包历史对话
        const recentMessages = this.storage.getTranscript(payload.limit || 50);
        const snapshotStr = await this.cognitive.summarizeEpisodic(recentMessages);
        this.storage.appendSnapshot({
            timestamp: new Date().toISOString(),
            snapshot: snapshotStr
        });
        
        // 同时提取语义知识并合并到 Markdown 知识库
        const newFacts = await this.cognitive.extractSemanticKnowledge(snapshotStr);
        if (newFacts.length > 0) {
            const existingMd = this.storage.readSemanticKnowledge();
            const consolidatedMd = await this.cognitive.consolidateKnowledgeTree(existingMd, newFacts);
            this.storage.writeSemanticKnowledge(consolidatedMd);
        }
        
        return { success: true, message: 'Snapshot and semantic knowledge updated.', data: snapshotStr };

      case 'life_tick':
        // 由 Cron 调用的自主思考与消息发送决策
        const decision = await this.autonomous.lifeTick(
            new Date(),
            new Date(payload.lastInteractionTime || Date.now()),
            payload.lastMessage || ''
        );
        return { success: true, data: decision };

      case 'query_cognitive_fs':
        // 提供给 Agent 的检索工具
        const knowledgeTree = this.storage.readSemanticKnowledge();
        const recentSnaps = this.storage.getRecentSnapshots(3).map(s => s.snapshot).join('\n\n');
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
