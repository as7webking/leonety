import { cn } from "@/lib/utils"

interface PageContainerProps {
  children: React.ReactNode
  className?: string
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn("container mx-auto box-border w-full min-w-0 px-4 py-6", className)}>
      {children}
    </div>
  )
}
