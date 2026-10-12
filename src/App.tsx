import { useState, useEffect } from 'react';
import './App.css';

// 强行用 as any 绕开 TypeScript 对 chrome 变量的报错
const chromeApi = (window as any).chrome;

interface Profile {
  name: string;
  email: string;
  phone: string;
  school: string;
  degree: string;
  major: string;
  wechat: string;
  qq: string;
  birthday: string;
  location: string;
}

function App() {
  const [profile, setProfile] = useState<Profile>({ name: '', email: '', phone: '', school: '', degree: '', major: '', wechat: '', qq: '', birthday: '', location: '' });
  const [aiPrompt, setAiPrompt] = useState('');     // 用户输入的题目
  const [aiResult, setAiResult] = useState('');     // AI生成的结果
  const [apiKey, setApiKey] = useState('');         // DeepSeek API Key
  const [loading, setLoading] = useState(false);    // 是否正在生成

  // 页面打开时，从浏览器本地存储读取之前存的数据
  useEffect(() => {
    if (chromeApi && chromeApi.storage) {
      chromeApi.storage.local.get(['profile', 'apiKey'], (result: any) => {
        if (result.profile) setProfile(result.profile);
        if (result.apiKey) setApiKey(result.apiKey);
      });
    }
  }, []);

  // 保存个人信息
  const handleSave = () => {
    if (chromeApi && chromeApi.storage) {
      chromeApi.storage.local.set({ profile }, () => {
        alert('✅ 个人信息已保存！');
      });
    }
  };

  // 保存 API Key
  const handleSaveApiKey = () => {
    if (chromeApi && chromeApi.storage) {
      chromeApi.storage.local.set({ apiKey }, () => {
        alert('✅ API Key 已保存！');
      });
    }
  };

  // 向当前活动标签页发消息：先主动注入 content.js，再发送（对 file:// 页面和“未刷新的旧页面”都有效）
  const sendToActiveTab = (message: any) => {
    chromeApi.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.id) return;
      chromeApi.scripting.executeScript(
        { target: { tabId: activeTab.id }, files: ['content.js'] },
        () => {
          if (chromeApi.runtime.lastError) {
            alert('❌ 注入失败：' + chromeApi.runtime.lastError.message +
              '\n\n如果是本地文件页面，请到 扩展详情页 打开“允许访问文件网址”');
            return;
          }
          chromeApi.tabs.sendMessage(activeTab.id, message, () => {
            if (chromeApi.runtime.lastError) {
              alert('❌ 发送失败：' + chromeApi.runtime.lastError.message);
            }
          });
        }
      );
    });
  };

  // 一键填充基础信息
  const handleFillForm = () => {
    sendToActiveTab({ type: 'FILL_FORM', data: profile });
  };

  // AI 写小作文
  const handleGenerateAI = () => {
    if (!aiPrompt) return alert('请输入题目');
    if (!apiKey) return alert('请先在下方保存你的 DeepSeek API Key');
    setLoading(true);

    if (chromeApi && chromeApi.runtime) {
      chromeApi.runtime.sendMessage(
        { type: 'GENERATE_TEXT', prompt: aiPrompt, apiKey: apiKey },
        (response: any) => {
          setLoading(false);
          if (response && response.success) {
            setAiResult(response.content);
            // 把生成的文字发送给网页内容脚本，让它填入页面
            sendToActiveTab({ type: 'FILL_TEXTAREA', text: response.content });
          } else {
            alert('生成失败：' + (response ? response.error : '未知错误'));
          }
        }
      );
    }
  };

  return (
    <div className="popup-container">
      <h2>CampusApply 助手</h2>
      <p className="subtitle">请录入你的基础信息</p >
      
      {/* --- 基础信息表单 --- */}
      <div className="form-group">
        <label>姓名：</label>
        <input type="text" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="例如：张三" />
      </div>
      {/* [新增] 更多个人信息 */}
      <div className="form-group">
        <label>微信：</label>
        <input type="text" value={profile.wechat} onChange={(e) => setProfile({ ...profile, wechat: e.target.value })} placeholder="例如：wxid_123456" />
      </div>
      <div className="form-group">
        <label>QQ：</label>
        <input type="text" value={profile.qq} onChange={(e) => setProfile({ ...profile, qq: e.target.value })} placeholder="例如：10001" />
      </div>
      <div className="form-group">
        <label>出生年月：</label>
        <input type="text" value={profile.birthday} onChange={(e) => setProfile({ ...profile, birthday: e.target.value })} placeholder="例如：2002-05" />
      </div>
      <div className="form-group">
        <label>居住地：</label>
        <input type="text" value={profile.location} onChange={(e) => setProfile({ ...profile, location: e.target.value })} placeholder="例如：北京市海淀区" />
      </div>
      <div className="form-group">
        <label>邮箱：</label>
        <input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} placeholder="例如：zhangsan@example.com" />
      </div>
      <div className="form-group">
        <label>手机：</label>
        <input type="text" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="例如：13800138000" />
      </div>
      <div className="form-group">
        <label>学校：</label>
        <input type="text" value={profile.school} onChange={(e) => setProfile({ ...profile, school: e.target.value })} placeholder="例如：清华大学" />
      </div>
      <div className="form-group">
        <label>学历：</label>
        <input type="text" value={profile.degree} onChange={(e) => setProfile({ ...profile, degree: e.target.value })} placeholder="例如：本科" />
      </div>
      <div className="form-group">
        <label>专业：</label>
        <input type="text" value={profile.major} onChange={(e) => setProfile({ ...profile, major: e.target.value })} placeholder="例如：计算机科学与技术" />
      </div>
      <button className="save-btn" onClick={handleSave} style={{ marginBottom: '8px' }}>
        保存信息
      </button>
      <button className="save-btn" style={{ backgroundColor: '#28a745' }} onClick={handleFillForm}>
        ⚡ 一键填充当前网页
      </button>

      {/* --- AI 小作文功能区 --- */}
      <div style={{ marginTop: '16px', borderTop: '1px solid #ccc', paddingTop: '12px' }}>
        <label style={{ fontSize: '13px', fontWeight: 'bold' }}>✨ AI 写网申小作文：</label>
        <input 
          type="text" 
          placeholder="输入题目，例如：你最大的缺点是什么？" 
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          style={{ width: '100%', padding: '6px', marginTop: '4px', boxSizing: 'border-box' }}
        />
        <button 
          className="save-btn"
          onClick={handleGenerateAI}
          disabled={loading}
          style={{ backgroundColor: '#ffc107', color: '#333', marginTop: '6px' }}
        >
          {loading ? 'AI 正在思考中...' : '✨ AI 帮我写'}
        </button>
        {aiResult && (
          <div style={{ marginTop: '8px', fontSize: '12px', backgroundColor: '#f8f9fa', padding: '6px', borderRadius: '4px', maxHeight: '80px', overflowY: 'auto' }}>
            AI生成：{aiResult}
          </div>
        )}
      </div>

      {/* --- API Key 设置区 --- */}
      <div style={{ marginTop: '12px', borderTop: '1px dashed #eee', paddingTop: '8px' }}>
        <label style={{ fontSize: '12px', color: '#666' }}>DeepSeek API Key：</label>
        <input 
          type="password" 
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="输入你的 API Key (sk-...)" 
          style={{ width: '100%', padding: '4px', marginTop: '4px', boxSizing: 'border-box' }}
        />
        <button 
          onClick={handleSaveApiKey}
          style={{ width: '100%', padding: '4px', marginTop: '4px', fontSize: '12px', cursor: 'pointer' }}
        >
          保存 API Key
        </button>
      </div>
    </div>
  );
}

export default App;