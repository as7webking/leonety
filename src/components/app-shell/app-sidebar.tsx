import Link from 'next/link'
import { AppSearch } from '@/components/app-search'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ProfileMenuClient } from '@/components/app-shell/profile-menu-client'
import { WorkspaceSelectorClient } from '@/components/app-shell/workspace-selector-client'
import { navigationGroups, primaryNavigation } from '@/components/app-shell/navigation-items'

export function AppSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white md:flex md:flex-col" aria-label="App navigation">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 px-5">
        <Link href="/app/dashboard" className="flex items-center gap-3">
          <img src="/icon-192.png" alt="Leonety" className="h-10 w-10 object-contain" />
          <span className="font-semibold text-slate-950">Leonety</span>
        </Link>
      </div>

      <div className="space-y-4 border-b border-slate-200 p-4">
        <WorkspaceSelectorClient />
        <AppSearch />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Main app navigation">
        <div className="space-y-1">
          {primaryNavigation.map((item) => {
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-950">
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>

        <div className="mt-5 space-y-5">
          {navigationGroups.map((group) => (
            <section key={group.label} className="space-y-1">
              <p className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-950">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </section>
          ))}
        </div>
      </nav>

      <div className="space-y-3 border-t border-slate-200 p-4">
        <LanguageSwitcher />
        <ProfileMenuClient />
      </div>
    </aside>
  )
}
