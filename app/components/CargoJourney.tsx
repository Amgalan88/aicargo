// Ачааны бодит аялал — нэг 14 секундын CSS циклээр:
// Хятадын дэлгүүрүүд → Эрээнд баглах → машинаар хил давах → УБ-д буулгаж системд орох → хэрэглэгч авах.
// Бүх хөдөлгөөн CSS keyframe (globals.css .cj-*) тул доорх алхмын тайлбартай яг зэрэгцэнэ.
// prefers-reduced-motion үед хөдөлгөөнгүй, бүрэн зураг харагдана.

const STEPS = [
  'Хятадаас Эрээнд ирнэ',
  'Эрээнд ангилж, баглана',
  'Машинаар Монгол руу',
  'УБ-д буулгаж, системд бүртгэнэ',
  'Хэрэглэгч вэбээс хараад авна',
]

function Parcel({ cls }: { cls: string }) {
  return (
    <g className={`cj-parcel ${cls}`}>
      <rect x="-10" y="-9" width="20" height="18" rx="2.5" className="cj-box" />
      <path d="M-10 -2 H10 M0 -9 V-2" className="cj-tape" />
    </g>
  )
}

function Shop({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="12" width="56" height="36" rx="4" className="cj-wall" />
      <path d="M-3 13 L59 13 L54 0 L2 0 Z" className="cj-awning" />
      <path d="M11 0 L9 13 M23 0 L22 13 M34 0 L35 13 M45 0 L47 13" className="cj-awning-line" />
      <rect x="21" y="27" width="14" height="21" rx="1.5" className="cj-door" />
    </g>
  )
}

