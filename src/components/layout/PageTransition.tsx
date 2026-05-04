import { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

const PageTransition = ({ children }: PageTransitionProps) => {
  return (
    <div className="animate-page-in">
      {children}
    </div>
  );
};

export default PageTransition;
