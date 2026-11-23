import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
// Register cascade layers before App imports feature styles.
import './styles.css';
import App from './app/App';
import { resetLegacyBusinessStorage } from './state/business-storage';
resetLegacyBusinessStorage(localStorage);
resetLegacyBusinessStorage(sessionStorage);
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
