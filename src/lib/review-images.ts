const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export const MAX_REVIEW_IMAGES = 5;

export function reviewImageUrl(path: string) {
  if (path.startsWith("data:") || /^https?:\/\//.test(path) || path.startsWith("/")) return path;
  return `/api/public/review-image?path=${encodeURIComponent(path)}`;
}

export function validateReviewImage(file: File) {
  if (!ALLOWED.includes(file.type)) {
    return `${file.name}: unsupported type (use JPG, PNG, WebP or AVIF)`;
  }
  if (file.size > MAX_BYTES) return `${file.name}: too large (max 5 MB)`;
  return null;
}

export async function uploadReviewImage(file: File, _userId: string) {
  const invalid = validateReviewImage(file);
  if (invalid) throw new Error(invalid);

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
