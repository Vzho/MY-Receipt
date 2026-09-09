import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AuthGate } from './components/AuthGate.tsx';
import { ResitAiDashboardDemo } from './components/ResitAiDashboardDemo.tsx';
import './index.css';

const searchParams = new URLSearchParams(window.location.search);
const showUiDemo = searchParams.has('ui-demo');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showUiDemo ? (
      <ResitAiDashboardDemo />
    ) : (
      <AuthGate>
        <App />
      </AuthGate>
    )}
  </StrictMode>,
);
