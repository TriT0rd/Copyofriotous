import { ensureDbSchema, getSql } from "@/lib/db";
import { type AdminCtx, assertAdmin, logAudit } from "@/lib/admin-utils";

export type InventoryTransactionType =
  | "ADMIN_ADD"
  | "ADMIN_REMOVE"
  | "ADMIN_SET"
  | "ORDER_DEDUCTION"
  | "ORDER_CANCELLATION"
  | "ORDER_RETURN"
  | "MANUAL_ADJUSTMENT";

export type InventoryTransactionRecord = {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  order_id: string | null;
  quantity_change: number;
  previous_quantity: number;
  new_quantity: number;
  transaction_type: InventoryTransactionType;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  product_name?: string | null;
  variant_details?: string | null;
};

export class InventoryError extends Error {
  code: string;
  availableQuantity?: number;

  constructor(message: string, code: string, availableQuantity?: number) {
    super(message);
    this.name = "InventoryError";
    this.code = code;
    this.availableQuantity = availableQuantity;
  }
}

/**
 * Recalculates and updates a product's top-level stock_quantity based on its variants.
 */
export async function syncProductTotalStock(productId: string): Promise<number> {
  const sql = getSql();
  const variants = await sql`
    SELECT COALESCE(SUM(stock_quantity), 0)::int as total_stock
    FROM product_variants
    WHERE product_id::text = ${String(productId)}
  `;
  const countRes = await sql`
    SELECT count(*)::int as variant_count
    FROM product_variants
    WHERE product_id::text = ${String(productId)}
  `;

  const variantCount = Number(countRes[0]?.variant_count ?? 0);
  if (variantCount > 0) {
    const totalStock = Number(variants[0]?.total_stock ?? 0);
    await sql`
      UPDATE products
      SET stock_quantity = ${Math.max(0, totalStock)}, updated_at = NOW()
      WHERE id::text = ${String(productId)}
    `;
    return totalStock;
  } else {
    const prod = await sql`
      SELECT stock_quantity FROM products WHERE id::text = ${String(productId)} LIMIT 1
    `;
    return Number(prod[0]?.stock_quantity ?? 0);
  }
}

/**
 * Records an immutable inventory transaction audit record.
 */
