import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  Type as TypeIcon,
  Trash2,
  Loader2,
  ShoppingBag,
  Eraser,
  Save,
  FolderOpen,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useCartStore } from "@/stores/cart-store";
import { formatPrice } from "@/lib/catalog";
import { useServerFn } from "@tanstack/react-start";
import { submitCustomDesign } from "@/lib/design-submissions.functions";
import { useAuth } from "@/hooks/use-auth";
import {
  getMySavedDesigns,
  saveDesign as saveDesignServerFn,
  deleteSavedDesign,
  type SavedDesign,
} from "@/lib/saved-designs.functions";

import teeBlackFront from "@/assets/tee-black-front.png";
import teeBlackBack from "@/assets/tee-black-back.png";
import teeMaroonFront from "@/assets/tee-maroon-front.png";
import teeMaroonBack from "@/assets/tee-maroon-back.png";
import teeOliveFront from "@/assets/tee-olive-front.png";
import teeOliveBack from "@/assets/tee-olive-back.png";
/**
 * Renders the tee preview at a capped resolution as JPEG so the artwork always
 * fits inside the submission payload (a multi-MB PNG used to fail silently and
 * the admin panel then had no photo to show).
 */
async function previewImage(canvas: any): Promise<string> {
  const width = canvas.getWidth?.() || 800;
  const multiplier = Math.min(2, Math.max(0.5, 1000 / width));
  return canvas.toDataURL({ format: "jpeg", quality: 0.85, multiplier });
}

export const Route = createFileRoute("/design")({
  head: () => ({
    meta: [
      { title: "Design Your Own — RIOTOUS Studio" },
      {
        name: "description",
        content:
          "Design your own DTF printed tee. Upload artwork, add text, place it front, back or sleeve — live preview.",
      },
      { property: "og:title", content: "Design Studio — RIOTOUS" },
      {
        property: "og:description",
        content: "Custom DTF printed apparel with live preview.",
      },
      { property: "og:url", content: "/design" },
    ],
    links: [{ rel: "canonical", href: "/design" }],
  }),
  component: DesignPage,
});

const COLORS = [
  {
    name: "Black",
    hex: "#0a0a0a",
    front: teeBlackFront,
    back: teeBlackBack,
  },
  {
    name: "Maroon",
    hex: "#6b1d24",
    front: teeMaroonFront,
    back: teeMaroonBack,
  },
  {
    name: "Olive",
    hex: "#3e4a2a",
    front: teeOliveFront,
    back: teeOliveBack,
  },
];

const PLACEMENTS = ["Front", "Back", "Sleeve"] as const;
type Placement = (typeof PLACEMENTS)[number];

const PLACEMENT_SURCHARGE: Record<Placement, number> = {
  Front: 0,
  Back: 100,
  Sleeve: 50,
};

const BASE_PRICE = 1499;

type SavedDesign = {
  id: string;
  name: string;
  color_name: string;
  placement: string;
  canvases: Record<string, any> | null;
  preview_url: string | null;
  updated_at: string;
};

