import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/unbounded/600.css';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { RealtimeProvider } from './realtime.jsx';
import { ToastProvider } from './ui.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <ToastProvider>
    <AuthProvider>
      <BrowserRouter>
        <RealtimeProvider>
          <App />
        </RealtimeProvider>
      </BrowserRouter>
    </AuthProvider>
  </ToastProvider>,
);
