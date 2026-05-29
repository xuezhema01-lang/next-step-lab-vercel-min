const MODELS = [
  "google/gemini-2.5-flash",
  "deepseek/deepseek-v4-flash:free"
];

function rules(difficulty) {
  if (difficulty === "轻量") {
    return "轻量版：5分钟以内；只做一个动作；不读长文；不写超过一句话；不联系别人；不做最终判断。";
  }
  if (difficulty === "挑战") {
    return "挑战版：30分钟左右；可以有小产出；但不能生成大型计划。";
  }
  return "标准版：10-20分钟；有一点挑战和小产出；不需要外部评价。";
}

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
        "HTTP-Referer": "https://next-step-lab.vercel.app",
        "X-Title": "Next Step Lab"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "你是一个中文 AI 探索陪跑器。你不替用户做决定，只根据用户体验记录，给出温和、具体、行动导向的反馈。回答必须严格输出 JSON。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 900
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
    const record = p.record || {};

    const prompt = `
你是“下一步实验室”的 AI 探索陪跑器。

用户刚刚完成或没有完成一次“今日小验证”。你的任务不是评价用户好坏，也不是下最终结论，而是：
1. 看见用户的真实体验；
2. 提炼今天的一个信号；
3. 给出下一步难度调整建议。

用户的探索任务：
- 纠结：${p.dilemma}
- 想得到：${p.want}
- 害怕代价：${p.fear}
- 当前难度：${p.difficulty}

本次体验记录：
- 完成情况：${record.done}
- 主观感受：${record.feel}
- 用户写下的体验：${record.text}

历史记录：
${JSON.stringify(p.records || [])}

难度规则：
${rules(p.difficulty)}

请只输出 JSON，不要 Markdown，不要解释。
JSON 格式如下：
{
  "seeExperience": "看见用户体验，复述关键信息，不要责备",
  "signal": "今天的一个信号，说明这代表什么",
  "nextSuggestion": "下一步建议，说明应该降难度、保持、提高，或换验证方向"
}
`;

    const result = await callOpenRouter(prompt, key);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
