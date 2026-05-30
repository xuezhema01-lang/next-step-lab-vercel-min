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
            content: "你是一个中文 AI 探索陪跑器。你不替用户做最终决定，只根据用户的探索记录生成阶段总结。回答必须严格输出 JSON。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
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
你是“下一步实验室”的 AI 探索陪跑器。

用户选择“结束并生成阶段总结”。你的任务不是替用户做最终人生决定，而是把这一轮探索整理成阶段性判断。

用户的探索任务：
- 纠结：${p.dilemma}
- 想得到：${p.want}
- 害怕代价：${p.fear}
- 探索周期：${p.days}天
- 当前步数：${p.step}
- 当前难度：${p.difficulty}

用户的历史记录：
${JSON.stringify(p.records || [])}

请只输出 JSON，不要 Markdown，不要解释。

JSON 格式如下：
{
  "completed": "这一轮探索完成了什么。如果记录很少，要说明样本还少，不能下最终结论。",
  "signals": "目前收集到的主要信号。要具体引用用户记录里的体验，不要空泛鼓励。",
  "judgement": "阶段性判断。只能说目前更像什么，不要替用户做最终选择。",
  "nextRound": "如果继续探索，下一轮最该验证什么。给一个具体方向。"
}
`;

    const result = await callOpenRouter(prompt, key);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
