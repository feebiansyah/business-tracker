import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 disabled:pointer-events-none disabled:opacity-50", { variants: { variant: { default: "bg-blue-600 text-white shadow-sm hover:bg-blue-700", ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-950" }, size: { default: "h-9 px-4 py-2", icon: "size-9" } }, defaultVariants: { variant: "default", size: "default" } });
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean; }
function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) { const Comp = asChild ? Slot : "button"; return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />; }
export { Button, buttonVariants };
