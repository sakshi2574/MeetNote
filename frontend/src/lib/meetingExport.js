export const EXPORT_FORMATS = [
  { id: 'pdf', label: 'PDF', description: 'Formatted report for sharing or printing' },
  { id: 'docx', label: 'Word (DOCX)', description: 'Editable document' },
  { id: 'txt', label: 'Plain text (TXT)', description: 'Simple text file' },
  { id: 'json', label: 'JSON', description: 'Structured data with IDs and timestamps' },
]

export const EXPORT_SECTIONS = [
  { id: 'details', label: 'Meeting details' },
  { id: 'summary', label: 'Summary and key points' },
  { id: 'transcript', label: 'Full transcript' },
  { id: 'action_items', label: 'Action items' },
  { id: 'decisions', label: 'Decisions' },
]

export function defaultExportSections() {
  return Object.fromEntries(EXPORT_SECTIONS.map((section) => [section.id, true]))
}

export function hasSelectedSection(sections) {
  return EXPORT_SECTIONS.some((section) => sections[section.id])
}

export function exportParams(format, sections) {
  const params = { format }
  for (const section of EXPORT_SECTIONS) {
    params[section.id] = Boolean(sections[section.id])
  }
  return params
}

// Prefers the RFC 5987 UTF-8 name, then the plain quoted name.
export function filenameFromDisposition(header) {
  if (!header) return ''

  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)
  if (encoded) {
    try {
      return safeFilename(decodeURIComponent(encoded[1].trim()))
    } catch {
      // Malformed encoding; fall through to the plain name.
    }
  }

  const plain = /filename\s*=\s*"([^"]*)"/i.exec(header) ?? /filename\s*=\s*([^;]+)/i.exec(header)
  return plain ? safeFilename(plain[1].trim()) : ''
}

export function fallbackExportFilename(title, format) {
  const stem = String(title ?? '')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80)
  return `${stem || 'meeting'}.${format}`
}

function safeFilename(name) {
  const printable = Array.from(name, (char) => (char.charCodeAt(0) < 32 ? ' ' : char)).join('')
  return printable.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

export async function exportErrorMessage(error) {
  const status = error?.response?.status
  if (status === 401) return 'Your session has expired. Sign in again to export.'
  if (status === 404) return 'This meeting could not be found. It may have been deleted.'
  if (!error?.response) return 'Unable to reach the MeetNote API. Check that it is running, then try again.'

  const detail = await readErrorDetail(error.response.data)
  if (status === 422 && detail) return detail
  return 'The export could not be created. Try again.'
}

async function readErrorDetail(data) {
  try {
    const text = typeof data?.text === 'function' ? await data.text() : null
    const parsed = text ? JSON.parse(text) : data
    return typeof parsed?.detail === 'string' ? parsed.detail : ''
  } catch {
    return ''
  }
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  try {
    link.click()
  } finally {
    link.remove()
    // Revoking immediately can cancel the download in some browsers.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
