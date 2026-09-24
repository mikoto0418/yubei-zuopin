import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConfigProvider, App as AntApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import "antd/dist/reset.css";
import App from "./App.jsx";
import { AuthProvider } from "./auth.jsx";
import { buildAppleTheme } from "./theme.js";
import "./apple-tokens.css";
import "./styles.css";

/**
 * 跟随系统深浅色。令牌层（apple-tokens.css）已用 prefers-color-scheme
 * 切换 CSS 变量；antd 主题需要 JS 侧同步，避免组件库与自定义样式脱节。
 */
function useSystemDark() {
  const [dark, setDark] = useState(
    () => typeof window !== "undefined"
      && window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setDark(e.matches);
    // 兼容旧版 Safari 的 addListener
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  return dark;
}

function Root() {
  const dark = useSystemDark();
  // 同步 <html> 的 color-scheme，让滚动条/表单控件原生部分也跟随
  useEffect(() => {
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);

  return (
    <ConfigProvider locale={zhCN} theme={buildAppleTheme(dark)}>
      <AntApp>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
