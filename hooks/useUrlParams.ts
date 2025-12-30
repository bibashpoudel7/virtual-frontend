'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export function useUrlParams() {
  const searchParams = useSearchParams();
  const [overlayId, setOverlayId] = useState<string | null>(null);
  const [sceneId, setSceneId] = useState<string | null>(null);

  useEffect(() => {
    const overlay = searchParams.get('overlay');
    const scene = searchParams.get('scene');
    
    setOverlayId(overlay);
    setSceneId(scene);
  }, [searchParams]);

  return { overlayId, sceneId };
}