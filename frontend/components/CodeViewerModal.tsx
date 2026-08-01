import React from 'react';
import { X, FileCode } from 'lucide-react';

interface CodeViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  codeSnippet: string;
  highlightLines?: number[];
}

export default function CodeViewerModal({
  isOpen,
  onClose,
  fileName,
  codeSnippet,
  highlightLines = []
}: CodeViewerModalProps) {
  if (!isOpen) return null;

  const lines = codeSnippet.split('\n');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0A0A]/80 backdrop-blur-sm">
      {/* Modal Container */}
      <div 
        className="w-full max-w-2xl bg-[#0F0F0F] border border-[#2D2D2D] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2D2D2D] bg-[#141414]">
          <div className="flex items-center gap-2">
            <FileCode size={16} className="text-[#FFD600]" />
            <span className="font-mono text-xs text-[#F5F5F0] tracking-wider">{fileName}</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded text-[#888888] hover:text-[#F5F5F0] hover:bg-[#2D2D2D] transition-colors"
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        {/* Code Content */}
        <div className="flex-1 overflow-auto p-4 bg-[#0A0A0A] font-mono text-xs md:text-sm leading-relaxed">
          <pre className="grid grid-cols-[auto_1fr] gap-4">
            {/* Line Numbers */}
            <div className="text-right text-[#555555] select-none text-[11px] pt-0.5">
              {lines.map((_, i) => (
                <div key={i} className="h-6 leading-6">
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Code Lines */}
            <div className="overflow-x-auto text-[#F5F5F0] text-[11px] pt-0.5">
              {lines.map((line, i) => {
                const isHighlighted = highlightLines.includes(i + 1);
                return (
                  <div 
                    key={i} 
                    className={`h-6 leading-6 px-2 -mx-2 rounded transition-colors ${
                      isHighlighted 
                        ? 'bg-[#FFD600]/10 border-l-2 border-[#FFD600] text-[#FFD600] font-medium' 
                        : 'border-l-2 border-transparent'
                    }`}
                  >
                    {line || ' '}
                  </div>
                );
              })}
            </div>
          </pre>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#2D2D2D] bg-[#141414] flex justify-end">
          <button
            onClick={onClose}
            className="font-ibm-mono text-[10px] tracking-wider text-[#0A0A0A] bg-[#FFD600] hover:bg-[#F5F5F0] px-4 py-2 font-bold transition-colors"
          >
            CLOSE VIEWER
          </button>
        </div>
      </div>
    </div>
  );
}
