/*
 * DEPRECATED: This showcase viewer is no longer used.
 * 
 * The showcase now redirects to the immersive tour player (/tours/:id) 
 * instead of using this basic viewer (/showcase/view/:id).
 * 
 * This provides users with the premium tour experience including:
 * - Advanced playback controls
 * - Background audio support
 * - Fullscreen mode
 * - Social sharing features
 * - Professional tour player interface
 * 
 * This file is kept for reference but the route now redirects to the new player.
 */

'use client';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DeprecatedShowcaseViewer() {
  const params = useParams();
  const router = useRouter();
  const tourId = params.id as string;

  useEffect(() => {
    // Automatically redirect to the new immersive tour player
    if (tourId) {
      router.replace(`/tours/${tourId}`);
    } else {
      router.replace('/showcase');
    }
  }, [tourId, router]);

  // Show a brief loading message while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-600">
      <div className="text-center text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold mb-2">Redirecting to Enhanced Tour Player...</h2>
        <p className="text-indigo-100">You'll be redirected to the premium tour experience</p>
      </div>
    </div>
  );
}