const MODELS = [
  "google/gemini-2.5-flash",
  "deepseek/deepseek-v4-flash:free"
];

function extractJson(text) {
  try { return JSON.parse(text); }
  catch(e){
    const start=text.indexOf("{"); const end=text.lastIndexOf("}");
    if(start!==-1 && end!==-1 && end>start) return JSON.parse(text.slice(start,end+1));
    throw new Error("模型没有返回可解析的 JSON：" + text);
  }
}

async function callOpenRouter(prompt,key){
  let lastError="";
  for(const model of MODELS){
    const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{
      method:"POST",
      headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},
      body:JSON.stringify({model,messages:[{role:"system",content:"你是下一步实验室AI，生成阶段总结，结合所有已记录体验，输出阶段性判断和下一轮验证建议。只输出JSON。"},{role:"user",content:prompt}],temperature:0.7,max_tokens:1000})
    });
    const d=await r.json().catch(()=>({}));
    if(r.ok){const c=d?.choices?.[0]?.message?.content||"";return extractJson(c);}
    lastError=`${model}: ${d?.error?.message||r.statusText}`;
  }
  throw new Error("OpenRouter API 调用失败，尝试模型："+MODELS.join(",")+",最后错误："+lastError);
}

module.exports=async(req,res)=>{
  if(req.method!=="POST") return res.status(405).json({error:"只支持 POST"});
  try{
    const key=process.env.OPENROUTER_API_KEY;
    if(!key) throw new Error("缺少 OPENROUTER_API_KEY");

    const p=req.body||{};
    const prompt=`
根据用户的探索记录生成阶段总结。
用户纠结：${p.dilemma||"未知"}
探索模式：${p.days||"未知"} 天
历史记录：
${JSON.stringify(p.records||[])}
要求：
1. 输出这一轮探索完成了什么
2. 输出目前收集到的信号
3. 输出阶段性判断
4. 输出下一轮最该验证什么
5. 输出JSON格式，不要Markdown
6. 语言通俗，带行动感和情绪价值
JSON示例：
{
  "completed":"本轮探索完成总结",
  "signals":"收集到的主要信号",
  "judgement":"阶段性判断",
  "nextRound":"下一轮最该验证的主题或行动",
  "model":"模型名称"
}
`;
    const result=await callOpenRouter(prompt,key);
    res.status(200).json(result);
  }catch(e){res.status(500).json({error:e.message});}
};