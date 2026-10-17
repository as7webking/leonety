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
  '/clients/:path*',
  '/invoices',
  '/mail',
  '/contracts',
  '/contracts/:path*',
  '/employees',
  '/employees/:path*',
  '/locations',
  '/shifts',
  '/products',
  '/products/:path*',
  '/inventory',
  '/stock-movements',
  '/settings',
  '/settings/:path*',
  '/admin/:path*',
]

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp', 'libheif-js'],
  outputFileTracingIncludes: {
    '/api/product-images/normalize': ['./node_modules/libheif-js/libheif-wasm/libheif.wasm'],
  },
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