export async function logInventoryTransaction(params: {
  productId: string | null;
  variantId: string | null;
  orderId?: string | null;
  quantityChange: number;
  previousQuantity: number;
  newQuantity: number;
  transactionType: InventoryTransactionType;
  reason?: string | null;
  createdBy?: string | null;
}) {
  try {
    const sql = getSql();
    const id = `itx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    await sql`
      INSERT INTO inventory_transactions (
        id, product_id, variant_id, order_id, quantity_change, previous_quantity,
        new_quantity, transaction_type, reason, created_by, created_at
      ) VALUES (
        ${id}, ${params.productId}, ${params.variantId}, ${params.orderId || null},
        ${params.quantityChange}, ${params.previousQuantity}, ${params.newQuantity},
        ${params.transactionType}, ${params.reason || null}, ${params.createdBy || null}, NOW()
      );
    `;
    return id;
  } catch (err) {
    console.warn("[Inventory Log] Failed to record transaction:", err);
    return null;
  }
}

/**
 * Admin operation: Adds stock to a specific variant or product.
 * Old stock + quantity = New stock
 */
export async function addInventory(
  context: AdminCtx,
  params: {
    variantId?: string | null;
    productId?: string | null;
    quantity: number;
    reason?: string | null;
  },
) {
  await assertAdmin(context);
  await ensureDbSchema();

  const qty = Math.round(Number(params.quantity));
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new InventoryError(
      "Quantity to add must be an integer greater than 0",
      "INVALID_QUANTITY",
    );
  }

  const sql = getSql();

  if (params.variantId) {
    const rows = await sql`
      SELECT id, product_id, stock_quantity, size, color
      FROM product_variants
      WHERE id::text = ${String(params.variantId)}
      LIMIT 1
    `;
    if (rows.length === 0) {
      throw new InventoryError("Product variant not found", "VARIANT_NOT_FOUND");
    }

    const v = rows[0];
    const prev = Number(v.stock_quantity ?? 0);
    const next = prev + qty;

    await sql`
      UPDATE product_variants
      SET stock_quantity = ${next}, updated_at = NOW()
      WHERE id::text = ${String(params.variantId)}
    `;

    const prodId = String(v.product_id);
    await syncProductTotalStock(prodId);

    await logInventoryTransaction({
      productId: prodId,
      variantId: String(v.id),
      quantityChange: qty,
      previousQuantity: prev,
      newQuantity: next,
      transactionType: "ADMIN_ADD",
      reason: params.reason || `Admin added ${qty} units (${v.size || ""} ${v.color || ""})`.trim(),
      createdBy: context.userId,
    });

    await logAudit(context, "inventory.add", "product_variant", String(v.id), {
      from: prev,
      to: next,
      added: qty,
    });

    return { ok: true, previous: prev, current: next, variantId: String(v.id), productId: prodId };
  } else if (params.productId) {
    const prodId = String(params.productId);
    const rows = await sql`
      SELECT id, stock_quantity, name, sizes, colors
      FROM products
      WHERE id::text = ${prodId}
      LIMIT 1
    `;
    if (rows.length === 0) {
      throw new InventoryError("Product not found", "PRODUCT_NOT_FOUND");
    }

    const p = rows[0];
    const prevTotal = Number(p.stock_quantity ?? 0);

    const variants = await sql`
      SELECT id, size, color, stock_quantity
      FROM product_variants
      WHERE product_id::text = ${prodId}
      ORDER BY created_at ASC
    `;

    if (variants.length > 0) {
      const base = Math.floor(qty / variants.length);
      const rem = qty % variants.length;

      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        const addForVar = base + (i < rem ? 1 : 0);
        if (addForVar > 0) {
          const vPrev = Number(v.stock_quantity ?? 0);
          const vNext = vPrev + addForVar;
          await sql`
            UPDATE product_variants
            SET stock_quantity = ${vNext}, updated_at = NOW()
            WHERE id::text = ${String(v.id)}
          `;
          await logInventoryTransaction({
            productId: prodId,
            variantId: String(v.id),
            quantityChange: addForVar,
            previousQuantity: vPrev,
            newQuantity: vNext,
            transactionType: "ADMIN_ADD",
            reason:
              params.reason ||
              `Admin added ${addForVar} units (${v.size || ""} ${v.color || ""})`.trim(),
            createdBy: context.userId,
          });
        }
      }
    } else {
      // Auto-create variants if missing
      const rawSizes: string[] = Array.isArray(p.sizes)
        ? p.sizes
        : typeof p.sizes === "string"
          ? JSON.parse(p.sizes)
          : [];
      const s = rawSizes.length ? rawSizes : [""];
      const base = Math.floor(qty / s.length);
      const rem = qty % s.length;

      for (let i = 0; i < s.length; i++) {
        const sz = s[i];
        const varId = `var_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        const varQty = base + (i < rem ? 1 : 0);
        await sql`
          INSERT INTO product_variants (id, product_id, size, color, stock_quantity)
          VALUES (${varId}, ${prodId}, ${sz}, '', ${varQty});
        `;
      }
    }

    const nextTotal = await syncProductTotalStock(prodId);

    await logAudit(context, "inventory.add", "product", prodId, {
      from: prevTotal,
      to: nextTotal,
      added: qty,
    });

    return { ok: true, previous: prevTotal, current: nextTotal, productId: prodId };
  } else {
    throw new InventoryError("Either variantId or productId must be provided", "INVALID_PARAMS");
  }
}

/**
 * Admin operation: Removes stock from a specific variant or product.
 * Old stock - quantity = New stock (Cannot be negative)
 */
