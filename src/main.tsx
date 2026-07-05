import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register Service Worker for offline capabilities only in production build environment
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  if ((import.meta as any).env?.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("ServiceWorker successfully registered with scope:", registration.scope);
        })
        .catch((error) => {
          console.warn("ServiceWorker registration failed:", error);
        });
    });
  } else {
    // In local development, unregister any active service workers to prevent cached development modules
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().then((success) => {
          if (success) {
            console.log("Unregistered stale development ServiceWorker to prevent dynamic module conflicts");
          }
        });
      }
    });
    // Clear caches in development environment
    if ("caches" in window) {
      caches.keys().then((keys) => {
        keys.forEach((key) => caches.delete(key));
      });
    }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

