import Link from 'next/link'
import { AppSearch } from '@/components/app-search'
import { LanguageSwitcher } from '@/components/language-switcher'
import { Logo } from '@/components/logo'
import { T } from '@/components/t'
import { ProfileMenuClient } from '@/components/app-shell/profile-menu-client'
import { WorkspaceSelectorClient } from '@/components/app-shell/workspace-selector-client'
import { navigationGroups, primaryNavigation } from '@/components/app-shell/navigation-items'
import { DesktopNavigationLink } from '@/components/app-shell/desktop-navigation-link'

export function AppSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white md:flex md:flex-col" aria-labelledby="app-sidebar-label">
      <span id="app-sidebar-label" className="sr-only"><T k="nav.appNavigation" /></span>
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 px-5">
        <Link href="/app/dashboard" className="flex items-center gap-3">
          <Logo size="md" />
          <span className="font-semibold text-slate-950">Leonety</span>
        </Link>
      </div>

      <div className="space-y-4 border-b border-slate-200 p-4">
        <WorkspaceSelectorClient />
        <AppSearch />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-labelledby="app-sidebar-main-nav-label">
        <span id="app-sidebar-main-nav-label" className="sr-only"><T k="nav.mainAppNavigation" /></span>
        <div className="space-y-1">
          {primaryNavigation.map((item) => <DesktopNavigationLink key={item.href} item={item} />)}
        </div>

        <div className="mt-5 space-y-5">
          {navigationGroups.map((group) => (
            <section key={group.labelKey} className="space-y-1">
              <p className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-400"><T k={group.labelKey} /></p>
              {group.items.map((item) => <DesktopNavigationLink key={item.href} item={item} />)}
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
