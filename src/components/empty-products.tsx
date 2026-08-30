import { BrandName } from "@/components/brand-name";

export function EmptyProducts({
  title = "No products yet",
  hint = (
    <>
      Tell the <BrandName /> designer in chat what to add — name, price, sizes, colors, and photos.
    </>
  ),
}: {
  title?: string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
        <span className="text-2xl">◇</span>
      </div>
      <h3 className="text-2xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-3 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}
