import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const size = {
  width: 1200,
  height: 630,
}

export async function renderShareImage() {
  const [teamData, logoData, fontData] = await Promise.all([
    readFile(join(process.cwd(), 'src/app/og-assets/team-group.png'), 'base64'),
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
          src={`data:image/png;base64,${teamData}`}
          width={size.width}
          height={size.height}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          alt=""
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            background:
              'linear-gradient(180deg, rgba(155,28,31,0) 42%, rgba(155,28,31,1) 66%, rgba(155,28,31,1) 100%)',
          }}
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
            width={300}
            height={139}
            style={{ objectFit: 'contain', flexShrink: 0 }}
            alt=""
          />
          <div
            style={{
              display: 'flex',
              fontFamily: 'Cormorant Garamond',
              fontSize: 30,
              lineHeight: 1.35,
              color: '#f3f0ec',
              maxWidth: 460,
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
