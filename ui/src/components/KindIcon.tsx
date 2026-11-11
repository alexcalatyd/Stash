import { File, Files, Image, Link2, Palette, Type } from 'lucide-react'
import type { Kind } from '@/lib/bridge'

export function KindIcon({ kind, many, size = 15 }: { kind: Kind; many?: boolean; size?: number }) {
  const props = { size, strokeWidth: 1.75 }
  switch (kind) {
    case 'link':
      return <Link2 {...props} />
    case 'color':
      return <Palette {...props} />
    case 'image':
      return <Image {...props} />
    case 'file':
      return many ? <Files {...props} /> : <File {...props} />
    default:
      return <Type {...props} />
  }
}
