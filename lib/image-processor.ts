/**
 * Process image before uploading to R2/Cloudflare
 * - Resize to optimal dimensions for 360 panoramas
 * - Convert to JPEG for better compression
 * - Maintain 2:1 aspect ratio for equirectangular images
 */

interface ProcessImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

export async function processImageBeforeUpload(
  file: File,
  options: ProcessImageOptions = {}
): Promise<{ processedFile: File; metadata: any }> {
  const {
    maxWidth = 4096,  // Max width for panorama
    maxHeight = 2048, // Max height (2:1 ratio)
    quality = 85,
    format = 'jpeg'
  } = options;

  // Create FormData with the file
  const formData = new FormData();
  formData.append('file', file);

  try {
    // Send to API route for processing
    const response = await fetch('/api/process-image', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to process image');
    }

    // Get processed image blob
    const processedBlob = await response.blob();
    
    // Get metadata from headers
    const metadata = {
      width: parseInt(response.headers.get('X-Image-Width') || '0'),
      height: parseInt(response.headers.get('X-Image-Height') || '0'),
      size: processedBlob.size,
      type: processedBlob.type
    };

    // Create new File object with processed image
    const processedFile = new File(
      [processedBlob],
      file.name.replace(/\.[^/.]+$/, `.${format}`),
      { type: `image/${format}` }
    );

    return { processedFile, metadata };
  } catch (error) {
    console.error('Error processing image:', error);
    // Return original file if processing fails
    return { 
      processedFile: file, 
      metadata: {
        width: 0,
        height: 0,
        size: file.size,
        type: file.type
      }
    };
  }
}

/**
 * Validate if image is suitable for 360 panorama
 */
export function validatePanoramaImage(file: File): { valid: boolean; error?: string } {
  // Check file type
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return { 
      valid: false, 
      error: 'Invalid file type. Please upload a JPEG, PNG, or WebP image.' 
    };
  }

  // Check file size (max 50MB)
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    return { 
      valid: false, 
      error: 'File too large. Maximum size is 50MB.' 
    };
  }

  return { valid: true };
}

/**
 * Check if image has correct aspect ratio for equirectangular projection
 */
export async function checkAspectRatio(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      const aspectRatio = img.width / img.height;
      // Check if aspect ratio is close to 2:1 (equirectangular)
      resolve(Math.abs(aspectRatio - 2) < 0.1);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(false);
    };
    
    img.src = url;
  });
}

/**
 * Process and upload image to R2 with presigned URL
 */
export async function processAndUploadToR2(
  file: File,
  presignedUrl: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  // Validate image
  const validation = validatePanoramaImage(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Process image with Sharp
  const { processedFile, metadata } = await processImageBeforeUpload(file, {
    maxWidth: 4096,
    maxHeight: 2048,
    quality: 85,
    format: 'jpeg'
  });

  console.log('Image processed:', metadata);

  // Upload processed image to presigned URL
  const xhr = new XMLHttpRequest();

  return new Promise((resolve, reject) => {
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const progress = (e.loaded / e.total) * 100;
        onProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200 || xhr.status === 204) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed'));
    });

    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', processedFile.type);
    xhr.send(processedFile);
  });
}