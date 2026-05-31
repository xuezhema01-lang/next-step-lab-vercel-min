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
            content: "你是一个中文 AI 探索陪跑器。用户正在做一个小验证任务。你不能替用户做最终决定，也不能输出长篇大道理。你的任务是帮助用户从卡住状态退回到一个更小、更清楚、更容易开始的动作。回答必须严格输出 JSON。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 700
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

用户正在探索一个问题，并且在执行过程中点了“我卡住了”。

当前探索信息：
- 纠结：${p.dilemma}
- 想得到：${p.want}
- 害怕代价：${p.fear}
- 当前难度：${p.difficulty}
- 当前小验证：${p.currentAction || "未知"}
- 历史记录：${JSON.stringify(p.records || [])}

用户现在问：
${p.message}

你的任务：
1. 先共情，但不要鸡汤；
2. 判断用户是“不懂任务”“任务太难”“情绪阻抗”“不知道怎么记录”还是“其他卡点”；
3. 给一个更小的下一步动作；
4. 最后问一个很轻的问题，帮助用户继续。

请只输出 JSON，不要 Markdown，不要解释。

JSON 格式如下：
{
  "reply": "给用户的简短回应，温和、具体、不超过120字",
  "smallerAction": "把当前任务降级成一个更小的动作",
  "question": "问用户一个很轻的问题，方便继续对话"
}
`;

    const result = await callOpenRouter(prompt, key);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
