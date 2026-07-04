import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// Default фонт кирилл дэмждэггүй тул Open Sans-ийг өөрсдөө хавсаргана
const fontPromise = fetch(new URL('./OpenSans-Bold.ttf', import.meta.url)).then(r => r.arrayBuffer())

export async function GET(req: NextRequest) {
  const title = (req.nextUrl.searchParams.get('title') ?? 'Карго бизнесээ 5 минутад онлайн болго').slice(0, 60)
  const sub = (req.nextUrl.searchParams.get('sub') ?? 'aicargo.mn · Эхний 30 хоног үнэгүй').slice(0, 80)
  const fontData = await fontPromise

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#f5f4ef',
          fontFamily: 'Open Sans',
        }}
      >
        {/* Дээд accent зурвас */}
        <div style={{ height: 14, width: '100%', background: '#c96442', display: 'flex' }} />

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 90px',
          }}
        >
          {/* Лого мөр */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 42 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: '#c96442',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 30,
                fontWeight: 800,
              }}
            >
              Ai
            </div>
            <div style={{ fontSize: 34, fontWeight: 800, color: '#1c1917', display: 'flex' }}>cargohub</div>
          </div>

          {/* Гарчиг */}
          <div
            style={{
              fontSize: 68,
              fontWeight: 800,
              color: '#1c1917',
              lineHeight: 1.15,
              letterSpacing: '-2px',
              display: 'flex',
              maxWidth: 980,
            }}
          >
            {title}
          </div>

          {/* Доод мөр */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 42 }}>
            <div
              style={{
                background: '#fdf0eb',
                border: '2px solid #c96442',
                color: '#c96442',
                borderRadius: 100,
                padding: '10px 28px',
                fontSize: 28,
                fontWeight: 700,
                display: 'flex',
              }}
            >
              {sub}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: 'Open Sans', data: fontData, weight: 700, style: 'normal' }],
    }
  )
}
