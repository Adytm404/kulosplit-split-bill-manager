
import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

const Spinner: React.FC<SpinnerProps> = ({ size = 'md', message }) => {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-2">
      <div
        className={`${sizeClasses[size]} animate-spin rounded-full border-4 border-sky-500 border-t-transparent dark:border-sky-400 dark:border-t-transparent`}
      ></div>
      {message && <p className="text-sm text-slate-600 dark:text-slate-400">{message}</p>}
    </div>
  );
};

export default Spinner;
    