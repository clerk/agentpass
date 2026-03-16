import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const fontMedium = readFileSync(join(__dirname, 'fonts', 'Inter-Medium.ttf'))
const fontBold = readFileSync(join(__dirname, 'fonts', 'Inter-Bold.ttf'))

// Read the SVG icon (black fill works on light background)
const svgIcon = readFileSync(join(__dirname, '..', 'public', 'AgentPass.svg'), 'utf-8')
const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svgIcon).toString('base64')}`

async function main() {
  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          backgroundColor: '#f5f5f5',
          padding: '80px',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginBottom: '40px',
              },
              children: [
                {
                  type: 'img',
                  props: {
                    src: svgDataUri,
                    width: 64,
                    height: 48,
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: 32,
                      fontWeight: 700,
                      color: '#0a0a0a',
                      letterSpacing: '-0.02em',
                    },
                    children: 'AgentPass',
                  },
                },
              ],
            },
          },
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                fontSize: 56,
                fontWeight: 700,
                color: '#0a0a0a',
                lineHeight: 1.2,
                letterSpacing: '-0.03em',
                marginBottom: '24px',
              },
              children: [
                { type: 'div', props: { children: 'An open protocol for' } },
                { type: 'div', props: { children: 'agent authorization' } },
              ],
            },
          },
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexWrap: 'wrap',
                fontSize: 24,
                color: '#737373',
                lineHeight: 1.5,
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', flexWrap: 'wrap' },
                    children: [
                      { type: 'span', props: { children: 'A\u00a0' } },
                      { type: 'span', props: { style: { fontWeight: 700, color: '#0a0a0a' }, children: 'Harness' } },
                      { type: 'span', props: { children: '\u00a0obtains an\u00a0' } },
                      { type: 'span', props: { style: { fontWeight: 700, color: '#0a0a0a' }, children: 'AgentPass' } },
                      { type: 'span', props: { children: '\u00a0from an\u00a0' } },
                      { type: 'span', props: { style: { fontWeight: 700, color: '#0a0a0a' }, children: 'Authority' } },
                      { type: 'span', props: { children: ', then presents it to a\u00a0' } },
                      { type: 'span', props: { style: { fontWeight: 700, color: '#0a0a0a' }, children: 'Service' } },
                      { type: 'span', props: { children: '\u00a0to' } },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    children: 'redeem a minimally-scoped browser session or bearer token.',
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Inter',
          data: fontMedium,
          weight: 400,
          style: 'normal',
        },
        {
          name: 'Inter',
          data: fontBold,
          weight: 700,
          style: 'normal',
        },
      ],
    },
  )

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
  })
  const pngData = resvg.render()
  const pngBuffer = pngData.asPng()

  const outPath = join(__dirname, '..', 'public', 'og.png')
  writeFileSync(outPath, pngBuffer)
  console.log(`Generated OG image at ${outPath} (${pngBuffer.length} bytes)`)
}

main().catch(console.error)
