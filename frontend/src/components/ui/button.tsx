import * as React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'success' | 'amber' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'btn',
          variant === 'primary' && 'btn-primary',
          variant === 'success' && 'btn-success',
          variant === 'amber' && 'btn-amber',
          variant === 'danger' && 'btn-danger',
          variant === 'ghost' && 'bg-transparent border-transparent hover:bg-bg-cardHover',
          size === 'sm' && 'btn-sm',
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
