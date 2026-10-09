import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Global pull-to-refresh prevention is handled via CSS overscroll-behavior in index.css
// to keep touch scrolling 100% native and passive on the compositor thread.

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error("Critical Error: Could not find root element to mount the application.");
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    console.error("Application Render Error:", error);
    rootElement.innerHTML = `
      <div style="padding: 20px; font-family: sans-serif; color: #721c24; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px; margin: 20px;">
        <h2 style="margin-top: 0;">Failed to Load Application</h2>
        <p>The application encountered a runtime error during initialization.</p>
        <pre style="background: rgba(0,0,0,0.05); padding: 10px; border-radius: 4px; overflow: auto;">${error instanceof Error ? error.message : String(error)}</pre>
        <p>Please check the browser console for more details.</p>
      </div>
    `;
  }
}