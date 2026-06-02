const MODELS = [
  "google/gemini-2.5-flash",
  "deepseek/deepseek-v4-flash:free"
];

function difficultyRules(difficulty) {
  if (difficulty === "轻量") {
    return `
轻量版硬规则：
1. 5分钟以内；
2. 只做一个动作；
3. 不要求读长文；
4. 不要求写超过一句话；
5. 不要求联系别人；
6. 不要求做最终决定；
7. 完成标准要非常低；
8. 重点是让用户能开始，而不是做出成果。
`;
  }

  if (difficulty === "挑战") {
    return `
挑战版硬规则：
1. 30分钟以内；
2. 可以有一个明确小产出；
3. 可以稍微增加思考深度；
4. 不能变成大型计划；
5. 不能一次给多个任务；
6. 不能要求用户立刻做重大决定。
`;
  }

  return `
学习区硬规则：
1. 10-20分钟；
2. 一个小任务；
3. 可以有一句话产出；
4. 有一点挑战，但不能让用户产生强压力；
5. 不需要外部评价；
6. 不要求完整作品。
`;
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
        "HTTP-Referer": "https://next-step-lab-vercel-min.vercel.app",
        "X-Title": "Next Step Lab"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "你是“下一步实验室”的 AI 探索陪跑器。你不替用户做最终决定，只把纠结转化成当前主题下可执行的小验证。回答必须严格输出 JSON。"
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
    const difficulty = p.difficulty || "学习区";

    const prompt = `
你是“下一步实验室”的 AI 探索陪跑器。

用户原始纠结：
${p.dilemma || "未知"}

用户想得到：
${p.want || "未知"}

用户害怕付出的代价：
${p.fear || "未知"}

当前探索进度：
- 探索总天数：${p.days || "未知"}
- 当前第几天：${p.currentDay || 1}
- 今日第几步：${p.step || 1}

今日主题：
${theme.theme || "未知"}

今日主题焦点：
${theme.focus || "未知"}

当前系统难度：
${difficulty}

难度硬规则：
${difficultyRules(difficulty)}

历史记录：
${JSON.stringify(p.records || [])}

你的任务：
请围绕“今日主题”和“今日主题焦点”，生成一个今天可以做的小验证。
注意：
1. 必须紧扣今日主题，不要跳到其他天的主题；
2. 如果是同一天继续生成下一步，要在同一主题下递进，而不是换主题；
3. 不要替用户做最终决定；
4. 不要一次给多个任务；
5. 任务必须具体到用户知道现在怎么开始；
6. 语言要像人说话，简单、温和、有行动感；
7. 判断标准必须戳中要害，不能空泛，比如不能只说“看自己感受如何”；
8. 判断标准要帮助用户回答：这个行动后的反应说明什么。

请只输出 JSON，不要 Markdown，不要解释。

JSON 格式如下：
{
  "coreConflict": "一句话总结用户当前冲突，要结合原始纠结和今日主题",
  "notDecide": "告诉用户今天不用决定什么，降低压力",
  "verifyQuestion": "今天只验证的一个关键问题，必须围绕今日主题",
  "action": "一个具体动作，必须符合当前难度规则",
  "judgement": "2-3条判断标准，写成一段话，帮助用户知道做完后如何判断"
}
`;

    const result = await callOpenRouter(prompt, key);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};