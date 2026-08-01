import SectionHeader from "./SectionHeader";

export default function Showcase() {
  return (
    <section id="showcase" className="flex flex-col w-full bg-[#080808] py-16 md:py-[100px] px-6 md:px-[120px] gap-12 md:gap-[64px]">
      <SectionHeader
        label="[07] // TESTED ON"
        title={"BUILT. TESTED. TRACED.\nREAL REPOS. REAL REPORTS. REAL PURCHASES."}
        titleWidth="w-full max-w-[1000px]"
      />

      <div className="flex flex-col gap-6 md:gap-[16px] w-full max-w-[800px]">
        <div className="p-6 border-l-4 border-[#FFD600] bg-[#111111]">
          <h4 className="font-grotesk text-[18px] font-bold text-[#F5F5F0] tracking-[1px] mb-2">[repo 1 name]</h4>
          <p className="font-ibm-mono text-[12px] text-[#888888] tracking-[1px] leading-[1.6]">Needed: [what it needed] // Purchased: [plan chosen]</p>
        </div>
        
        <div className="p-6 border-l-4 border-[#FF6B35] bg-[#111111]">
          <h4 className="font-grotesk text-[18px] font-bold text-[#F5F5F0] tracking-[1px] mb-2">[repo 2 name]</h4>
          <p className="font-ibm-mono text-[12px] text-[#888888] tracking-[1px] leading-[1.6]">Needed: [what it needed] // Purchased: [plan chosen]</p>
        </div>
      </div>
    </section>
  );
}

