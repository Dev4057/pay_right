import React from 'react';
import { Code, User } from 'lucide-react';

export type ConfidenceTag = 'derived' | 'derived-from-code' | 'inferred' | 'user-provided' | 'assumption';

interface ConfidenceBadgeProps {
  tag: ConfidenceTag;
}

export default function ConfidenceBadge({ tag }: ConfidenceBadgeProps) {
  switch (tag) {
    case 'derived':
    case 'derived-from-code':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium font-mono bg-[#22c55e] text-[#0A0A0A] border border-[#22c55e] uppercase tracking-wider shrink-0">
          <Code size={11} className="stroke-[3px]" />
          Derived from code
        </span>
      );
    case 'inferred':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium font-mono border border-[#f59e0b] text-[#f59e0b] bg-[#f59e0b]/5 uppercase tracking-wider shrink-0">
          Inferred
        </span>
      );
    case 'user-provided':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium font-mono border border-[#3b82f6] text-[#3b82f6] bg-[#3b82f6]/5 uppercase tracking-wider shrink-0">
          <User size={11} className="stroke-[2.5px]" />
          User provided
        </span>
      );
    case 'assumption':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium font-mono border border-dashed border-[#9ca3af] text-[#9ca3af] bg-[#9ca3af]/5 uppercase tracking-wider shrink-0">
          Assumption
        </span>
      );
    default:
      return null;
  }
}
