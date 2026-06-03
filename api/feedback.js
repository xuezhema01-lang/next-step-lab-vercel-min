const MODELS = [
  "google/gemini-3.5-flash",
  "google/gemini-3.1-flash-lite",
  "openrouter/owl-alpha"
];

function extractJson(text) {
  try { return JSON.parse(text); }
  catch (e) {
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
      body:JSON.stringify({model,messages:[{role:"system",content:"你是下一步实验室AI，结合今日小验证和今日记录生成反馈，语言要通俗、带情绪价值。只输出JSON。"},{role:"user",content:prompt}],temperature:0.7,max_tokens:900})
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
根据用户今日小验证和今日记录生成今日反馈。
用户纠结：${p.dilemma||"未知"}
今日小验证：${p.card?.action||"未知"}
今日记录：${p.record?.text||"未知"}
今日完成情况：${p.record?.done||"未知"}
今日感受：${p.record?.feel||"未知"}
系统难度：${p.difficulty||"学习区"}
历史记录：${JSON.stringify(p.records||[])}
要求：
1. 输出看见你的体验
2. 输出今天的一个信号
3. 输出下一步建议
4. 输出JSON格式，不要Markdown
5. 语言通俗、带一点情绪价值
JSON示例：
{
  "seeExperience":"你看到自己真实体验的总结",
  "signal":"今天给你的一个信号",
  "nextSuggestion":"下一步建议",
  "model":"模型名称"
}
`;
    const result=await callOpenRouter(prompt,key);
    res.status(200).json(result);
  }catch(e){res.status(500).json({error:e.message});}
};