export default function CargoJourney() {
  return (
    <div className="cj" aria-hidden>
      <svg viewBox="0 0 1000 250" className="cj-svg">
        {/* Газар, зам */}
        <path d="M150 207 H995" className="cj-ground" />
        <path d="M320 216 H760" className="cj-road" />

        {/* ── Хятадын дэлгүүрүүд ── */}
        <Shop x={30} y={24} />
        <Shop x={30} y={90} />
        <Shop x={30} y={156} />
        <path d="M92 48 Q160 60 212 176 M92 114 Q160 118 212 180 M92 180 Q150 188 212 184" className="cj-trail" />
        <Parcel cls="cj-p1" />
        <Parcel cls="cj-p2" />
        <Parcel cls="cj-p3" />

        {/* ── Эрээн агуулах ── */}
        <g>
          <rect x="200" y="130" width="110" height="77" rx="3" className="cj-wall cj-wh" />
          <path d="M191 133 L255 94 L319 133 Z" className="cj-roof" />
          <rect x="236" y="160" width="38" height="47" rx="2" className="cj-door cj-door-ereen" />
          <path d="M236 168 H274 M236 176 H274 M236 184 H274 M236 192 H274 M236 200 H274" className="cj-door-lines" />
        </g>
        <circle cx="255" cy="184" r="10" className="cj-pulse" />
        <g className="cj-bundle">
          <rect x="-17" y="-14" width="34" height="28" rx="5" className="cj-sack" />
          <path d="M-17 0 H17 M0 -14 V14" className="cj-strap" />
        </g>

        {/* ── Хил ── */}
        <path d="M520 118 V207" className="cj-border" />
        <path d="M520 104 V124 M520 104 L540 110 L520 116" className="cj-flag" />

        {/* ── Ачааны машин ── */}
        <g className="cj-truck">
          <g className="cj-truck-body">
            <rect x="322" y="142" width="92" height="52" rx="4" className="cj-container" />
            <text x="368" y="186" className="cj-truck-logo">AiCargo</text>
            <g className="cj-load">
              <rect x="332" y="148" width="14" height="12" rx="2" className="cj-box" />
              <rect x="349" y="148" width="14" height="12" rx="2" className="cj-box" />
              <rect x="386" y="148" width="14" height="12" rx="2" className="cj-box" />
            </g>
            <path d="M416 160 H436 Q446 160 450 172 L452 194 H416 Z" className="cj-cab" />
            <path d="M421 165 H434 Q441 165 444 176 H421 Z" className="cj-window" />
          </g>
          {[344, 394, 436].map(cx => (
            <g key={cx} className="cj-wheel" style={{ transformOrigin: `${cx}px 198px` }}>
              <circle cx={cx} cy="198" r="9" className="cj-tyre" />
              <path d={`M${cx - 5} 198 H${cx + 5} M${cx} 193 V203`} className="cj-hub" />
            </g>
          ))}
        </g>

        {/* Буулгах ачаа */}
        <Parcel cls="cj-unload" />

        {/* ── УБ агуулах ── */}
        <g>
          <rect x="760" y="130" width="100" height="77" rx="3" className="cj-wall cj-wh" />
          <path d="M751 133 L810 96 L869 133 Z" className="cj-roof" />
          <rect x="792" y="160" width="36" height="47" rx="2" className="cj-door cj-door-ub" />
          <path d="M792 168 H828 M792 176 H828 M792 184 H828 M792 192 H828 M792 200 H828" className="cj-door-lines" />
        </g>

        {/* ── Систем → утас ── */}
        <path d="M812 96 Q845 30 886 58" className="cj-signal" />
        <g className="cj-notif">
          <rect x="770" y="6" width="104" height="26" rx="13" className="cj-notif-bg" />
          <circle cx="785" cy="19" r="7" className="cj-notif-dot" />
          <path d="M781.5 19 L784 21.5 L788.5 16.5" className="cj-notif-check" />
          <text x="798" y="23" className="cj-notif-text">Ачаа ирлээ!</text>
        </g>
        <g transform="translate(888 22)">
          <rect x="0" y="0" width="62" height="112" rx="12" className="cj-phone" />
          <rect x="22" y="5" width="18" height="4" rx="2" className="cj-notch" />
          <text x="8" y="25" className="cj-phone-title">Миний ачаа</text>
          <rect x="6" y="32" width="50" height="40" rx="6" className="cj-card" />
          <rect x="11" y="39" width="30" height="4" rx="2" className="cj-line" />
          <g className="cj-pill-wait">
            <rect x="11" y="51" width="36" height="14" rx="7" className="cj-pill-w" />
            <text x="29" y="61" className="cj-pill-t cj-pill-tw">Замд</text>
          </g>
          <g className="cj-pill-ok">
            <rect x="11" y="51" width="40" height="14" rx="7" className="cj-pill-g" />
            <text x="31" y="61" className="cj-pill-t cj-pill-tg">Ирсэн ✓</text>
          </g>
          <rect x="6" y="78" width="50" height="26" rx="6" className="cj-card cj-card-dim" />
        </g>

        {/* ── Хэрэглэгч ── */}
        <g className="cj-person">
          <circle cx="0" cy="162" r="9" className="cj-head" />
          <path d="M-12 207 V186 a12 12 0 0 1 24 0 V207 Z" className="cj-body" />
          <g className="cj-carry">
            <rect x="-9" y="178" width="18" height="15" rx="2" className="cj-box" />
            <path d="M-9 184 H9" className="cj-tape" />
          </g>
        </g>

        {/* Шошгууд (утсанд нуугдана — доорх алхмууд хангалттай) */}
        <text x="58" y="240" className="cj-lbl">Хятад</text>
        <text x="255" y="240" className="cj-lbl">Эрээн</text>
        <text x="541" y="100" className="cj-lbl cj-lbl-sm">Хил</text>
        <text x="810" y="240" className="cj-lbl">Улаанбаатар</text>
        <text x="935" y="240" className="cj-lbl">Хэрэглэгч</text>
      </svg>

      <ol className="cj-steps">
        {STEPS.map((s, i) => (
          <li key={s} className={`cj-step cj-s${i + 1}`}><b>{i + 1}</b>{s}</li>
        ))}
      </ol>
      <div className="cj-progress"><span /></div>
    </div>
  )
}
