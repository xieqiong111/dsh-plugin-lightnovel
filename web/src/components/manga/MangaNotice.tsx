import { Info } from 'lucide-react'

export function MangaNotice({ message }: { message: string }) {
  return (
    <div role="status" className="flex items-start gap-2 rounded-xl border border-caution-line bg-caution-soft px-4 py-3 text-xs leading-relaxed text-caution">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 break-words">{message}</p>
    </div>
  )
}
