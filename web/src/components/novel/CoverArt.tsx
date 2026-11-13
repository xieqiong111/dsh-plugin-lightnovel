import { useId } from 'react'
import { cn } from '@/services/utils'
import type { CoverTheme } from '@/types'

/**
 * 原创矢量封面：按参考图的抽象几何风格重绘，非截图、非外链图片。
 * 使用 300×400 视口 + preserveAspectRatio="xMidYMid slice"，
 * 任意容器尺寸下都不会拉伸变形。
 */
export function CoverArt({
  theme,
  index,
  className,
  title,
  caption,
  showTag,
  mini,
}: {
  theme: CoverTheme
  index: number
  className?: string
  title?: string
  caption?: string
  showTag?: boolean
  mini?: boolean
}) {
  const uid = useId().replace(/:/g, '')
  return (
    <div className={cn('relative overflow-hidden bg-[#2b2a55]', className)}>
      <svg
        viewBox="0 0 300 400"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={title ? `${title} 封面插画` : '小说封面插画'}
      >
        <defs>
          <linearGradient id={`bg-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={palette(theme).from} />
            <stop offset="100%" stopColor={palette(theme).to} />
          </linearGradient>
          <radialGradient id={`glow-${uid}`} cx="50%" cy="42%" r="60%">
            <stop offset="0%" stopColor={palette(theme).glow} stopOpacity="0.5" />
            <stop offset="100%" stopColor={palette(theme).glow} stopOpacity="0" />
          </radialGradient>
          <pattern id={`lines-${uid}`} width="7" height="7" patternUnits="userSpaceOnUse">
            <rect width="1.2" height="7" fill="#ffffff" opacity="0.055" />
          </pattern>
          <filter id={`grain-${uid}`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="noise" />
            <feColorMatrix in="noise" type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.55" />
            </feComponentTransfer>
          </filter>
        </defs>

        <rect width="300" height="400" fill={`url(#bg-${uid})`} />
        <rect width="300" height="400" fill={`url(#glow-${uid})`} />

        {art(theme)}

        <rect width="300" height="400" fill={`url(#lines-${uid})`} />
        <rect width="300" height="400" filter={`url(#grain-${uid})`} opacity="0.055" />
        <rect width="300" height="400" fill={`url(#bg-${uid})`} opacity="0.10" />
      </svg>

      {!mini && (
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
        <span className="whitespace-nowrap text-[6.5px] font-semibold uppercase leading-none tracking-[0.18em] text-white/60">
          LIGHT NOVEL / {String(index).padStart(2, '0')}
        </span>
        {(title || caption) && (
          <div>
            {title && (
              <p className="mb-1.5 h-[2px] w-4 rounded-full bg-white/55" aria-hidden />
            )}
            {title && (
              <p className="max-w-[92%] text-[14.5px] font-bold leading-[1.45] tracking-[0.02em] text-white drop-shadow-[0_2px_6px_rgba(20,18,50,0.35)]">
                {title}
              </p>
            )}
            {caption && (
              <p className="mt-2 text-[6.5px] font-medium uppercase leading-none tracking-[0.24em] text-white/45">
                {caption}
              </p>
            )}
          </div>
        )}
      </div>
      )}

      {showTag && !mini && (
        <span className="absolute left-3 top-7 rounded-[6px] border border-white/25 bg-white/20 px-2 py-[3px] text-[9px] font-semibold text-white backdrop-blur-sm">
          示例书目
        </span>
      )}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10" />
    </div>
  )
}

function palette(theme: CoverTheme) {
  switch (theme) {
    case 'moon':
      return { from: '#3E4478', to: '#242A4C', glow: '#8FA0E8' }
    case 'flower':
      return { from: '#CE818F', to: '#8B4A5C', glow: '#FFDCC6' }
    case 'mountain':
      return { from: '#489A92', to: '#1E5566', glow: '#B9F0DA' }
    case 'orb':
      return { from: '#7F7FC0', to: '#3A3C68', glow: '#C9D8FF' }
    case 'city':
      return { from: '#3C526E', to: '#243A52', glow: '#D8C193' }
    case 'rose':
      return { from: '#F0A08C', to: '#8E4258', glow: '#FFE2C9' }
    case 'night':
      return { from: '#2B3A72', to: '#121731', glow: '#8FA8FF' }
    case 'paper':
      return { from: '#E8DCC6', to: '#9C8467', glow: '#FFF6E2' }
  }
}

function art(theme: CoverTheme) {
  switch (theme) {
    case 'moon':
      return (
        <g>
          <circle cx="228" cy="92" r="54" fill="#2A2554" opacity="0.85" />
          <circle cx="228" cy="92" r="54" fill="none" stroke="#8F7EDC" strokeOpacity="0.5" strokeWidth="1" />
          <path d="M196 76a38 38 0 1 0 48 54 34 34 0 0 1-48-54z" fill="#A896E8" opacity="0.65" />
          <path d="M0 268c48-28 96-30 146-6s104 22 154-8v146H0z" fill="#231F4A" opacity="0.55" />
          <path d="M0 300c60-34 118-20 168 4s88 12 132-10v106H0z" fill="#191634" opacity="0.7" />
          <g stroke="#C9BDF6" strokeWidth="1.6" fill="none" opacity="0.85">
            <path d="M126 236l28-24 28 24v26h-56z" />
            <path d="M150 214v58M126 236h56" strokeWidth="0.9" />
          </g>
          <g fill="#E7E0FF">
            <circle cx="72" cy="70" r="1.4" />
            <circle cx="110" cy="48" r="1" />
            <circle cx="46" cy="140" r="1.1" />
          </g>
        </g>
      )
    case 'flower':
      return (
        <g>
          <circle cx="150" cy="150" r="72" fill="#F8D9BE" opacity="0.28" />
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i * Math.PI) / 4
            const cx = 150 + Math.cos(angle) * 42
            const cy = 148 + Math.sin(angle) * 42
            return <ellipse key={i} cx={cx} cy={cy} rx="26" ry="42" fill="#F8DEC4" transform={`rotate(${i * 45} ${cx} ${cy})`} opacity="0.95" />
          })}
          <circle cx="150" cy="148" r="27" fill="#8E3F52" />
          <circle cx="150" cy="148" r="11" fill="#E9B7A0" />
          <path d="M0 330c70-16 130 4 300-14v84H0z" fill="#5E2F3F" opacity="0.55" />
          <path d="M0 356c90-10 180 18 300-6v50H0z" fill="#3E2030" opacity="0.5" />
        </g>
      )
    case 'mountain':
      return (
        <g>
          <circle cx="222" cy="100" r="48" fill="#E8DCA8" opacity="0.85" />
          <path d="M0 300L96 132l66 112 26-34 112 150v58H0z" fill="#9FE3D2" opacity="0.92" />
          <path d="M96 300l86-118 74 106 30-26 44 38v20H96z" fill="#2C7D7C" opacity="0.65" />
          <path d="M0 306c60-20 104 2 166-6s92-12 134 2v98H0z" fill="#14464F" />
          <path d="M0 322c74-14 130 6 190-2" stroke="#B7DC9C" strokeWidth="1.2" fill="none" />
          <path d="M0 332c74-14 130 6 190-2" stroke="#B7DC9C" strokeWidth="0.6" fill="none" opacity="0.6" />
        </g>
      )
    case 'orb':
      return (
        <g>
          <circle cx="164" cy="146" r="78" fill="#C7D2F2" opacity="0.28" />
          <circle cx="164" cy="146" r="60" fill="#9FB6E8" opacity="0.55" />
          <circle cx="164" cy="146" r="60" fill="none" stroke="#E6E9FF" strokeWidth="1" opacity="0.5" />
          <circle cx="156" cy="132" r="14" fill="#F2F3FF" opacity="0.9" />
          <ellipse cx="164" cy="298" rx="76" ry="14" fill="#2C2A57" opacity="0.45" />
          <g fill="none" stroke="#EDE9FF" strokeWidth="1" opacity="0.55">
            <circle cx="58" cy="96" r="10" />
            <circle cx="246" cy="118" r="12" />
            <circle cx="230" cy="214" r="6" />
          </g>
          <path d="M0 330c78-8 148 10 300-8v78H0z" fill="#302E5E" opacity="0.45" />
        </g>
      )
    case 'city':
      return (
        <g>
          <circle cx="196" cy="86" r="46" fill="#D8C193" opacity="0.92" />
          <g fill="#1B3147" opacity="0.9">
            <rect x="34" y="188" width="42" height="150" />
            <rect x="84" y="146" width="34" height="192" />
            <rect x="126" y="212" width="30" height="126" />
            <rect x="164" y="164" width="44" height="174" />
            <rect x="216" y="196" width="30" height="142" />
            <rect x="252" y="222" width="34" height="116" />
          </g>
          <g fill="#8FA6B6" opacity="0.45">
            <rect x="40" y="206" width="18" height="3" />
            <rect x="40" y="220" width="26" height="3" />
            <rect x="90" y="164" width="20" height="3" />
            <rect x="90" y="178" width="14" height="3" />
            <rect x="172" y="184" width="24" height="3" />
            <rect x="222" y="214" width="16" height="3" />
            <rect x="258" y="240" width="22" height="3" />
          </g>
          <rect x="0" y="300" width="300" height="1.6" fill="#E7C98F" opacity="0.85" />
          <path d="M0 338c76 10 154-14 300 6v56H0z" fill="#0D1B2B" opacity="0.6" />
        </g>
      )
    case 'rose':
      return (
        <g>
          <circle cx="212" cy="118" r="62" fill="#FFE3C6" opacity="0.55" />
          <path d="M0 250c70-22 132-18 200 4s74 6 100-6v152H0z" fill="#7C3A50" opacity="0.55" />
          <path d="M0 292c64-16 122 8 182-4s82-8 118 2v110H0z" fill="#4C2336" opacity="0.65" />
          <g stroke="#FFE6D2" strokeWidth="1" opacity="0.5" fill="none">
            <path d="M56 330c26-18 54-22 78-6" />
            <path d="M190 340c22-16 46-18 68-4" />
          </g>
          <g fill="#FFE9D6" opacity="0.85">
            <circle cx="70" cy="92" r="1.6" />
            <circle cx="108" cy="66" r="1.1" />
          </g>
        </g>
      )
    case 'night':
      return (
        <g>
          <g fill="#E8EDFF">
            <circle cx="52" cy="72" r="1.6" />
            <circle cx="92" cy="46" r="1" />
            <circle cx="142" cy="88" r="1.4" />
            <circle cx="210" cy="54" r="1" />
            <circle cx="258" cy="102" r="1.8" />
            <circle cx="228" cy="152" r="1.1" />
            <circle cx="34" cy="150" r="1.2" />
          </g>
          <path d="M96 300v-96a54 54 0 0 1 108 0v96z" fill="#1B2450" />
          <path d="M96 300v-96a54 54 0 0 1 108 0v96z" fill="none" stroke="#8FA8E8" strokeWidth="1.2" opacity="0.6" />
          <circle cx="150" cy="186" r="4" fill="#CFE0FF" />
          <rect x="80" y="298" width="140" height="2" fill="#8FA8E8" opacity="0.5" />
          <path d="M0 336c80 12 154-10 300 8v56H0z" fill="#0B1027" opacity="0.7" />
        </g>
      )
    case 'paper':
      return (
        <g>
          <g stroke="#8B7257" strokeWidth="0.7" opacity="0.35">
            {Array.from({ length: 11 }).map((_, i) => (
              <path key={i} d={`M40 ${120 + i * 22}h220`} />
            ))}
          </g>
          <g fill="none" stroke="#5C4A38" strokeWidth="1.6" opacity="0.65">
            <path d="M150 108c-18 10-26 26-14 40 10-14 26-16 38-6" />
            <path d="M150 108c18 10 26 26 14 40-10-14-26-16-38-6" />
            <path d="M150 92v86" />
          </g>
          <circle cx="208" cy="86" r="34" fill="#F5E7C9" opacity="0.5" />
          <path d="M0 352c90-10 168 8 300-4v52H0z" fill="#8B7257" opacity="0.35" />
        </g>
      )
  }
}
