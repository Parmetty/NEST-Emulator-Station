import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installMockApi } from './mock';
import './styles.css';

// Browser preview (no Electron preload): install a fixture API so the real
// renderer can still be reviewed. Inside Electron the bridge already exists.
if (!window.nest) installMockApi();

const container = document.getElementById('root');
if (!container) throw new Error('#root missing');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
