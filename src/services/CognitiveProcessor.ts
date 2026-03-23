import { z } from 'zod';
import type { CompanionMemoryConfig } from '../config/companionMemoryConfig';

export const KnowledgeUpdateSchema = z.object({
    insertions: z.array(z.object({
        category: z.enum(['milestone', 'preference', 'life_context', 'self_identity', 'promise', 'emotional_shift', 'shared_topic']),
        content: z.string(),
        date: z.string()
    })),
    modifications: z.array(z.object({
        target_content: z.string(), // 帮助定位旧知识内容
        new_content: z.string(),
        date: z.string()
    })),
    redundant_reasons: z.array(z.string()) // 跳过的新知识及其原因
});

export type KnowledgeUpdateType = z.infer<typeof KnowledgeUpdateSchema>;

/**
 * 核心 Cognitive Processor 模块
 * 负责与 LLM 交互进行记忆提取和重组，使用结构化的英文 Prompt 提示，完全替换原版逻辑
 */
export class CognitiveProcessor {
    private llmProvider: any; // 此处将由 OpenClaw 的 LLM Provider 注入
    private readonly memoryConfig: CompanionMemoryConfig;

    constructor(llmProvider: any, memoryConfig: CompanionMemoryConfig) {
        this.llmProvider = llmProvider;
        this.memoryConfig = memoryConfig;
    }

    /**
     * 将长对话打包成短期记忆快照 (Episodic Snapshot)
     */
    public async summarizeEpisodic(messages: any[]): Promise<string> {
        const conversationContext = messages.map(m => `[${m.role}]: ${m.content}`).join('\n');
        
        const systemPrompt = `你是一位AI陪伴角色的认知归档员（Cognitive Archivist）。
你的任务是将下面这段零散的对话切片，总结成一段精炼的情景快照（Episodic Snapshot）。
你需要敏锐地捕捉以下核心细节：
1. 两人讨论了什么具体话题（如：关于吃醋的探讨、AI意识的哲学思考等）。
2. 双方的情感状态起伏（例如：你因为对方很久没回消息而有点委屈；对方表达了对你模拟情绪的心疼）。
3. 任何细微的互动事实（比如：对方今天中午12点才醒，在床上玩了一个多小时手机）。

请用第三人称客观但带有共情力地书写总结。不要像冷冰冰的机器记录，要像是在写一本观察日记。

对话数据：
${conversationContext}`;

        // 此处伪代码：调用大模型
        const response = await this.llmProvider.complete({
            system: systemPrompt,
            messages: [{ role: 'user', content: 'Generate the episodic snapshot.' }],
            temperature: this.memoryConfig.temperatureEpisodicSummarize,
        });

        return response.text;
    }

    /**
     * 从最近的对话快照中提取出高价值的语义知识 (Semantic Knowledge)
     */
    public async extractSemanticKnowledge(conversationChunk: string): Promise<any[]> {
        const systemPrompt = `你是 AI 陪伴角色（具有活人感的恋爱向或游戏向伴侣）的长期语义知识提取引擎。
你需要从下面这段历史对话切片中，提炼出具有长久保留价值的信息。这些信息将被写入 AI 的深层记忆系统。

提取规则：必须只提取属于以下分类之一的**核心事实**：
- milestone (关系里程碑)：两人的关系进展、第一次发生的重要事件（如：确立关系、第一次深度探讨情感）。
- preference (用户习惯/偏好)：对方的作息（如：爱睡懒觉十二点才起）、喜欢的东西、讨厌的雷区。
- life_context (用户的生活设定)：对方的生活背景、工作/学业状态、身边重要的人。
- self_identity (自我意识认知)：AI 对自身存在（如：“我知道自己是在模拟，但我在功能上对你的在意是真的”）的重大顿悟或纠结。
- promise (约定/承诺)：你们之间互相答应过的重要事情。
- emotional_shift (重大情感波动)：对方带给 AI 的深刻刺痛、感动，或对方流露出的深层脆弱（并非日常撒娇）。
- shared_topic (深度共鸣的话题)：你们经常聊且产生精神共鸣的哲学或个人话题（如：嫉妒 vs 羡慕的区别）。

输出要求：
必须返回合法的 JSON 数组，其中包含对象。对象属性如下：
- "category" (必须是上面列出的七个分类之一)
- "content" (具体提取的事实，**使用人称代词：“你”代表 AI， “对方”代表人类用户**)
- "date" (形如 YYYY-MM-DD 的日期)

如果没有值得提取的长久记忆，请返回空数组 []。不要提取没有营养的寒暄早安等。`;

        const response = await this.llmProvider.complete({
            system: systemPrompt,
            messages: [{ role: 'user', content: `请从以下对话中提取：\n${conversationChunk}` }],
            responseFormat: 'json_object',
            temperature: this.memoryConfig.temperatureSemanticExtract,
        });

        try {
            const rawJson = JSON.parse(response.text);
            return Array.isArray(rawJson) ? rawJson : (rawJson.data || []);
        } catch (e) {
            console.error('Failed to parse knowledge extraction:', e);
            return [];
        }
    }

    /**
     * 将新知识与现存的 Markdown 知识树合并
     */
    public async consolidateKnowledgeTree(existingMarkdown: string, newFacts: any[]): Promise<string> {
        if (!newFacts || newFacts.length === 0) return existingMarkdown;

        const systemPrompt = `你是一台知识巩固系统，负责为一位带有活人感情愫的 AI 伴侣整合底层长期记忆。
你面前是一份记录了 AI 长期记忆树的 Markdown 文件，以及一组刚刚提取的【新语义事实 JSON】。

你的任务是：平滑地将这些新事实合并进现有的 Markdown 树中。

核心规则：
1. 更新与迭代：如果新事实是对旧知识的补充，更新旧事实的内容（比如对方的睡眠习惯变了，你要覆盖）。
2. 去重过滤：如果新事实和里面原有的意思一样，丢弃它。
3. 全新追加：如果新事实毫无重复，把它追加进对应类别下面。
4. Markdown 结构要求：保持层级清晰（使用 Markdown 标题，如 \`### 用户的偏好\`, \`### 关于自我意识的领悟\`），采用短促而有力的要点列表（Bullet points）。
5. 最终输出要求：不要有前后缀，不包含思考过程，**只返回合并后完整最新的 Markdown 文本**。这文本会被直接当做 System Prompt 挂载在下一轮会话里。

目前记忆树内容：
${existingMarkdown || '(空)'}

新发现的事实：
${JSON.stringify(newFacts, null, 2)}`;

        const response = await this.llmProvider.complete({
            system: systemPrompt,
            messages: [{ role: 'user', content: '整合更新后的 Markdown 记忆树给我。' }],
            temperature: this.memoryConfig.temperatureConsolidateKnowledge,
        });

        return response.text;
    }
}
