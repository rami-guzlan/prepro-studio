import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/courier-prime/400.css';
import '@fontsource/courier-prime/400-italic.css';
import '@fontsource/courier-prime/700.css';
import '@fontsource/courier-prime/700-italic.css';
import './styles/app.css';
import './shell/shell.css';
import './styles/phone.css';
import { App } from './shell/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ((window as any).prepro?.selftest) {
  import('./selftest').then((m) => m.runSelftest());
}
