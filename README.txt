先用这个最小版验证 Vercel + Gemini API 是否能跑通。
部署后在 Vercel Environment Variables 设置 GEMINI_API_KEY。
然后触发部署（trigger deploy again）以更新环境。
如果需要清理部署队列，可使用 clean deploy trigger。