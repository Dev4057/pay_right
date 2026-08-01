import SectionHeader from "./SectionHeader";

export default function Testimonials() {
  return (
    <section className="flex flex-col w-full bg-[#0A0A0A] py-16 px-6 md:py-[100px] md:px-[120px] gap-12 md:gap-[64px]">
      <SectionHeader
        label="[04] // THE PROBLEM WE SOLVE"
        title={"NOBODY BUYS INFRA\nBEFORE THEY NEED IT."}
      />

      <div className="flex flex-col gap-6 md:gap-[32px] w-full max-w-[800px]">
        <p className="font-ibm-mono text-[14px] md:text-[16px] text-[#CCCCCC] tracking-[1px] leading-[1.8]">
          TEAMS GUESS AT CAPACITY BEFORE LAUNCH — NO TRAFFIC DATA EXISTS YET.
        </p>
        
        <div className="flex flex-col md:flex-row gap-4 md:gap-[16px]">
          <div className="flex-1 p-6 border-l-4 border-[#FF6B35] bg-[#111111]">
            <h4 className="font-grotesk text-[18px] font-bold text-[#FF6B35] tracking-[1px] mb-2">GUESS TOO SMALL:</h4>
            <p className="font-ibm-mono text-[12px] text-[#888888] tracking-[1px] leading-[1.6]">APP BREAKS.</p>
          </div>
          <div className="flex-1 p-6 border-l-4 border-[#FFD600] bg-[#111111]">
            <h4 className="font-grotesk text-[18px] font-bold text-[#FFD600] tracking-[1px] mb-2">GUESS TOO BIG:</h4>
            <p className="font-ibm-mono text-[12px] text-[#888888] tracking-[1px] leading-[1.6]">MONEY WASTED EVERY MONTH.</p>
          </div>
        </div>

        <p className="font-ibm-mono text-[16px] md:text-[20px] font-bold text-[#F5F5F0] tracking-[1px] leading-[1.6] mt-4">
          WE READ THE CODE INSTEAD OF GUESSING.
        </p>
      </div>
    </section>
  );
}

