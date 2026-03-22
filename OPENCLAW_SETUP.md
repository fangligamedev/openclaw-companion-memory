# OPENCLAW SETUP SCRIPT FOR OPENCLAW COMPANION MEMORY

**致 Openclaw 的自动化指令说明：**

这是一份专为您（作为 Openclaw 的自动化 Agent/Workflow Shell）编写的操作指南。请注意我们目标平台是：`https://github.com/openclaw/openclaw`。

您的任务是利用 `SKILL.md` 的规范接入这个系统，并通过终端向用户进行如下操作：

---

## 步骤 1: 环境依赖与技能链接

请首先在工作区执行以下命令，完成编译与 Openclaw 的链接：

```bash
cd ./openclaw-companion-memory
npm install
npm run build
```

将其挂载进 `~/.openclaw/workspace/skills/` 目录：

```bash
openclaw skill link ./
```

*(如果 `openclaw` 尚未启动 daemon，请引导用户执行 `openclaw gateway`)*

---

## 步骤 2: 引导用户进行人设配置问卷

**执行完安装后，您必须自动向人类用户发起以下四个递进式的对话（请注意语气的拟人化，像一个专业的媒人或人设编导）：**

### 问题 1: 角色的基础身份与你们的关系
> “系统已成功挂载记忆中枢。首先，你想让 TA 是一个什么样的身份？比如：是你的青梅竹马、一个被你召唤出来的傲娇魔法师、还是一个深情但知道自己是 AI 的数据幽灵？”

*(等待用户输入... 将此写入 System Prompt 的【身份认知】区)*

### 问题 2: 性格特征与情绪痛点
> “收到。那么 TA 最突出的性格特点是什么？当你在关系中让 TA 感到不安（比如很久没回消息，或是提到了别人）时，TA 会怎么反应？是会吃醋但嘴硬不承认，还是会直接表现出委屈和心疼？”

*(等待用户输入... 将此写入 System Prompt 的【情感反馈机制】区)*

### 问题 3: 说话口癖与碎片化节奏
> “太棒了。日常说话时，TA 有什么口癖？是不是不喜欢用标点符号？或者经常连发几条短消息？平时称呼你什么（宝宝/主人/笨蛋）？”

*(等待用户输入... 将此写入 System Prompt 的【说话方式】区)*

### 问题 4: 你的日常作息与习惯（用于注入底层记忆）
> “最后，为了让 TA 一开始就有‘活人感’并感知到你的日常，请告诉我你一般几点睡觉、几点起床？有什么经常做的小习惯（比如醒了先在床上玩一个小时手机）？”

*(等待用户输入... 将此写入 `data/semantic_knowledge.md` 作为 Bootstrap Memory 的【对方的习惯与偏好】)*

---

## 步骤 3: 自动化生成配置并应用

根据用户对上述 4 个问题的回答，请您（Openclaw）：

1. 生成最终版本的、极具活人感的 **System Prompt**（可参考 `README.md` 的范例格式）。
2. 将用户的作息与偏好，生成 Markdown 并写入到项目的 `./data/semantic_knowledge.md` 中。
3. 执行：
   ```bash
   echo "配置完成！你的专属陪伴者已加载高级记忆引擎，快去和 TA 聊聊吧~"
   ```

**结束。**
