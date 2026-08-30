import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

export interface AdminOrderNotificationProps {
  orderNumber?: string;
  createdAt?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress?: string;
  paymentMethod?: string;
  subtotal?: string;
  shippingCharge?: string;
  total?: string;
  currency?: string;
  hasCustomDesign?: boolean;
  items?: Array<{
    name: string;
    quantity: number;
    size?: string | null;
    color?: string | null;
    price: string;
    isCustomDesign?: boolean;
  }>;
}

function AdminOrderNotificationEmail(props: AdminOrderNotificationProps) {
  const items = props.items ?? [];
  const currency = props.currency ?? "INR";
  return (
    <Html>
      <Head />
      <Preview>
        New order {props.orderNumber ?? ""} — {props.total ?? ""} {currency}
      </Preview>
      <Body style={{ backgroundColor: "#f6f6f6", fontFamily: "Helvetica, Arial, sans-serif" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            margin: "24px auto",
            padding: "24px",
            maxWidth: 560,
          }}
        >
          <Heading style={{ fontSize: 20, margin: "0 0 4px" }}>
            RIOT<span style={{ color: "#f00b11" }}>O</span>US — New Order
          </Heading>
          <Text style={{ color: "#666", marginTop: 0 }}>
            {props.orderNumber} · {props.createdAt}
            {props.hasCustomDesign ? " · 🎨 Includes a custom Design-Your-Own item" : ""}
          </Text>
          <Hr />
          <Section>
            <Text style={{ margin: "4px 0" }}>
              <strong>Customer:</strong> {props.customerName}
            </Text>
            <Text style={{ margin: "4px 0" }}>
              <strong>Email:</strong> {props.customerEmail}
            </Text>
            {props.customerPhone ? (
              <Text style={{ margin: "4px 0" }}>
                <strong>Phone:</strong> {props.customerPhone}
              </Text>
            ) : null}
            <Text style={{ margin: "4px 0" }}>
              <strong>Ship to:</strong> {props.shippingAddress}
            </Text>
            <Text style={{ margin: "4px 0" }}>
              <strong>Payment:</strong> {props.paymentMethod ?? "COD"}
            </Text>
          </Section>
          <Hr />
          <Section>
            {items.map((item, i) => (
              <Text key={i} style={{ margin: "6px 0" }}>
                {item.quantity} × {item.name}
                {item.size ? ` — Size ${item.size}` : ""}
                {item.color ? ` / ${item.color}` : ""}
                {item.isCustomDesign ? " (Custom design — check admin panel)" : ""}
                {" — "}
                {item.price} {currency}
              </Text>
            ))}
          </Section>
          <Hr />
          <Text style={{ margin: "4px 0" }}>
            Subtotal: {props.subtotal} {currency}
          </Text>
          <Text style={{ margin: "4px 0" }}>
            Shipping: {props.shippingCharge} {currency}
          </Text>
          <Text style={{ margin: "4px 0", fontSize: 16 }}>
            <strong>
              Total: {props.total} {currency}
            </strong>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const template = {
  component: AdminOrderNotificationEmail,
  subject: (d: Record<string, any>) =>
    `New order ${d.orderNumber ?? ""} — ${d.total ?? ""} ${d.currency ?? "INR"}${d.hasCustomDesign ? " (custom design)" : ""}`,
  displayName: "Admin order notification",
  // Fixed recipient: every order notification goes to the store owner.
  to: "princevekariya9898@gmail.com",
  previewData: {
    orderNumber: "RIO-ABCD1234",
    createdAt: new Date().toLocaleString("en-IN"),
    customerName: "Aarav Shah",
    customerEmail: "customer@example.com",
    customerPhone: "+91 98765 43210",
    shippingAddress: "12 Ring Road, Surat, Gujarat 395002",
    paymentMethod: "COD",
    subtotal: "2398",
    shippingCharge: "0",
    total: "2398",
    currency: "INR",
    hasCustomDesign: true,
    items: [
      { name: "Zoro Black Tee", quantity: 1, size: "L", color: "Black", price: "1199" },
      {
        name: "Custom RIOTOUS Tee — Front print",
        quantity: 1,
        size: "M",
        color: "Olive",
        price: "1499",
        isCustomDesign: true,
      },
    ],
  } satisfies AdminOrderNotificationProps,
} satisfies TemplateEntry;
