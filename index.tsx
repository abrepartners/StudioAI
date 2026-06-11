import React from 'react';
import ReactDOM from 'react-dom/client';
import AppRouter from './src/routes/AppRouter';

// Engine A/B override — captured here, before the router mounts, because the
// authed redirect at "/" (Navigate to "/vellum") strips the query string.
// ?engine=nano|seedream sticks for the tab session; ?engine=fill clears it.
try {
  const eng = new URLSearchParams(window.location.search).get('engine');
  if (eng === 'nano' || eng === 'seedream') {
    sessionStorage.setItem('studioai_engine', eng);
  } else if (eng === 'fill') {
    sessionStorage.removeItem('studioai_engine');
  }
} catch {}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);