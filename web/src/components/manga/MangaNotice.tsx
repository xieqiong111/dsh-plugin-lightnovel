import { Info } from 'lucide-react'

export function MangaNotice({ message }: { message: string }) {
  return (
    <div role="status" className="flex items-start gap-2 rounded-xl border border-[#F5E3BE] bg-[#FDF8EC] px-4 py-3 text-xs leading-relaxed text-[#805511]">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 break-words">{message}</p>
    </div>
  )
}
