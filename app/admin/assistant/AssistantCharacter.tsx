'use client'
// Админы туслахын дүр: чихэвчтэй саваа хүн. Төлөвийг data-s-ээр сольж, хөдөлгөөнийг globals.css (.asst-av) хийнэ.
import { useEffect, useRef } from 'react'

export type AssistantPose = 'idle' | 'hello' | 'listen' | 'think' | 'talk' | 'warn' | 'happy' | 'sleep'

const I = 'var(--text)'      // бие
const F = '#1c1917'          // нүүр, толгойн хүрээ (толгой цагаан тул үргэлж бараан)
const A = 'var(--accent)'
const PAPER = '#fbfaf7'

export default function AssistantCharacter({ pose }: { pose: AssistantPose }) {
  // Анивчилт: тасралтгүй CSS хөдөлгөөн биш, ~5 сек тутамд нэг удаа (сул үед CPU зарцуулахгүй)
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    let off: ReturnType<typeof setTimeout> | undefined
    const id = setInterval(() => {
      const el = ref.current
      if (!el || document.hidden) return
      el.classList.add('blinking')
      off = setTimeout(() => el.classList.remove('blinking'), 300)
    }, 4800)
    return () => { clearInterval(id); clearTimeout(off) }
  }, [])
  return (
    <svg ref={ref} className="asst-av" data-s={pose} viewBox="0 0 160 215" aria-hidden="true">
      <defs>
        <filter id="asst-rough" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={7} />
          <feDisplacementMap in="SourceGraphic" scale={1.8} />
        </filter>
      </defs>
      <ellipse cx="80" cy="205" rx="30" ry="4" fill="var(--text)" opacity=".12" />
      <g className="fig">
        <g filter="url(#asst-rough)" fill="none" stroke={I} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M80 90 L80 150" />
          <path d="M80 150 L69 198" /><path d="M80 150 L91 198" />
        </g>
        <g fill={I}><ellipse cx="65" cy="200" rx="7.5" ry="3.6" /><ellipse cx="95" cy="200" rx="7.5" ry="3.6" /></g>

        <g filter="url(#asst-rough)">
          <path d="M73 91 L80 113 L87 91" fill="none" stroke={A} strokeWidth="2.2" strokeLinejoin="round" />
          <rect x="69" y="112" width="22" height="15" rx="3" fill={A} />
        </g>
        <text x="80" y="123" textAnchor="middle" fontFamily="inherit" fontWeight="800" fontSize="9.5" fill="#fff">AI</text>

        <g filter="url(#asst-rough)" fill="none" stroke={I} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
          <g data-p="idle hello listen think happy sleep"><path d="M80 106 L64 130 L60 150" /><circle cx="60" cy="151" r="4" fill={I} /></g>
          <g data-p="talk"><g className="gest l"><path d="M80 106 L62 124 L50 114" /><circle cx="49" cy="113" r="4" fill={I} /></g></g>
          <g data-p="warn"><path d="M80 106 L62 124 L76 138" /><circle cx="77" cy="139" r="4" fill={I} /></g>

          <g data-p="idle sleep"><path d="M80 106 L96 130 L100 150" /><circle cx="100" cy="151" r="4" fill={I} /></g>
          <g data-p="hello"><path d="M80 106 L106 100" /><g className="wv"><path d="M106 100 L124 80" /><circle cx="125" cy="78" r="4.5" fill={I} /></g></g>
          <g data-p="listen"><path d="M80 106 L108 108 L121 76" /><circle cx="122" cy="74" r="4.5" fill={I} /></g>
          <g data-p="think"><path d="M80 106 L104 116 L93 99" /><circle cx="92" cy="97" r="4.5" fill={I} /></g>
          <g data-p="talk"><g className="gest"><path d="M80 106 L100 124 L114 114" /><circle cx="115" cy="113" r="4" fill={I} /></g></g>
          <g data-p="warn"><path d="M80 106 L108 102 L124 88" /><rect x="120" y="71" width="13" height="17" rx="5.5" fill={I} stroke="none" transform="rotate(14 126 80)" /></g>
          <g data-p="happy"><path d="M80 106 L106 108 L117 92" /><circle cx="118" cy="89" r="5.5" fill={I} /><path d="M119 84 L120 75" strokeWidth="4" /></g>
        </g>

        <g filter="url(#asst-rough)" stroke={F} strokeLinejoin="round">
          <circle cx="80" cy="62" r="30" fill={PAPER} strokeWidth="3.5" />
          <path d="M44.2 66 A36 36 0 0 1 115.8 66" fill="none" strokeWidth="5" strokeLinecap="round" />
          <rect x="38" y="54" width="13" height="24" rx="6" fill={A} strokeWidth="2.5" />
          <rect x="109" y="54" width="13" height="24" rx="6" fill={A} strokeWidth="2.5" />
          <path d="M44 77 Q46 92 61 92" fill="none" strokeWidth="3" strokeLinecap="round" />
          <rect x="59" y="88" width="10" height="7.5" rx="3.7" fill={F} stroke="none" />
        </g>
        <circle className="led" cx="44.5" cy="59.5" r="2.3" />

        <g fill={A} opacity=".26"><ellipse cx="65" cy="71" rx="5.5" ry="3.2" /><ellipse cx="93" cy="71" rx="5.5" ry="3.2" /></g>
        <g stroke={F} strokeWidth="3" strokeLinecap="round" fill="none">
          <g data-p="idle hello listen talk happy sleep"><path d="M66 49 Q71 46 75 48" /><path d="M82 48 Q86 46 91 49" /></g>
          <g data-p="warn"><path d="M66 46.5 L75 51" /><path d="M91 46.5 L82 51" /></g>
          <g data-p="think"><path d="M66 50 Q71 48.5 75 50" /><path d="M82 46 Q86 42 91 45" /></g>
          <g data-p="happy"><path d="M68 61 Q72 56 76 61" /><path d="M82 61 Q86 56 90 61" /></g>
          <g data-p="sleep"><path d="M68 60 Q72 64 76 60" /><path d="M82 60 Q86 64 90 60" /></g>
        </g>
        <g data-p="idle hello listen think talk warn"><g className="look"><g className="blink" fill={F}><ellipse cx="72" cy="60" rx="3.6" ry="4.6" /><ellipse cx="86" cy="60" rx="3.6" ry="4.6" /></g></g></g>
        <g fill={F} stroke={F} strokeWidth="3.2" strokeLinecap="round">
          <path data-p="idle hello listen" d="M71 71 Q78 78.5 85 71" fill="none" />
          <path data-p="think" d="M74 74.5 Q78 72.5 83 75" fill="none" />
          <g data-p="talk"><ellipse className="mt" cx="78" cy="74" rx="5.5" ry="4.6" stroke="none" /></g>
          <path data-p="warn" d="M72 74 L84 74" fill="none" />
          <path data-p="happy" d="M70 70.5 Q78 83 86 70.5 Z" strokeWidth="2" strokeLinejoin="round" />
          <ellipse data-p="sleep" cx="79" cy="75" rx="2.6" ry="2.1" stroke="none" />
        </g>
      </g>

      <g data-p="listen" fill={A}><rect className="bar" x="20" y="58" width="4" height="16" rx="2" /><rect className="bar" x="27" y="54" width="4" height="24" rx="2" /><rect className="bar" x="34" y="60" width="4" height="12" rx="2" /></g>
      <g data-p="think" fill="var(--muted)"><circle className="dot" cx="38" cy="32" r="3" /><circle className="dot" cx="28" cy="21" r="4.3" /><circle className="dot" cx="16" cy="8" r="5.6" /></g>
      <g data-p="warn"><g className="wm"><circle cx="128" cy="30" r="13" fill={A} /><text x="128" y="37" textAnchor="middle" fontFamily="inherit" fontWeight="900" fontSize="20" fill="#fff">!</text></g></g>
      <g data-p="happy" fill="var(--green)">
        <path className="sp" d="M134 36 l2.5 6.5 6.5 2.5 -6.5 2.5 -2.5 6.5 -2.5 -6.5 -6.5 -2.5 6.5 -2.5z" />
        <path className="sp" d="M26 30 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
        <path className="sp" d="M120 12 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" />
      </g>
      <g data-p="sleep" fill="var(--muted)" fontFamily="inherit" fontWeight="900">
        <text className="zz" x="110" y="38" fontSize="14">z</text><text className="zz" x="121" y="24" fontSize="18">z</text><text className="zz" x="133" y="9" fontSize="23">Z</text>
      </g>
    </svg>
  )
}
