import { useEffect, useState, useCallback } from "react";
import { useAuth } from "./use-auth";
import { toast } from "sonner";
import {
  addFavorite,
  getMyFavorites,
  removeFavorite,
  type Favorite,
} from "@/lib/favorites.functions";

export function useFavorites() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setFavorites([]);
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem("riotous_session") || "";
      const data = await getMyFavorites({ headers: { Authorization: `Bearer ${token}` } });
      setFavorites(Array.isArray(data) ? data : []);
    } catch {
      setFavorites([]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isFavorite = useCallback(
    (handle: string) =>
      Array.isArray(favorites) && favorites.some((f) => f?.product_handle === handle),
    [favorites],
  );

  const toggle = useCallback(
    async (product: {
      handle: string;
      title: string;
      image: string | null;
      price?: number | null;
      currency?: string | null;
    }) => {
      if (!user) {
        toast.error("Please sign in to save favorites");
        return;
      }
      const token = localStorage.getItem("riotous_session") || "";
      const currentList = Array.isArray(favorites) ? favorites : [];
      const existing = currentList.find((f) => f?.product_handle === product.handle);

      if (existing) {
        setFavorites((prev) =>
          (Array.isArray(prev) ? prev : []).filter((f) => f?.product_handle !== product.handle),
        );
        try {
          await removeFavorite({
            data: { id: existing.id },
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch {
          toast.error("Could not remove favorite");
          refresh();
        }
      } else {
        try {
          const newFav = await addFavorite({
            data: {
              handle: product.handle,
              title: product.title,
              image: product.image,
              price: product.price,
              currency: product.currency,
            },
            headers: { Authorization: `Bearer ${token}` },
          });
          if (newFav && newFav.id) {
            setFavorites((prev) => [newFav, ...(Array.isArray(prev) ? prev : [])]);
          }
          toast.success("Added to favorites");
        } catch {
          toast.error("Could not save favorite");
        }
      }
    },
    [user, favorites, refresh],
  );

  return { favorites, loading, isFavorite, toggle, refresh };
}
