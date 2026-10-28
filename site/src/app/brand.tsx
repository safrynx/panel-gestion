/** The Fiverax mark (folded arrow + square), vector and transparent, for use on dark backgrounds. */
export function Mark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="136 118 250 250" aria-hidden="true">
      <defs>
        <linearGradient id="fx-band" x1="150" y1="0" x2="330" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6f6a5e" /><stop offset="0.75" stopColor="#efe8d6" />
        </linearGradient>
        <linearGradient id="fx-fold" x1="185" y1="0" x2="275" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#efe8d6" /><stop offset="1" stopColor="#8a8475" />
        </linearGradient>
      </defs>
      <path d="M172 222 L352 152 L292 335 L256 236 Z" fill="#efe8d6" stroke="#efe8d6" strokeWidth="44" strokeLinejoin="round" />
      <path d="M172 222 L352 152 L262 228 Z" fill="url(#fx-band)" stroke="url(#fx-band)" strokeWidth="44" strokeLinejoin="round" />
      <path d="M182 232 L338 172 L272 232 Z" fill="url(#fx-fold)" />
      <path d="M272 232 L338 172 L300 300 Z" fill="#efe8d6" />
      <rect x="158" y="274" width="62" height="60" rx="14" fill="#efe8d6" transform="rotate(-4 189 304)" />
    </svg>
  );
}

/** Mark + wordmark. */
export function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <span className="wordmark">
      <Mark size={size} />
      <b>Fiverax</b>
    </span>
  );
}

/** Discord logo, for the login buttons. */
export function DiscordIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.26a18.3 18.3 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.26.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.89 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.78 1.36 1.23 1.99a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z" />
    </svg>
  );
}
