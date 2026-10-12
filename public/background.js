// 监听来自弹窗的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 如果收到 AI 生成指令
  if (request.type === 'LLM_FALLBACK') {
  const fields = request.fields;
  
  // 取出用户的简历信息（从 storage 拿，这里简化写死一个示例，实际要存）
  chrome.storage.local.get(['profile', 'apiKey'], (result) => {
    const profile = result.profile || {};
    const apiKey = result.apiKey || '';
    if (!apiKey) return sendResponse({ success: false, error: '无 API Key' });

    // 构造给 AI 的提示词
    const prompt = `以下是一些未匹配的网页表单字段，请根据上下文判断它们应该填入下面简历中的哪个信息。简历信息：${JSON.stringify(profile)}。\n表单字段列表：${JSON.stringify(fields)}\n请返回一个JSON数组，格式如 [{"id": "字段id", "value": "要填入的值"}]，只返回JSON，不要其他文字。`;

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
        const parsed = JSON.parse(data.choices[0].message.content);
        sendResponse({ success: true, answers: parsed });
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

  // [新增] 处理复杂字段的大模型兜底
    if (request.type === 'LLM_FALLBACK') {
      const fields = request.fields;
      console.log('后台收到大模型兜底请求:', fields);

      // 从存储里取出 API Key 和个人信息
      // [修改] 读取经历，让 AI 拥有完整上下文
        chrome.storage.local.get(['profile', 'experiences', 'apiKey'], (result) => {
        const profile = result.profile || {};
        const experiences = result.experiences || [];
        const apiKey = result.apiKey || '';
        
        // 把 profile 和 experiences 合并发给 AI
        const prompt = `以下是一些未匹配的网页表单字段，请根据上下文判断它们应该填入下面简历中的哪个信息。
        简历基础信息：${JSON.stringify(profile)}
        项目/工作经历列表：${JSON.stringify(experiences)}
        表单字段列表：${JSON.stringify(fields)}
        
        注意：如果是填写项目经历相关的字段（如公司名、职位、描述），请从 experiences 列表中智能提取。不要直接输出对象，把内容拼成字符串填入。
        请返回 JSON 数组，格式如 [{"id": "字段id", "value": "要填入的值"}]，只返回这个 JSON，绝对不要任何解释文字。`;

        fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: 'json_object' } // 强制 AI 返回 JSON 格式
          })
        })
        .then(res => res.json())
        .then(data => {
          try {
            const content = data.choices[0].message.content;
            // 有些模型返回的 JSON 会被包在 markdown 代码块里，这里做个兼容
            const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(jsonStr);
            sendResponse({ success: true, answers: parsed });
          } catch (e) {
            console.error('解析 AI 返回失败:', e);
            sendResponse({ success: false, error: 'AI 返回格式无法解析' });
          }
        })
        .catch(err => sendResponse({ success: false, error: err.message }));
      });
      
      return true; // 保持通信通道打开
    }
});