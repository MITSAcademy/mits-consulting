import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { initTheme } from './components/ThemeToggle';

initTheme();

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      // Longer default cache lifetime — most data on this app changes slowly
      // (sourcing requests, client lifecycles, trainer pool). 60s staleTime
      // means navigating between pages doesn't refetch the same data over
      // and over. Components that need fresh data (e.g. lists with mutations)
      // call qc.invalidateQueries themselves on success.
      staleTime: 60_000,
      gcTime: 5 * 60_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
