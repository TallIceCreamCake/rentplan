import { create } from 'zustand'

// ---------- Notifications (bas à droite de l'écran) ----------
let n = 0
export const useToasts = create((set, get) => ({
  toasts: [],
  push: (message, type = 'success') => {
    const id = `t_${++n}`
    set({ toasts: [...get().toasts, { id, message, type }] })
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3500)
  },
}))
export const toast = (message, type) => useToasts.getState().push(message, type)
