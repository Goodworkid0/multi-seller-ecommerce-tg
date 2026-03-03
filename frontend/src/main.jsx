import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { useThemeStore } from './store/themeStore'

// Apply saved theme
useThemeStore.getState().init()

// Telegram Mini App - expand to full screen
if (window.Telegram?.WebApp) {
  window.Telegram.WebApp.expand()
  window.Telegram.WebApp.ready()
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
