import { size, renderShareImage } from './og-image'

export const alt =
  'Law for AI Safety founding team at the European Parliament, with the tagline: Building the legal foundations for safe artificial intelligence.'
export { size }
export const contentType = 'image/png'
export const dynamic = 'force-static'

export default function Image() {
  return renderShareImage()
}
