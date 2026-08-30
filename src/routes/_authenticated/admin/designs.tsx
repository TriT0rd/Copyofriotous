import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { adminListDesignSubmissions } from "@/lib/design-submissions.functions";
import { dateTime, money } from "@/components/admin/format";

export const Route = createFileRoute("/_authenticated/admin/designs")({
  component: DesignsPage,
});

function DesignsPage() {
  const fn = useServerFn(adminListDesignSubmissions);
  const q = useQuery({
    queryKey: ["admin", "design-submissions"],
    queryFn: () => fn(),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Custom designs</h1>
        <p className="text-sm text-muted-foreground">
          Artwork submitted from the Design Your Own studio.
        </p>
      </div>

      {q.isLoading ? (
        <p className="text-muted-foreground">Loading designs…</p>
      ) : q.isError ? (
        <p className="text-destructive">
          {(q.error as Error)?.message ?? "Could not load designs"}
        </p>
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-muted-foreground">No customer designs yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(q.data ?? []).map((d) => (
            <div key={d.id} className="overflow-hidden rounded-xl border bg-card">
              {(() => {
                const sides = Object.entries(d.preview_images ?? {}).filter(
                  ([, url]) => typeof url === "string" && url.startsWith("data:image/"),
                );
                if (sides.length === 0 && d.preview_data_url) {
                  sides.push([d.placement || "Design", d.preview_data_url]);
                }
                if (sides.length === 0) {
                  return <div className="aspect-square w-full bg-muted" />;
                }
                return (
                  <div
                    className={
                      sides.length > 1 ? "grid grid-cols-2 gap-px bg-border" : "grid grid-cols-1"
                    }
                  >
                    {sides.map(([side, url]) => (
                      <a
                        key={side}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="relative block bg-muted"
                      >
                        <img
                          src={url}
                          alt={`Custom design ${side}`}
                          className="aspect-square w-full object-contain"
                        />
                        <span className="absolute left-1 top-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                          {side}
                        </span>
                      </a>
                    ))}
                  </div>
                );
              })()}
              <div className="space-y-1 p-3 text-xs">
                <div className="text-sm font-medium">{d.product_title ?? "Custom tee"}</div>
                <div className="text-muted-foreground">
                  {d.color_name} · {d.placement}
                  {d.price ? ` · ${money(d.price)}` : ""}
                </div>
                <div className="truncate text-muted-foreground">
                  {d.customer_name || "—"} · {d.customer_email || "no email"}
                </div>
                <div className="text-muted-foreground">{dateTime(d.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
