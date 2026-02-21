
import React from 'react';
import { ColorData } from '../types';
import { Palette } from 'lucide-react';

interface ColorAnalysisProps {
  colors: ColorData[];
  isLoading: boolean;
}

const ColorAnalysis: React.FC<ColorAnalysisProps> = ({ colors, isLoading }) => {
    if (isLoading) {
    return (
      <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm w-full max-w-xs animate-pulse">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-slate-200 rounded-lg w-8 h-8"></div>
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-slate-200 rounded w-3/4"></div>
          </div>
        </div>
        <div className="h-2 bg-slate-200 rounded-full mb-3"></div>
        <div className="space-y-1.5">
          <div className="h-2 bg-slate-200 rounded w-full"></div>
          <div className="h-2 bg-slate-200 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  if (colors.length === 0) return null;

  return (
    <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm w-full max-w-xs animate-in fade-in duration-500">
      <div className="flex items-center gap-3 mb-3">
        <div className="bg-slate-100 p-1.5 rounded-lg text-slate-600">
          <Palette size={16} />
        </div>
        <div>
          <h3 className="font-bold text-sm text-slate-900">Color Palette</h3>
        </div>
      </div>
      
      <div className="flex w-full h-2 rounded-full overflow-hidden mb-3">
        {colors.map((color, idx) => (
          <div
            key={idx}
            className="h-full"
            style={{ width: `${color.value}%`, backgroundColor: color.fill }}
            title={`${color.name}: ${color.value}%`}
          />
        ))}
      </div>

      <div className="space-y-1.5">
        {colors.slice(0, 4).map((color, idx) => (
          <div key={idx} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border border-slate-200" style={{ backgroundColor: color.fill }} />
              <span className="font-medium text-slate-700">{color.name}</span>
            </div>
            <span className="font-mono text-slate-500">{color.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ColorAnalysis;
