const SHOTS = [
  {
    src: "/flyer-today.png?v=light",
    alt: "Reps Today screen logging Dumbbell Bench Press",
    caption: "Today — log your sets",
  },
  {
    src: "/flyer-howto.png?v=light",
    alt: "Reps How to screen for Dumbbell Bench Press with start and finish photos",
    caption: "How to — photos and steps",
  },
  {
    src: "/flyer-routines.png?v=light",
    alt: "Reps Routines screen with custom programs",
    caption: "Routines — build your plan",
  },
] as const;

export function FlyerPhones() {
  return (
    <div className="flex items-start justify-center gap-3">
      {SHOTS.map((shot) => (
        <figure key={shot.src} className="w-[31%] min-w-0">
          <div className="overflow-hidden rounded-[1.15rem] border-[3px] border-[#0a1210] bg-white shadow-[0_6px_0_#0a1210]">
            <img
              src={shot.src}
              alt={shot.alt}
              className="block h-[3.15in] w-full object-cover object-top"
            />
          </div>
          <figcaption className="mt-1.5 text-center text-xs font-bold leading-tight tracking-wide text-[#d6ff3f]">
            {shot.caption}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
