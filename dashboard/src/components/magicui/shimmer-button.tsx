import React, { type ComponentPropsWithoutRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface ShimmerButtonProps extends ComponentPropsWithoutRef<"button"> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
  className?: string;
  children?: React.ReactNode;
}

export const ShimmerButton = React.forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  (
    {
      shimmerColor = "#a78bfa",
      shimmerSize = "0.05em",
      shimmerDuration = "3s",
      borderRadius = "0.5rem",
      background = "linear-gradient(135deg, #7c3aed, #6d28d9)",
      className,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        style={
          {
            "--spread": "90deg",
            "--shimmer-color": shimmerColor,
            "--radius": borderRadius,
            "--speed": shimmerDuration,
            "--cut": shimmerSize,
            "--bg": background,
          } as CSSProperties
        }
        className={cn(
          "group relative z-0 flex cursor-pointer items-center justify-center overflow-hidden border border-white/10 px-6 py-2.5 whitespace-nowrap text-white font-medium text-sm",
          "transform-gpu transition-transform duration-300 ease-in-out active:translate-y-px",
          className,
        )}
        style-border-radius="var(--radius)"
        ref={ref}
        {...props}
      >
        {/* Shimmer spark */}
        <div className="absolute inset-0 -z-30 overflow-visible blur-[2px]">
          <div className="absolute inset-0 animate-shimmer-slide">
            <div
              className="absolute -inset-full w-auto rotate-0 animate-spin-around"
              style={{
                background: `conic-gradient(from calc(270deg - (var(--spread) * 0.5)), transparent 0, var(--shimmer-color) var(--spread), transparent var(--spread))`,
              }}
            />
          </div>
        </div>
        {children}
        {/* Highlight */}
        <div
          className={cn(
            "absolute inset-0 size-full",
            "px-4 py-1.5 text-sm font-medium shadow-[inset_0_-8px_10px_#ffffff1f]",
            "transform-gpu transition-all duration-300 ease-in-out",
            "group-hover:shadow-[inset_0_-6px_10px_#ffffff3f]",
            "group-active:shadow-[inset_0_-10px_10px_#ffffff3f]",
          )}
          style={{ borderRadius: "var(--radius)" }}
        />
        {/* Background */}
        <div
          className="absolute -z-20"
          style={{
            inset: "var(--cut)",
            borderRadius: "var(--radius)",
            background: "var(--bg)",
          }}
        />
      </button>
    );
  },
);

ShimmerButton.displayName = "ShimmerButton";
