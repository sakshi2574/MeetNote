export function speakerMark(speaker) {
  const label = typeof speaker === 'string' ? speaker.trim() : ''
  const numbered = /^Speaker\s+(\d+)$/i.exec(label)
  if (numbered) return numbered[1]
  if (!label) return '?'
  return label.slice(0, 1).toUpperCase()
}
