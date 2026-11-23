export interface OptimizedImageResult {
  blob: Blob;
  width: number;
  height: number;
  originalBytes: number;
  optimizedBytes: number;
}

/**
 * Optimiza cualquier imagen en navegador a WebP (máx 1200px sin upscaling, calidad 0.86)
 * preservando la máxima nitidez y reduciendo peso para Supabase Storage.
 */
export async function optimizeImageToWebP(
  file: File,
  maxSide = 1200,
  quality = 0.86
): Promise<OptimizedImageResult> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
      el.src = bitmapUrl;
    });

    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Tu navegador no permite procesar imágenes.');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error('No se pudo generar el archivo WebP.'));
        },
        'image/webp',
        quality
      );
    });

    return {
      blob,
      width,
      height,
      originalBytes: file.size,
      optimizedBytes: blob.size,
    };
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

export function formatKb(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
