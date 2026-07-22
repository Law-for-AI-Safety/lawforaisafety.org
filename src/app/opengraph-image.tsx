import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const alt = 'Law for AI Safety'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'
export const dynamic = 'force-static'

export default async function Image() {
  const [teamData, logoData, fontData] = await Promise.all([
    readFile(join(process.cwd(), 'src/app/og-assets/team-group.png'), 'base64'),
    readFile(join(process.cwd(), 'src/app/og-assets/logo-original.png'), 'base64'),
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
          background: '#1b334c',
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
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            background:
              'linear-gradient(180deg, rgba(243,240,236,0) 42%, rgba(243,240,236,1) 66%, rgba(243,240,236,1) 100%)',
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
            gap: 40,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${logoData}`}
            width={300}
            height={139}
            style={{ objectFit: 'contain', flexShrink: 0 }}
          />
          <div
            style={{
              display: 'flex',
              fontFamily: 'Cormorant Garamond',
              fontSize: 30,
              lineHeight: 1.35,
              color: '#16161d',
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
