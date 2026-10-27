'use client';

import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

interface TourSkeletonProps {
  count?: number;
}

export default function TourSkeleton({ count = 6 }: TourSkeletonProps) {
  return (
    <SkeletonTheme baseColor="#f3f4f6" highlightColor="#e5e7eb">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
        {[...Array(count)].map((_, index) => (
          <div
            key={index}
            className="bg-white border border-gray-200 rounded-xl flex flex-col h-full"
            style={{
              animationDelay: `${index * 50}ms`, // Stagger animation for smoother effect
            }}
          >
            {/* Header Section Skeleton */}
            <div className="p-5 pb-4">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0 pr-4">
                  <Skeleton height={24} width="75%" className="mb-2" />
                  <Skeleton height={16} width="50%" />
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Skeleton height={24} width={64} borderRadius={12} />
                  <div className="flex gap-1">
                    <Skeleton height={28} width={28} borderRadius={4} />
                    <Skeleton height={28} width={28} borderRadius={4} />
                  </div>
                </div>
              </div>
            </div>

            {/* Content Section Skeleton */}
            <div className="px-5 pb-4 flex-1">
              <div className="space-y-3">
                {/* Scenes count skeleton */}
                <div className="flex items-center">
                  <Skeleton height={20} width={20} className="mr-2 flex-shrink-0" />
                  <Skeleton height={16} width={80} />
                </div>

                {/* Tour type skeleton */}
                <div className="flex items-center">
                  <Skeleton height={20} width={20} className="mr-2 flex-shrink-0" />
                  <Skeleton height={16} width={96} />
                </div>

                {/* Features skeleton */}
                <div className="space-y-2 min-h-[4rem]">
                  <div className="flex items-center">
                    <Skeleton height={20} width={20} className="mr-2 flex-shrink-0" />
                    <Skeleton height={16} width={128} />
                  </div>
                  <div className="flex items-center">
                    <Skeleton height={20} width={20} className="mr-2 flex-shrink-0" />
                    <Skeleton height={16} width={112} />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Section Skeleton */}
            <div className="px-5 pb-5 pt-3 border-t border-gray-100 mt-auto">
              <div className="flex items-center justify-between">
                <Skeleton height={16} width={128} />
                <Skeleton height={16} width={48} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </SkeletonTheme>
  );
}