'use client';

import { Check, ImagePlus, MousePointerClick, Pencil } from 'lucide-react';

const STEPS = [
  { label: 'Name your tour', icon: Pencil },
  { label: 'Add 360° photos', icon: ImagePlus },
  { label: 'Add hotspots & publish', icon: MousePointerClick },
];

interface TourStepsProps {
  /** 0-based index of the step the user is on */
  current: number;
  className?: string;
}

// Progress indicator for the tour creation flow. On phones only the current step's label is shown.
export default function TourSteps({ current, className = '' }: TourStepsProps) {
  return (
    <ol className={`flex items-center gap-2 ${className}`}>
      {STEPS.map((step, index) => {
        const isDone = index < current;
        const isCurrent = index === current;
        const StepIcon = isDone ? Check : step.icon;
        return (
          <li
            key={step.label}
            aria-current={isCurrent ? 'step' : undefined}
            className={`flex items-center gap-2 min-w-0 ${isCurrent ? 'flex-1' : 'sm:flex-1'}`}
          >
            <span
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                isCurrent ? 'bg-blue-600 text-white' : isDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              <StepIcon className="w-4 h-4" />
            </span>
            <span className={`text-sm ${isCurrent ? 'font-semibold text-gray-900' : 'hidden sm:inline text-gray-500'}`}>
              <span className="sm:hidden">Step {index + 1} of {STEPS.length}: </span>
              {step.label}
            </span>
            {index < STEPS.length - 1 && <span className="hidden sm:block flex-1 h-px bg-gray-200" />}
          </li>
        );
      })}
    </ol>
  );
}
