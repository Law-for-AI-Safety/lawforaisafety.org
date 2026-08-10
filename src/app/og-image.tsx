import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const size = {
  width: 1200,
  height: 630,
}

export async function renderShareImage() {
  const [logomarkData, logoData, fontData] = await Promise.all([
    readFile(join(process.cwd(), 'src/app/og-assets/logomark-white.png'), 'base64'),
    readFile(join(process.cwd(), 'src/app/og-assets/logo-white.png'), 'base64'),
    readFile(join(process.cwd(), 'src/app/og-assets/cormorant-garamond-subset.ttf')),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: '#9b1c1f',
        }}
      >
        <img
          src={`data:image/png;base64,${logomarkData}`}
          width={730}
          height={1000}
          style={{
            position: 'absolute',
            top: -140,
            right: -120,
            opacity: 0.1,
            objectFit: 'contain',
          }}
          alt=""
        />
        <div
          style={{
            position: 'absolute',
            left: 64,
            right: 64,
            bottom: 44,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 100,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${logoData}`}
            width={430}
            height={199}
            style={{ objectFit: 'contain', flexShrink: 0 }}
            alt=""
          />
          <div
            style={{
              display: 'flex',
              fontFamily: 'Cormorant Garamond',
              fontSize: 43,
              lineHeight: 1.35,
              color: '#f3f0ec',
              maxWidth: 560,
            }}
          >
            Building the legal foundations for safe artificial intelligence.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Cormorant Garamond',
          data: fontData,
          style: 'normal',
          weight: 400,
        },
      ],
    }
  )
}
