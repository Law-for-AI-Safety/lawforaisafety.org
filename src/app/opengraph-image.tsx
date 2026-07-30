import { size, renderShareImage } from './og-image'

export const alt =
  'Law for AI Safety founding team at the European Parliament, with the tagline: Bringing together legal professionals to address large-scale AI risks and advance AI safety.'
export { size }
export const contentType = 'image/png'
export const dynamic = 'force-static'

export default function Image() {
  return renderShareImage()
}
