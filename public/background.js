// 监听来自弹窗的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 如果收到 AI 生成指令
  if (request.type === 'LLM_FALLBACK') {
  const fields = request.fields;

  // 取出用户的简历信息和 API Key
  chrome.storage.local.get(['profile', 'apiKey'], (result) => {
    const profile = result.profile || {};
    const apiKey = result.apiKey || '';
    if (!apiKey) return sendResponse({ success: false, error: '无 API Key' });

    // 构造给 AI 的提示词（注意：json_object 模式要求顶层必须是对象，所以包一层 answers）
    const prompt = `以下是一些未匹配的网页表单字段，请根据上下文和简历信息进行填充。
简历信息：${JSON.stringify(profile)}
表单字段：${JSON.stringify(fields)}

规则：
1. 只填充你非常确定、且简历里有直接对应信息的字段；没有把握的绝对不要猜。
2. 不确定、简历里没有对应信息、或属于日期/时间/上传/附件类的字段，直接不要出现在 answers 里。
3. 有把握可以智能推断（例如：有邮箱可推算QQ号）。
请返回 JSON，格式如 {"answers": [{"id": "字段id", "value": "要填入的值"}]}，只返回 JSON，不要其他任何文字。answers 可以为空数组。`;

    fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: 'json_object' } // 强制 AI 返回 JSON
      })
    })
    .then(res => res.json())
    .then(data => {
      try {
        const content = data.choices[0].message.content;
        const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        // 兼容 {"answers": [...]} 和裸数组两种返回
        sendResponse({ success: true, answers: parsed.answers || parsed });
      } catch (e) {
        sendResponse({ success: false, error: 'AI 返回格式错误' });
      }
    }).catch(err => sendResponse({ success: false, error: err.message }));
  });
  return true;
}
  if (request.type === 'GENERATE_TEXT') {
    const { prompt, apiKey } = request;
    
    // 调用 DeepSeek API
    fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "你是一个校园招聘求职助手，请用简洁、专业、真诚的语气，帮我生成网申主观题的答案，字数控制在100-200字。" },
          { role: "user", content: prompt }
        ],
        stream: false
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.choices && data.choices.length > 0) {
        sendResponse({ success: true, content: data.choices[0].message.content });
      } else {
        sendResponse({ success: false, error: 'AI 返回格式异常' });
      }
    })
    .catch(error => {
      console.error('AI 请求失败:', error);
      sendResponse({ success: false, error: error.message });
    });

    return true; // 保持消息通道开启，等待异步请求返回
  }

    // [新增] AI 润色经历
    if (request.type === 'POLISH_TEXT') {
    const { text, apiKey } = request;
    if (!apiKey) return sendResponse({ success: false, error: '请先保存 API Key' });

    const prompt = `请作为资深HR和面试官，帮我润色以下项目/工作经历，使其更专业、更符合STAR法则（情境、任务、行动、结果），并用数据量化结果。字数控制在200字以内。\n\n原草稿：${text}`;

    fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        stream: false
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.choices && data.choices.length > 0) {
        sendResponse({ success: true, content: data.choices[0].message.content });
        } else {
        sendResponse({ success: false, error: 'AI 返回异常' });
        }
    })
    .catch(err => sendResponse({ success: false, error: err.message }));
    
    return true;
    }
});