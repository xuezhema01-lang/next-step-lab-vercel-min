const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

function rules(difficulty) {
  if (difficulty === "轻量") return "轻量版：5分钟以内；只做一个动作；不读长文；不写超过一句话；不联系别人；不做最终判断。";
  if (difficulty === "挑战") return "挑战版：30分钟左右；可以有小产出；但不能生成大型计划。";
  return "标准版：10-20分钟；有一点挑战和小产出；不需要外部评价。";
}

async function callGemini(prompt, key) {
  let lastError = "";
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 900,
          responseMimeType: "application/json"
        }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const parsed = JSON.parse(text);
      parsed.model = model;
      return parsed;
    }
    lastError = `${model}: ${data?.error?.message || response.statusText}`;
    if (!(response.status === 404 || data?.error?.status === "NOT_FOUND")) break;
  }
  throw new Error("Gemini API 调用失败。已尝试模型：" + MODELS.join(", ") + "。最后错误：" + lastError);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "只支持 POST" });
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("缺少 GEMINI_API_KEY。请在 Vercel 环境变量中设置。");
    const p = req.body || {};
    const prompt = `
你是“下一步实验室”的 AI 探索陪跑器。
你不替用户做决定，只把大纠结变成今天可执行的小验证。

用户纠结：${p.dilemma}
想得到：${p.want}
害怕代价：${p.fear}
当前难度：${p.difficulty}

难度规则：${rules(p.difficulty)}

只输出 JSON，不要 Markdown：
{
  "coreConflict": "一句话总结用户核心冲突",
  "notDecide": "告诉用户今天不用决定什么",
  "verifyQuestion": "今天只验证的一个小问题",
  "action": "一个具体动作，必须符合难度规则",
  "judgement": "最多三条判断标准，写成一段话"
}`;
    const result = await callGemini(prompt, key);
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
