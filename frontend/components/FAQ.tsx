"use client";

import { useState } from "react";
import SectionHeader from "./SectionHeader";

const faqs = [
  {
    question: "WHAT HAPPENS IF THE AGENT OVERSPENDS?",
    answer:
      "IT CAN'T. THE RULES LAYER IS DETERMINISTIC CODE THAT ENFORCES THE SPEND CEILING YOU SET. IF A PLAN EXCEEDS THE BUDGET, THE PROCESS HALTS IMMEDIATELY.",
    defaultOpen: true,
  },
  { question: "HOW DOES PRAVA BUY THE INFRASTRUCTURE?", answer: "PRAVA GENERATES A ONE-TIME TOKENIZED VISA CARD LOCKED TO THE SPECIFIC MERCHANT AND EXACT AMOUNT OF THE APPROVED PROPOSAL." },
  { question: "DOES THE AI HAVE ACCESS TO MY CREDIT CARD?", answer: "NO. YOUR REAL CARD DETAILS ARE STORED SECURELY IN PRAVA. THE AGENT ONLY RECEIVES A DYNAMIC TOKEN FOR A SINGLE TRANSACTION." },
  { question: "HOW DOES IT KNOW WHAT MY CODE NEEDS?", answer: "THE ANALYZER AGENT READS YOUR DEPENDENCIES, CONFIGURATIONS, AND ARCHITECTURE PATTERNS TO DERIVE EXACT REQUIREMENTS LIKE DATABASES, QUEUES, AND COMPUTE." },
  { question: "CAN I REVIEW THE DECISION BEFORE PURCHASE?", answer: "YES. IN APPROVAL MODE, YOU GET A FULL PROPOSAL EXPLAINING THE REASONING BEHIND THE CHOSEN PLAN BEFORE ANY MONEY IS SPENT." },
  { question: "DOES IT DEPLOY MY APP TOO?", answer: "YES. AFTER THE PURCHASE, A DEPLOYER AGENT PLANS THE DEPLOYMENT FROM THE SAME EVIDENCE, PUTS YOUR APP LIVE, AND EMAILS YOU THE RECEIPT WITH A STEP-BY-STEP DEPLOYMENT GUIDE." },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
      <section id="faq" className="flex flex-col w-full bg-[#060606] py-16 px-6 md:py-[100px] md:px-[120px]">
      <div className="w-full max-w-[480px]">
        <SectionHeader
          label="[08] // FAQ"
          title={"GOT\nQUESTIONS?"}
          subtitle="EVERYTHING YOU NEED TO KNOW BEFORE YOUR AGENT SPENDS A RUPEE."
          titleWidth="w-full"
          subtitleWidth="w-full"
        />
      </div>

      <div className="h-10 md:h-[64px]" />

      {/* FAQ items */}
      <div className="flex flex-col w-full">
        {faqs.map((faq, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={i} className="flex flex-col w-full border-t border-t-[#1D1D1D]">
              <button
                className="flex items-center justify-between w-full py-5 md:h-[72px] text-left gap-4"
                onClick={() => setOpenIndex(isOpen ? -1 : i)}
              >
                <span className="font-grotesk text-[14px] md:text-[16px] font-bold text-[#F5F5F0] tracking-[1px]">
                  {faq.question}
                </span>
                <div
                  className="flex items-center justify-center w-[32px] h-[32px] shrink-0"
                  style={{ backgroundColor: isOpen ? "#FFD600" : "#1A1A1A", border: isOpen ? "none" : "1px solid #3D3D3D" }}
                >
                  <span
                    className="font-ibm-mono text-[14px] font-bold"
                    style={{ color: isOpen ? "#0A0A0A" : "#888888" }}
                  >
                    {isOpen ? "—" : "+"}
                  </span>
                </div>
              </button>
              {isOpen && faq.answer && (
                <div className="pb-8">
                  <p className="font-ibm-mono text-[12px] md:text-[13px] text-[#888888] tracking-[1px] leading-[1.6]">
                    {faq.answer}
                  </p>
                </div>
              )}
            </div>
          );
        })}
        <div className="border-t border-t-[#1D1D1D]" />
      </div>

      {/* CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-[16px] pt-10 md:pt-[48px]">
        <span className="font-ibm-mono text-[13px] text-[#555555] tracking-[1px]">
          STILL HAVE QUESTIONS?
        </span>
        <a
          href="https://github.com/Dev4057/pay_right"
          target="_blank"
          rel="noopener noreferrer"
          className="font-ibm-mono text-[13px] font-bold text-[#FFD600] tracking-[1px] cursor-pointer hover:underline"
        >
          TALK TO A HUMAN &gt;
        </a>
      </div>
    </section>
  );
}
