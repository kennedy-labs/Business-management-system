interface SectionHeaderProps {
  title: string;
  subtitle?: string;
}

/** Consistent page section header with high-contrast text */
export default function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
    </div>
  );
}
