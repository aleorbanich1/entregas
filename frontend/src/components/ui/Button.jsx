import React from 'react';
import { cn } from '../../utils/cn';

export function Button({ className, variant = 'primary', size = 'default', children, ...props }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-medium transition-all duration-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/20 disabled:pointer-events-none disabled:opacity-50",
        {
          'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 shadow-sm': variant === 'primary',
          'bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700': variant === 'secondary',
          'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 shadow-sm': variant === 'danger',
          'bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800': variant === 'ghost',
          'min-h-[52px] px-6 text-base': size === 'default',
          'min-h-[44px] px-4 text-sm rounded-lg': size === 'sm',
          'min-h-[60px] px-8 text-lg rounded-2xl': size === 'lg',
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
