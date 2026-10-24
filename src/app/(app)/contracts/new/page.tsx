import { redirect } from 'next/navigation'
import { getContractsCreateRedirect } from '@/lib/contract-client-routing'

export default async function NewContractPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  redirect(getContractsCreateRedirect(params.clientId))
}
