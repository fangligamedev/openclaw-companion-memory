import * as fs from 'fs';
import * as path from 'path';
import type { CompanionMemoryConfig } from '../config/companionMemoryConfig';
import { DEFAULT_COMPANION_MEMORY_CONFIG } from '../config/companionMemoryConfig';

/**
 * StorageService 负责管理所有持久化数据，采用追加和部分重写相结合的文件存储机制。
 * 旨在让 AI 拥有一套自我记录、可自我审视的历史文档，就像一个真实人类日记本。
 *
 * 包含：
 * 1. 语义知识 SemanticKnowledge (.md) - 关于你和 AI 共同历史的长久事实。
 * 2. 情景快照 EpisodicSnapshot (.jsonl) - 以第三人称记录的大段时间块的情绪/对话摘要。
 * 3. 内在独白 InternalMonologue (.jsonl) - 用户看不见的内心 OS，用于保持 AI 内心的波澜。
 * 4. 自主状态 AutonomousState (.jsonl) - Life Tick 系统主动为 AI 创建的状态碎片。
 * 5. 原始对话 DialogueTranscript (.jsonl) - 无损对话原本记录。
 */
export class StorageService {
    private baseDir: string;
    private readonly memoryConfig: CompanionMemoryConfig;

    constructor(dataDir?: string, memoryConfig?: CompanionMemoryConfig) {
        this.baseDir = dataDir || path.join(process.cwd(), 'data');
        this.memoryConfig = memoryConfig ?? DEFAULT_COMPANION_MEMORY_CONFIG;
        this.ensureDirExists(this.baseDir);
    }

    private ensureDirExists(dirPath: string) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    private getFilePath(filename: string): string {
        return path.join(this.baseDir, filename);
    }

    /**
     * 追加 JSONL 记录
     */
    private appendJsonl(filename: string, data: any) {
        const filePath = this.getFilePath(filename);
        const line = JSON.stringify(data) + '\n';
        fs.appendFileSync(filePath, line, 'utf8');
    }

    /**
     * 读取 JSONL 文件，返回解析后的对象数组
     */
    private readJsonl<T>(filename: string): T[] {
        const filePath = this.getFilePath(filename);
        if (!fs.existsSync(filePath)) return [];
        
        const content = fs.readFileSync(filePath, 'utf8');
        return content
            .split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => {
                try {
                    return JSON.parse(line) as T;
                } catch (e) {
                    console.error(`Failed to parse JSONL line in ${filename}:`, line);
                    return null;
                }
            })
            .filter(item => item !== null) as T[];
    }

    // ─── Semantic Knowledge (语义知识) ───

    /**
     * 读取语义知识 (Markdown 格式)
     */
    public readSemanticKnowledge(): string {
        const filePath = this.getFilePath('semantic_knowledge.md');
        if (!fs.existsSync(filePath)) return '';
        return fs.readFileSync(filePath, 'utf8');
    }

    /**
     * 写入语义知识 (全量覆盖)
     */
    public writeSemanticKnowledge(content: string): void {
        const filePath = this.getFilePath('semantic_knowledge.md');
        fs.writeFileSync(filePath, content, 'utf8');
    }

    // ─── Episodic Snapshot (情景快照) ───

    public appendSnapshot(snapshot: any): void {
        this.appendJsonl('episodic_snapshots.jsonl', snapshot);
    }

    public getRecentSnapshots(limit?: number): any[] {
        const n = limit ?? this.memoryConfig.storageDefaultSnapshotLimit;
        if (n <= 0) return [];
        const all = this.readJsonl<any>('episodic_snapshots.jsonl');
        return all.slice(-n);
    }

    // ─── Internal Monologue (内在独白) ───

    public appendMonologue(thought: string): void {
        this.appendJsonl('internal_monologue.jsonl', {
            timestamp: new Date().toISOString(),
            thought
        });
    }

    public getRecentMonologues(limit?: number): any[] {
        const n = limit ?? this.memoryConfig.storageDefaultMonologueLimit;
        if (n <= 0) return [];
        const all = this.readJsonl<any>('internal_monologue.jsonl');
        return all.slice(-n);
    }

    // ─── Autonomous State (自主状态记录) ───

    public appendAutonomousState(state: any): void {
        const entry = {
            timestamp: new Date().toISOString(),
            ...state
        };
        this.appendJsonl('autonomous_state.jsonl', entry);
    }

    public getRecentAutonomousStates(limit?: number): any[] {
        const n = limit ?? this.memoryConfig.storageDefaultAutonomousStateLimit;
        if (n <= 0) return [];
        const all = this.readJsonl<any>('autonomous_state.jsonl');
        return all.slice(-n);
    }

    // ─── Dialogue Transcript (原始对话记录) ───

    public appendTranscript(role: 'user' | 'assistant' | 'system', content: string, metadata?: any): void {
        this.appendJsonl('dialogue_transcript.jsonl', {
            timestamp: new Date().toISOString(),
            role,
            content,
            ...metadata
        });
    }

    public getTranscript(limit?: number): any[] {
        const n = limit ?? this.memoryConfig.storageDefaultTranscriptLimit;
        if (n <= 0) return [];
        const all = this.readJsonl<any>('dialogue_transcript.jsonl');
        return all.slice(-n);
    }

    // ─── Workspace Bridge (官方工作区桥接) ───

    /**
     * 将快照片段追加到官方工作区的每日日记中 (memory/YYYY-MM-DD.md)
     */
    public appendToWorkspaceDailyMemory(workspaceDir: string, content: string): void {
        if (!workspaceDir) return;
        const memoryDir = path.join(workspaceDir, 'memory');
        this.ensureDirExists(memoryDir);

        const date = new Date();
        const dateString = date.toISOString().split('T')[0];
        const filePath = path.join(memoryDir, `${dateString}.md`);

        const timeString = date.toTimeString().split(' ')[0];
        const appendContent = `\n\n## 伴侣记忆快照 (${timeString})\n${content}\n`;
        fs.appendFileSync(filePath, appendContent, 'utf8');
    }

    /**
     * 将长期语义记忆同步更新到官方工作区的 MEMORY.md 对应区块
     */
    public syncToWorkspaceGlobalMemory(workspaceDir: string, semanticMd: string): void {
        if (!workspaceDir) return;
        this.ensureDirExists(workspaceDir);
        
        const filePath = path.join(workspaceDir, 'MEMORY.md');
        let currentContent = '';
        if (fs.existsSync(filePath)) {
            currentContent = fs.readFileSync(filePath, 'utf8');
        }

        const BLOCK_START = '<!-- COMPANION_MEMORY_START -->';
        const BLOCK_END = '<!-- COMPANION_MEMORY_END -->';
        const wrappedSemantic = `${BLOCK_START}\n## 伴侣记忆系统 (Companion Memory)\n\n${semanticMd}\n${BLOCK_END}`;

        if (currentContent.includes(BLOCK_START) && currentContent.includes(BLOCK_END)) {
            // 正则替换该区块
            const regex = new RegExp(`${BLOCK_START}[\\s\\S]*?${BLOCK_END}`, 'g');
            currentContent = currentContent.replace(regex, wrappedSemantic);
        } else {
            // 在末尾追加
            if (currentContent && !currentContent.endsWith('\n\n')) {
                currentContent += '\n\n';
            }
            currentContent += wrappedSemantic + '\n';
        }

        fs.writeFileSync(filePath, currentContent, 'utf8');
    }
}
