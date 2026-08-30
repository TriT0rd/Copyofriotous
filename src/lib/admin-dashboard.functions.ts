import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth-middleware";
import { assertAdmin } from "@/lib/admin-utils";
import { getSql } from "@/lib/db";

export type DashboardOrder = {
  id: string;
  order_number: string;
  created_at: string;
  total_amount: number;
  currency: string;
  status: string;
  payment_status: string;
  shipping_name: string;
  shipping_email: string;
};

export type DashboardCustomer = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  orders: number;
  spent: number;
};

export type DashboardProduct = {
  id: string;
  name: string;
  stock_quantity: number;
  reserved_stock: number;
  low_stock_threshold: number;
  is_active: boolean;
};

export type BestSeller = {
  name: string;
  units: number;
  revenue: number;
};

export type AdminNotification = {
  kind: "order" | "low_stock" | "out_of_stock" | "customer" | "payment";
  title: string;
  detail: string;
  at: string | null;
};

export type AdminDashboard = {
  currency: string;
  totals: {
    sales: number;
    salesToday: number;
    salesMonth: number;
    orders: number;
    products: number;
    customers: number;
    avgOrderValue: number;
  };
  statusCounts: Record<string, number>;
  paymentCounts: Record<string, number>;
  lowStock: DashboardProduct[];
  outOfStock: DashboardProduct[];
  recentOrders: DashboardOrder[];
  recentCustomers: DashboardCustomer[];
  bestSellers: BestSeller[];
  salesByDay: Array<{ date: string; revenue: number; orders: number }>;
  notifications: AdminNotification[];
};

const VOID = new Set(["Cancelled", "Returned", "Refunded"]);

