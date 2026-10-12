// 防止重复注入
if (window.__campusApplyAgentLoaded) {
  console.log('[CampusApply] content.js 已存在，跳过重复注入');
} else {
  window.__campusApplyAgentLoaded = true;
  console.log('[CampusApply] content.js 已注入页面:', location.href);

  // ==========================================
  // 工具函数
  // ==========================================

  // 获取元素的标识特征（id/name/placeholder/class 拼接，全小写）
  function identifierOf(el) {
    return ((el.id || '') + ' ' + (el.name || '') + ' ' + (el.placeholder || '') + ' ' + (el.className || '')).toLowerCase();
  }

  // 向上找最多 3 层父容器，提取短文本作为"标签上下文"（应对 id/name 都为空的网站，如牛客）
  function shortContext(el) {
    let node = el.parentElement;
    for (let i = 0; i < 3 && node; i++) {
      const t = (node.innerText || '').replace(el.value || '', '').trim();
      if (t.length > 0 && t.length < 15) return t;
      node = node.parentElement;
    }
    return '';
  }

  // 给没有 id 的输入框分配临时标识（供 AI 兜底后精准回填）
  function ensureId(el) {
    if (!el.id) {
      el.setAttribute('data-campus-id', 'campus-' + Math.random().toString(36).slice(2, 10));
    }
    return el.id || el.getAttribute('data-campus-id');
  }

  // 通用填值：支持 input / textarea / 富文本(contenteditable，如 Quill 编辑器)
  function fillValue(el, value) {
    if (!value) return false;
    if (el.tagName === 'TEXTAREA') {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(el, value);
    } else if (el.isContentEditable) {
      // 富文本编辑器不能直接改 innerText（内部状态不认，会被还原），
      // 必须模拟真实键盘输入：聚焦 → 全选 → insertText。
      // 注意：编辑器若在 iframe 里，execCommand 必须作用于它所在的文档
      const doc = el.ownerDocument;
      el.focus();
      doc.execCommand('selectAll', false, null);
      doc.execCommand('insertText', false, value);
    } else {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, value);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.style.backgroundColor = '#fff3cd';
    return true;
  }

  // 从锚点元素向上找"最小的、包含描述输入区(textarea 或富文本)的祖先容器"
  // 保证角色/描述和项目名称在同一个经历区块里，不会串到别的区块
  function findBlock(titleInput) {
    let node = titleInput.parentElement;
    while (node && node !== document.body) {
      if (getEditables(node).length > 0) return node;
      node = node.parentElement;
    }
    return document;
  }

  // 收集某个容器（或 iframe 文档）下的可输入元素
  function collectEditables(root, seen, result) {
    // 根元素本身可编辑的情况（UEditor 的 iframe body 就是这样）
    if (root.isContentEditable && !seen.has(root)) { seen.add(root); result.push(root); }
    root.querySelectorAll('textarea, [contenteditable]').forEach(el => {
      if (!seen.has(el)) { seen.add(el); result.push(el); }
    });
    root.querySelectorAll('div, p, section').forEach(el => {
      if (el.isContentEditable && !seen.has(el)) {
        // 跳过已经收集过的外层容器（比如整个编辑器外壳），只留最内层可编辑区
        const nested = result.some(r => r === el || el.contains(r) || r.contains(el));
        if (!nested) { seen.add(el); result.push(el); }
      }
    });
  }

  // 元素是否真实可见
  function isVisible(el) {
    try {
      return el.offsetParent !== null || el.getClientRects().length > 0;
    } catch (e) { return false; }
  }

  // 深度收集：穿透同源 iframe 和 open shadow DOM
  // （富文本编辑器常用 iframe 实现，牛客等 React 站点也可能把编辑器包进 shadow root）
  function deepCollect(container, seen, result, depth) {
    if (depth > 6) return;
    collectEditables(container, seen, result);
    container.querySelectorAll('*').forEach(el => {
      if (el.tagName === 'IFRAME') {
        try {
          const doc = el.contentDocument;
          if (doc && doc.body) deepCollect(doc.body, seen, result, depth + 1);
        } catch (e) { /* 跨域 iframe 无法访问，忽略 */ }
      } else if (el.shadowRoot) {
        deepCollect(el.shadowRoot, seen, result, depth + 1);
      }
    });
  }

  // 收集容器内所有"可输入文字的区域"：textarea + 各种 contenteditable 形态
  function getEditables(container) {
    const seen = new Set();
    const result = [];
    deepCollect(container, seen, result, 0);
    // 关键：所有元素（包括 textarea）都必须"真实可见"。
    // 富文本编辑器网站常带一个隐藏 textarea 作为提交镜像，若不过滤会把内容填进看不见的 textarea。
    return result.filter(el =>
      (el.tagName === 'TEXTAREA' || el.isContentEditable) && isVisible(el)
    );
  }

  // 关键词是否命中（同时检查元素标识和标签上下文）
  function hit(el, keywords) {
    const idf = identifierOf(el);
    const ctx = shortContext(el);
    return keywords.some(k => idf.includes(k) || ctx.includes(k));
  }

  // ==========================================
  // 核心逻辑：执行填表
  // ==========================================
  function executeFormFill(msg) {
    chrome.storage.local.get(['profile', 'experiences'], (result) => {
      if (!result.profile) return alert('请先点击插件图标录入个人信息！');
      const data = result.profile;
      // 优先用消息带来的经历（弹窗当前内容），否则用存储里的
      const experiences = ((msg && msg.experiences && msg.experiences.length) ? msg.experiences : (result.experiences || []))
        .filter(e => (e.title || '').trim() || (e.role || '').trim() || (e.description || '').trim());

      const alreadyFilled = new Set(); // 已填过的元素，避免重复覆盖

      // ==========================================
      // 第一步：填充项目/工作经历
      // ==========================================
      const EXP = {
        title: ['项目名称', '项目名', '项目题目', '项目', 'projectname', 'project_name'],
        role: ['担任角色', '担任职务', '担任岗位', '角色', '职务', '岗位', 'rolename', 'role_name'],
        desc: ['项目描述', '项目介绍', '项目内容', '项目详情', '工作内容', '主要工作', '职责描述', '项目职责', '描述', 'description', 'content']
      };

      let expFilled = 0;

      if (experiences.length > 0) {
        // 以"项目名称"输入框作为每段经历的锚点（第 i 个锚点对应第 i 段经历）
        const titleInputs = Array.from(document.querySelectorAll('input')).filter(el => {
          if (el.type === 'hidden' || el.offsetParent === null || alreadyFilled.has(el)) return false;
          return hit(el, EXP.title);
        });

        if (titleInputs.length > 0) {
          titleInputs.forEach((titleInput, i) => {
            const exp = experiences[i];
            if (!exp) return;

            // 找到这段经历所在的区块（向上找最小的、同时包含描述输入区的容器）
            const block = findBlock(titleInput);

            if (exp.title && fillValue(titleInput, exp.title)) { alreadyFilled.add(titleInput); expFilled++; }

            // 区块内找"角色"输入框：先按关键词，找不到就取区块内第一个其他可见输入框
            if (exp.role) {
              let roleEl = Array.from(block.querySelectorAll('input')).find(el =>
                el !== titleInput && el.type !== 'hidden' && el.offsetParent !== null && !alreadyFilled.has(el) && hit(el, EXP.role)
              );
              if (!roleEl) {
                roleEl = Array.from(block.querySelectorAll('input')).find(el =>
                  el !== titleInput && el.type !== 'hidden' && el.offsetParent !== null && !alreadyFilled.has(el)
                );
              }
              if (roleEl && fillValue(roleEl, exp.role)) { alreadyFilled.add(roleEl); expFilled++; }
            }

            // 区块内找"描述"：先按关键词，找不到就取区块内第一个可输入区
            if (exp.description) {
              const candidates = getEditables(block).filter(el => !alreadyFilled.has(el));
              console.log('[CampusApply] 区块内候选描述区域:', candidates.length,
                candidates.map(el => el.tagName + '.' + (el.className || '').toString().slice(0, 40)));
              // 优先级：关键词命中 > 可见的富文本编辑器 > 第一个候选
              // （富文本站点常把隐藏 textarea 和可见编辑器放一起，盲取第一个会填错）
              let descEl = candidates.find(el => hit(el, EXP.desc))
                || candidates.find(el => el.isContentEditable)
                || candidates[0];
              if (descEl) {
                console.log('[CampusApply] 选中的描述区域:', descEl.tagName,
                  'contenteditable=' + descEl.isContentEditable,
                  'class=' + (descEl.className || '').toString().slice(0, 50));
              }
              if (descEl && fillValue(descEl, exp.description)) {
                alreadyFilled.add(descEl);
                expFilled++;
              } else {
                console.warn('[CampusApply] ⚠️ 找到了区块但没填上描述，候选区:', candidates,
                  '| 页面 iframe 数:', document.querySelectorAll('iframe').length);
              }
            }
          });
        } else {
          // 页面上没有"项目名称"锚点：退而求其次，把第一段经历填进第一个匹配"描述"的输入区
          const first = experiences[0];
          const descEl = getEditables(document).find(el => hit(el, EXP.desc));
          if (descEl && first.description && fillValue(descEl, first.description)) {
            alreadyFilled.add(descEl);
            expFilled++;
          }
        }
      }

      // ==========================================
      // 第二步：填充基础信息（跳过已被经历填充的元素）
      // ==========================================
      const fieldDictionary = {
        name: ['姓名', '名字', '真实姓名', '联系人'],
        email: ['邮箱', '邮件', '电子邮箱', 'email', 'e-mail'],
        phone: ['手机', '电话', '联系方式', '手机号码', '联系电话', 'tel', 'mobile'],
        school: ['学校', '院校', '毕业院校', '学校名称', '大学'],
        degree: ['学历', '学位', '最高学历'],
        major: ['专业', '所学专业', '专业名称'],
        wechat: ['微信', 'weixin', 'wechat'],
        qq: ['qq'],
        birthday: ['出生年月', '出生日期', '生日', 'birth'],
        location: ['居住地', '现居', '所在地', '常住', '城市']
      };

      const inputs = document.querySelectorAll('input, textarea, select');
      let filledCount = 0;
      const unmatchedFields = [];

      inputs.forEach(input => {
        if (input.type === 'hidden' || alreadyFilled.has(input)) return;
        const identifier = identifierOf(input);

        let valueToFill = null;
        for (const [field, keywords] of Object.entries(fieldDictionary)) {
          if (keywords.some(kw => identifier.includes(kw))) {
            valueToFill = data[field];
            break;
          }
        }

        if (valueToFill) {
          if (input.tagName === 'SELECT') {
            const options = Array.from(input.options);
            const matchedOption = options.find(opt => opt.text.includes(valueToFill) || valueToFill.includes(opt.text));
            if (matchedOption) {
              const selectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
              selectSetter.call(input, matchedOption.value);
              input.dispatchEvent(new Event('change', { bubbles: true }));
              filledCount++;
            } else {
              console.log(`⚠️ 下拉框没有匹配到 "${valueToFill}"，当前选项:`, options.map(o => o.text));
            }
          } else {
            if (fillValue(input, valueToFill)) filledCount++;
          }
        } else if (input.tagName === 'INPUT' && input.type === 'text' && input.offsetParent !== null) {
          // 未匹配字段：提取上下文，交给 AI 兜底
          // 日期/时间/上传类字段 AI 无法处理，直接跳过，避免被填成"无"
          const contextText = shortContext(input);
          if (contextText && !/时间|日期|年龄|生日|上传|附件|照片/.test(contextText)) {
            unmatchedFields.push({
              id: ensureId(input),
              context: contextText,
              currentPageUrl: window.location.href
            });
          }
        }
      });

      // ==========================================
      // 第三步：汇总反馈 / AI 兜底
      // ==========================================
      let summary = `🎉 自动填充完成！\n基础信息已填 ${filledCount} 项`;
      if (experiences.length > 0) {
        summary += `，项目经历已填 ${expFilled} 项`;
        if (expFilled === 0) summary += '\n⚠️ 未在页面识别到项目经历输入框，请手动填写或检查页面结构';
      }

      if (unmatchedFields.length > 0) {
        console.log('🤖 发现未匹配字段，正在向大模型请求帮助:', JSON.stringify(unmatchedFields));
        chrome.runtime.sendMessage({
          type: 'LLM_FALLBACK',
          fields: unmatchedFields
        }, (response) => {
          if (response && response.success) {
            let aiFilled = 0;
            (response.answers || []).forEach(ans => {
              // 规则：AI 不确定（返回"无"或空值）就不填，避免污染表单
              if (!ans.value || !ans.value.trim() || ans.value.trim() === '无') return;
              const el = document.querySelector(`[data-campus-id="${ans.id}"], #${ans.id}`);
              if (el) {
                fillValue(el, ans.value);
                el.style.backgroundColor = '#cce5ff'; // 蓝色标识是 AI 填的
                console.log(`[AI填入] ${ans.id} => ${ans.value}`);
                aiFilled++;
              }
            });
            const skipped = unmatchedFields.length - aiFilled;
            alert(summary + (aiFilled > 0 ? `\nAI 智能填入 ${aiFilled} 个字段` : '') +
              (skipped > 0 ? `\nAI 不确定的 ${skipped} 个字段已跳过` : ''));
          } else {
            console.error('AI 兜底失败:', response ? response.error : '未知错误');
            alert(summary + `\n（AI 兜底失败：${response ? response.error : '未知错误'}）`);
          }
        });
      } else {
        alert(summary);
      }

      console.log(`🎉 [CampusApply] 填充完成：基础 ${filledCount} 项，经历 ${expFilled} 项`);
    });
  }

  // ==========================================
  // 创建右下角悬浮按钮的 UI（支持拖拽）
  // ==========================================
  function injectFloatingButton() {
    if (document.getElementById('campus-apply-float-btn')) return;

    const btn = document.createElement('div');
    btn.id = 'campus-apply-float-btn';
    btn.innerHTML = '⚡ 一键网申';

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

    let isDragging = false, startX, startY, initialLeft, initialTop;

    btn.onmousedown = (e) => {
      isDragging = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = btn.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      btn.style.right = 'auto';
      btn.style.bottom = 'auto';
      btn.style.left = initialLeft + 'px';
      btn.style.top = initialTop + 'px';
      btn.style.cursor = 'grabbing';

      const onMouseMove = (moveEvent) => {
        isDragging = true;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        btn.style.left = initialLeft + dx + 'px';
        btn.style.top = initialTop + dy + 'px';
      };

      const onMouseUp = () => {
        btn.style.cursor = 'pointer';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    btn.onclick = () => {
      if (!isDragging) executeFormFill();
    };

    document.body.appendChild(btn);
    console.log('[CampusApply] 悬浮按钮已注入');
  }

  // 页面加载时注入悬浮按钮
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectFloatingButton);
  } else {
    injectFloatingButton();
  }

  // ==========================================
  // 消息监听（弹窗发送过来的指令）
  // ==========================================
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'FILL_FORM') {
      executeFormFill(request); // 把消息（含 experiences）传进去
      sendResponse({ status: 'done' });
    }

    if (request.type === 'FILL_TEXTAREA') {
      console.log('🔥 [CampusApply] 收到 AI 生成内容:', request.text);
      let filledCount = 0;

      // 统一走 getEditables：覆盖 textarea、contenteditable、iframe/shadow DOM 里的编辑器
      getEditables(document).forEach(el => {
        fillValue(el, request.text);
        el.style.backgroundColor = '#d4edda';
        filledCount++;
      });

      console.log(`✅ [CampusApply] AI 内容已填入 ${filledCount} 个区域`);
      sendResponse({ status: 'done', count: filledCount });
    }
  });
}
