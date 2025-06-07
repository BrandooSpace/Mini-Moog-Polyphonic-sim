
import React from 'react';
import { MINIMOOG_PANEL_BG, MINIMOOG_GROUP_BORDER } from '../constants';

interface SectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

const Section: React.FC<SectionProps> = ({ title, children, className = '' }) => {
  return (
    <div className={`p-3 rounded-md shadow-lg ${MINIMOOG_PANEL_BG} border ${MINIMOOG_GROUP_BORDER} ${className}`}>
      <h3 className="text-sm font-semibold text-amber-300 mb-3 uppercase tracking-wider border-b border-slate-600 pb-1">{title}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6">
        {children}
      </div>
    </div>
  );
};

export default Section;
