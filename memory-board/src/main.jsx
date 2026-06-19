import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import MemoryBoard from './MemoryBoard.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MemoryBoard />
  </StrictMode>
);
