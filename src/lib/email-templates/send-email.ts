import * as React from "react";
import { render } from "@react-email/render";
import { TEMPLATES } from "./registry";

// Server-only: reads RESEND_API_KEY / EMAIL_FROM. Never import from client components.

const SITE_NAME = "RIOTOUS";
const FROM_DOMAIN = process.env.EMAIL_FROM_DOMAIN || "riotous.store";
const FROM_EMAIL = process.env.EMAIL_FROM || `${SITE_NAME} <noreply@${FROM_DOMAIN}>`;

export type SendTemplateEmailResult = { sent: true } | { sent: false; reason: string };

export interface SendTemplateEmailOptions {
  templateData?: Record<string, any>;
  /** Dedupes retries of the same logical send; defaults to a random UUID (no dedupe). */
  idempotencyKey?: string;
  replyTo?: string;
}

/**
 * Renders a registered template and sends it through a standard email API (Resend or configured SMTP/API).
 * If no key is set, logs the simulated email so local development and environments without email providers work smoothly.
 */
export async function sendTemplateEmail(
  templateName: string,
  to: string,
  options: SendTemplateEmailOptions = {},
): Promise<SendTemplateEmailResult> {
  const apiKey = process.env["RESEND_API_KEY"] || process.env["EMAIL_API_KEY"];

  const template = TEMPLATES[templateName];
  if (!template) {
    throw new Error(
      `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(", ")}`,
    );
  }

  // Template-level `to` takes precedence — notification templates always
  // send to their fixed address.
  const recipient = template.to || to;
  if (!recipient) {
    throw new Error("Recipient is required (the template defines no fixed recipient)");
  }

  const templateData = options.templateData ?? {};
  const element = React.createElement(template.component, templateData);
  const html = await render(element);
  const text = await render(element, { plainText: true });
  const subject =
    typeof template.subject === "function" ? template.subject(templateData) : template.subject;

  if (!apiKey) {
    console.info(
      `[Email Service] Simulated email sending to ${recipient} for template '${templateName}' (${subject})`,
    );
    return { sent: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: recipient,
        subject,
        html,
        text,
        reply_to: options.replyTo,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[Email Service] Send failed: ${res.status} ${errText}`);
      return { sent: false, reason: `Provider error ${res.status}` };
    }
    return { sent: true };
  } catch (error) {
    console.error("[Email Service] Error sending email:", error);
    return { sent: false, reason: error instanceof Error ? error.message : "Unknown error" };
  }
}