export const adminDashboard = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AdminDashboard> => {
    await assertAdmin(context);
    const sql = getSql();

    const [orders, products, profiles, items] = await Promise.all([
      sql`
        SELECT id, order_number, created_at, total_amount, currency, status, payment_status, shipping_name, shipping_email, user_id
        FROM orders
        ORDER BY created_at DESC
        LIMIT 1000
      `,
      sql`
        SELECT id, name, stock_quantity, reserved_stock, low_stock_threshold, is_active
        FROM products
      `,
      sql`
        SELECT id, email, full_name, created_at
        FROM profiles
        ORDER BY created_at DESC
        LIMIT 500
      `,
      sql`
        SELECT product_name, quantity, subtotal, order_id
        FROM order_items
        LIMIT 5000
      `,
    ]);

    const currency = (orders[0]?.currency as string) || "INR";
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const revenueOrders = orders.filter((o: any) => !VOID.has(o.status));
    const sum = (list: typeof revenueOrders) =>
      list.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);

    const statusCounts: Record<string, number> = {};
    const paymentCounts: Record<string, number> = {};
    for (const o of orders as any[]) {
      statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
      paymentCounts[o.payment_status] = (paymentCounts[o.payment_status] ?? 0) + 1;
    }

    const voidIds = new Set((orders as any[]).filter((o) => VOID.has(o.status)).map((o) => o.id));
    const bestMap = new Map<string, BestSeller>();
    for (const it of items as any[]) {
      if (voidIds.has(it.order_id)) continue;
      const row = bestMap.get(it.product_name) ?? {
        name: it.product_name,
        units: 0,
        revenue: 0,
      };
      row.units += Number(it.quantity || 0);
      row.revenue += Number(it.subtotal || 0);
      bestMap.set(it.product_name, row);
    }
    const bestSellers = Array.from(bestMap.values())
      .sort((a, b) => b.units - a.units)
      .slice(0, 5);

    // Sales by day (last 14 days)
    const daysMap = new Map<string, { revenue: number; orders: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      daysMap.set(key, { revenue: 0, orders: 0 });
    }
    for (const o of revenueOrders as any[]) {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (daysMap.has(key)) {
        const entry = daysMap.get(key)!;
        entry.revenue += Number(o.total_amount || 0);
        entry.orders += 1;
      }
    }
    const salesByDay = Array.from(daysMap.entries()).map(([date, val]) => ({
      date,
      revenue: val.revenue,
      orders: val.orders,
    }));

    // Customer metrics
    const customerOrders = new Map<string, { count: number; spent: number }>();
    for (const o of revenueOrders as any[]) {
      if (!o.user_id) continue;
      const c = customerOrders.get(o.user_id) ?? { count: 0, spent: 0 };
      c.count += 1;
      c.spent += Number(o.total_amount || 0);
      customerOrders.set(o.user_id, c);
    }
    const recentCustomers: DashboardCustomer[] = (profiles as any[]).slice(0, 10).map((p) => {
      const stats = customerOrders.get(p.id) ?? { count: 0, spent: 0 };
      return {
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        created_at: new Date(p.created_at).toISOString(),
        orders: stats.count,
        spent: stats.spent,
      };
    });

    const lowStock: DashboardProduct[] = [];
    const outOfStock: DashboardProduct[] = [];
    for (const p of products as any[]) {
      if (!p.is_active) continue;
      const available = Number(p.stock_quantity || 0) - Number(p.reserved_stock || 0);
      const threshold = Number(p.low_stock_threshold || 2);
      const prod: DashboardProduct = {
        id: p.id,
        name: p.name,
        stock_quantity: Number(p.stock_quantity || 0),
        reserved_stock: Number(p.reserved_stock || 0),
        low_stock_threshold: threshold,
        is_active: p.is_active,
      };
      if (available <= 0) outOfStock.push(prod);
      else if (available <= threshold) lowStock.push(prod);
    }

    const recentOrders: DashboardOrder[] = (orders as any[]).slice(0, 10).map((o) => ({
      id: o.id,
      order_number: o.order_number,
      created_at: new Date(o.created_at).toISOString(),
      total_amount: Number(o.total_amount || 0),
      currency: o.currency || "INR",
      status: o.status || "Pending",
      payment_status: o.payment_status || "Pending",
      shipping_name: o.shipping_name || "",
      shipping_email: o.shipping_email || "",
    }));

    const notifications: AdminNotification[] = [];
    for (const o of (orders as any[]).slice(0, 5)) {
      notifications.push({
        kind: "order",
        title: `New Order ${o.order_number}`,
        detail: `${o.shipping_name || "Customer"} placed an order worth ₹${o.total_amount}`,
        at: new Date(o.created_at).toISOString(),
      });
    }

    for (const p of outOfStock.slice(0, 5)) {
      notifications.push({
        kind: "out_of_stock",
        title: `Out of Stock: ${p.name}`,
        detail: `0 units remaining in stock`,
        at: null,
      });
    }

    const salesTotal = sum(revenueOrders);
    const salesToday = sum(
      revenueOrders.filter((o: any) => new Date(o.created_at).getTime() >= startOfDay),
    );
    const salesMonth = sum(
      revenueOrders.filter((o: any) => new Date(o.created_at).getTime() >= startOfMonth),
    );

    return {
      currency,
      totals: {
        sales: salesTotal,
        salesToday,
        salesMonth,
        orders: orders.length,
        products: products.length,
        customers: profiles.length,
        avgOrderValue: revenueOrders.length ? Math.round(salesTotal / revenueOrders.length) : 0,
      },
      statusCounts,
      paymentCounts,
      lowStock,
      outOfStock,
      recentOrders,
      recentCustomers,
      bestSellers,
      salesByDay,
      notifications,
    };
  });

export const adminAuditLog = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(
    async ({
      context,
    }): Promise<
      Array<{
        id: string;
        created_at: string;
        actor_email: string | null;
        action: string;
        entity_type: string | null;
        entity_id: string | null;
        details: any;
      }>
    > => {
      assertAdmin(context);
      try {
        const sql = getSql();
        const rows = await sql`
        SELECT id, created_at, actor_email, action, entity_type, entity_id, details
        FROM admin_audit_logs
        ORDER BY created_at DESC
        LIMIT 100
      `;
        return rows.map((r: any) => ({
          id: r.id,
          created_at: new Date(r.created_at).toISOString(),
          actor_email: r.actor_email || null,
          action: r.action,
          entity_type: r.entity_type || null,
          entity_id: r.entity_id || null,
          details: typeof r.details === "string" ? JSON.parse(r.details) : r.details || {},
        }));
      } catch {
        return [];
      }
    },
  );
