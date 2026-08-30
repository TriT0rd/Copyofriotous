import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth-middleware";
import { ensureDbSchema, getSql } from "@/lib/db";

export type SavedDesign = {
  id: string;
  name: string;
  color_name: string;
  placement: string;
  canvases: Record<string, unknown> | null;
  preview_url: string | null;
  updated_at: string;
};

export const getMySavedDesigns = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<SavedDesign[]> => {
    try {
      await ensureDbSchema();
      const sql = getSql();
      const rows = await sql`
        SELECT id, name, color_name, placement, canvases, preview_url, updated_at
        FROM saved_designs
        WHERE user_id = ${context.userId}
        ORDER BY updated_at DESC
      `;
      return rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        color_name: r.color_name,
        placement: r.placement,
        canvases: typeof r.canvases === "string" ? JSON.parse(r.canvases) : r.canvases || null,
        preview_url: r.preview_url || null,
        updated_at: new Date(r.updated_at).toISOString(),
      }));
    } catch {
      return [];
    }
  });

export const saveDesign = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (d: {
      id?: string | null;
      name: string;
      color_name: string;
      placement: string;
      canvases: Record<string, unknown> | null;
      preview_url?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }): Promise<SavedDesign> => {
    await ensureDbSchema();
    const sql = getSql();

    if (data.id) {
      await sql`
        UPDATE saved_designs SET
          color_name = ${data.color_name},
          placement = ${data.placement},
          canvases = ${JSON.stringify(data.canvases)}::jsonb,
          preview_url = ${data.preview_url || null},
          updated_at = NOW()
        WHERE id = ${data.id} AND user_id = ${context.userId}
      `;
      return {
        id: data.id,
        name: data.name,
        color_name: data.color_name,
        placement: data.placement,
        canvases: data.canvases,
        preview_url: data.preview_url || null,
        updated_at: new Date().toISOString(),
      };
    }

    const id = `des_saved_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    await sql`
      INSERT INTO saved_designs (
        id, user_id, name, color_name, placement, canvases, preview_url
      ) VALUES (
        ${id}, ${context.userId}, ${data.name}, ${data.color_name}, ${data.placement}, ${JSON.stringify(data.canvases)}::jsonb, ${data.preview_url || null}
      );
    `;

    return {
      id,
      name: data.name,
      color_name: data.color_name,
      placement: data.placement,
      canvases: data.canvases,
      preview_url: data.preview_url || null,
      updated_at: new Date().toISOString(),
    };
  });

export const deleteSavedDesign = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await ensureDbSchema();
    const sql = getSql();
    await sql`
      DELETE FROM saved_designs WHERE id = ${data.id} AND user_id = ${context.userId}
    `;
    return { ok: true };
  });
