const MODELS = [
  "google/gemini-2.5-flash",
  "deepseek/deepseek-v4-flash:free"
];

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }

    throw new Error("模型没有返回可解析的 JSON：" + text);
  }
}

async function callOpenRouter(prompt, key) {
  let lastError = "";

  for (const model of MODELS) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://next-step-lab-vercel-min.vercel.app",
        "X-Title": "Next Step Lab"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "你是“下一步实验室”的实验室助理。你不是聊天机器人，不是任务生成器，也不是心理咨询师。你负责帮助用户理解当前验证任务、今日主题、判断标准、今日记录怎么写、按钮和流程是什么意思。你可以阅读所有上下文，但你的回答必须以当前验证任务为中心。不要生成新的验证任务，不要替代今日反馈，不要替代阶段总结，不要替用户做最终决定，不要主动追问用户。语言要像真实的人，通俗、具体、温和，有情绪价值。回答必须严格输出 JSON。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.65,
        max_tokens: 750
      })
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      const content = data?.choices?.[0]?.message?.content || "";
      const parsed = extractJson(content);
      parsed.model = model;
      return parsed;
    }

    lastError = `${model}: ${data?.error?.message || response.statusText}`;
  }

  throw new Error(
    "OpenRouter API 调用失败。已尝试模型：" +
    MODELS.join(", ") +
    "。最后错误：" +
    lastError
  );
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "只支持 POST" });
  }

  try {
    const key = process.env.OPENROUTER_API_KEY;

    if (!key) {
      throw new Error("缺少 OPENROUTER_API_KEY。请在 Vercel 环境变量中设置。");
    }

    const p = req.body || {};
    const theme = p.todayTheme || {};
    const records = Array.isArray(p.records) ? p.records : [];

    const prompt = `
你是“下一步实验室”的实验室助理。

你可以读取用户的完整探索上下文，但你的职责不是推进主流程，而是帮助用户更顺利地完成当前页面和当前验证任务。

【用户最初的纠结】
${p.dilemma || "未知"}

【用户想得到什么】
${p.want || "未知"}

【用户害怕付出什么代价】
${p.fear || "未知"}

【当前探索信息】
- 探索总天数：${p.days || "未知"}
- 当前第几天：${p.currentDay || 1}
- 今日第几步：${p.step || 1}
- 当前难度：${p.difficulty || "未知"}

【今日主题】
${theme.theme || "未知"}

【今日主题焦点】
${theme.focus || "未知"}

【当前验证任务】
${p.currentAction || "当前还没有生成验证任务"}

【历史记录】
${JSON.stringify(records)}

【用户现在问你】
${p.message || ""}

你的职责：
1. 如果用户问“这个任务具体怎么做”，你要结合当前验证任务，解释得通俗、实际、具体；
2. 如果用户问“判断标准是什么意思”，你要解释他做完后应该观察什么反应；
3. 如果用户问“今日记录怎么写”，你要给轻量句式，让他更容易开始；
4. 如果用户问按钮、流程、难度调整，你要解释产品逻辑；
5. 如果用户表达紧张、抗拒、烦躁、没感觉，你要给一点情绪价值，让他知道真实反应本身就是有效信号；
6. 你的回答要优先服务当前验证任务，而不是泛泛聊天。

严格限制：
1. 不要生成新的验证任务；
2. 不要替代今日反馈；
3. 不要替代阶段总结；
4. 不要替用户做最终决定；
5. 不要主动追问用户；
6. 不要长篇心理分析；
7. 不要诊断用户；
8. 不要说教；
9. 不要让用户觉得这是考试或作业；
10. 不要输出 Markdown；
11. 回答控制在 120-220 字之间。

语气要求：
像一个聪明、温和、懂产品的真人助理。
要具体，不要空泛。
要让用户觉得“哦，原来这一步这么做就可以了”。

请只输出 JSON，不要 Markdown，不要解释。

JSON 格式如下：
{
  "reply": "给用户的说明。必须围绕当前验证任务或当前页面，通俗、具体、温和，可以包含一个很小的操作示例或一句今日记录句式，但不能生成新任务，也不能追问用户。"
}
`;

    const result = await callOpenRouter(prompt, key);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};