import { useEffect, useState } from 'react'

const startMeetingMessage = 'No recording was started. This action is ready for the recorder.'

export default function useStartMeetingNotice() {
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    if (!notice) return undefined

    const timer = window.setTimeout(() => setNotice(null), 4200)
    return () => window.clearTimeout(timer)
  }, [notice])

  function startMeeting() {
    setNotice({ id: Date.now(), message: startMeetingMessage })
  }

  function dismissNotice() {
    setNotice(null)
  }

  return { notice, startMeeting, dismissNotice }
}
