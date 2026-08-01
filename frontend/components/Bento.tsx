import SectionHeader from "./SectionHeader";

export default function Bento() {
  return (
    <section className="flex flex-col w-full bg-[#0D0D0D] py-16 px-6 md:py-[100px] md:px-[120px] gap-10 md:gap-[48px]">
      <SectionHeader
        label="[05] // WHAT THE SYSTEM DOES"
        title={"THE FULL STACK.\nIN ONE SYSTEM."}
        titleWidth="w-full max-w-[800px]"
      />

      <div className="flex flex-col w-full gap-[2px]">
        {/* Row 1 */}
        <div className="flex flex-col md:flex-row w-full gap-[2px]">
          {/* Bento A — Yellow */}
          <div className="flex flex-col gap-5 p-8 md:p-[40px] md:h-[320px] bg-[#FFD600] w-full md:flex-1">
            <span className="font-ibm-mono text-[11px] font-bold text-[#1A1A1A] tracking-[2px]">[01]</span>
            <h3 className="font-grotesk text-[24px] md:text-[28px] font-bold text-[#0A0A0A] tracking-[-1px] leading-[1.1] whitespace-pre-line">
              {"CODE-DERIVED\nEVIDENCE"}
            </h3>
            <p className="font-ibm-mono text-[12px] text-[#1A1A1A] tracking-[1px] leading-[1.6]">
              EVERY FINDING TAGGED: DERIVED-FROM-CODE / INFERRED / ASSUMPTION. NO BLIND GUESSES.
            </p>
            <div className="flex items-center justify-center h-[28px] px-[12px] bg-[#0A0A0A] w-fit">
              <span className="font-ibm-mono text-[10px] font-bold text-[#FFD600] tracking-[2px]">[FACTS]</span>
            </div>
          </div>

          {/* Bento B */}
          <div className="flex flex-col gap-5 p-8 md:p-[40px] md:h-[320px] bg-[#111111] border border-[#2D2D2D] w-full md:flex-1">
            <span className="font-ibm-mono text-[11px] font-bold text-[#FFD600] tracking-[2px]">[02]</span>
            <h3 className="font-grotesk text-[24px] md:text-[28px] font-bold text-[#F5F5F0] tracking-[-1px] leading-[1.1] whitespace-pre-line">
              {"REAL PLAN\nCOMPARISON"}
            </h3>
            <p className="font-ibm-mono text-[12px] text-[#666666] tracking-[1px] leading-[1.6]">
              CURATED CATALOG OF ACTUAL PROVIDERS. REAL PRICING, NOT ESTIMATES.
            </p>
          </div>

          {/* Bento C */}
          <div className="flex flex-col gap-5 p-8 md:p-[40px] md:h-[320px] bg-[#0A0A0A] border border-[#2D2D2D] w-full md:flex-1">
            <span className="font-ibm-mono text-[11px] font-bold text-[#FFD600] tracking-[2px]">[03]</span>
            <h3 className="font-grotesk text-[24px] md:text-[28px] font-bold text-[#F5F5F0] tracking-[-1px] leading-[1.1] whitespace-pre-line">
              {"DETERMINISTIC\nRULES LAYER"}
            </h3>
            <p className="font-ibm-mono text-[12px] text-[#666666] tracking-[1px] leading-[1.6]">
              SPEND CEILING, PRICE MATCH, CATEGORY LOCK, TRACEABILITY. PLAIN CODE, NO AI OVERRIDE.
            </p>
            <div className="flex items-center justify-center h-[28px] px-[12px] bg-[#1A1A1A] border border-[#FF6B35] w-fit">
              <span className="font-ibm-mono text-[10px] font-bold text-[#FF6B35] tracking-[2px]">[SAFE]</span>
            </div>
          </div>
        </div>

        {/* Row 2 */}
        <div className="flex flex-col md:flex-row w-full gap-[2px]">
          {/* Bento D */}
          <div className="flex flex-col gap-5 p-8 md:p-[40px] md:h-[260px] bg-[#111111] border border-[#2D2D2D] w-full md:flex-1">
            <span className="font-ibm-mono text-[11px] font-bold text-[#FFD600] tracking-[2px]">[04]</span>
            <h3 className="font-grotesk text-[24px] md:text-[28px] font-bold text-[#F5F5F0] tracking-[-1px] leading-[1.1] whitespace-pre-line">
              {"TOKENIZED\nVISA PAYMENT"}
            </h3>
            <p className="font-ibm-mono text-[12px] text-[#666666] tracking-[1px] leading-[1.6]">
              ONE-TIME CARD VIA PRAVA. LOCKED TO EXACT MERCHANT + AMOUNT. EXPIRES IN MINUTES.
            </p>
          </div>

          {/* Bento E */}
          <div className="flex flex-col gap-5 p-8 md:p-[40px] md:h-[260px] bg-[#0F0F0F] border-2 border-[#FF6B35] w-full md:flex-1">
            <span className="font-ibm-mono text-[11px] font-bold text-[#FF6B35] tracking-[2px]">[05]</span>
            <h3 className="font-grotesk text-[24px] md:text-[28px] font-bold text-[#F5F5F0] tracking-[-1px] leading-[1.1] whitespace-pre-line">
              {"APPROVAL OR\nAUTONOMY MODE"}
            </h3>
            <p className="font-ibm-mono text-[12px] text-[#666666] tracking-[1px] leading-[1.6]">
              USER CHOOSES: REVIEW EVERY PURCHASE, OR SET LIMITS AND LET IT RUN.
            </p>
            <div className="flex items-center justify-center h-[28px] px-[12px] bg-[#1A1A1A] border border-[#FF6B35] w-fit">
              <span className="font-ibm-mono text-[10px] font-bold text-[#FF6B35] tracking-[2px]">[MODE]</span>
            </div>
          </div>

          {/* Bento F */}
          <div className="flex flex-col gap-5 p-8 md:p-[40px] md:h-[260px] bg-[#0A0A0A] border border-[#2D2D2D] w-full md:flex-1">
            <span className="font-ibm-mono text-[11px] font-bold text-[#FFD600] tracking-[2px]">[06]</span>
            <h3 className="font-grotesk text-[24px] md:text-[28px] font-bold text-[#F5F5F0] tracking-[-1px] leading-[1.1] whitespace-pre-line">
              {"FULL RECEIPT\nTRAIL"}
            </h3>
            <p className="font-ibm-mono text-[12px] text-[#666666] tracking-[1px] leading-[1.6]">
              EVERY DOLLAR TRACES BACK TO A LINE OF YOUR OWN CODE.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

