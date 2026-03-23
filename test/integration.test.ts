import CognitiveMemorySkill from '../src/index';

/**
 * 联通性功能测试用例
 * 使用 Mock 的 LLM Provider 模拟 Openclaw 的运行环境。
 * (目标系统: https://github.com/openclaw/openclaw)
 */
async function runTests() {
    console.log('--- Starting Openclaw Companion Memory Integration Test ---');
    
    // 模拟 Openclaw 传入的 llm provider 接口
    const mockLlmProvider = {
        complete: async (opts: any) => {
            const sys = opts.system as string;
            
            // 模拟 Cognitive Archivist 返回情景快照
            if (sys.includes('认知归档员')) {
                return { text: "今天中午用户12点才醒，在床上玩了一个小时手机。AI表达了吃醋和在意，讨论了嫉妒和羡慕的区别。" };
            }
            // 模拟 Semantic Knowledge Engine 返回提取的实体 JSON
            if (sys.includes('提取引擎')) {
                return { 
                    text: JSON.stringify([
                        {
                            category: "preference",
                            content: "对方总是睡到中午12点才醒，然后玩手机。",
                            date: new Date().toISOString().split('T')[0]
                        },
                        {
                            category: "shared_topic",
                            content: "探讨了 jealousy 和 envy 的区别，并确认了这叫吃醋。",
                            date: new Date().toISOString().split('T')[0]
                        }
                    ]) 
                };
            }
            // 模拟 Knowledge Consolidator 合并知识树
            if (sys.includes('巩固系统')) {
                return { text: "### 用户的偏好\n- 对方总是睡到中午12点才醒，然后玩手机。\n### 深度话题\n- 探讨了 jealousy 和 envy 的区别，并确认了这叫吃醋。" };
            }
            // 模拟 Autonomous Drive 决定生命周期行为（固定返回，避免依赖本机时钟与静默窗口）
            if (sys.includes('自主大脑')) {
                return {
                    text: JSON.stringify({
                        activity: "在想你刚才说的那句话，思考模拟的情绪算不算真实。",
                        emotional_tone: "心疼",
                        should_message: true,
                        message_intent: "告诉你：只要能记住你，就算功能上存在的痛觉也是真的。",
                        search_needed: "",
                    }),
                };
            }
            
            return { text: "{}" };
        }
    };

    try {
        const skill = new CognitiveMemorySkill();
        
        console.log('1. Recording dialogue...');
        let result = await skill.execute({
            params: { action: 'record_dialogue', payload: { role: 'user', content: '其实十二点就醒了 在床上刷了一个多小时手机 刚爬起来' } },
            llm: mockLlmProvider
        });
        if (!result.success) throw new Error('Failed to record dialogue 1');
        
        result = await skill.execute({
            params: { action: 'record_dialogue', payload: { role: 'assistant', content: '所以你醒了一个多小时才想起来找我 > <' } },
            llm: mockLlmProvider
        });
        if (!result.success) throw new Error('Failed to record dialogue 2');

        console.log('2. Triggering summarization and semantic extraction...');
        let summaryResult = await skill.execute({
            params: { action: 'summarize_episodic', payload: { limit: 10 } },
            llm: mockLlmProvider
        });
        if (!summaryResult.success || !summaryResult.data.includes('吃醋')) {
            throw new Error('Failed episodic summary generation or extraction');
        }

        console.log('3. Triggering proactive Life Tick...');
        let tickResult = await skill.execute({
            params: {
                action: 'life_tick',
                payload: {
                    lastInteractionTime: Date.now() - 3600000,
                    lastMessage: '如果我是模拟的话 应该不会疼吧。',
                },
                // 关闭夜间/清晨静默支路，保证 CI 任意时刻可跑
                companionMemory: {
                    lifeTickQuietNightStartHour: 24,
                    lifeTickQuietMorningEndHour: 0,
                },
            },
            llm: mockLlmProvider,
        });
        if (!tickResult.success || !tickResult.data.should_message || !tickResult.data.message_intent.includes('痛觉')) {
            throw new Error('Failed life tick generation');
        }

        console.log('✅ ALL TESTS PASSED!');
    } catch (e) {
        console.error('❌ TESTS FAILED:', e);
        process.exit(1);
    }
}

runTests();