export async function removeInventory(
  context: AdminCtx,
  params: {
    variantId?: string | null;
    productId?: string | null;
    quantity: number;
    reason?: string | null;
  },
) {
  await assertAdmin(context);
  await ensureDbSchema();

  const qty = Math.round(Number(params.quantity));
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new InventoryError(
      "Quantity to remove must be an integer greater than 0",
      "INVALID_QUANTITY",
    );
  }

  const sql = getSql();

  if (params.variantId) {
    const rows = await sql`
      SELECT id, product_id, stock_quantity, reserved_stock, size, color
      FROM product_variants
      WHERE id::text = ${String(params.variantId)}
      LIMIT 1
    `;
    if (rows.length === 0) {
      throw new InventoryError("Product variant not found", "VARIANT_NOT_FOUND");
    }

    const v = rows[0];
    const prev = Number(v.stock_quantity ?? 0);
    if (prev < qty) {
      throw new InventoryError(
        `Cannot remove ${qty} unit(s). Only ${prev} currently available in stock.`,
        "INSUFFICIENT_STOCK",
        prev,
      );
    }

    // Atomic conditional decrement to ensure no concurrent modification can make it negative
    const updated = await sql`
      UPDATE product_variants
      SET stock_quantity = stock_quantity - ${qty}, updated_at = NOW()
      WHERE id::text = ${String(params.variantId)} AND stock_quantity >= ${qty}
      RETURNING id, product_id, stock_quantity
    `;

    if (updated.length === 0) {
      const refreshed = await sql`
        SELECT stock_quantity FROM product_variants WHERE id::text = ${String(params.variantId)}
      `;
      const current = Number(refreshed[0]?.stock_quantity ?? 0);
      throw new InventoryError(
        `Cannot remove ${qty} unit(s). Only ${current} currently available in stock.`,
        "INSUFFICIENT_STOCK",
        current,
      );
    }

    const next = Number(updated[0].stock_quantity);
    const prodId = String(updated[0].product_id);
    await syncProductTotalStock(prodId);

    await logInventoryTransaction({
      productId: prodId,
      variantId: String(v.id),
      quantityChange: -qty,
      previousQuantity: prev,
      newQuantity: next,
      transactionType: "ADMIN_REMOVE",
      reason:
        params.reason || `Admin removed ${qty} units (${v.size || ""} ${v.color || ""})`.trim(),
      createdBy: context.userId,
    });

    await logAudit(context, "inventory.remove", "product_variant", String(v.id), {
      from: prev,
      to: next,
      removed: qty,
    });

    return { ok: true, previous: prev, current: next, variantId: String(v.id), productId: prodId };
  } else if (params.productId) {
    const prodId = String(params.productId);
    const rows = await sql`
      SELECT id, stock_quantity, name
      FROM products
      WHERE id::text = ${prodId}
      LIMIT 1
    `;
    if (rows.length === 0) {
      throw new InventoryError("Product not found", "PRODUCT_NOT_FOUND");
    }

    const p = rows[0];
    const prevTotal = Number(p.stock_quantity ?? 0);
    if (prevTotal < qty) {
      throw new InventoryError(
        `Cannot remove ${qty} unit(s). Only ${prevTotal} currently available across all variants.`,
        "INSUFFICIENT_STOCK",
        prevTotal,
      );
    }

    const variants = await sql`
      SELECT id, size, color, stock_quantity
      FROM product_variants
      WHERE product_id::text = ${prodId}
      ORDER BY stock_quantity DESC, created_at ASC
    `;

    if (variants.length > 0) {
      let remainingToRemove = qty;
      for (const v of variants) {
        if (remainingToRemove <= 0) break;
        const vStock = Number(v.stock_quantity ?? 0);
        if (vStock <= 0) continue;
        const deduct = Math.min(vStock, remainingToRemove);
        const vNext = vStock - deduct;

        await sql`
          UPDATE product_variants
          SET stock_quantity = ${vNext}, updated_at = NOW()
          WHERE id::text = ${String(v.id)}
        `;

        await logInventoryTransaction({
          productId: prodId,
          variantId: String(v.id),
          quantityChange: -deduct,
          previousQuantity: vStock,
          newQuantity: vNext,
          transactionType: "ADMIN_REMOVE",
          reason:
            params.reason ||
            `Admin removed ${deduct} units (${v.size || ""} ${v.color || ""})`.trim(),
          createdBy: context.userId,
        });

        remainingToRemove -= deduct;
      }
    }

    const nextTotal = await syncProductTotalStock(prodId);

    await logAudit(context, "inventory.remove", "product", prodId, {
      from: prevTotal,
      to: nextTotal,
      removed: qty,
    });

    return { ok: true, previous: prevTotal, current: nextTotal, productId: prodId };
  } else {
    throw new InventoryError("Either variantId or productId must be provided", "INVALID_PARAMS");
  }
}

/**
 * Admin operation: Sets exact stock quantity for a variant or product.
 * Must be an integer >= 0.
 */
