import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth-middleware";
import { assertAdmin } from "@/lib/admin-utils";
import { getSql, ensureDbSchema } from "@/lib/db";

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
    await ensureDbSchema();
    const sql = getSql();

    const now = new Date();
    const daysMap = new Map<string, { revenue: number; orders: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      daysMap.set(key, { revenue: 0, orders: 0 });
    }

    try {
      const [
        orderTotalsRes,
        countsRes,
        statusCountsRes,
        paymentCountsRes,
        recentOrdersRes,
        productsRes,
        recentCustomersRes,
        bestSellersRes,
        salesByDayRes,
      ] = await Promise.all([
        sql`
          SELECT 
            COUNT(*)::int as total_orders,
            COALESCE(SUM(CASE WHEN status NOT IN ('Cancelled', 'Returned', 'Refunded') THEN total_amount ELSE 0 END), 0)::numeric as total_sales,
            COALESCE(SUM(CASE WHEN status NOT IN ('Cancelled', 'Returned', 'Refunded') AND created_at >= CURRENT_DATE THEN total_amount ELSE 0 END), 0)::numeric as sales_today,
            COALESCE(SUM(CASE WHEN status NOT IN ('Cancelled', 'Returned', 'Refunded') AND created_at >= DATE_TRUNC('month', CURRENT_DATE) THEN total_amount ELSE 0 END), 0)::numeric as sales_month,
            COUNT(CASE WHEN status NOT IN ('Cancelled', 'Returned', 'Refunded') THEN 1 ELSE NULL END)::int as revenue_orders_count
          FROM orders
        `,
        sql`
          SELECT
            (SELECT COUNT(*)::int FROM profiles) as total_customers,
            (SELECT COUNT(*)::int FROM products) as total_products
        `,
        sql`
          SELECT status, COUNT(*)::int as count FROM orders GROUP BY status
        `,
        sql`
          SELECT payment_status, COUNT(*)::int as count FROM orders GROUP BY payment_status
        `,
        sql`
          SELECT id, order_number, created_at, total_amount, currency, status, payment_status, shipping_name, shipping_email
          FROM orders
          ORDER BY created_at DESC
          LIMIT 10
        `,
        sql`
          SELECT id, name, stock_quantity, reserved_stock, low_stock_threshold, is_active
          FROM products
          WHERE is_active = true
          ORDER BY (stock_quantity - reserved_stock) ASC
          LIMIT 100
        `,
        sql`
          SELECT 
            p.id, p.email, p.full_name, p.created_at,
            COUNT(o.id)::int as orders,
            COALESCE(SUM(CASE WHEN o.status NOT IN ('Cancelled', 'Returned', 'Refunded') THEN o.total_amount ELSE 0 END), 0)::numeric as spent
          FROM profiles p
          LEFT JOIN orders o ON p.id::text = o.user_id::text
          GROUP BY p.id, p.email, p.full_name, p.created_at
          ORDER BY p.created_at DESC
          LIMIT 10
        `,
        sql`
          SELECT 
            oi.product_name as name,
            COALESCE(SUM(oi.quantity), 0)::int as units,
            COALESCE(SUM(oi.subtotal), 0)::numeric as revenue
          FROM order_items oi
          JOIN orders o ON oi.order_id::text = o.id::text
          WHERE o.status NOT IN ('Cancelled', 'Returned', 'Refunded')
          GROUP BY oi.product_name
          ORDER BY units DESC
          LIMIT 5
        `,
        sql`
          SELECT 
            TO_CHAR(created_at, 'YYYY-MM-DD') as date,
            COALESCE(SUM(total_amount), 0)::numeric as revenue,
            COUNT(*)::int as orders
          FROM orders
          WHERE created_at >= CURRENT_DATE - INTERVAL '14 days'
            AND status NOT IN ('Cancelled', 'Returned', 'Refunded')
          GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
          ORDER BY date ASC
        `,
      ]);

      const orderTotals = orderTotalsRes[0] || {};
      const counts = countsRes[0] || {};

      const statusCounts: Record<string, number> = {};
      for (const row of statusCountsRes as any[]) {
        if (row?.status) statusCounts[row.status] = Number(row.count || 0);
      }

      const paymentCounts: Record<string, number> = {};
      for (const row of paymentCountsRes as any[]) {
        if (row?.payment_status) paymentCounts[row.payment_status] = Number(row.count || 0);
      }

      const currency = (recentOrdersRes[0]?.currency as string) || "INR";
      const totalOrders = Number(orderTotals.total_orders || 0);
      const totalSales = Number(orderTotals.total_sales || 0);
      const salesToday = Number(orderTotals.sales_today || 0);
      const salesMonth = Number(orderTotals.sales_month || 0);
      const revOrdersCount = Number(orderTotals.revenue_orders_count || 0);

      // Populate daily sales
      for (const row of salesByDayRes as any[]) {
        if (row?.date && daysMap.has(row.date)) {
          daysMap.set(row.date, {
            revenue: Number(row.revenue || 0),
            orders: Number(row.orders || 0),
          });
        }
      }
      const salesByDay = Array.from(daysMap.entries()).map(([date, val]) => ({
        date,
        revenue: val.revenue,
        orders: val.orders,
      }));

      // Calculate low/out of stock
      const lowStock: DashboardProduct[] = [];
      const outOfStock: DashboardProduct[] = [];
      for (const p of productsRes as any[]) {
        const available = Number(p.stock_quantity || 0) - Number(p.reserved_stock || 0);
        const threshold = Number(p.low_stock_threshold || 2);
        const prod: DashboardProduct = {
          id: String(p.id),
          name: p.name,
          stock_quantity: Number(p.stock_quantity || 0),
          reserved_stock: Number(p.reserved_stock || 0),
          low_stock_threshold: threshold,
          is_active: Boolean(p.is_active),
        };
        if (available <= 0) outOfStock.push(prod);
        else if (available <= threshold) lowStock.push(prod);
      }

      const recentOrders: DashboardOrder[] = (recentOrdersRes as any[]).map((o) => ({
        id: String(o.id),
        order_number: o.order_number,
        created_at: new Date(o.created_at).toISOString(),
        total_amount: Number(o.total_amount || 0),
        currency: o.currency || "INR",
        status: o.status || "Pending",
        payment_status: o.payment_status || "Pending",
        shipping_name: o.shipping_name || "",
        shipping_email: o.shipping_email || "",
      }));

      const recentCustomers: DashboardCustomer[] = (recentCustomersRes as any[]).map((p) => ({
        id: String(p.id),
        email: p.email || null,
        full_name: p.full_name || null,
        created_at: new Date(p.created_at).toISOString(),
        orders: Number(p.orders || 0),
        spent: Number(p.spent || 0),
      }));

      const bestSellers: BestSeller[] = (bestSellersRes as any[]).map((b) => ({
        name: b.name,
        units: Number(b.units || 0),
        revenue: Number(b.revenue || 0),
      }));

      const notifications: AdminNotification[] = [];
      for (const o of recentOrders.slice(0, 5)) {
        notifications.push({
          kind: "order",
          title: `New Order ${o.order_number}`,
          detail: `${o.shipping_name || "Customer"} placed an order worth ₹${o.total_amount}`,
          at: o.created_at,
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

      return {
        currency,
        totals: {
          sales: totalSales,
          salesToday,
          salesMonth,
          orders: totalOrders,
          products: Number(counts.total_products || 0),
          customers: Number(counts.total_customers || 0),
          avgOrderValue: revOrdersCount > 0 ? Math.round(totalSales / revOrdersCount) : 0,
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
    } catch (err) {
      console.error("[Admin Dashboard] error:", err);
      return {
        currency: "INR",
        totals: {
          sales: 0,
          salesToday: 0,
          salesMonth: 0,
          orders: 0,
          products: 0,
          customers: 0,
          avgOrderValue: 0,
        },
        statusCounts: {},
        paymentCounts: {},
        lowStock: [],
        outOfStock: [],
        recentOrders: [],
        recentCustomers: [],
        bestSellers: [],
        salesByDay: Array.from(daysMap.entries()).map(([date]) => ({
          date,
          revenue: 0,
          orders: 0,
        })),
        notifications: [],
      };
    }
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
      await assertAdmin(context);
      try {
        const sql = getSql();
        const rows = await sql`
        SELECT id, created_at, actor_email, action, entity_type, entity_id, details
        FROM admin_audit_log
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
