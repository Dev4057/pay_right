import SectionHeader from "./SectionHeader";

export default function Showcase() {
  const items = [
    {
      title: "SOLO FOUNDER",
      desc: "Shipping first product, no time to research 15 hosting plans",
      accent: "border-[#FFD600]",
      tag: "01 // FOUNDERS",
    },
    {
      title: "SMALL TEAM",
      desc: "Pre-seed, avoiding both downtime and wasted spend",
      accent: "border-[#FF6B35]",
      tag: "02 // TEAMS",
    },
    {
      title: "AGENT BUILDERS",
      desc: "Want their AI agents to safely handle real purchases",
      accent: "border-[#00E5FF]",
      tag: "03 // AGENTS",
    },
  ];

  return (
    <section id="showcase" className="flex flex-col w-full bg-[#080808] py-16 md:py-[100px] px-6 md:px-[120px] gap-12 md:gap-[64px]">
      <SectionHeader
        label="[07] // WHO IT'S FOR"
        title={"BUILT FOR FOUNDERS,\nTEAMS & AI AGENTS."}
        titleWidth="w-full max-w-[1000px]"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-[24px] w-full max-w-[1200px]">
        {items.map((item) => (
          <div
            key={item.title}
            className={`p-8 border-l-4 ${item.accent} bg-[#111111] flex flex-col justify-between gap-4 transition-all hover:bg-[#161616]`}
          >
            <div>
              <span className="font-ibm-mono text-[10px] text-[#666666] tracking-[2px] block mb-3">
                {item.tag}
              </span>
              <h4 className="font-grotesk text-[22px] font-bold text-[#F5F5F0] tracking-[1px] mb-3">
                {item.title}
              </h4>
              <p className="font-ibm-mono text-[13px] text-[#888888] tracking-[1px] leading-[1.6]">
                {item.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
