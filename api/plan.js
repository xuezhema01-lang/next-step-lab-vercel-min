const MODELS = [
  "google/gemini-3.1-flash-lite",
  "openrouter/owl-alpha",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
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
            content: "你是“下一步实验室”的探索路线设计器。你要把用户的纠结拆成1天、3天或7天的探索主题。必须降低认知负荷，每天只探索一个主题。回答必须严格输出 JSON。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.65,
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
  }

  throw new Error(
    "OpenRouter API 调用失败。已尝试模型：" +
    MODELS.join(", ") +
    "。最后错误：" +
    lastError
  );
}

function fallbackPlan(days) {
  if (days === 1) {
    return {
      modeName: "1天快速试探",
      planSummary: "今天不做最终决定，只判断这个问题是否值得继续探索。",
      dayThemes: [
        {
          day: 1,
          theme: "值得继续吗",
          focus: "用一个很小的行动接触这个方向，观察它是否值得进入更长周期。"
        }
      ]
    };
  }

  if (days === 3) {
    return {
      modeName: "3天小探索",
      planSummary: "用三天低成本验证这个选择是否值得继续推进。",
      dayThemes: [
        { day: 1, theme: "真实动机", focus: "看清你想靠近这件事的真实原因。" },
        { day: 2, theme: "进入门槛", focus: "验证这件事能不能从一个很小的动作开始。" },
        { day: 3, theme: "代价与初判", focus: "观察你是否愿意承受它的主要代价，并形成初步判断。" }
      ]
    };
  }

  return {
    modeName: "7天认真验证",
    planSummary: "用一周把纠结变成有证据的阶段判断。",
    dayThemes: [
      { day: 1, theme: "真实动机", focus: "看清你为什么想做这件事。" },
      { day: 2, theme: "兴趣/吸引力", focus: "验证你是否真的被这件事本身吸引。" },
      { day: 3, theme: "能力入口", focus: "找到你现在能开始的最小能力入口。" },
      { day: 4, theme: "时间与精力成本", focus: "观察你是否能承受它需要的投入。" },
      { day: 5, theme: "现实生活方式", focus: "感受这件事对应的日常状态是否适合你。" },
      { day: 6, theme: "替代路径", focus: "看看是否有别的路径也能满足你的核心目标。" },
      { day: 7, theme: "阶段总结", focus: "整理已有信号，形成阶段性判断。" }
    ]
  };
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
    const days = Number(p.days || 7);

    if (![1, 3, 7].includes(days)) {
      return res.status(400).json({ error: "探索模式只支持 1、3、7 天。" });
    }

    const prompt = `
你是“下一步实验室”的探索路线设计器。

用户输入：
- 纠结：${p.dilemma || "未知"}
- 想得到：${p.want || "未知"}
- 害怕代价：${p.fear || "未知"}
- 探索天数：${days}

你的任务：
根据用户的纠结，把探索拆成 ${days} 天。

设计原则：
1. 每天只探索一个主题；
2. 每个主题都要普适、清晰、具体，不能像凑数；
3. 1天模式 = 快速试探，只判断是否值得继续；
4. 3天模式 = 小探索，通常覆盖真实动机、进入门槛、代价与初判；
5. 7天模式 = 认真验证，通常覆盖真实动机、兴趣吸引、能力入口、成本、生活方式、替代路径、阶段总结；
6. 不要提前生成每天具体任务，只生成每天主题和焦点；
7. 语言要对普通用户友好，不要学术腔；
8. 不要替用户做最终决定。

请只输出 JSON，不要 Markdown，不要解释。

JSON 格式如下：
{
  "modeName": "模式名称，例如：7天认真验证",
  "planSummary": "一句话说明这轮探索的目标",
  "dayThemes": [
    {
      "day": 1,
      "theme": "当天主题，6个字以内最好",
      "focus": "当天要验证什么，通俗具体"
    }
  ]
}
`;

    const result = await callOpenRouter(prompt, key);

    if (!result.dayThemes || !Array.isArray(result.dayThemes) || result.dayThemes.length !== days) {
      const fallback = fallbackPlan(days);
      fallback.model = "fallback";
      return res.status(200).json(fallback);
    }

    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};