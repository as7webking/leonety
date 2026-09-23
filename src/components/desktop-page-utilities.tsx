interface DesktopPageUtilitiesProps {
  title: string
  children: React.ReactNode
}

export function DesktopPageUtilities({ title, children }: DesktopPageUtilitiesProps) {
  return (
    <section
      className="mb-5 hidden min-w-0 items-center gap-5 border-y border-slate-200 bg-slate-50/70 px-3 py-3 lg:flex"
      aria-label={title}
    >
      <h2 className="shrink-0 text-xs font-semibold uppercase text-slate-500">{title}</h2>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
    </section>
  )
}
