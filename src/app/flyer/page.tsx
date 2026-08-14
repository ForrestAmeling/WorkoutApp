import type { Metadata } from "next";
import { FlyerPhones } from "./FlyerPhones";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = {
  title: "Reps gym flyer",
  description: "Printable bulletin-board flyer for Reps.",
  robots: { index: false, follow: false },
};

const TABS = Array.from({ length: 8 }, (_, i) => i);

export default function FlyerPage() {
  return (
    <main className="flyer-page min-h-dvh bg-[#eef2f0] px-4 py-6 text-[#14201c]">
      <style>{`
        .flyer-sheet {
          width: min(100%, 8.5in);
          min-height: 11in;
        }
        @media print {
          @page { size: letter portrait; margin: 0; }
          html, body { background: #14201c !important; }
          .flyer-page { padding: 0 !important; background: #14201c !important; }
          .flyer-no-print { display: none !important; }
          .flyer-sheet {
            width: 8.5in;
            height: 11in;
            min-height: 11in;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <div className="flyer-no-print mx-auto mb-5 flex max-w-[8.5in] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[#5b6b64]">
          Letter size (8.5 × 11). Print in color if you can — the lime still
          reads in grayscale.
        </p>
        <PrintButton />
      </div>

      <article className="flyer-sheet mx-auto flex flex-col overflow-hidden bg-[#14201c] text-[#f4f7f4] shadow-[0_20px_60px_rgb(20_32_28_/_0.18)]">
        <div className="flex flex-1 flex-col px-7 pt-6 pb-3 sm:px-8 sm:pt-7">
          <p className="font-[family-name:var(--font-display)] text-sm font-bold tracking-[0.35em] text-[#d6ff3f]">
            WORKOUT TRACKER
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-8xl font-extrabold leading-[0.82] tracking-tight text-[#d6ff3f]">
            REPS
          </h1>
          <p className="mt-2 font-[family-name:var(--font-display)] text-5xl font-extrabold leading-none tracking-tight text-[#f4f7f4]">
            You have a plan.
          </p>
          <p className="mt-3 max-w-[36rem] text-lg font-semibold leading-snug text-[#c9d5d0]">
            Build your routine once. Each gym day, today&apos;s lifts are
            waiting. Not Excel. Not Notes.
          </p>

          <div className="mt-4">
            <FlyerPhones />
          </div>

          <ul className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2.5 text-base font-bold leading-snug">
            <li className="flex gap-2.5">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#d6ff3f]" />
              Build and switch your own routines
            </li>
            <li className="flex gap-2.5">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#d6ff3f]" />
              Today&apos;s workout, ready
            </li>
            <li className="flex gap-2.5">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#d6ff3f]" />
              How to: photos and steps on every lift
            </li>
            <li className="flex gap-2.5">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#d6ff3f]" />
              History of every session
            </li>
            <li className="flex gap-2.5">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#d6ff3f]" />
              Progress charts — see you getting stronger
            </li>
            <li className="flex gap-2.5">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#d6ff3f]" />
              Starting-weight suggestions from your logs
            </li>
            <li className="flex gap-2.5">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#d6ff3f]" />
              Rest timer between sets
            </li>
            <li className="flex gap-2.5">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#d6ff3f]" />
              1-month free trial · then $12 / year
            </li>
          </ul>

          <div className="mt-auto flex items-end justify-between gap-5 pt-4">
            <div className="rounded-xl bg-white p-1.5">
              <img
                src="/flyer-qr.svg"
                alt="QR code to repsapp.fit"
                width={140}
                height={140}
                className="h-28 w-28"
              />
            </div>
            <div className="pb-1 text-right">
              <p className="text-sm font-bold tracking-wide text-[#d6ff3f]">
                SCAN TO START
              </p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-5xl font-extrabold tracking-tight text-[#f4f7f4]">
                repsapp.fit
              </p>
              <p className="mt-1 text-sm font-semibold text-[#c9d5d0]">
                Open it. Today&apos;s workout is already there.
              </p>
            </div>
          </div>
        </div>

        <div className="flex border-t border-dashed border-[#d6ff3f]/40">
          {TABS.map((tab) => (
            <div
              key={tab}
              className="flex h-24 flex-1 items-center justify-center border-l border-dashed border-[#d6ff3f]/40 first:border-l-0"
            >
              <span
                className="font-[family-name:var(--font-display)] text-sm font-bold tracking-widest text-[#d6ff3f]"
                style={{
                  writingMode: "vertical-rl",
                  transform: "rotate(180deg)",
                }}
              >
                repsapp.fit
              </span>
            </div>
          ))}
        </div>
      </article>
    </main>
  );
}
