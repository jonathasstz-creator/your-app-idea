import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

const styles: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white px-4 py-2 rounded',
  secondary: 'bg-slate-800 text-white px-4 py-2 rounded',
  ghost: 'bg-transparent text-indigo-500 underline',
};

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', className = '', children, ...rest }) => (
  <button className={`${styles[variant]} ${className}`} {...rest}>
    {children}
  </button>
);
