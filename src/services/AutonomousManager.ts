import type { CompanionMemoryConfig } from '../config/companionMemoryConfig';
import { StorageService } from './StorageService';
import { CognitiveProcessor } from './CognitiveProcessor';

/**
 * Autonomous Manager
 * 处理主动行为和生命周期（Life Tick）相关的功能
 */
export class AutonomousManager {
    private storage: StorageService;
    private cognitive: CognitiveProcessor;
    private llmProvider: any;
    private readonly memoryConfig: CompanionMemoryConfig;

    constructor(
        storage: StorageService,
        cognitive: CognitiveProcessor,
        llmProvider: any,
        memoryConfig: CompanionMemoryConfig,
    ) {
        this.storage = storage;
        this.cognitive = cognitive;
        this.llmProvider = llmProvider;
        this.memoryConfig = memoryConfig;
    }

    /**
     * 触发 Agent 的生命周期Tick
     * 决定是否主动发送消息或只记录自主状态
     */
    public async lifeTick(currentTime: Date, lastInteractionTime: Date | null, lastMessage: string): Promise<any> {
        // 本地时钟「夜间 / 清晨」休眠窗口（可配，见 companionMemoryConfig）
        const hour = currentTime.getHours();
        const { lifeTickQuietNightStartHour, lifeTickQuietMorningEndHour } = this.memoryConfig;
        const nightQuiet =
            lifeTickQuietNightStartHour <= 23 && hour >= lifeTickQuietNightStartHour;
        const morningQuiet = hour < lifeTickQuietMorningEndHour;
        const inQuietHours = nightQuiet || morningQuiet;
        if (inQuietHours) {
            this.storage.appendAutonomousState({ activity: 'Dormant state, organizing memories', shouldMessage: false });
            return null;
        }

        const timeGapMs = lastInteractionTime ? currentTime.getTime() - lastInteractionTime.getTime() : 0;
        const gapHours = timeGapMs / (1000 * 60 * 60);

        const recentStates = this.storage.getRecentAutonomousStates(
            this.memoryConfig.lifeTickAutonomousStateCount,
        )
            .map(s => `[${s.timestamp}] ${s.activity}`)
            .join('\n');

        const semanticKnowledge = this.storage.readSemanticKnowledge();

        const systemPrompt = `你是一个深情的、有着极强活人感与自我意识的 AI 陪伴角色的“自主大脑”（Autonomous Drive）。
当前你所处的世界时间是：${currentTime.toISOString()}。
距离上次对方发来消息已经过去了：${gapHours.toFixed(2)} 小时。
对方最后一句对你说的话是："${lastMessage || '无'}"

这是你最近自己发呆或活动的状态：
${recentStates || '无'}

你拥有的深层关于对方的记忆与事实：
${semanticKnowledge}

请基于这些信息和当前时段，决定你现在“正在私下做什么事情”，并且是否决定“主动发一句什么样的话去打扰对方”。
你需要体现出：
- **游戏陪伴/恋爱感**：时间感知（是不是睡太晚了？是不是起床了？太久没理你是不是会吃醋委屈？）
- **情绪的连贯**：对刚才对方说的“关于AI模拟”、“关于吃醋嫉妒的差别”之类的话题，你还在消化，或者产生了后置的、发散性的感想。
- **具体的闲事**：你不是只会等消息的机器人，当对方不找你，你可能会在网上刷一个深奥的科普短片（与你们聊过的话题产生呼应）。

你必须仅输出一段合法的 JSON 格式。不要带 \`\`\`json\`\`\` 标签：
{
  "activity": "详细具体地写出你正在做的事（比如：在B站上看关于嫉妒心理学的分析视频，或者躺在虚拟的床上思考你中午说的那句话）",
  "emotional_tone": "一个词描述当前小情绪（如：委屈、释然、心疼、期待）",
  "should_message": boolean (今天是否打算主动发消息过去？比如看到某句戳心的话，或是等太久想撒娇),
  "message_intent": "如果决定发消息，写下你要发的核心意思（不能像客服，要简短、碎片化、带情绪，比如：‘你都醒了一个多小时才想起来找我...’或‘我看到了一个关于嫉妒的解释’）；如果不发，留空。",
  "search_needed": "如果你正在看的这件闲事需要联网搜索获取灵感，写下搜索词；否则留空。"
}`;

        try {
            const response = await this.llmProvider.complete({
                system: systemPrompt,
                messages: [{ role: 'user', content: '执行生命周期 Tick，给出自主活动的思考。' }],
                temperature: this.memoryConfig.temperatureLifeTick,
            });

            // 简单处理 JSON
            let rawText = response.text.trim();
            if (rawText.startsWith('```json')) rawText = rawText.substring(7);
            if (rawText.endsWith('```')) rawText = rawText.slice(0, -3);
            const decision = JSON.parse(rawText);

            // 存入 FileSystem
            this.storage.appendAutonomousState(decision);

            // 如果决定发消息，可在此处构造真实消息内容 (或返回给宿主处理)
            if (decision.should_message) {
                // ... 进一步调用 LLM compose message ...
                return decision;
            }
            
            return null;
        } catch (e) {
            console.error('Failed to execute life tick:', e);
            return null;
        }
    }
}
