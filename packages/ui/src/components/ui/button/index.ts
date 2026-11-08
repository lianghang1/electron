import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Button } from './Button.vue'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors select-none disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default: 'rounded-md bg-primary text-primary-foreground hover:opacity-90',
        secondary: 'rounded-md bg-secondary text-secondary-foreground hover:bg-accent',
        outline: 'rounded-md border border-border text-foreground hover:bg-hover',
        ghost: 'rounded-md text-muted-foreground hover:bg-hover hover:text-foreground',
        destructive: 'rounded-md bg-destructive text-destructive-foreground hover:opacity-90',
        link: 'text-primary underline-offset-4 hover:underline',
        soft: 'rounded-md bg-accent text-accent-foreground hover:opacity-80',
      },
      size: {
        'xs': 'h-6 px-2 text-ui-xs',
        'sm': 'h-7 px-2.5 text-ui-sm',
        'default': 'h-9 px-4 text-ui-base',
        'lg': 'h-10 px-5 text-ui-lg',
        'icon': 'size-9',
        'icon-sm': 'size-7',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
