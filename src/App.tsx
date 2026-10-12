declare const chrome: any;

import { useState, useEffect } from 'react';
import './App.css';

interface Profile {
  name: string;
  email: string;
  phone: string;
}

function App() {
  const [profile, setProfile] = useState<Profile>({ name: '', email: '', phone: '' });
  const [status, setStatus] = useState('');

  // 页面打开时，从浏览器本地存储读取之前存的数据
  useEffect(() => {
    const chromeApi = (window as any).chrome;
    if (chromeApi && chromeApi.storage) {
     chromeApi.storage.local.get(['profile'], (result: any) => {
      if (result && result.profile) {
        setProfile(result.profile);
      }
    });
    }
  }, []);

  // 点击保存时，存入浏览器本地存储
  const handleSave = () => {
    const chromeApi = (window as any).chrome;
    if (chromeApi && chromeApi.storage) {
      chromeApi.storage.local.set({ profile }, () => {
        setStatus('✅ 个人信息已保存！');
      });
    }
  };

  return (
    <div className="popup-container">
      <h2>CampusApply 助手</h2>
      <p className="subtitle">请录入你的基础信息</p >
      
      <div className="form-group">
        <label>姓名：</label>
        <input
          type="text"
          value={profile.name}
          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          placeholder="例如：张三"
        />
      </div>
      
      <div className="form-group">
        <label>邮箱：</label>
        <input
          type="email"
          value={profile.email}
          onChange={(e) => setProfile({ ...profile, email: e.target.value })}
          placeholder="例如：zhangsan@example.com"
        />
      </div>

      <div className="form-group">
        <label>手机：</label>
        <input
          type="text"
          value={profile.phone}
          onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
          placeholder="例如：13800138000"
        />
      </div>

      <button className="save-btn" onClick={handleSave} style={{ marginBottom: '8px'}}>
        保存信息
      </button>

      <button
        className="save-btn"
        style={{ backgroundColor: '#28a745' }}
        onClick={() => {
          setStatus('⏳ 正在注入并填充...');
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
            const activeTab = tabs[0];
            if (!activeTab || !activeTab.id) {
              setStatus('❌ 找不到活动标签页');
              return;
            }
            // 主动注入 content.js（对"插件加载前就已打开的页面"也有效）
            chrome.scripting.executeScript(
              {
                target: { tabId: activeTab.id },
                files: ['content.js'],
              },
              () => {
                if (chrome.runtime.lastError) {
                  setStatus('❌ 注入失败：' + chrome.runtime.lastError.message);
                  return;
                }
                chrome.tabs.sendMessage(
                  activeTab.id,
                  { type: 'FILL_FORM', data: profile },
                  (resp: any) => {
                    if (chrome.runtime.lastError) {
                      setStatus('❌ 发送失败：' + chrome.runtime.lastError.message);
                      return;
                    }
                    setStatus(`✅ 已填充 ${resp?.count ?? 0} 个字段，请在页面中检查`);
                  }
                );
              }
            );
          });
        }}
      >
        ⚡ 一键填充当前网页
      </button>

      {status && (
        <p style={{ fontSize: '12px', color: '#555', marginTop: '8px', wordBreak: 'break-all' }}>
          {status}
        </p>
      )}
    </div>
  );
}

export default App;