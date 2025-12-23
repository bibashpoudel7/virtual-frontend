/**
 * Direct upload to Cloudflare R2 from frontend
 * Uses presigned URLs for secure direct uploads
 */

interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

class StorageUploader {
  /**
   * Upload a file to R2 using presigned URL
   */
  async uploadFile(
    file: File | Buffer,
    key: string,
    contentType: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<string> {
    try {
      // Convert Buffer to Blob if needed
      const blob = file instanceof File ? file : new Blob([new Uint8Array(file)], { type: contentType });
      
      // Upload directly via API proxy route
      const xhr = new XMLHttpRequest();
      
      return new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress({
              loaded: e.loaded,
              total: e.total,
              percentage: Math.round((e.loaded / e.total) * 100)
            });
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText);
              if (response.success && response.url) {
                console.log(`Successfully uploaded ${key} to R2`);
                resolve(response.url);
              } else {
                console.error('Upload response error:', response);
                reject(new Error(response.error || response.message || 'Upload failed'));
              }
            } catch (err) {
              console.error('Failed to parse upload response:', xhr.responseText);
              reject(new Error('Invalid response from upload'));
            }
          } else {
            try {
              const errorResponse = JSON.parse(xhr.responseText);
              console.error('Upload failed:', errorResponse);
              reject(new Error(errorResponse.error || errorResponse.message || `Upload failed with status ${xhr.status}`));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener('error', () => {
          console.error('Upload failed - network error');
          reject(new Error('Upload failed - network error'));
        });

        // Upload to API proxy endpoint
        xhr.open('PUT', `/api/upload-to-r2?key=${encodeURIComponent(key)}`);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.send(blob);
      });
    } catch (error) {
      console.error('Failed to upload:', error);
      throw error;
    }
  }

  /**
   * Upload multiple files in parallel
   */
  async uploadMultiple(
    files: Array<{ file: File | Buffer; key: string; contentType: string }>,
    onProgress?: (key: string, progress: UploadProgress) => void,
    maxConcurrent: number = 5
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    
    // Process in batches to avoid overwhelming the server
    for (let i = 0; i < files.length; i += maxConcurrent) {
      const batch = files.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async ({ file, key, contentType }) => {
        try {
          const url = await this.uploadFile(
            file,
            key,
            contentType,
            (progress) => onProgress?.(key, progress)
          );
          results.set(key, url);
          return url;
        } catch (error) {
          console.error(`Failed to upload ${key}:`, error);
          // Continue with other uploads even if one fails
          results.set(key, '');
          return '';
        }
      });
      
      await Promise.all(batchPromises);
    }
    
    return results;
  }

  /**
   * Get public URL for uploaded file
   */
  getPublicUrl(key: string): string {
    const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://test.thenimto.com';
    return `${publicUrl}/${key}`;
  }
}

export const storageUploader = new StorageUploader();