import { initials } from '@/lib/utils';

export function Avatar({ name, size = 30 }: { name?: string; size?: number }) {
  return (
    <div
      className="rounded-full bg-brand-blue text-white flex items-center justify-center font-medium flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(name)}
    </div>
  );
}
