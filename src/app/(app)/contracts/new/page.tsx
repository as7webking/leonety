import { redirect } from 'next/navigation'

export default function NewContractPage() {
  redirect('/app/contracts?mode=create')
}
