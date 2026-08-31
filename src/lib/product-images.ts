const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];

export function productImageUrl(path: string) {
  if (!path) return "/placeholder-tee.jpg";
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
  if (!ALLOWED.includes(file.type) && !file.type.startsWith("image/")) {
    return `${file.name}: unsupported type (use JPG, PNG, WebP or AVIF)`;
  }
  if (file.size > MAX_BYTES) {
    return `${file.name}: too large (max 15 MB)`;
  }
  return null;
}

export async function uploadProductImage(file: File): Promise<string> {
  const invalid = validateImageFile(file);
  if (invalid) throw new Error(invalid);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        try {
          const MAX_DIM = 1000;
          let { width, height } = img;
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const format = file.type === "image/png" ? "image/webp" : "image/jpeg";
          const compressed = canvas.toDataURL(format, 0.85);
          resolve(compressed);
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };
    reader.onerror = (e) => reject(e || new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}
