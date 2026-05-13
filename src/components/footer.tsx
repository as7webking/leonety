'use client'

import Link from 'next/link'
import { DollarSign } from 'lucide-react'

export function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white py-12">
          <div className="container mx-auto px-4">
            <div className="grid gap-8 md:grid-cols-4">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <span className="text-lg font-semibold">Leonety</span>
                </div>
                <p className="text-sm text-slate-600">Beautiful finance tools for freelancers and small teams.</p>
              </div>
              <div>
                <p className="font-semibold text-slate-900 mb-4">Product</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li><Link href="/#features" className="hover:text-slate-900 transition">Features</Link></li>
                  <li><Link href="/#pricing" className="hover:text-slate-900 transition">Pricing</Link></li>
                  <li><Link href="/onboarding" className="hover:text-slate-900 transition">Get started</Link></li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-900 mb-4">Support</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li><Link href="/#help-center" className="hover:text-slate-900 transition">Help center</Link></li>
                  <li><Link href="/#contact" className="hover:text-slate-900 transition">Contact</Link></li>
                  <li><a href="mailto:support@leonety.app" className="hover:text-slate-900 transition">Email us</a></li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-900 mb-4">Legal</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li><Link href="/privacy" className="hover:text-slate-900 transition">Privacy</Link></li>
                  <li><Link href="/terms" className="hover:text-slate-900 transition">Terms</Link></li>
                  <li><Link href="/cookies" className="hover:text-slate-900 transition">Cookies</Link></li>
                  <li><Link href="/impressum" className="hover:text-slate-900 transition">Impressum</Link></li>
                  <li><Link href="/delete-account" className="hover:text-slate-900 transition">Delete account</Link></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-slate-200 mt-12 pt-8">
              <p className="text-center text-sm text-slate-600">© 2026 Leonety. All rights reserved.</p>
            </div>
          </div>
        </footer>
  )
}
