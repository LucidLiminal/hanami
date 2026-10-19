// Normalize every uploaded cover to one bounded, static WebP.
export const GROUP_COVER_MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const GROUP_COVER_MAX_OUTPUT_BYTES = 1024 * 1024;
export const GROUP_COVER_MAX_EDGE = 1280;
export const GROUP_COVER_MAX_PIXELS = 40_000_000;
export const GROUP_COVER_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export function groupCoverPath(groupId) {
  if (
    typeof groupId !== "string" ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(groupId)
  )
    throw new Error("El grupo no tiene un identificador válido.");
  return `${groupId.toLowerCase()}/cover.webp`;
}

export function validateGroupCoverFile(file) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0)
    throw new Error("Selecciona una imagen válida.");
  if (!GROUP_COVER_TYPES.includes(file.type))
    throw new Error("Selecciona una imagen JPG, PNG, WebP o GIF.");
  if (file.size > GROUP_COVER_MAX_INPUT_BYTES)
    throw new Error("La imagen original no puede superar 10 MB.");
}

async function decodeCover(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Some browsers can display a raster format but cannot decode it here.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("No se pudo leer la imagen."));
      image.src = url;
    });
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("No se pudo leer la imagen. El archivo puede estar dañado.");
  }
}

function encodeWebp(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.type !== "image/webp")
          reject(
            new Error(
              "Este navegador no pudo crear la portada WebP. Actualízalo y vuelve a intentarlo.",
            ),
          );
        else resolve(blob);
      },
      "image/webp",
      quality,
    );
  });
}

export async function prepareGroupCover(file) {
  validateGroupCoverFile(file);
  const decoded = await decodeCover(file);
  let canvas;
  try {
    const { width, height } = decoded;
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 1 ||
      height < 1 ||
      width * height > GROUP_COVER_MAX_PIXELS
    )
      throw new Error("La imagen debe tener como máximo 40 megapíxeles.");
    const initialScale = Math.min(1, GROUP_COVER_MAX_EDGE / Math.max(width, height));
    canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la imagen.");
    for (const resize of [1, 0.75, 0.5]) {
      canvas.width = Math.max(1, Math.round(width * initialScale * resize));
      canvas.height = Math.max(1, Math.round(height * initialScale * resize));
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.7, 0.55]) {
        const blob = await encodeWebp(canvas, quality);
        if (blob.size > 0 && blob.size <= GROUP_COVER_MAX_OUTPUT_BYTES)
          return blob;
      }
    }
    throw new Error("No se pudo reducir la portada a 1 MB. Prueba otra imagen.");
  } finally {
    decoded.release();
    if (canvas) canvas.width = canvas.height = 0;
  }
}