export async function setInventory(
  context: AdminCtx,
  params: {
    variantId?: string | null;
    productId?: string | null;
    quantity: number;
    reason?: string | null;
  },
) {
  await assertAdmin(context);
  await ensureDbSchema();

  const qty = Math.round(Number(params.quantity));
  if (!Number.isFinite(qty) || qty < 0) {
    throw new InventoryError(
      "Stock quantity must be a non-negative integer (≥ 0)",
      "INVALID_QUANTITY",
    );
  }

  const sql = getSql();

  if (params.variantId) {
    const rows = await sql`
      SELECT id, product_id, stock_quantity, size, color
      FROM product_variants
      WHERE id::text = ${String(params.variantId)}
      LIMIT 1
    `;
    if (rows.length === 0) {
      throw new InventoryError("Product variant not found", "VARIANT_NOT_FOUND");
    }

    const v = rows[0];
    const prev = Number(v.stock_quantity ?? 0);
    const diff = qty - prev;

    await sql`
      UPDATE product_variants
      SET stock_quantity = ${qty}, updated_at = NOW()
      WHERE id::text = ${String(params.variantId)}
    `;

    const prodId = String(v.product_id);
    await syncProductTotalStock(prodId);

    await logInventoryTransaction({
      productId: prodId,
      variantId: String(v.id),
      quantityChange: diff,
      previousQuantity: prev,
      newQuantity: qty,
      transactionType: "ADMIN_SET",
      reason:
        params.reason || `Admin set stock to ${qty} (${v.size || ""} ${v.color || ""})`.trim(),
      createdBy: context.userId,
    });

    await logAudit(context, "inventory.set", "product_variant", String(v.id), {
      from: prev,
      to: qty,
    });

    return { ok: true, previous: prev, current: qty, variantId: String(v.id), productId: prodId };
  } else if (params.productId) {
    const prodId = String(params.productId);
    const rows = await sql`
      SELECT id, stock_quantity, name, sizes, colors
      FROM products
      WHERE id::text = ${prodId}
      LIMIT 1
    `;
    if (rows.length === 0) {
      throw new InventoryError("Product not found", "PRODUCT_NOT_FOUND");
    }

    const p = rows[0];
    const prevTotal = Number(p.stock_quantity ?? 0);

    const variants = await sql`
      SELECT id, size, color, stock_quantity
      FROM product_variants
      WHERE product_id::text = ${prodId}
      ORDER BY created_at ASC
    `;

    if (variants.length > 0) {
      if (qty === 0) {
        for (const v of variants) {
          const vPrev = Number(v.stock_quantity ?? 0);
          await sql`
            UPDATE product_variants
            SET stock_quantity = 0, updated_at = NOW()
            WHERE id::text = ${String(v.id)}
          `;
          await logInventoryTransaction({
            productId: prodId,
            variantId: String(v.id),
            quantityChange: -vPrev,
            previousQuantity: vPrev,
            newQuantity: 0,
            transactionType: "ADMIN_SET",
            reason:
              params.reason || `Admin set stock to 0 (${v.size || ""} ${v.color || ""})`.trim(),
            createdBy: context.userId,
          });
        }
      } else {
        const base = Math.floor(qty / variants.length);
        const rem = qty % variants.length;
        for (let i = 0; i < variants.length; i++) {
          const v = variants[i];
          const targetQty = base + (i < rem ? 1 : 0);
          const vPrev = Number(v.stock_quantity ?? 0);
          await sql`
            UPDATE product_variants
            SET stock_quantity = ${targetQty}, updated_at = NOW()
            WHERE id::text = ${String(v.id)}
          `;
          await logInventoryTransaction({
            productId: prodId,
            variantId: String(v.id),
            quantityChange: targetQty - vPrev,
            previousQuantity: vPrev,
            newQuantity: targetQty,
            transactionType: "ADMIN_SET",
            reason:
              params.reason ||
              `Admin set stock to ${targetQty} (${v.size || ""} ${v.color || ""})`.trim(),
            createdBy: context.userId,
          });
        }
      }
    } else {
      // Create default variants from product sizes
      const rawSizes: string[] = Array.isArray(p.sizes)
        ? p.sizes
        : typeof p.sizes === "string"
          ? JSON.parse(p.sizes)
          : [];
      const s = rawSizes.length ? rawSizes : [""];
      const base = Math.floor(qty / s.length);
      const rem = qty % s.length;

      for (let i = 0; i < s.length; i++) {
        const sz = s[i];
        const varId = `var_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        const varQty = base + (i < rem ? 1 : 0);
        await sql`
          INSERT INTO product_variants (id, product_id, size, color, stock_quantity)
          VALUES (${varId}, ${prodId}, ${sz}, '', ${varQty});
        `;
      }
    }

    const nextTotal = await syncProductTotalStock(prodId);

    await logAudit(context, "inventory.set", "product", prodId, {
      from: prevTotal,
      to: nextTotal,
    });

    return { ok: true, previous: prevTotal, current: nextTotal, productId: prodId };
  } else {
    throw new InventoryError("Either variantId or productId must be provided", "INVALID_PARAMS");
  }
}

export type DeductOrderItemInput = {
  productId: string | null;
  productName: string;
  quantity: number;
  selectedSize?: string | null;
  selectedColor?: string | null;
  variantId?: string | null;
};

/**
 * Atomically deducts inventory for all items in an order.
 * If ANY item has insufficient stock, ALL deductions in this batch are rolled back.
 * Guarantees idempotency via order_id transaction checking.
 */
export async function deductOrderInventory(
  orderId: string,
  items: DeductOrderItemInput[],
  userId: string,
) {
  await ensureDbSchema();
  const sql = getSql();

  // 1. Idempotency Check: Verify if this order was already deducted
  const existingTx = await sql`
    SELECT id FROM inventory_transactions
    WHERE order_id::text = ${String(orderId)} AND transaction_type = 'ORDER_DEDUCTION'
    LIMIT 1
  `;
  if (existingTx.length > 0) {
    return { ok: true, alreadyProcessed: true };
  }

  // Filter items that need inventory tracking (custom designs without product link don't track inventory)
  const trackableItems = items.filter((i) => i.productId && i.quantity > 0);
  if (trackableItems.length === 0) {
    return { ok: true, count: 0 };
  }

  // Deductions completed in this run (used for rollback if a subsequent item fails)
  const executedDeductions: Array<{
    type: "variant" | "product";
    targetId: string;
    productId: string;
    variantId: string | null;
    quantity: number;
    previousStock: number;
    newStock: number;
    itemTitle: string;
  }> = [];

  try {
    for (const item of trackableItems) {
      const prodId = String(item.productId);
      const reqQty = Math.max(1, Math.round(item.quantity));
      const size = item.selectedSize || "";
      const color = item.selectedColor || "";

      // Determine whether there are variants for this product
      let targetVariantId: string | null = item.variantId || null;

      if (!targetVariantId && (size || color)) {
        const matchingVariants = await sql`
          SELECT id, stock_quantity FROM product_variants
          WHERE product_id::text = ${prodId}
            AND (size = ${size} OR (size IS NULL AND ${size} = ''))
            AND (color = ${color} OR (color IS NULL AND ${color} = ''))
          LIMIT 1
        `;
        if (matchingVariants.length > 0) {
          targetVariantId = String(matchingVariants[0].id);
        }
      }

      if (!targetVariantId) {
        // If not matched by exact size/color, check if any variants exist at all for this product
        const anyVariants = await sql`
          SELECT id, stock_quantity, size, color FROM product_variants
          WHERE product_id::text = ${prodId}
          LIMIT 1
        `;
        if (anyVariants.length > 0) {
          targetVariantId = String(anyVariants[0].id);
        }
      }

      if (targetVariantId) {
        // ATOMIC CONDITIONAL UPDATE: only decrement if stock_quantity >= reqQty
        const res = await sql`
          UPDATE product_variants
          SET stock_quantity = stock_quantity - ${reqQty}, updated_at = NOW()
          WHERE id::text = ${targetVariantId} AND stock_quantity >= ${reqQty}
          RETURNING id, product_id, stock_quantity, (stock_quantity + ${reqQty})::int as prev_stock
        `;

        if (res.length === 0) {
          // Deduction failed due to insufficient stock!
          const currentVariant = await sql`
            SELECT stock_quantity, size, color FROM product_variants
            WHERE id::text = ${targetVariantId}
            LIMIT 1
          `;
          const avail = Number(currentVariant[0]?.stock_quantity ?? 0);
          throw new InventoryError(
            `Insufficient stock for "${item.productName}"${size || color ? ` (${[size, color].filter(Boolean).join(" / ")})` : ""}. Only ${avail} available.`,
            "INSUFFICIENT_STOCK",
            avail,
          );
        }

        const prevStock = Number(res[0].prev_stock);
        const newStock = Number(res[0].stock_quantity);

        executedDeductions.push({
          type: "variant",
          targetId: targetVariantId,
          productId: prodId,
          variantId: targetVariantId,
          quantity: reqQty,
          previousStock: prevStock,
          newStock: newStock,
          itemTitle: item.productName,
        });
      } else {
        // Product-level stock deduction
        const res = await sql`
          UPDATE products
          SET stock_quantity = stock_quantity - ${reqQty}, updated_at = NOW()
          WHERE id::text = ${prodId} AND stock_quantity >= ${reqQty}
          RETURNING id, stock_quantity, (stock_quantity + ${reqQty})::int as prev_stock
        `;

        if (res.length === 0) {
          const currentProd = await sql`
            SELECT stock_quantity FROM products WHERE id::text = ${prodId} LIMIT 1
          `;
          const avail = Number(currentProd[0]?.stock_quantity ?? 0);
          throw new InventoryError(
            `Insufficient stock for "${item.productName}". Only ${avail} available.`,
            "INSUFFICIENT_STOCK",
            avail,
          );
        }

        const prevStock = Number(res[0].prev_stock);
        const newStock = Number(res[0].stock_quantity);

        executedDeductions.push({
          type: "product",
          targetId: prodId,
          productId: prodId,
          variantId: null,
          quantity: reqQty,
          previousStock: prevStock,
          newStock: newStock,
          itemTitle: item.productName,
        });
      }
    }

    // ALL ITEMS DEDUCTED SUCCESSFULLY -> Write audit transaction log & sync totals
    const touchedProducts = new Set<string>();
    for (const d of executedDeductions) {
      touchedProducts.add(d.productId);
      await logInventoryTransaction({
        productId: d.productId,
        variantId: d.variantId,
        orderId: orderId,
        quantityChange: -d.quantity,
        previousQuantity: d.previousStock,
        newQuantity: d.newStock,
        transactionType: "ORDER_DEDUCTION",
        reason: `Order placed: ${orderId}`,
        createdBy: userId,
      });
    }

    for (const pId of touchedProducts) {
      await syncProductTotalStock(pId);
    }

    await sql`
      UPDATE orders
      SET stock_state = 'Deducted', updated_at = NOW()
      WHERE id::text = ${String(orderId)}
    `;

    return { ok: true, count: executedDeductions.length };
  } catch (err) {
    // TRANSACTION ROLLBACK: Restore any units that were decremented before the failure
    for (const d of executedDeductions) {
      try {
        if (d.type === "variant" && d.variantId) {
          await sql`
            UPDATE product_variants
            SET stock_quantity = stock_quantity + ${d.quantity}, updated_at = NOW()
            WHERE id::text = ${d.variantId}
          `;
        } else {
          await sql`
            UPDATE products
            SET stock_quantity = stock_quantity + ${d.quantity}, updated_at = NOW()
            WHERE id::text = ${d.productId}
          `;
        }
        await syncProductTotalStock(d.productId);
      } catch (rollbackErr) {
        console.error("[Inventory Rollback Error]:", rollbackErr);
      }
    }

    throw err;
  }
}

/**
 * Idempotently restores inventory when an order is cancelled.
 * If cancellation runs multiple times, inventory is only restored ONCE.
 */
export async function restoreOrderInventory(
  orderId: string,
  reason = "Order cancelled",
  actorId?: string | null,
) {
  await ensureDbSchema();
  const sql = getSql();

  // 1. Idempotency Check: Verify if order was already cancelled/restored
  const orders = await sql`
    SELECT id, order_number, status, stock_state
    FROM orders
    WHERE id::text = ${String(orderId)}
    LIMIT 1
  `;
  if (orders.length === 0) {
    throw new InventoryError("Order not found", "ORDER_NOT_FOUND");
  }

  const order = orders[0];
  if (order.stock_state === "Restored") {
    // Already restored! Idempotent no-op
    return { ok: true, alreadyRestored: true };
  }

  const alreadyRestoredTx = await sql`
    SELECT id FROM inventory_transactions
    WHERE order_id::text = ${String(orderId)} AND transaction_type = 'ORDER_CANCELLATION'
    LIMIT 1
  `;
  if (alreadyRestoredTx.length > 0) {
    await sql`
      UPDATE orders
      SET stock_state = 'Restored', status = 'Cancelled', cancelled_at = COALESCE(cancelled_at, NOW())
      WHERE id::text = ${String(orderId)}
    `;
    return { ok: true, alreadyRestored: true };
  }

  // 2. Fetch order items
  const items = await sql`
    SELECT id, product_id, variant_id, quantity, product_name, selected_size, selected_color
    FROM order_items
    WHERE order_id::text = ${String(orderId)}
  `;

  const touchedProducts = new Set<string>();
  let restoredCount = 0;

  for (const item of items as any[]) {
    if (!item.product_id) continue;
    const prodId = String(item.product_id);
    const qty = Math.max(1, Math.round(Number(item.quantity || 1)));
    let variantId = item.variant_id ? String(item.variant_id) : null;

    if (!variantId && (item.selected_size || item.selected_color)) {
      const v = await sql`
        SELECT id FROM product_variants
        WHERE product_id::text = ${prodId}
          AND (size = ${item.selected_size || ""} OR (size IS NULL AND ${item.selected_size || ""} = ''))
          AND (color = ${item.selected_color || ""} OR (color IS NULL AND ${item.selected_color || ""} = ''))
        LIMIT 1
      `;
      if (v.length > 0) variantId = String(v[0].id);
    }

    if (variantId) {
      const prevRes = await sql`
        SELECT stock_quantity FROM product_variants WHERE id::text = ${variantId} LIMIT 1
      `;
      const prev = Number(prevRes[0]?.stock_quantity ?? 0);
      const next = prev + qty;

      await sql`
        UPDATE product_variants
        SET stock_quantity = ${next}, updated_at = NOW()
        WHERE id::text = ${variantId}
      `;

      await logInventoryTransaction({
        productId: prodId,
        variantId: variantId,
        orderId: String(orderId),
        quantityChange: qty,
        previousQuantity: prev,
        newQuantity: next,
        transactionType: "ORDER_CANCELLATION",
        reason: `${reason} (${order.order_number})`,
        createdBy: actorId || null,
      });

      touchedProducts.add(prodId);
      restoredCount++;
    } else {
      const prevRes = await sql`
        SELECT stock_quantity FROM products WHERE id::text = ${prodId} LIMIT 1
      `;
      if (prevRes.length > 0) {
        const prev = Number(prevRes[0]?.stock_quantity ?? 0);
        const next = prev + qty;

        await sql`
          UPDATE products
          SET stock_quantity = ${next}, updated_at = NOW()
          WHERE id::text = ${prodId}
        `;

        await logInventoryTransaction({
          productId: prodId,
          variantId: null,
          orderId: String(orderId),
          quantityChange: qty,
          previousQuantity: prev,
          newQuantity: next,
          transactionType: "ORDER_CANCELLATION",
          reason: `${reason} (${order.order_number})`,
          createdBy: actorId || null,
        });

        touchedProducts.add(prodId);
        restoredCount++;
      }
    }
  }

  for (const pId of touchedProducts) {
    await syncProductTotalStock(pId);
  }

  await sql`
    UPDATE orders
    SET stock_state = 'Restored', status = 'Cancelled', cancelled_at = COALESCE(cancelled_at, NOW()), updated_at = NOW()
    WHERE id::text = ${String(orderId)}
  `;

  return { ok: true, restoredCount, alreadyRestored: false };
}

/**
 * Idempotently restores inventory when a return item reaches approved / received status.
 */
export async function restoreReturnInventory(params: {
  returnId: string;
  orderId: string;
  orderItemId: string;
  quantity?: number;
  actorId?: string | null;
}) {
  await ensureDbSchema();
  const sql = getSql();

  // 1. Idempotency Check: check if ORDER_RETURN already logged for this returnId
  const returnTxKey = `return_${params.returnId}`;
  const existingTx = await sql`
    SELECT id FROM inventory_transactions
    WHERE transaction_type = 'ORDER_RETURN' AND reason LIKE ${`%${returnTxKey}%`}
    LIMIT 1
  `;
  if (existingTx.length > 0) {
    return { ok: true, alreadyRestored: true };
  }

  const items = await sql`
    SELECT id, product_id, variant_id, quantity, product_name, selected_size, selected_color
    FROM order_items
    WHERE id::text = ${String(params.orderItemId)}
    LIMIT 1
  `;
  if (items.length === 0) return { ok: false, message: "Order item not found" };

  const it = items[0];
  if (!it.product_id) return { ok: true, message: "No product linked" };

  const prodId = String(it.product_id);
  const qty = Math.max(1, Math.round(Number(params.quantity || it.quantity || 1)));
  let variantId = it.variant_id ? String(it.variant_id) : null;

  if (!variantId && (it.selected_size || it.selected_color)) {
    const v = await sql`
      SELECT id FROM product_variants
      WHERE product_id::text = ${prodId}
        AND (size = ${it.selected_size || ""} OR (size IS NULL AND ${it.selected_size || ""} = ''))
        AND (color = ${it.selected_color || ""} OR (color IS NULL AND ${it.selected_color || ""} = ''))
      LIMIT 1
    `;
    if (v.length > 0) variantId = String(v[0].id);
  }

  if (variantId) {
    const prevRes = await sql`
      SELECT stock_quantity FROM product_variants WHERE id::text = ${variantId} LIMIT 1
    `;
    const prev = Number(prevRes[0]?.stock_quantity ?? 0);
    const next = prev + qty;

    await sql`
      UPDATE product_variants
      SET stock_quantity = ${next}, updated_at = NOW()
      WHERE id::text = ${variantId}
    `;

    await logInventoryTransaction({
      productId: prodId,
      variantId: variantId,
      orderId: String(params.orderId),
      quantityChange: qty,
      previousQuantity: prev,
      newQuantity: next,
      transactionType: "ORDER_RETURN",
      reason: `Return processed [${returnTxKey}]`,
      createdBy: params.actorId || null,
    });

    await syncProductTotalStock(prodId);
  } else {
    const prevRes = await sql`
      SELECT stock_quantity FROM products WHERE id::text = ${prodId} LIMIT 1
    `;
    if (prevRes.length > 0) {
      const prev = Number(prevRes[0]?.stock_quantity ?? 0);
      const next = prev + qty;

      await sql`
        UPDATE products
        SET stock_quantity = ${next}, updated_at = NOW()
        WHERE id::text = ${prodId}
      `;

      await logInventoryTransaction({
        productId: prodId,
        variantId: null,
        orderId: String(params.orderId),
        quantityChange: qty,
        previousQuantity: prev,
        newQuantity: next,
        transactionType: "ORDER_RETURN",
        reason: `Return processed [${returnTxKey}]`,
        createdBy: params.actorId || null,
      });

      await syncProductTotalStock(prodId);
    }
  }

  return { ok: true, alreadyRestored: false };
}

/**
 * Lists recent inventory transactions for admin audit & review.
 */
export async function listInventoryTransactions(
  context: AdminCtx,
  filters?: {
    productId?: string;
    variantId?: string;
    orderId?: string;
    limit?: number;
  },
): Promise<InventoryTransactionRecord[]> {
  await assertAdmin(context);
  await ensureDbSchema();
  const sql = getSql();

  const limit = Math.min(200, Math.max(1, filters?.limit || 50));

  let rows;
  if (filters?.variantId) {
    rows = await sql`
      SELECT t.id, t.product_id, t.variant_id, t.order_id, t.quantity_change, t.previous_quantity,
        t.new_quantity, t.transaction_type, t.reason, t.created_by, t.created_at,
        p.name as product_name, v.size, v.color
      FROM inventory_transactions t
      LEFT JOIN products p ON t.product_id::text = p.id::text
      LEFT JOIN product_variants v ON t.variant_id::text = v.id::text
      WHERE t.variant_id::text = ${String(filters.variantId)}
      ORDER BY t.created_at DESC
      LIMIT ${limit}
    `;
  } else if (filters?.productId) {
    rows = await sql`
      SELECT t.id, t.product_id, t.variant_id, t.order_id, t.quantity_change, t.previous_quantity,
        t.new_quantity, t.transaction_type, t.reason, t.created_by, t.created_at,
        p.name as product_name, v.size, v.color
      FROM inventory_transactions t
      LEFT JOIN products p ON t.product_id::text = p.id::text
      LEFT JOIN product_variants v ON t.variant_id::text = v.id::text
      WHERE t.product_id::text = ${String(filters.productId)}
      ORDER BY t.created_at DESC
      LIMIT ${limit}
    `;
  } else {
    rows = await sql`
      SELECT t.id, t.product_id, t.variant_id, t.order_id, t.quantity_change, t.previous_quantity,
        t.new_quantity, t.transaction_type, t.reason, t.created_by, t.created_at,
        p.name as product_name, v.size, v.color
      FROM inventory_transactions t
      LEFT JOIN products p ON t.product_id::text = p.id::text
      LEFT JOIN product_variants v ON t.variant_id::text = v.id::text
      ORDER BY t.created_at DESC
      LIMIT ${limit}
    `;
  }

  return (rows as any[]).map((r) => ({
    id: String(r.id),
    product_id: r.product_id ? String(r.product_id) : null,
    variant_id: r.variant_id ? String(r.variant_id) : null,
    order_id: r.order_id ? String(r.order_id) : null,
    quantity_change: Number(r.quantity_change || 0),
    previous_quantity: Number(r.previous_quantity || 0),
    new_quantity: Number(r.new_quantity || 0),
    transaction_type: r.transaction_type as InventoryTransactionType,
    reason: r.reason || null,
    created_by: r.created_by || null,
    created_at: new Date(r.created_at).toISOString(),
    product_name: r.product_name || null,
    variant_details: [r.size, r.color].filter(Boolean).join(" / ") || null,
  }));
}
