import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Dev only: lets scripts (screenshots, recordings) drive replays without clicking.
if (import.meta.env.DEV) {
  void Promise.all([import('./engine/session/controller'), import('./engine/session/lecture'), import('./engine/session/demo'), import('./engine/store')]).then(
    ([controller, lecture, demo, store]) => {
      Object.assign(window, { snakk: { ...controller, LECTURE_SESSION: lecture.LECTURE_SESSION, DEMO_SESSION: demo.DEMO_SESSION, store: store.useSnakk } });
    },
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