function DesignPage() {
  const canvasEl = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<any>(null);
  const canvasRef = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [placement, setPlacement] = useState<Placement>("Front");
  const [textValue, setTextValue] = useState("");
  const [addingToCart, setAddingToCart] = useState(false);

  // Per-placement design storage
  const canvasesRef = useRef<Record<string, any>>({});
  const [savedDesigns, setSavedDesigns] = useState<SavedDesign[]>([]);
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [designName, setDesignName] = useState("");
  const [activeDesignId, setActiveDesignId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { user } = useAuth();
  const addItem = useCartStore((s) => s.addItem);
  const submitDesignFn = useServerFn(submitCustomDesign);
  const saveDesignFn = useServerFn(saveDesignServerFn);
  const deleteSavedDesignFn = useServerFn(deleteSavedDesign);

  const refreshDesigns = useCallback(async () => {
    if (!user) {
      setSavedDesigns([]);
      return;
    }
    setLoadingDesigns(true);
    try {
      const token = localStorage.getItem("riotous_session") || "";
      const data = await getMySavedDesigns({ headers: { Authorization: `Bearer ${token}` } });
      setSavedDesigns(data || []);
    } catch {
      setSavedDesigns([]);
    }
    setLoadingDesigns(false);
  }, [user]);

  useEffect(() => {
    refreshDesigns();
  }, [refreshDesigns]);

  const snapshotCurrent = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;

    canvasesRef.current[placement] = c.toJSON();
  }, [placement]);

  const loadPlacementCanvas = useCallback(async (next: Placement) => {
    const c = canvasRef.current;
    if (!c) return;

    const json = canvasesRef.current[next];

    c.clear();
    c.backgroundColor = "transparent";

    if (json) {
      await c.loadFromJSON(json);
    }

    c.requestRenderAll();
  }, []);

  const switchPlacement = useCallback(
    async (next: Placement) => {
      if (next === placement) return;

      snapshotCurrent();
      setPlacement(next);
      await loadPlacementCanvas(next);
    },
    [placement, snapshotCurrent, loadPlacementCanvas],
  );

  // Load fabric.js on client only
  useEffect(() => {
    let disposed = false;
    let created: any = null;

    (async () => {
      const fabricMod = await import("fabric");

      if (disposed || !canvasEl.current) return;

      fabricRef.current = fabricMod;

      const c = new fabricMod.Canvas(canvasEl.current, {
        backgroundColor: "transparent",
        preserveObjectStacking: true,
      });

      c.setDimensions({
        width: 380,
        height: 460,
      });

      created = c;
      canvasRef.current = c;

      setReady(true);

      const json = canvasesRef.current[placement];

      if (json) {
        await c.loadFromJSON(json);
        c.requestRenderAll();
      }
    })();

    return () => {
      disposed = true;

      if (created) {
        created.dispose?.();

        if (canvasRef.current === created) {
          canvasRef.current = null;
          setReady(false);
        }
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file || !fabricRef.current || !canvasRef.current) return;

    const reader = new FileReader();

    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;

      const img = await fabricRef.current.FabricImage.fromURL(dataUrl);

      img.scaleToWidth(180);

      img.set({
        left: 100,
        top: 140,
      });

      canvasRef.current.add(img);
      canvasRef.current.setActiveObject(img);
      canvasRef.current.requestRenderAll();
    };

    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const addText = () => {
    if (!textValue.trim() || !fabricRef.current || !canvasRef.current) {
      return;
    }

    const t = new fabricRef.current.Textbox(textValue, {
      left: 90,
      top: 200,
      fontFamily: "Inter",
      fontWeight: 800,
      fontSize: 40,
      fill: color.hex === "#0a0a0a" ? "#ffffff" : "#0a0a0a",
      width: 220,
      textAlign: "center",
    });

    canvasRef.current.add(t);
    canvasRef.current.setActiveObject(t);
    canvasRef.current.requestRenderAll();

    setTextValue("");
  };

  const deleteSelected = () => {
    const c = canvasRef.current;

    if (!c) return;

    const active = c.getActiveObjects();

    active.forEach((o: any) => c.remove(o));

    c.discardActiveObject();
    c.requestRenderAll();
  };

  const clearAll = () => {
    canvasRef.current?.clear();

    if (canvasRef.current) canvasRef.current.backgroundColor = "transparent";

    canvasRef.current?.requestRenderAll();

    delete canvasesRef.current[placement];
  };

  const openSave = () => {
    if (!user) {
      toast.error("Please sign in to save your design");
      return;
    }

    const c = canvasRef.current;

    snapshotCurrent();

    const hasWork =
      (c && c.getObjects().length > 0) ||
      Object.values(canvasesRef.current).some((j: any) => (j?.objects?.length ?? 0) > 0);

    if (!hasWork) {
      toast.error("Add artwork or text first.");
      return;
    }

    setDesignName("");
    setShowSave(true);
  };

  const saveDesign = async () => {
    if (!user || !designName.trim()) return;

    setSaving(true);

    try {
      snapshotCurrent();

      const preview = canvasRef.current?.toDataURL({
        format: "png",
        multiplier: 1,
      });

      const token = localStorage.getItem("riotous_session") || "";
      const saved = await saveDesignFn({
        data: {
          name: designName.trim(),
          color_name: color.name,
          placement,
          canvases: canvasesRef.current as any,
          preview_url: preview ?? null,
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      setSavedDesigns((prev) => [saved, ...prev]);
      setActiveDesignId(saved.id);
      setShowSave(false);
      toast.success(`Saved “${designName.trim()}”`);
    } catch (e) {
      console.error(e);
      toast.error("Could not save your design.");
    } finally {
      setSaving(false);
    }
  };

  const updateActiveDesign = async () => {
    if (!user || !activeDesignId) return;

    setSaving(true);

    try {
      snapshotCurrent();

      const preview = canvasRef.current?.toDataURL({
        format: "png",
        multiplier: 1,
      });

      const token = localStorage.getItem("riotous_session") || "";
      const current = savedDesigns.find((d) => d.id === activeDesignId);
      await saveDesignFn({
        data: {
          id: activeDesignId,
          name: current?.name || "My Design",
          color_name: color.name,
          placement,
          canvases: canvasesRef.current as any,
          preview_url: preview ?? null,
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success("Design updated");
      refreshDesigns();
    } catch (e) {
      console.error(e);
      toast.error("Could not update the design.");
    } finally {
      setSaving(false);
    }
  };

  const loadDesign = async (d: SavedDesign) => {
    const nextColor = COLORS.find((c) => c.name === d.color_name) ?? COLORS[0];

    canvasesRef.current = {
      ...(d.canvases ?? {}),
    };

    const nextPlacement = (PLACEMENTS as readonly string[]).includes(d.placement)
      ? (d.placement as Placement)
      : "Front";

    setColor(nextColor);
    setPlacement(nextPlacement);
    setActiveDesignId(d.id);
    setShowLibrary(false);

    await loadPlacementCanvas(nextPlacement);

    toast.success(`Loaded “${d.name}”`);
  };

  const deleteDesign = async (id: string) => {
    try {
      const token = localStorage.getItem("riotous_session") || "";
      await deleteSavedDesignFn({
        data: { id },
        headers: { Authorization: `Bearer ${token}` },
      });
      setSavedDesigns((prev) => prev.filter((d) => d.id !== id));
      if (activeDesignId === id) {
        setActiveDesignId(null);
      }
    } catch {
      toast.error("Could not delete the design.");
    }
  };

  const price = BASE_PRICE + PLACEMENT_SURCHARGE[placement];

  const addToCart = async () => {
    const canvas = canvasRef.current;

    if (!canvas) {
      toast.error("Studio is still loading — try again in a moment.");
      return;
    }

    snapshotCurrent();

    const hasWork = Object.values(canvasesRef.current).some(
      (j: any) => (j?.objects?.length ?? 0) > 0,
    );

    if (!hasWork) {
      toast.error("Add artwork or text first.");
      return;
    }

    if (!user) {
      toast.error("Please sign in so we can save your design with your order.");
      return;
    }

    setAddingToCart(true);

    try {
      // Render one preview per designed side so the admin sees front AND back.
      const previewImages: Record<string, string> = {};

      for (const p of PLACEMENTS) {
        const json: any = canvasesRef.current[p];
        if ((json?.objects?.length ?? 0) === 0) continue;

        await loadPlacementCanvas(p);
        previewImages[p] = await previewImage(canvas);
      }

      // Restore the side the customer is looking at.
      await loadPlacementCanvas(placement);

      const preview = previewImages[placement] ?? (await previewImage(canvas));

      // Send the design to the admin
      let submissionId: string | null = null;

      try {
        const res = await submitDesignFn({
          data: {
            colorName: color.name,
            placement,
            productTitle: `Custom RIOTOUS Tee — ${placement} print`,
            variantId: null,
            price,
            previewDataUrl: preview,
            previewImages,
            canvases: canvasesRef.current,
          },
        });

        submissionId = res?.id ?? null;
      } catch (e) {
        console.error("submitCustomDesign", e);
        toast.error("Could not save your design. Please try again.");
        setAddingToCart(false);
        return;
      }

      await addItem({
        variantId: `custom|${placement}|${color.name}|${submissionId ?? Date.now()}`,
        productId: null,
        designSubmissionId: submissionId,
        productHandle: "design",
        productTitle: `Custom RIOTOUS Tee — ${placement} print`,
        variantTitle: `${color.name} / ${placement}`,
        imageUrl: preview,
        price: { amount: String(price), currencyCode: "INR" },
        quantity: 1,
        selectedOptions: [
          { name: "Color", value: color.name },
          { name: "Placement", value: placement },
        ],
        attributes: [
          { key: "Color", value: color.name },
          { key: "Placement", value: placement },
          ...(submissionId ? [{ key: "Design reference", value: submissionId }] : []),
        ],
      });

      toast.success("Custom design added to bag — sent to our print team");
    } catch (e) {
      console.error(e);
      toast.error("Could not add to bag. Please try again.");
    } finally {
      setAddingToCart(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-16 md:px-10 md:py-24">
      <div className="mb-12 max-w-3xl">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
          Design Studio
        </p>

        <h1 className="text-5xl font-semibold tracking-tight md:text-7xl">Design Your Own.</h1>

        <p className="mt-6 max-w-lg text-muted-foreground">
          Pick a color, upload your artwork, add text — see it live on the tee.
        </p>
      </div>

      <div className="grid gap-10 md:grid-cols-[1fr_360px] md:gap-16">
        {/* Preview */}
        <div className="relative flex min-h-[560px] items-center justify-center overflow-hidden rounded-3xl bg-secondary p-8">
          <div className="relative">
            {/* Shirt photo */}
            <img
              src={placement === "Back" ? color.back : color.front}
              alt={`${color.name} tee ${placement === "Back" ? "back" : "front"}`}
              width={440}
              height={520}
              className="block h-[520px] w-[440px] object-contain drop-shadow-2xl"
              draggable={false}
            />

            {/* Canvas overlay for design */}
            <div
              className="absolute"
              style={{
                left: placement === "Sleeve" ? "8%" : "50%",
                top: placement === "Back" ? "24%" : "28%",
                transform: placement === "Sleeve" ? "translate(0, 0)" : "translate(-50%, 0)",
                width: placement === "Sleeve" ? 110 : 220,
                height: placement === "Sleeve" ? 140 : 270,
              }}
            >
              <canvas
                ref={canvasEl}
                className="h-full w-full"
                style={{
                  width: "100%",
                  height: "100%",
                }}
              />
            </div>
          </div>

          <span className="absolute bottom-6 left-6 rounded-full bg-background/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest backdrop-blur">
            {placement} · {color.name}
          </span>
        </div>

        {/* Controls */}
        <div className="space-y-8">
          {/* Color */}
          <Panel title="Color">
            <div className="flex gap-3">
              {COLORS.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setColor(c)}
                  className={`relative h-11 w-11 rounded-full border-2 transition-transform hover:scale-110 ${
                    color.name === c.name ? "border-foreground" : "border-border"
                  }`}
                  style={{
                    backgroundColor: c.hex,
                  }}
                  title={c.name}
                  aria-label={c.name}
                />
              ))}
            </div>
          </Panel>

          {/* Placement */}
          <Panel title="Placement">
            <div className="flex gap-2">
              {PLACEMENTS.map((p) => (
                <button
                  key={p}
                  onClick={() => switchPlacement(p)}
                  className={`flex-1 rounded-full border px-4 py-2.5 text-sm transition-colors ${
                    placement === p
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:border-foreground"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <p className="mt-2 text-[11px] text-muted-foreground">
              Each side keeps its own artwork — switch back anytime.
            </p>
          </Panel>

          {/* Upload */}
          <Panel title="Artwork">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-full border border-dashed border-border py-4 text-sm hover:border-foreground">
              <Upload className="h-4 w-4" />
              Upload PNG / SVG / JPG
              <input
                type="file"
                accept="image/png,image/svg+xml,image/jpeg"
                className="hidden"
                onChange={handleUpload}
                disabled={!ready}
              />
            </label>
          </Panel>

          {/* Text */}
          <Panel title="Add text">
            <div className="flex gap-2">
              <input
                type="text"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                placeholder="Your line"
                maxLength={40}
                className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-foreground"
              />

              <button
                onClick={addText}
                disabled={!ready || !textValue.trim()}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <TypeIcon className="h-4 w-4" />
              </button>
            </div>
          </Panel>

          <div className="flex gap-2">
            <button
              onClick={deleteSelected}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border py-2.5 text-xs font-medium hover:border-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete selected
            </button>

            <button
              onClick={clearAll}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border py-2.5 text-xs font-medium hover:border-foreground"
            >
              <Eraser className="h-3.5 w-3.5" />
              Remove artwork
            </button>
          </div>

          {/* Save / My designs */}
          <Panel title="Your designs">
            <div className="flex gap-2">
              <button
                onClick={openSave}
                disabled={!ready}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-foreground py-2.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <Save className="h-3.5 w-3.5" />
                Save design
              </button>

              <button
                onClick={() => {
                  if (!user) {
                    toast.error("Please sign in to see your saved designs");
                    return;
                  }

                  refreshDesigns();
                  setShowLibrary(true);
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border py-2.5 text-xs font-medium hover:border-foreground"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                My designs
                {savedDesigns.length > 0 && ` (${savedDesigns.length})`}
              </button>
            </div>

            {activeDesignId && (
              <button
                onClick={updateActiveDesign}
                disabled={saving}
                className="mt-2 w-full rounded-full border border-border py-2.5 text-xs font-medium hover:border-foreground disabled:opacity-50"
              >
                Update saved design
              </button>
            )}

            {!user && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Sign in to save your designs and come back to them later.
              </p>
            )}
          </Panel>

          {/* Price + CTA */}
          <div className="rounded-3xl bg-secondary p-6">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Estimated
              </span>

              <span className="text-3xl font-semibold tracking-tight">
                {formatPrice(price, "INR")}
              </span>
            </div>

            <button
              onClick={addToCart}
              disabled={addingToCart || !ready}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {addingToCart ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <ShoppingBag className="h-4 w-4" />
                  Add to bag
                </>
              )}
            </button>

            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Your design will be printed on a premium DTF tee and ship in 5–7 days. Final proof
              reviewed before print.
            </p>
          </div>
        </div>
      </div>

      {!ready && (
        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading design studio…
        </div>
      )}

      {/* Save dialog */}
      {showSave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-sm rounded-3xl bg-background p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Name your design</h2>

              <button
                onClick={() => setShowSave(false)}
                aria-label="Close"
                className="rounded-full p-1 hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <input
              autoFocus
              type="text"
              value={designName}
              maxLength={60}
              onChange={(e) => setDesignName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveDesign();
              }}
              placeholder="e.g. Zoro drop v1"
              className="mt-4 w-full rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-foreground"
            />

            <button
              onClick={saveDesign}
              disabled={saving || !designName.trim()}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Saved designs library */}
      {showLibrary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-3xl bg-background p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold tracking-tight">My saved designs</h2>

              <button
                onClick={() => setShowLibrary(false)}
                aria-label="Close"
                className="rounded-full p-1 hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loadingDesigns ? (
              <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading…
              </div>
            ) : savedDesigns.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">
                No saved designs yet. Create something and hit Save design.
              </p>
            ) : (
              <ul className="mt-5 space-y-3">
                {savedDesigns.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-4 rounded-2xl border border-border p-3"
                  >
                    <div className="h-16 w-14 shrink-0 overflow-hidden rounded-xl bg-secondary">
                      {d.preview_url && (
                        <img
                          src={d.preview_url}
                          alt={d.name}
                          className="h-full w-full object-contain"
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{d.name}</p>

                      <p className="text-[11px] text-muted-foreground">
                        {d.color_name} · {d.placement} ·{" "}
                        {new Date(d.updated_at).toLocaleDateString()}
                      </p>
                    </div>

                    <button
                      onClick={() => loadDesign(d)}
                      className="rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90"
                    >
                      Open
                    </button>

                    <button
                      onClick={() => deleteDesign(d.id)}
                      aria-label={`Delete ${d.name}`}
                      className="rounded-full border border-border p-2 hover:border-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}
