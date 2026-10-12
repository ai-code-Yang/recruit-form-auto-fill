chrome.runtime.onInstalled.addListener(() => {
  console.log("CampusApply-Agent 插件已安装！");
});

// 处理来自弹窗的 AI 生成请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GENERATE_TEXT') {
    console.log('[CampusApply] background 收到生成请求:', request.prompt);

    callDeepSeek(request.prompt, request.apiKey)
      .then((content) => sendResponse({ success: true, content: content }))
      .catch((err) => {
        console.error('[CampusApply] DeepSeek 调用失败:', err);
        sendResponse({ success: false, error: String((err && err.message) || err) });
      });

    // 必须返回 true，告诉 Chrome“响应是异步的”，否则 sendResponse 会失效
    return true;
  }
});

async function callDeepSeek(prompt, apiKey) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: '你是一个校招网申小作文助手。用中文、第一人称、真诚简洁地回答网申开放题，输出纯文本（不要 Markdown 标记），控制在 300 字以内。'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 1.3
    })
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = (body.error && body.error.message) || JSON.stringify(body);
    } catch (e) { /* 忽略解析失败，用 statusText */ }
    throw new Error('HTTP ' + res.status + ': ' + detail);
  }

  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('API 返回内容为空: ' + JSON.stringify(data).slice(0, 200));
  return content.trim();
}
