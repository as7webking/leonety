import type { NextConfig } from "next";

const appRoutes = [
  '/dashboard',
  '/income',
  '/expenses',
  '/transactions',
  '/time',
  '/onboarding',
  '/profile',
  '/workspaces',
  '/upgrade',
  '/clients',
  '/invoices',
  '/contracts',
  '/employees',
  '/locations',
  '/shifts',
  '/products',
  '/inventory',
  '/stock-movements',
  '/settings/integrations',
  '/settings/integrations/woocommerce',
]

const nextConfig: NextConfig = {
  async redirects() {
    return appRoutes.map((route) => ({
      source: route,
      destination: `/app${route}`,
      permanent: false,
    }))
  },
  async rewrites() {
    return appRoutes.map((route) => ({
      source: `/app${route}`,
      destination: route,
    }))
  },
};

export default nextConfig;
