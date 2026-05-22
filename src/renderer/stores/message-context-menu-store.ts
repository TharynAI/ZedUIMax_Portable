/* START> Tharyn | ZedUI ViewTab
    2026-01-01
    What: Zustand store for message context menu state
    Why: Manage right-click context menu for messages in View tab
    Expected: Show/hide menu at cursor position with message content
*/
import { create } from 'zustand';

interface MessageContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  content: string;
  messageType: 'user' | 'assistant';
  show: (x: number, y: number, content: string, messageType: 'user' | 'assistant') => void;
  hide: () => void;
}

export const useMessageContextMenuStore = create<MessageContextMenuState>((set) => ({
  isOpen: false,
  x: 0,
  y: 0,
  content: '',
  messageType: 'assistant',
  show: (x, y, content, messageType) => set({ isOpen: true, x, y, content, messageType }),
  hide: () => set({ isOpen: false, content: '', messageType: 'assistant' }),
}));
// <END Tharyn | ZedUI ViewTab
