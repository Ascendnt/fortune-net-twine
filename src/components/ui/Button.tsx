import React from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-pine-700 text-white hover:bg-pine-600 active:bg-pine-800 shadow-sm disabled:bg-paper-300",
  secondary:
    "bg-white text-paper-800 border border-paper-300 hover:bg-paper-50 active:bg-paper-100 disabled:text-paper-400",
  ghost: "text-paper-700 hover:bg-paper-100 active:bg-paper-200 disabled:text-paper-400",
  danger: "bg-alert-600 text-white hover:bg-alert-700 shadow-sm disabled:bg-paper-300",
  success: "bg-pine-600 text-white hover:bg-pine-700 shadow-sm disabled:bg-paper-300",
};

const sizeClasses: Record<Size, string> = {
  sm: "text-xs px-2.5 py-1.5 gap-1.5 rounded-md",
  md: "text-sm px-3.5 py-2 gap-2 rounded-lg",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center font-medium transition-colors disabled:cursor-not-allowed",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-manifest-600",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
