const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export function productImageUrl(path: string) {
  if (
    path.startsWith("data:") ||
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("/")
  ) {
    return path;
  }
  return `/api/public/product-image?path=${encodeURIComponent(path)}`;
}

export function validateImageFile(file: File) {
  if (!ALLOWED.includes(file.type)) {
    return `${file.name}: unsupported type (use JPG, PNG, WebP or AVIF)`;
  }
  if (file.size > MAX_BYTES) {
    return `${file.name}: too large (max 5 MB)`;
  }
  return null;
}

export async function uploadProductImage(file: File): Promise<string> {
  const invalid = validateImageFile(file);
  if (invalid) throw new Error(invalid);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
