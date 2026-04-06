import React from 'react'
import ReactDOM from 'react-dom/client'
import Index from './Index'
import './index.css'

// Default to dark theme
document.documentElement.classList.add('dark')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Index />
  </React.StrictMode>,
)
