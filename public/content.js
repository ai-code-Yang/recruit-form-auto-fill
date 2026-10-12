// 防止重复注入
if (window.__campusApplyAgentLoaded) {
  console.log('[CampusApply] content.js 已存在，跳过重复注入');
} else {
  window.__campusApplyAgentLoaded = true;
  console.log('[CampusApply] content.js 已注入页面:', location.href);

  // ==========================================
  // 核心逻辑：执行填表（抽成函数，方便复用）
  // ==========================================
  function executeFormFill() {
    chrome.storage.local.get(['profile'], (result) => {
      if (!result.profile) return alert('请先点击插件图标录入个人信息！');
      const data = result.profile;

      const inputs = document.querySelectorAll('input, textarea, select');
      let filledCount = 0;

      const fieldDictionary = {
        name: ['姓名', '名字', '真实姓名', '联系人'],
        email: ['邮箱', '邮件', '电子邮箱', 'email'],
        phone: ['手机', '电话', '联系方式', '手机号码', '联系电话'],
        school: ['学校', '院校', '毕业院校', '学校名称', '大学'],
        degree: ['学历', '学位', '最高学历'],
        major: ['专业', '所学专业', '专业名称']
      };
      
      let unmatchedFields = [];

      inputs.forEach(input => {
        if (input.type === 'hidden') return;
        const identifier = ((input.id || '') + ' ' + (input.name || '') + ' ' + (input.placeholder || '') + ' ' + (input.className || '')).toLowerCase();

        // [新增] 在循环外面准备收集未匹配字段的数组
// 注意：这个数组要在 inputs.forEach 外面定义，比如 let unmatchedFields = [];

        let valueToFill = null;
        for (const [field, keywords] of Object.entries(fieldDictionary)) {
        if (keywords.some(keyword => identifier.includes(keyword))) {
            valueToFill = data[field];
            break;
        }
        }

        // [新增] 如果字典匹配失败，并且是普通的文本输入框，就提取上下文并保存起来
        if (!valueToFill && input.tagName === 'INPUT' && input.type === 'text') {
        // 复用我们刚才测试成功的“往上找”逻辑
        let contextText = '无';
        let currentNode = input.parentElement;
        for (let i = 0; i < 4 && currentNode; i++) {
            let text = currentNode.innerText.replace(input.value, '').trim();
            if (text.length > 0 && text.length < 15) {
            contextText = text;
            break;
            }
            currentNode = currentNode.parentElement;
        }
        
        if (contextText !== '无') {
            unmatchedFields.push({
            id: input.getAttribute('data-campus-id'), // 使用我们刚刚发的临时身份证
            context: contextText, // 比如 "姓名"、"生日/年龄"
            });
        }
        }

        if (valueToFill) {
          if (input.tagName === 'SELECT') {
            const options = Array.from(input.options);
            const matchedOption = options.find(opt => opt.text.includes(valueToFill) || valueToFill.includes(opt.text));
            if (matchedOption) {
              const selectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
              selectSetter.call(input, matchedOption.value);
            } else {
              console.log(`⚠️ 下拉框没有匹配到 "${valueToFill}"，当前选项:`, options.map(o => o.text));
              return;
            }
          } else {
            const prototype = input.tagName === 'TEXTAREA'
              ? window.HTMLTextAreaElement.prototype
              : window.HTMLInputElement.prototype;
            const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
            valueSetter.call(input, valueToFill);
          }

          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          filledCount++;
        }else {
            if (input.tagName === 'INPUT' && input.type === 'text' && input.offsetParent !== null) {
        // 尝试找它周围的文字作为上下文
        const parentText = input.closest('div')?.innerText || '';
        unmatchedFields.push({
            id: input.id || input.name || 'unknown', // 唯一标识
            context: parentText.substring(0, 100) // 截取上下文，避免太长
        });
        }
    }
    });
      
            // [新增] 如果存在未匹配字段，调用后台 AI 兜底
    if (unmatchedFields.length > 0) {
    console.log('🤖 发现未匹配字段，正在向大模型请求帮助:', unmatchedFields);
    chrome.runtime.sendMessage({ 
        type: 'LLM_FALLBACK', 
        fields: unmatchedFields 
    }, (response) => {
        if (response && response.success) {
        // 拿到 AI 的答案，回填
        response.answers.forEach(ans => {
            const el = document.querySelector(`[data-campus-id="${ans.id}"]`);
            if (el) {
            el.value = ans.value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.style.backgroundColor = '#cce5ff'; // 蓝色标识是AI填的
            console.log(`[AI填入] ${ans.id} => ${ans.value}`);
            }
        });
        alert('🎉 包含AI兜底的自动填充完成！');
        } else {
        console.error('AI 兜底失败:', response ? response.error : '未知错误');
        }
    });
    } else {
    // 原有的提示
    alert(`🎉 自动填充完成！共填入了 ${filledCount} 个字段。`);
    }

      console.log(`🎉 [CampusApply] 悬浮按钮自动填充完成！共填入 ${filledCount} 个字段`);
      alert(`🎉 自动填充完成！共填入了 ${filledCount} 个字段。`);
    });
  }

  // ==========================================
  // 创建右下角悬浮按钮的 UI
  // ==========================================
  function injectFloatingButton() {
    // 防止页面原本有 id 冲突
    if (document.getElementById('campus-apply-float-btn')) return;

    const btn = document.createElement('div');
    btn.id = 'campus-apply-float-btn';
    btn.innerHTML = '⚡ 一键网申';
    
    // 设置漂亮的悬浮样式
    Object.assign(btn.style, {
      position: 'fixed',
      bottom: '80px',
      right: '30px',
      zIndex: '999999',
      backgroundColor: '#007bff',
      color: 'white',
      padding: '12px 20px',
      borderRadius: '30px',
      cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      fontWeight: 'bold',
      fontSize: '14px',
      transition: 'all 0.3s ease',
      userSelect: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    });

    // ================== 【新增：拖拽逻辑】 start ==================
let isDragging = false;
let startX, startY, initialLeft, initialTop;

// 1. 鼠标按下：准备拖拽
btn.onmousedown = (e) => {
  isDragging = false; // 初始化未拖动
  startX = e.clientX;
  startY = e.clientY;
  // 获取按钮当前的位置
  const rect = btn.getBoundingClientRect();
  initialLeft = rect.left;
  initialTop = rect.top;

  // 按下时，移除 right/bottom 定位，改为 left/top 绝对定位
  btn.style.right = 'auto';
  btn.style.bottom = 'auto';
  btn.style.left = initialLeft + 'px';
  btn.style.top = initialTop + 'px';
  btn.style.cursor = 'grabbing'; // 鼠标样式变化

  // 2. 鼠标移动：实时更新位置
  const onMouseMove = (moveEvent) => {
    isDragging = true; // 标记发生了拖动
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    btn.style.left = initialLeft + dx + 'px';
    btn.style.top = initialTop + dy + 'px';
  };

  // 3. 鼠标松开：结束拖拽
  const onMouseUp = () => {
    btn.style.cursor = 'pointer';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};

// 4. 点击事件：防止拖拽结束后误触发填充
btn.onclick = () => {
  if (!isDragging) {
    executeFormFill();
  }
};
// ================== 【新增：拖拽逻辑】 end ==================

    // 把按钮添加到页面上
    document.body.appendChild(btn);
    console.log('[CampusApply] 悬浮按钮已注入');
  }
    // ================== 【测试代码】 start ==================
    // 测试：向上查找最近的、包含较短文字的父级容器，作为上下文
    function findInputContext() {
    const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], textarea');
    
    inputs.forEach((input, index) => {
        // [新增] 如果没有 id，我们就给它一个临时的 data-campus-id，方便 AI 返回后精准定位
        if (!input.id) {
            input.setAttribute('data-campus-id', `campus-input-${index}`);
        }

        if (input.offsetParent === null) return; // 跳过隐藏的

        let contextText = '无';
        let currentNode = input.parentElement;
        
        // 最多往上找 3 层父节点
        for (let i = 0; i < 3 && currentNode; i++) {
        // 提取当前容器的文字，并且把输入框本身的值替换掉
        let text = currentNode.innerText.replace(input.value, '').trim();
        
        // 经验法则：真实的标签文字通常很短（2-10个字）。
        // 如果文字太长，说明我们找错容器了（包住了整个页面），继续往上找或者放弃
        if (text.length > 0 && text.length < 15) {
            contextText = text;
            break; // 找到了，跳出循环
        }
        currentNode = currentNode.parentElement; // 继续往上
        }

        console.log(`[测试${index}] 输入框ID: "${input.id || '空'}", 提取到的上下文: "${contextText}"`);
    });
    }

    // 延迟 3 秒执行
    setTimeout(findInputContext, 3000);
// ================== 【测试代码】 end ==================

  // 页面加载时注入悬浮按钮
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectFloatingButton);
  } else {
    injectFloatingButton();
  }

  // ==========================================
  // 消息监听（保留弹窗发送过来的指令）
  // ==========================================
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'FILL_FORM') {
      executeFormFill(); // 弹窗点“一键填充”时，调用核心逻辑
      sendResponse({ status: 'done' });
    }

    if (request.type === 'FILL_TEXTAREA') {
      console.log('🔥 [CampusApply] 收到 AI 生成内容:', request.text);
      const textareas = document.querySelectorAll('textarea');
      let filledCount = 0;
      textareas.forEach(textarea => {
        if (textarea.offsetParent === null) return;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        nativeSetter.call(textarea, request.text);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        textarea.style.backgroundColor = '#d4edda';
        filledCount++;
      });
      sendResponse({ status: 'done', count: filledCount });
    }
  });
}
