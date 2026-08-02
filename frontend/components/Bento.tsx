import SectionHeader from "./SectionHeader";

interface BentoCardProps {
  number: string;
  title: string;
  description: string;
  tag?: string;
  tagColor?: string;
  heightClass?: string;
}

function BentoCard({
  number,
  title,
  description,
  tag,
  tagColor = "#FFD600",
  heightClass = "md:h-[300px]",
}: BentoCardProps) {
  return (
    <div
      className={`flex flex-col gap-5 p-8 md:p-[36px] ${heightClass} bg-[#0F0F0F] border border-[#2D2D2D] hover:border-[#FFD600] hover:bg-[#FFD600] transition-all duration-300 w-full md:flex-1 group cursor-pointer shadow-lg rounded-sm`}
    >
      <span className="font-ibm-mono text-[11px] font-bold text-[#FFD600] group-hover:text-[#1A1A1A] tracking-[2px] transition-colors">
        {number}
      </span>
      <h3 className="font-grotesk text-[24px] md:text-[28px] font-bold text-[#F5F5F0] group-hover:text-[#0A0A0A] tracking-[-1px] leading-[1.1] whitespace-pre-line transition-colors">
        {title}
      </h3>
      <p className="font-ibm-mono text-[12px] text-[#888888] group-hover:text-[#1A1A1A] tracking-[1px] leading-[1.6] transition-colors">
        {description}
      </p>
      {tag && (
        <div
          className="flex items-center justify-center h-[28px] px-[12px] bg-[#1A1A1A] group-hover:bg-[#0A0A0A] border transition-colors w-fit"
          style={{ borderColor: tagColor }}
        >
          <span className="font-ibm-mono text-[10px] font-bold tracking-[2px] transition-colors" style={{ color: tagColor }}>
            {tag}
          </span>
        </div>
      )}
    </div>
  );
}

export default function Bento() {
  return (
    <section className="flex flex-col w-full bg-[#0D0D0D] py-16 px-6 md:py-[100px] md:px-[120px] gap-10 md:gap-[48px]">
      <SectionHeader
        label="[05] // WHAT THE SYSTEM DOES"
        title={"THE FULL STACK.\nIN ONE SYSTEM."}
        titleWidth="w-full max-w-[800px]"
      />

      <div className="flex flex-col w-full gap-4 md:gap-6">
        {/* Row 1 */}
        <div className="flex flex-col md:flex-row w-full gap-4 md:gap-6">
          <BentoCard
            number="[01]"
            title={"CODE-DERIVED\nEVIDENCE"}
            description="EVERY FINDING TAGGED: DERIVED-FROM-CODE / INFERRED / ASSUMPTION. NO BLIND GUESSES."
            tag="[FACTS]"
            tagColor="#FFD600"
          />
          <BentoCard
            number="[02]"
            title={"REAL PLAN\nCOMPARISON"}
            description="CURATED CATALOG OF ACTUAL PROVIDERS. REAL PRICING, NOT ESTIMATES."
          />
          <BentoCard
            number="[03]"
            title={"DETERMINISTIC\nRULES LAYER"}
            description="SPEND CEILING, PRICE MATCH, CATEGORY LOCK, TRACEABILITY. PLAIN CODE, NO AI OVERRIDE."
            tag="[SAFE]"
            tagColor="#FF6B35"
          />
        </div>

        {/* Row 2 */}
        <div className="flex flex-col md:flex-row w-full gap-4 md:gap-6">
          <BentoCard
            number="[04]"
            title={"TOKENIZED\nVISA PAYMENT"}
            description="ONE-TIME CARD VIA PRAVA. LOCKED TO EXACT MERCHANT + AMOUNT. EXPIRES IN MINUTES."
            heightClass="md:h-[280px]"
          />
          <BentoCard
            number="[05]"
            title={"APPROVAL OR\nAUTONOMY MODE"}
            description="USER CHOOSES: REVIEW EVERY PURCHASE, OR SET LIMITS AND LET IT RUN."
            tag="[MODE]"
            tagColor="#FF6B35"
            heightClass="md:h-[280px]"
          />
          <BentoCard
            number="[06]"
            title={"FULL RECEIPT\nTRAIL"}
            description="EVERY DOLLAR TRACES BACK TO A LINE OF YOUR OWN CODE."
            heightClass="md:h-[280px]"
          />
        </div>
      </div>
    </section>
  );
}
