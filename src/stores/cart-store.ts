import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getMyCart, saveMyCart } from "@/lib/cart.functions";

export interface CartItem {
  /** Stable key: `${productId}|${size}|${color}` (custom designs append the design id). */
  variantId: string;
  productId: string | null;
  productHandle: string;
  productTitle: string;
  variantTitle: string;
  imageUrl: string | null;
  price: { amount: string; currencyCode: string };
  quantity: number;
  selectedOptions: Array<{ name: string; value: string }>;
  attributes?: Array<{ key: string; value: string }>;
  designSubmissionId?: string | null;
}

interface CartStore {
  items: CartItem[];
  isLoading: boolean;
  isSyncing: boolean;
  addItem: (item: CartItem) => Promise<void>;
  updateQuantity: (variantId: string, quantity: number) => Promise<void>;
  removeItem: (variantId: string) => Promise<void>;
  clearCart: () => void;
  syncCart: () => Promise<void>;
  subtotal: () => number;
  totalItems: () => number;
}

function getSessionToken(): string | null {
  try {
    return typeof window !== "undefined" ? localStorage.getItem("riotous_session") || null : null;
  } catch {
    return null;
  }
}

const safeStorage = {
  getItem: (name: string) => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(name, value);
    } catch {
      // ignore write errors
    }
  },
  removeItem: (name: string) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(name);
    } catch {
      // ignore remove errors
    }
  },
};

async function persistRemote(items: CartItem[]) {
  const token = getSessionToken();
  if (!token) return;
  try {
    await saveMyCart({
      data: { items },
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    /* ignore sync failures */
  }
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isLoading: false,
      isSyncing: false,

      addItem: async (item) => {
        set({ isLoading: true });
        try {
          const currentItems = Array.isArray(get().items) ? get().items : [];
          const existing = currentItems.find((i) => i?.variantId === item?.variantId);
          const items = existing
            ? currentItems.map((i) =>
                i?.variantId === item?.variantId
                  ? { ...i, quantity: (Number(i?.quantity) || 0) + (Number(item?.quantity) || 1) }
                  : i,
              )
            : [...currentItems, item];
          set({ items });
          await persistRemote(items);
        } finally {
          set({ isLoading: false });
        }
      },

      updateQuantity: async (variantId, quantity) => {
        if (quantity <= 0) return get().removeItem(variantId);
        const currentItems = Array.isArray(get().items) ? get().items : [];
        const items = currentItems.map((i) =>
          i?.variantId === variantId ? { ...i, quantity } : i,
        );
        set({ items });
        await persistRemote(items);
      },

      removeItem: async (variantId) => {
        const currentItems = Array.isArray(get().items) ? get().items : [];
        const items = currentItems.filter((i) => i?.variantId !== variantId);
        set({ items });
        await persistRemote(items);
      },

      clearCart: () => {
        set({ items: [] });
        void persistRemote([]);
      },

      syncCart: async () => {
        if (get().isSyncing) return;
        set({ isSyncing: true });
        try {
          const token = getSessionToken();
          if (!token) return;
          const remote = await getMyCart({
            headers: { Authorization: `Bearer ${token}` },
          }).catch((err: unknown) => {
            const errorMsg = err instanceof Error ? err.message : String(err);
            if (errorMsg.includes("Unauthorized") || errorMsg.includes("401")) {
              safeStorage.removeItem("riotous_session");
              if (typeof window !== "undefined") {
                window.dispatchEvent(new Event("riotous_auth_changed"));
              }
            }
            return [] as CartItem[];
          });
          const safeRemote = Array.isArray(remote) ? remote : [];
          const local = Array.isArray(get().items) ? get().items : [];
          if (local.length === 0) {
            set({ items: safeRemote });
            return;
          }
          const merged = [...safeRemote];
          for (const item of local) {
            if (!item?.variantId) continue;
            const idx = merged.findIndex((i) => i?.variantId === item.variantId);
            if (idx >= 0)
              merged[idx] = {
                ...merged[idx],
                quantity: Math.max(Number(merged[idx]?.quantity) || 1, Number(item?.quantity) || 1),
              };
            else merged.push(item);
          }
          set({ items: merged });
          await persistRemote(merged);
        } catch (e: unknown) {
          // Handled gracefully
          console.warn("syncCart warning:", e);
        } finally {
          set({ isSyncing: false });
        }
      },

      subtotal: () => {
        const list = Array.isArray(get().items) ? get().items : [];
        return list.reduce(
          (s, i) => s + (parseFloat(i?.price?.amount || "0") || 0) * (Number(i?.quantity) || 0),
          0,
        );
      },
      totalItems: () => {
        const list = Array.isArray(get().items) ? get().items : [];
        return list.reduce((s, i) => s + (Number(i?.quantity) || 0), 0);
      },
    }),
    {
      name: "riotus-cart",
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ items: Array.isArray(s?.items) ? s.items : [] }),
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.items)) {
          state.items = [];
        }
      },
    },
  ),
);
