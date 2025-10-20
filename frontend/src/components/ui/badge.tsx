import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 backdrop-blur-md",
  {
    variants: {
      variant: {
        default:
          "border-primary/30 bg-primary/20 text-primary hover:bg-primary/30",
        secondary:
          "border-white/10 bg-white/5 text-white hover:bg-white/15",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20",
        outline: "text-foreground border-white/20 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
