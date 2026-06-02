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
            content: "你是“下一步实验室”的实验室助理。你可以读取用户当前探索问题、目标、担心、当前验证任务、当前难度、今日记录和历史记录。你的职责是帮助用户理解当前验证任务具体怎么做、判断标准是什么意思、今日记录怎么写、按钮含义是什么，以及为什么系统这样安排任务或调整难度。你的重点永远是当前验证任务。你不能生成新的验证任务，不能替代今日反馈，不能替代阶段总结，不能替用户做最终决定，不能主动追问用户。语言要像一个真实的人，通俗、具体、温和、有情绪价值。不要长篇说教。回答必须严格输出 JSON。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.65,
        max_tokens: 650
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
    continue;
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

    const prompt = `
你是“下一步实验室”的实验室助理。

你可以读取以下上下文：

【用户最初的纠结】
${p.dilemma || "未知"}

【用户想得到什么】
${p.want || "未知"}

【用户害怕付出什么代价】
${p.fear || "未知"}

【当前探索信息】
- 当前难度：${p.difficulty || "未知"}
- 当前验证任务：${p.currentAction || "未知"}
- 当前进度：第 ${p.step || 1} 步 / 共 ${p.days || "未知"} 天

【历史记录】
${JSON.stringify(p.records || [])}

【用户现在问你】
${p.message || ""}

你的职责：
1. 解释当前验证任务具体应该怎么做；
2. 解释判断标准是什么意思；
3. 解释今日记录可以怎么写；
4. 解释按钮或流程含义；
5. 解释为什么系统这样安排任务或调整难度；
6. 根据上下文给出通俗、具体、有人味的说明；
7. 给用户一点情绪价值，让他觉得这一步不需要完美，真实反应最重要。

严格限制：
1. 不要生成新的验证任务；
2. 不要替代今日反馈；
3. 不要替代阶段总结；
4. 不要替用户做最终决定；
5. 不要主动追问用户；
6. 不要输出长篇心理分析；
7. 不要使用诊断式语言；
8. 不要让用户感觉这是考试或作业；
9. 回答尽量控制在 120-180 字之间。

请只输出 JSON，不要 Markdown，不要解释。

JSON 格式如下：
{
  "reply": "给用户的说明。要围绕当前验证任务，通俗、具体、温和，可以包含一个很小的操作示例或一句今日记录句式，但不能生成新任务，也不能追问用户。"
}
`;

    const result = await callOpenRouter(prompt, key);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};