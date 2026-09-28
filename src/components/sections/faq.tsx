import Link from "next/link";
import { Plus } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import type { FaqEntry } from "@/data/faq";

// Native <details> disclosure: keyboard and screen-reader support for free, no
// client JS, and every answer stays in the server-rendered HTML for crawlers.
// The homepage emits the same list as FAQPage JSON-LD, so the visible text and
// the structured data cannot disagree.
export function Faq({ faqs }: { faqs: readonly FaqEntry[] }) {
  return (
    <section id="faq" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading number="12" title="FAQ" color="var(--color-accent-green)" />

        <div className="max-w-3xl border-t border-(--border)">
          {faqs.map((faq) => (
            <details key={faq.question} className="group border-b border-(--border)">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 [&::-webkit-details-marker]:hidden">
                <h3 className="font-display text-lg font-bold tracking-tight">{faq.question}</h3>
                <Plus
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 text-(--muted) transition-transform group-open:rotate-45"
                />
              </summary>
              <p className="pb-6 text-base leading-relaxed text-(--muted)">{faq.answer}</p>
            </details>
          ))}
        </div>

        <p className="mt-8 text-sm text-(--muted)">
          Something else?{" "}
          <Link href="/ai" className="font-semibold text-accent-green hover:underline">
            Ask Amin AI
          </Link>
        </p>
      </div>
    </section>
  );
}
