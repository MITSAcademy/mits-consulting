import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({
  children,
  className,
  title,
  description,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 bg-black/70 z-[100]" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-[101] -translate-x-1/2 -translate-y-1/2 w-[92%] max-w-[620px] max-h-[88vh] overflow-y-auto rounded-xl border border-brand-border bg-bg-card p-6',
          className,
        )}
      >
        {title && <h3 className="text-base font-semibold mb-1">{title}</h3>}
        {description && <p className="text-sm text-brand-textSecondary mb-4">{description}</p>}
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 rounded p-1 hover:bg-bg-cardHover">
          <X size={16} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-brand-borderSoft flex-wrap">
      {children}
    </div>
  );
}
