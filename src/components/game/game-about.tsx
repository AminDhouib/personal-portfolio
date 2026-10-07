import { Fragment } from "react";
import Link from "next/link";
import type { GameContent } from "@/app/games/content/types";

// Server-rendered: the game itself is client-only (ssr: false), so this block
// is what a crawler or an answer engine reads on a game page. The FAQ text is
// also emitted as FAQPage JSON-LD and must stay identical to what renders here.

const H3 = "mt-10 font-display text-lg font-bold tracking-tight";
const BODY = "text-(--foreground)/85";

export function GameAbout({ title, content }: { title: string; content: GameContent }) {
  return (
    <section
      data-game-about
      aria-labelledby="about-game"
      className="mt-16 max-w-3xl leading-relaxed"
    >
      <h2 id="about-game" className="font-display text-2xl font-black tracking-tight">
        About {title}
      </h2>
      <p className={`mt-4 ${BODY}`}>{content.intro}</p>

      <h3 className={H3}>How to play</h3>
      <ol className={`mt-3 list-decimal space-y-1.5 pl-5 ${BODY}`}>
        {content.howToPlay.map((step, i) => (
          <li key={`${i}:${step}`}>{step}</li>
        ))}
      </ol>

      <h3 className={H3}>Controls</h3>
      <dl className="mt-3 grid grid-cols-[minmax(0,auto)_1fr] gap-x-6 gap-y-2 text-sm">
        {content.controls.map((control, i) => (
          <Fragment key={`${i}:${control.input}:${control.action}`}>
            <dt className="font-semibold">{control.input}</dt>
            <dd className={BODY}>{control.action}</dd>
          </Fragment>
        ))}
      </dl>

      <h3 className={H3}>Tips and strategy</h3>
      <ul className={`mt-3 list-disc space-y-1.5 pl-5 ${BODY}`}>
        {content.strategy.map((tip, i) => (
          <li key={`${i}:${tip}`}>{tip}</li>
        ))}
      </ul>

      <h3 className={H3}>Quick facts</h3>
      <dl className="mt-3 grid grid-cols-[minmax(0,auto)_1fr] gap-x-6 gap-y-2 text-sm">
        {content.facts.map((fact, i) => (
          <Fragment key={`${i}:${fact.label}`}>
            <dt className="font-semibold">{fact.label}</dt>
            <dd className={BODY}>{fact.value}</dd>
          </Fragment>
        ))}
      </dl>

      <h3 className={H3}>FAQ</h3>
      <div className="mt-3 space-y-5">
        {content.faq.map((entry, i) => (
          <div key={`${i}:${entry.question}`}>
            <h4 className="font-semibold">{entry.question}</h4>
            <p className={`mt-1 ${BODY}`}>{entry.answer}</p>
          </div>
        ))}
      </div>

      {content.links && content.links.length > 0 ? (
        <>
          <h3 className={H3}>More</h3>
          <ul className="mt-3 space-y-1.5">
            {content.links.map((link) => (
              <li key={link.href} className={BODY}>
                <Link
                  href={link.href}
                  className="font-semibold underline underline-offset-2 hover:text-(--foreground)"
                >
                  {link.label}
                </Link>
                {": "}
                <span>{link.description}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h3 className={H3}>Credits</h3>
      <ul className="mt-3 space-y-1.5 text-sm text-(--muted)">
        {content.credits.map((credit, i) => (
          <li key={`${i}:${credit.label}`}>
            <span className="font-semibold text-(--foreground)/85">{credit.label}:</span>{" "}
            {credit.href ? (
              <a
                href={credit.href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-(--foreground)"
              >
                {credit.detail}
              </a>
            ) : (
              credit.detail
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
