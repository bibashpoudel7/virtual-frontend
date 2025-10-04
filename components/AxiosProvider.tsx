'use client';

import { useEffect } from 'react';
import { configureAxios } from '@/utils/axios-config';

export default function AxiosProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    configureAxios();
  }, []);

  return <>{children}</>;
}