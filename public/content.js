// 防止重复注入
if (window.__campusApplyAgentLoaded) {
  console.log('[CampusApply] content.js 已存在，跳过重复注入');
} else {
  window.__campusApplyAgentLoaded = true;
  console.log('[CampusApply] content.js 已注入页面:', location.href);

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // ==========================================
    // 功能 1：自动填充基础信息（含字典匹配和下拉框）
    // ==========================================
    if (request.type === 'FILL_FORM') {
      const data = request.data;
      console.log('🔥 [CampusApply] 收到填表数据:', data);

      // 关键：把 select 也加进去
      const inputs = document.querySelectorAll('input, textarea, select');
      let filledCount = 0;

      // 智能匹配字典（支持同义词）
      const fieldDictionary = {
        name: ['姓名', '名字', '真实姓名', '联系人'],
        email: ['邮箱', '邮件', '电子邮箱', 'email'],
        phone: ['手机', '电话', '联系方式', '手机号码', '联系电话'],
        school: ['学校', '院校', '毕业院校', '学校名称', '大学'],
        degree: ['学历', '学位', '最高学历'],
        major: ['专业', '所学专业', '专业名称']
      };

      inputs.forEach(input => {
        if (input.type === 'hidden') return;

        const identifier = (
          (input.id || '') + ' ' +
          (input.name || '') + ' ' +
          (input.placeholder || '') + ' ' +
          (input.className || '')
        ).toLowerCase();

        let valueToFill = null;

        // 遍历字典，看当前输入框的特征符合哪个字段
        for (const [field, keywords] of Object.entries(fieldDictionary)) {
          if (keywords.some(keyword => identifier.includes(keyword))) {
            valueToFill = data[field];
            break;
          }
        }

        // 如果匹配到了值，就填入
        if (valueToFill) {
          // 处理下拉框 <select>
          if (input.tagName === 'SELECT') {
            const options = Array.from(input.options);
            const matchedOption = options.find(opt => 
              opt.text.includes(valueToFill) || valueToFill.includes(opt.text)
            );
            if (matchedOption) {
              input.value = matchedOption.value;
            } else {
              return; // 没找到对应选项，跳过
            }
          } else {
            // 普通输入框，使用原生 setter（解决 React/Vue 不响应问题）
            const proto = (input instanceof HTMLTextAreaElement)
              ? window.HTMLTextAreaElement.prototype
              : window.HTMLInputElement.prototype;
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            nativeInputValueSetter.call(input, valueToFill);
          }

          // 触发事件
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.style.backgroundColor = '#fff3cd'; // 黄色背景
          filledCount++;
        }
      });

      console.log(`🎉 [CampusApply] 自动填充完成！共填入 ${filledCount} 个字段`);
      sendResponse({ status: 'done', count: filledCount });
    }

    // ==========================================
    // 功能 2：AI 小作文自动填充（你刚刚丢失的逻辑在这里！）
    // ==========================================
    if (request.type === 'FILL_TEXTAREA') {
      console.log('🔥 [CampusApply] 收到 AI 生成内容:', request.text);
      
      const textareas = document.querySelectorAll('textarea');
      let filledCount = 0;

      textareas.forEach(textarea => {
        // 忽略隐藏的文本域
        if (textarea.offsetParent === null) return;

        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        nativeSetter.call(textarea, request.text);

        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        textarea.style.backgroundColor = '#d4edda'; // 绿色背景
        filledCount++;
      });

      console.log(`✅ [CampusApply] AI 内容已填入 ${filledCount} 个文本域`);
      sendResponse({ status: 'done', count: filledCount });
    }
  });
}