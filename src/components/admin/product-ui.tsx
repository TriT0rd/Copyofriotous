import { useRef, useState } from "react";
import { toast } from "sonner";
import { uploadProductImage } from "@/lib/product-images";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { X, Upload, Star } from "lucide-react";

export const ARCHIVED_TAG = "__archived";

export type ProductFormValues = {
  title: string;
  description: string;
  price: string;
  category: string;
  images: string[];
  colors: string[];
  sizes: string[];
  tags: string[];
  stock: string;
  isActive: boolean;
};

export function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

export function StockEditor({
  productId,
  stock,
  onSave,
  saving,
}: {
  productId: string;
  stock: number;
  onSave: (productId: string, quantity: number) => void;
  saving: boolean;
}) {
  const [val, setVal] = useState(String(stock));
  const dirty = val !== String(stock);
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <span className="w-12 shrink-0 text-xs font-medium">Stock</span>
      <Input
        type="number"
        min={0}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="h-7 w-24 px-2 text-xs"
      />
      <Button
        type="button"
        size="sm"
        variant={dirty ? "default" : "ghost"}
        disabled={!dirty || saving}
        onClick={() => {
          const q = parseInt(val, 10);
          if (Number.isFinite(q) && q >= 0) onSave(productId, q);
        }}
        className="h-7 px-2 text-xs"
      >
        Save
      </Button>
    </div>
  );
}

export function ChipInput({
  label,
  values,
  onChange,
  placeholder,
  suggestions = [],
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (!parts.length) return;
    onChange(Array.from(new Set([...values, ...parts])));
    setDraft("");
  };

  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
        />
        <Button type="button" variant="outline" onClick={() => add(draft)}>
          Add
        </Button>
      </div>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {suggestions
            .filter((s) => !values.includes(s))
            .map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-secondary"
              >
                + {s}
              </button>
            ))}
        </div>
      )}
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"
            >
              {v}
              <button
                type="button"
                aria-label={`Remove ${v}`}
                onClick={() => onChange(values.filter((x) => x !== v))}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ImageManager({
  images,
  onChange,
}: {
  images: string[];
  onChange: (next: string[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      try {
        uploaded.push(await uploadProductImage(file));
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
    setUploading(false);
    if (uploaded.length) {
      onChange([...images, ...uploaded]);
      toast.success(`${uploaded.length} image(s) uploaded`);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div>
      <Label>Product images</Label>
      <div className="mt-1 flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {uploading ? "Uploading…" : "Upload images"}
        </Button>
        <span className="text-xs text-muted-foreground">
          JPG / PNG / WebP / AVIF · max 5 MB each
        </span>
      </div>
      {images.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {images.map((url, i) => (
            <div key={url} className="relative">
              <img
                src={url}
                alt={`Product image ${i + 1}`}
                className="h-24 w-24 rounded border bg-muted object-cover"
                onError={(e) => {
                  // Retry once with a cache-buster in case the request raced
                  // the upload finishing.
                  const img = e.currentTarget;
                  if (img.dataset["retried"]) return;
                  img.dataset["retried"] = "1";
                  setTimeout(() => {
                    img.src = `${url}${url.includes("?") ? "&" : "?"}r=${Date.now()}`;
                  }, 800);
                }}
              />

              {i === 0 ? (
                <span className="absolute left-1 top-1 rounded bg-brand-red px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Main
                </span>
              ) : (
                <button
                  type="button"
                  title="Set as main image"
                  className="absolute left-1 top-1 rounded bg-background/80 p-1"
                  onClick={() => onChange([url, ...images.filter((u) => u !== url)])}
                >
                  <Star className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                title="Remove image"
                className="absolute right-1 top-1 rounded bg-background/80 p-1"
                onClick={() => onChange(images.filter((u) => u !== url))}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const EMPTY_FORM: ProductFormValues = {
  title: "",
  description: "",
  price: "",
  category: "Oversized Tee",
  images: [],
  colors: [],
  sizes: ["S", "M", "L", "XL", "XXL"],
  tags: [],
  stock: "0",
  isActive: true,
};

export function ProductForm({
  heading,
  submitLabel,
  initial,
  onSubmit,
  onCancel,
}: {
  heading: string;
  submitLabel: string;
  initial?: ProductFormValues;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<ProductFormValues>(initial ?? EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  return (
    <form
      className="space-y-4 rounded-lg border bg-card p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!values.title.trim()) {
          toast.error("Product name is required");
          return;
        }
        const price = Number(values.price);
        if (!values.price.trim() || !Number.isFinite(price) || price < 0) {
          toast.error("Price is required and must be a number ≥ 0");
          return;
        }
        const stock = Number(values.stock);
        if (!Number.isFinite(stock) || stock < 0) {
          toast.error("Stock must be a number ≥ 0");
          return;
        }
        setBusy(true);
        try {
          await onSubmit({ ...values, title: values.title.trim() });
        } catch (err) {
          toast.error((err as Error).message || "Something went wrong");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="font-semibold">{heading}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Product name *</Label>
          <Input value={values.title} onChange={(e) => set("title", e.target.value)} required />
        </div>
        <div>
          <Label>Price (INR) *</Label>
          <Input
            type="number"
            min={0}
            step="1"
            value={values.price}
            onChange={(e) => set("price", e.target.value)}
            required
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Description</Label>
          <Textarea
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        <div>
          <Label>Category</Label>
          <Input value={values.category} onChange={(e) => set("category", e.target.value)} />
        </div>
        <div>
          <Label>Stock quantity</Label>
          <Input
            type="number"
            min={0}
            value={values.stock}
            onChange={(e) => set("stock", e.target.value)}
          />
        </div>
        <ChipInput
          label="Sizes"
          values={values.sizes}
          onChange={(v) => set("sizes", v)}
          placeholder="S, M, L…"
          suggestions={["S", "M", "L", "XL", "XXL"]}
        />
        <ChipInput
          label="Colors"
          values={values.colors}
          onChange={(v) => set("colors", v)}
          placeholder="Black, Maroon…"
          suggestions={["Black", "White", "Maroon", "Olive Green"]}
        />
        <ChipInput
          label="Tags"
          values={values.tags}
          onChange={(v) => set("tags", v)}
          placeholder="anime, dtf…"
        />
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
            />
            Active (visible on the storefront)
          </label>
        </div>
        <div className="sm:col-span-2">
          <ImageManager images={values.images} onChange={(v) => set("images", v)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
