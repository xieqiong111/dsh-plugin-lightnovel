/**
 * 搜索横幅插画：两本叠放的轻小说书卡 + 细线圆环 + 花瓣与星芒。
 * 纯 SVG 绘制，不依赖任何外链图片。
 */
export function HeroArt() {
  return (
    <div className="pointer-events-none absolute bottom-0 right-0 top-0 hidden w-[420px] items-center justify-end lg:flex">
      <svg viewBox="-28 -18 462 306" className="h-[270px] w-[420px]" aria-hidden>
        <defs>
          <linearGradient id="hero-card-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#514394" />
            <stop offset="55%" stopColor="#3A3170" />
            <stop offset="100%" stopColor="#241F4E" />
          </linearGradient>
          <linearGradient id="hero-card-b" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#9A7FA6" />
            <stop offset="48%" stopColor="#80648F" />
            <stop offset="100%" stopColor="#4A3562" />
          </linearGradient>
          <radialGradient id="hero-star" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#FFF6E2" />
            <stop offset="72%" stopColor="#E9D3A8" />
            <stop offset="100%" stopColor="#C9A97A" />
          </radialGradient>
          <filter id="hero-shadow" x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="14" stdDeviation="16" floodColor="#4A3C9A" floodOpacity="0.28" />
          </filter>
          <filter id="hero-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
        </defs>

        <circle cx="172" cy="132" r="88" fill="#C9BEF8" opacity="0.28" filter="url(#hero-soft)" />
        <circle cx="172" cy="132" r="118" fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="1" />
        <circle cx="172" cy="132" r="140" fill="none" stroke="#FFFFFF" strokeOpacity="0.18" strokeWidth="0.8" strokeDasharray="2 8" />

        {/* 后层书卡 */}
        <g transform="translate(286 54) rotate(13 48 73)" filter="url(#hero-shadow)">
          <rect width="96" height="146" rx="7" fill="url(#hero-card-b)" />
          <rect width="96" height="146" rx="7" fill="none" stroke="#FFFFFF" strokeOpacity="0.14" />
          <circle cx="58" cy="62" r="31" fill="url(#hero-star)" opacity="0.95" />
          <path d="M59 43l4.6 10.4 11.2 1.1-8.4 7.5 2.4 11-9.8-5.8-9.8 5.8 2.4-11-8.4-7.5 11.2-1.1z" fill="#FFFFFF" opacity="0.8" />
          <text x="10" y="16" fill="#F2E7F2" fontSize="4.4" letterSpacing="1.8" opacity="0.65">LIGHT NOVEL / 04</text>
          <text x="10" y="138" fill="#F7EDF4" fontSize="4" letterSpacing="1.4" opacity="0.45">NEW BEGINNING</text>
        </g>

        {/* 前层书卡 */}
        <g transform="translate(186 46) rotate(-14 54 86)" filter="url(#hero-shadow)">
          <rect width="108" height="172" rx="8" fill="url(#hero-card-a)" />
          <rect width="108" height="172" rx="8" fill="none" stroke="#FFFFFF" strokeOpacity="0.15" />
          <circle cx="66" cy="42" r="26" fill="#1C1940" opacity="0.85" />
          <circle cx="66" cy="42" r="26" fill="none" stroke="#A995E6" strokeOpacity="0.4" />
          <path d="M50 33a20 20 0 1 0 26 28 18 18 0 0 1-26-28z" fill="#B9A8EF" opacity="0.55" />
          <path d="M0 112c22-12 44-6 64 6s32 8 44 6v48H0z" fill="#211C45" opacity="0.55" />
          <path d="M0 132c30-14 54 2 108-4v44H0z" fill="#171331" opacity="0.55" />
          <g stroke="#D7CCF7" strokeWidth="1.2" fill="none" opacity="0.9">
            <path d="M36 108l20-16 20 16v20h-40z" />
            <path d="M56 92v52" strokeWidth="0.7" />
          </g>
          <text x="10" y="17" fill="#DCD2F8" fontSize="4.4" letterSpacing="1.8" opacity="0.6">LIGHT NOVEL / 01</text>
          <text x="10" y="150" fill="#FFFFFF" fontSize="9" letterSpacing="1.6" opacity="0.95">月下的茶馆</text>
          <text x="10" y="164" fill="#CFC4EE" fontSize="3.8" letterSpacing="1.4" opacity="0.5">STORIES UNDER THE MOON</text>
        </g>

        {/* 花瓣 */}
        <g fill="#F6B4C4" opacity="0.9" transform="translate(78 88) scale(0.95)">
          {Array.from({ length: 6 }).map((_, i) => (
            <ellipse key={i} cx={0} cy={-8} rx="3.2" ry="6.4" transform={`rotate(${i * 60})`} opacity="0.75" />
          ))}
          <circle r="2.4" fill="#EE8AA2" />
        </g>

        {/* 星芒与细点 */}
        <g fill="#FFFFFF" opacity="0.9">
          <path d="M129 55l2.6 6 6 2.6-6 2.6-2.6 6-2.6-6-6-2.6 6-2.6z" opacity="0.85" />
          <path d="M348 214l2 4.6 4.6 2-4.6 2-2 4.6-2-4.6-4.6-2 4.6-2z" opacity="0.7" />
          <circle cx="119" cy="180" r="1.4" opacity="0.65" />
          <circle cx="360" cy="92" r="1.6" opacity="0.6" />
        </g>
      </svg>
    </div>
  )
}
