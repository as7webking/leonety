import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description?: string
  children?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, children, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-2 pb-6", className)}>
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 break-words text-muted-foreground">{description}</p>
          )}
        </div>
        {children && <div className="flex min-w-0 flex-wrap gap-2 lg:justify-end">{children}</div>}
      </div>
    </div>
  )
}
