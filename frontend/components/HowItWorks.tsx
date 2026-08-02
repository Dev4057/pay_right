import SectionHeader from "./SectionHeader";

interface StepCardProps {
  number: string;
  title: string;
  description: string;
}

function StepCard({
  number,
  title,
  description,
}: StepCardProps) {
  return (
    <div
      className="flex flex-col gap-4 p-8 md:p-[40px] border border-[#2D2D2D] hover:border-[#FFD600] bg-[#0A0A0A] hover:bg-[#111111] transition-all duration-300 w-full md:flex-1 md:h-[260px] group cursor-pointer shadow-lg"
    >
      <span className="font-grotesk text-[48px] font-bold text-[#FFD600] tracking-[-2px] group-hover:scale-105 transition-transform origin-left">
        {number}
      </span>
      <h3 className="font-grotesk text-[20px] font-bold text-[#F5F5F0] tracking-[1px] leading-[1.2] whitespace-pre-line">
        {title}
      </h3>
      <p className="font-ibm-mono text-[11px] text-[#888888] group-hover:text-[#D4D4D4] tracking-[1px] leading-[1.5] transition-colors">
        {description}
      </p>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <section id="process" className="flex flex-col w-full bg-[#0D0D0D] py-16 px-6 md:py-[100px] md:px-[120px] gap-12 md:gap-[64px]">
      <SectionHeader
        label="[02] // THE PROCESS"
        title={"THREE STEPS.\nZERO GUESSWORK."}
      />

      <div className="flex flex-col md:flex-row w-full gap-4 md:gap-[16px]">
        <StepCard
          number="01"
          title={"READ\nCODEBASE"}
          description="ANALYZER AGENT EXTRACTS TRUE REQUIREMENTS FROM EVIDENCE IN CODE."
        />
        <StepCard
          number="02"
          title={"COMPARE &\nPROPOSE"}
          description="INFRA AGENT CURATES THE BEST PLAN FROM THE CATALOG BASED ON REPORT."
        />
        <StepCard
          number="03"
          title={"APPROVE &\nEXECUTE"}
          description="RULES LAYER VALIDATES. PRAVA TOKENIZED VISA COMPLETES THE PURCHASE."
        />
      </div>
    </section>
  );
}
