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
        alert('✅ 个人信息已保存！');
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

      <button className="save-btn" onClick={handleSave}>
        保存信息
      </button>
    </div>
  );
}

export default App;