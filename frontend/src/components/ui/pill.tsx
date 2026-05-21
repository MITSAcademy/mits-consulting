import * as React from 'react';
import { cn } from '@/lib/utils';

export function Pill({
  children,
  color = 'grey',
  className,
}: {
  children: React.ReactNode;
  color?: 'grey' | 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'pink' | 'teal';
  className?: string;
}) {
  return <span className={cn('pill', `pill-${color}`, className)}>{children}</span>;
}
