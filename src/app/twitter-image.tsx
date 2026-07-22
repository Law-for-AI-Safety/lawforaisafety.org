import { size, renderShareImage } from './og-image'

export const alt = 'Law for AI Safety'
export { size }
export const contentType = 'image/png'
export const dynamic = 'force-static'

export default function Image() {
  return renderShareImage()
}
