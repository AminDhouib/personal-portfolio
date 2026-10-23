"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { translations, type Language } from "./translations";
import { useUnmountTimers } from "./use-unmount-timers";
import { VoltorbIcon, LegendVoltorb, LoopingSparkle } from "./chrome";
import { Card } from "./card";

// ---------------------------------------------------------------------------
// src/components/InstructionsModal.tsx (1:1 port).
// ---------------------------------------------------------------------------

type InstructionsModalProps = {
  language: Language;
  setModalOpen: Dispatch<SetStateAction<boolean>>;
};

export const InstructionsModal = ({ language, setModalOpen }: InstructionsModalProps) => {
  const { howToPlayTitle, instructions, tipsTitle, tips } = translations[language];
  const { later } = useUnmountTimers();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setModalOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [setModalOpen]);

  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    setClosing(true);
    later(() => setModalOpen(false), 180);
  }, [setModalOpen, later]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close]);

  return (
    <div
      className={`svf-modal-backdrop absolute inset-0 z-[60] flex items-center justify-center overflow-y-auto p-3 ${
        closing ? "svf-modal-closing" : "svf-modal-open"
      }`}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={howToPlayTitle}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="svf-modal-card rounded-5 my-auto w-full max-w-[460px] cursor-default border-4 border-gray-300 bg-white text-gray-700 outline outline-2 outline-gray-600"
      >
        <div className="flex items-center justify-between border-b-2 border-gray-200 px-4 py-2">
          <div className="flex items-center gap-2">
            <VoltorbIcon size={20} />
            <h1 className="drop-shadow-soft text-2xl leading-none">{howToPlayTitle}</h1>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded border-2 border-gray-300 bg-white text-lg leading-none text-gray-600 transition-colors hover:bg-zinc-100"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
              <rect x="1" y="2" width="2" height="2" />
              <rect x="3" y="4" width="2" height="2" />
              <rect x="5" y="6" width="4" height="2" />
              <rect x="9" y="4" width="2" height="2" />
              <rect x="11" y="2" width="2" height="2" />
              <rect x="1" y="10" width="2" height="2" />
              <rect x="3" y="8" width="2" height="2" />
              <rect x="9" y="8" width="2" height="2" />
              <rect x="11" y="10" width="2" height="2" />
            </svg>
          </button>
        </div>

        <div className="drop-shadow-soft flex flex-col gap-4 p-4 text-base leading-snug">
          {/* Reward legend */}
          <section>
            <h2 className="mb-2 text-xl text-gray-700">Tiles &amp; rewards</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-lg">
              <div className="flex items-center gap-2">
                <Card fake>1</Card>
                <Card fake>2</Card>
                <Card fake>3</Card>
                <span>...x1! ...x2! ...x3!</span>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-lg">
              <div className="relative">
                <Card fake>
                  <LegendVoltorb size={24} burstSize={36} className="picture-outline voltorb" />
                </Card>
              </div>
              <span>Game Over! 0!</span>
            </div>
          </section>

          {/* Demo animations */}
          <section>
            <h2 className="mb-2 text-xl text-gray-700">How it plays</h2>
            <ul className="flex list-disc flex-col gap-2 pl-6 text-base">
              <li>{instructions[0]}</li>
              <li>{instructions[1]}</li>
              <li>{instructions[2]}</li>
              <li>{instructions[3]}</li>
              <li>{instructions[4]}</li>
            </ul>
            <div className="mt-3 flex items-center justify-around gap-3 rounded-md bg-[#eef5ef] p-3">
              <div className="flex flex-col items-center gap-1">
                <div className="relative">
                  <Card fake>3</Card>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <LoopingSparkle size={38} />
                  </div>
                </div>
                <span className="text-xs text-gray-500">Collect coins</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="relative">
                  <Card fake>
                    <LegendVoltorb size={22} burstSize={38} className="picture-outline voltorb" />
                  </Card>
                </div>
                <span className="text-xs text-gray-500">Avoid Voltorbs</span>
              </div>
            </div>
          </section>

          {/* Tips */}
          <section>
            <h2 className="mb-1 text-xl text-gray-700">{tipsTitle}</h2>
            <ul className="flex list-disc flex-col gap-2 pl-6 text-base">
              <li>{tips[0]}</li>
              <li>{tips[1]}</li>
            </ul>
          </section>

          <p className="text-xs leading-snug text-gray-500">
            Unofficial fan recreation. Not affiliated with or endorsed by Nintendo, Creatures Inc.
            or GAME FREAK inc. The Voltorb sprites and the music are the originals from Pokemon
            HeartGold and SoulSilver, the property of those companies, used here in a non-commercial
            fan project. Pokemon and Voltorb are trademarks of their owners.
          </p>
        </div>
      </div>
    </div>
  );
};
