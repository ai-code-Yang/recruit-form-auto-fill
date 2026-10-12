// 防止重复注入（manifest 自动注入 + popup 主动注入可能都执行本文件）
if (window.__campusApplyAgentLoaded) {
  console.log('[CampusApply] content.js 已存在，跳过重复注入');
} else {
  window.__campusApplyAgentLoaded = true;
  console.log('[CampusApply] content.js 已注入页面:', location.href);

  // 监听来自弹窗的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'FILL_FORM') {
      const data = request.data;
      console.log('🔥 [CampusApply] 收到填表数据:', data);

      // 找到页面上所有的输入框（包括 textarea）
      const inputs = document.querySelectorAll('input, textarea');
      let filledCount = 0;

      inputs.forEach(input => {
        if (input.type === 'hidden') return;

        // 获取输入框的各种特征，拼成一个小写字符串
        const identifier = (
          (input.id || '') + ' ' +
          (input.name || '') + ' ' +
          (input.placeholder || '') + ' ' +
          (input.className || '')
        ).toLowerCase();

        let valueToFill = null;

        // 简单的规则匹配
        if (identifier.includes('name') || identifier.includes('姓名')) {
          valueToFill = data.name;
        } else if (identifier.includes('email') || identifier.includes('邮箱') || identifier.includes('e-mail')) {
          valueToFill = data.email;
        } else if (identifier.includes('phone') || identifier.includes('手机') || identifier.includes('电话') || identifier.includes('tel')) {
          valueToFill = data.phone;
        }

        // 如果匹配到了值，就填入
        if (valueToFill) {
          // React/Vue 写的网申页面，直接赋值 input.value 没用，必须用原生 setter
          const proto = (input instanceof HTMLTextAreaElement)
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          nativeInputValueSetter.call(input, valueToFill);

          // 触发事件，让网申系统知道数据变了
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));

          // 加个黄色背景标识填了哪里
          input.style.backgroundColor = '#fff3cd';
          filledCount++;
        }
      });

      console.log('🎉 [CampusApply] 自动填充完成！共填入 ' + filledCount + ' 个字段');
      sendResponse({ status: 'done', count: filledCount });
    }
  });
}
