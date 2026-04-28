/// <reference lib="webworker" />

addEventListener('message', ({ data }) => {
  const { type, payload } = data;

  if (type === 'resize') {
    handleResize(payload);
  } else if (type === 'filter') {
    handleFilter(payload);
  }
});

async function handleResize(payload: { base64: string; maxWidth: number }) {
  const { base64, maxWidth } = payload;
  
  // NOTE: In workers, we don't have access to DOM Image or Canvas directly easily 
  // without OffscreenCanvas. 
  // However, modern browsers supporting workers usually support OffscreenCanvas.
  
  try {
    const response = await fetch(base64);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
        postMessage({ type: 'error', message: 'Could not get context' });
        return;
    }

    let width = bitmap.width;
    let height = bitmap.height;

    if (width > maxWidth) {
      const scale = maxWidth / width;
      width = maxWidth;
      height = height * scale;
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blobResult = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.3 });

    const reader = new FileReader();
    reader.onloadend = () => {
      postMessage({ type: 'resize_result', base64: reader.result });
    };
    reader.readAsDataURL(blobResult);
    
  } catch (e: any) {
    postMessage({ type: 'error', message: e.message });
  }
}

async function handleFilter(payload: { base64: string; filter: string }) {
    const { base64, filter } = payload;
    try {
        const response = await fetch(base64);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        ctx.drawImage(bitmap, 0, 0);

        if (filter !== 'none') {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            applyFilterLogic(data, filter);
            ctx.putImageData(imageData, 0, 0);
        }

        const blobResult = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
        const reader = new FileReader();
        reader.onloadend = () => {
            postMessage({ type: 'filter_result', base64: reader.result });
        };
        reader.readAsDataURL(blobResult);
    } catch (e: any) {
        postMessage({ type: 'error', message: e.message });
    }
}

function applyFilterLogic(data: Uint8ClampedArray, filter: string) {
    switch (filter) {
        case 'grayscale':
            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                data[i] = data[i + 1] = data[i + 2] = avg;
            }
            break;
        case 'contrast':
            const factor = (259 * (128 + 255)) / (255 * (259 - 128));
            for (let i = 0; i < data.length; i += 4) {
                data[i] = clamp(factor * (data[i] - 128) + 128);
                data[i + 1] = clamp(factor * (data[i + 1] - 128) + 128);
                data[i + 2] = clamp(factor * (data[i + 2] - 128) + 128);
            }
            break;
        case 'brightness':
            for (let i = 0; i < data.length; i += 4) {
                data[i] = clamp(data[i] * 1.2);
                data[i + 1] = clamp(data[i + 1] * 1.2);
                data[i + 2] = clamp(data[i + 2] * 1.2);
            }
            break;
        case 'sepia':
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
                data[i] = clamp(r * 0.393 + g * 0.769 + b * 0.189);
                data[i + 1] = clamp(r * 0.349 + g * 0.686 + b * 0.168);
                data[i + 2] = clamp(r * 0.272 + g * 0.534 + b * 0.131);
            }
            break;
    }
}

function clamp(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
}
