import React from 'react';

interface EcsLogoProps {
  size?: number;
  variant?: 'light' | 'dark' | 'simple';
  className?: string;
}

export function EcsLogo({ size = 48, variant = 'light', className = '' }: EcsLogoProps) {
  // Brand luxury styling matching the new attached monogram logo
  const outerBorderClass = variant === 'dark'
    ? 'border-white/10 bg-zinc-950 shadow-[0_0_25px_rgba(255,255,255,0.08)]'
    : 'border-zinc-200 bg-white shadow-sm';

  const sizeStyle = { width: size, height: size };

  // Luxury Navy matching the exact brand color of the new attached image
  let brandColor = '#06182c'; 

  if (variant === 'dark') {
    brandColor = '#ffffff'; // Pristine White for luxury dark cards
  } else if (variant === 'simple') {
    brandColor = 'currentColor'; // Context-adaptive color
  }

  return (
    <div 
      style={sizeStyle} 
      className={`relative rounded-2xl border flex items-center justify-center transition-all duration-500 hover:scale-110 active:scale-95 group overflow-hidden ${outerBorderClass} ${className}`}
    >
      {/* Subtle modern reflection / ambient lighting inside the logo card */}
      {variant === 'dark' && (
        <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />
      )}

      {/* Vector replica of the premium interlocking double-line ECS SYSTEMS brand logo */}
      <svg
        viewBox="0 0 600 450"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-[85%] h-[85%] select-none transition-transform duration-500 group-hover:scale-105"
      >
        <g 
          stroke={brandColor} 
          strokeWidth="15" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          fill="none"
        >
          {/* ========================================================= */}
          {/* OUTER E-C LOOP (Left and Middle)                         */}
          {/* ========================================================= */}
          <path d="M 330,165 A 80,80 0 0,0 260,120 H 130 V 280 H 260 A 80,80 0 0,0 330,235" />

          {/* ========================================================= */}
          {/* INNER E-C LOOP (Left and Middle)                         */}
          {/* ========================================================= */}
          <path d="M 292,175 A 42,42 0 0,0 260,155 H 172 V 245 H 260 A 42,42 0 0,0 292,225" />

          {/* ========================================================= */}
          {/* MIDDLE BAR OF "E"                                         */}
          {/* ========================================================= */}
          <path d="M 130,200 H 215" />

          {/* ========================================================= */}
          {/* OUTER "S" LOOP (Right)                                    */}
          {/* ========================================================= */}
          <path d="M 445,130 C 445,110 425,120 405,120 H 375 C 345,120 345,150 345,165 C 345,190 380,195 405,200 C 435,205 445,215 445,240 C 445,270 425,280 400,280 H 360 C 340,280 340,265 340,255" />

          {/* ========================================================= */}
          {/* INNER "S" LOOP (Right)                                    */}
          {/* ========================================================= */}
          <path d="M 410,165 C 410,155 400,155 390,155 H 375 C 365,155 365,165 365,170 C 365,180 380,185 395,188 C 415,192 420,198 420,215 C 420,225 410,235 395,235 H 380 C 370,235 370,225 370,220" />
        </g>

        {/* ========================================================= */}
        {/* ECS SYSTEMS Brand Typography below the monogram           */}
        {/* ========================================================= */}
        <text
          x="300"
          y="375"
          fill={brandColor}
          fontSize="38"
          fontWeight="800"
          textAnchor="middle"
          fontFamily="Inter, system-ui, -apple-system, sans-serif"
          style={{ letterSpacing: '0.25em' }}
        >
          ECS SYSTEMS
        </text>
      </svg>
    </div>
  );
}
