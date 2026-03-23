import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import App from './App.tsx'

const initialTheme = localStorage.getItem("sc-theme") ?? "dark";
document.documentElement.classList.toggle("dark", initialTheme !== "light");

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
