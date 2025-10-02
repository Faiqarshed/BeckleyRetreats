"use client";

import React from 'react';
import Link from 'next/link';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  isLoading?: boolean;
  icon?: React.ReactNode;
}

interface LinkButtonProps {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

const getVariantClasses = (variant: ButtonVariant): string => {
  switch (variant) {
    case 'primary':
      return 'bg-blue-600 hover:bg-blue-700 text-white';
    case 'secondary':
      return 'bg-gray-100 hover:bg-gray-200 text-gray-800';
    case 'outline':
      return 'bg-transparent hover:bg-gray-50 text-blue-600 border border-blue-600';
    case 'danger':
      return 'bg-red-600 hover:bg-red-700 text-white';
    default:
      return 'bg-blue-600 hover:bg-blue-700 text-white';
  }
};

const getSizeClasses = (size: ButtonSize): string => {
  switch (size) {
    case 'sm':
      return 'text-sm py-1.5 px-3';
    case 'md':
      return 'text-base py-2 px-4';
    case 'lg':
      return 'text-lg py-2.5 px-5';
    default:
      return 'text-base py-2 px-4';
  }
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  isLoading = false,
  icon,
  className = '',
  ...props
}) => {
  const variantClasses = getVariantClasses(variant);
  const sizeClasses = getSizeClasses(size);
  const widthClass = fullWidth ? 'w-full' : '';
  
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ${variantClasses} ${sizeClasses} ${widthClass} ${className}`}
      disabled={isLoading}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {icon && !isLoading && <span className="mr-2">{icon}</span>}
      {children}
    </button>
  );
};

export const LinkButton: React.FC<LinkButtonProps> = ({
  children,
  href,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon,
  className = '',
}) => {
  const variantClasses = getVariantClasses(variant);
  const sizeClasses = getSizeClasses(size);
  const widthClass = fullWidth ? 'w-full' : '';
  
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${variantClasses} ${sizeClasses} ${widthClass} ${className}`}
    >
      {icon && <span className="mr-2">{icon}</span>}
      {children}
    </Link>
  );
};

export default Button;
