import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'danger-solid';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  active?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', icon: Icon, iconRight: IconRight, active, className, children, type = 'button', ...rest },
  ref,
) {
  const cls = [
    'btn',
    variant === 'primary' && 'primary',
    variant === 'ghost' && 'ghost',
    variant === 'danger' && 'danger',
    variant === 'danger-solid' && 'danger solid',
    size === 'sm' && 'sm',
    size === 'lg' && 'lg',
    active && 'active',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} type={type} className={cls} {...rest}>
      {Icon && <Icon />}
      {children}
      {IconRight && <IconRight />}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'iconRight'> {
  icon: LucideIcon;
  /** tooltip + accessible label */
  label: string;
  tip?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, variant = 'ghost', size = 'md', className, tip = false, ...rest },
  ref,
) {
  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={['icon', className].filter(Boolean).join(' ')}
      aria-label={label}
      title={tip ? undefined : label}
      data-tip={tip ? label : undefined}
      {...rest}
    >
      <Icon />
    </Button>
  );
});
