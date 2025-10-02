"use client";

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
}

interface CardDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

// Define the Card component with composite type
type CardComponent = React.FC<CardProps> & {
  Header: React.FC<CardHeaderProps>;
  Title: React.FC<CardTitleProps>;
  Description: React.FC<CardDescriptionProps>;
  Content: React.FC<CardContentProps>;
  Footer: React.FC<CardFooterProps>;
};

// Create base Card component
export const Card: React.FC<CardProps> = ({ 
  children, 
  className = ''
}) => {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
};

export const CardHeader: React.FC<CardHeaderProps> = ({ 
  children, 
  className = ''
}) => {
  return (
    <div className={`px-6 py-4 border-b border-gray-200 ${className}`}>
      {children}
    </div>
  );
};

export const CardTitle: React.FC<CardTitleProps> = ({ 
  children, 
  className = ''
}) => {
  return (
    <h3 className={`text-lg font-medium ${className}`}>
      {children}
    </h3>
  );
};

export const CardDescription: React.FC<CardDescriptionProps> = ({ 
  children, 
  className = ''
}) => {
  return (
    <p className={`mt-1 text-sm text-gray-600 ${className}`}>
      {children}
    </p>
  );
};

export const CardContent: React.FC<CardContentProps> = ({ 
  children, 
  className = ''
}) => {
  return (
    <div className={`px-6 py-4 ${className}`}>
      {children}
    </div>
  );
};

export const CardFooter: React.FC<CardFooterProps> = ({ 
  children, 
  className = ''
}) => {
  return (
    <div className={`px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-lg ${className}`}>
      {children}
    </div>
  );
};

// Create compound component by assigning subcomponents
const CardWithSubcomponents = Object.assign(Card, {
  Header: CardHeader,
  Title: CardTitle,
  Description: CardDescription,
  Content: CardContent,
  Footer: CardFooter,
}) as CardComponent;

export default CardWithSubcomponents;
