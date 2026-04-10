interface SectionHeadingProps {
  number: string;
  title: string;
  color?: string;
}

export function SectionHeading({
  number,
  title,
  color = "var(--color-accent-green)",
}: SectionHeadingProps) {
  return (
    <div className="flex items-center gap-4 mb-12">
      <span
        className="font-display text-sm font-bold opacity-60"
        style={{ color }}
      >
        {number}
      </span>
      <div className="h-px w-8" style={{ backgroundColor: color, opacity: 0.4 }} />
      <h2 className="font-display text-2xl font-bold tracking-tight" style={{ color }}>
        {title}
      </h2>
    </div>
  );
}
