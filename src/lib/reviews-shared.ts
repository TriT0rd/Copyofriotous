/** Client-safe types and constants for the product review system. */

export const REVIEW_STATUSES = ["pending", "approved", "rejected", "hidden"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: "Awaiting approval",
  approved: "Published",
  rejected: "Rejected",
  hidden: "Hidden",
};

export const REVIEW_STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-500",
  approved: "bg-emerald-500/15 text-emerald-400",
  rejected: "bg-destructive/15 text-destructive",
  hidden: "bg-muted text-muted-foreground",
};

export type PublicReview = {
  id: string;
  rating: number;
  title: string | null;
  review: string | null;
  images: string[];
  verified_purchase: boolean;
  created_at: string;
  author_name?: string | null;
};

export const REVIEW_SORTS = ["recent", "highest", "lowest", "verified"] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

export const REVIEW_SORT_LABEL: Record<ReviewSort, string> = {
  recent: "Most recent",
  highest: "Highest rating",
  lowest: "Lowest rating",
  verified: "Verified purchases",
};

export const REVIEW_PAGE_SIZE = 10;

export type ReviewSummary = {
  average: number;
  total: number;
  /** Count per star, index 0 = 1 star … index 4 = 5 stars. */
  distribution: number[];
};

export type MyReview = PublicReview & {
  status: ReviewStatus;
  product_id: string;
  admin_note: string | null;
  updated_at: string;
  product?: { name: string; slug: string; image: string | null } | null;
};

export type AdminReview = MyReview & {
  user_id: string;
  order_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
};

export function summarize(ratings: number[]): ReviewSummary {
  const distribution = [0, 0, 0, 0, 0];
  for (const r of ratings) {
    const i = Math.min(5, Math.max(1, Math.round(r))) - 1;
    distribution[i] = (distribution[i] ?? 0) + 1;
  }
  const total = ratings.length;
  const average = total ? Math.round((ratings.reduce((a, b) => a + b, 0) / total) * 10) / 10 : 0;
  return { average, total, distribution };
}
