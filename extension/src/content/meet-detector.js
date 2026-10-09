/**
 * Detects whether the current Google Meet tab is in a live call, and whether
 * the local microphone control is on. Runs as a classic content script, so it
 * cannot import the shared modules.
 *
 * Meet's mute button is separate from Chrome's microphone permission. The
 * button label says what the click will do: "Turn off microphone" means the
 * mic is currently on.
 */
(() => {
  const MEET_CODE_RE = /^\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?:$|[/?#])/i;
  const IN_CALL_SELECTORS = [
    '[aria-label*="Leave call" i]',
    '[aria-label*="End call" i]',
    '[data-tooltip*="Leave call" i]',
    '[aria-label*="Turn off microphone" i]',
    '[aria-label*="Turn on microphone" i]'
  ];
  const MIC_POLL_MS = 1000;

  /** @type {boolean | undefined} */
  let lastMic;
  /** @type {boolean | undefined} */
  let lastPresenting;
  /** @type {number} */
  let publishTimer = 0;

  function meetingCode() {
    const match = MEET_CODE_RE.exec(location.pathname);
    return match ? match[1].toLowerCase() : null;
  }

  function inCall() {
    return IN_CALL_SELECTORS.some((selector) => document.querySelector(selector) !== null);
  }

  function labelOf(element) {
    return `${element.getAttribute('aria-label') || ''} ${element.getAttribute('data-tooltip') || ''}`.toLowerCase();
  }

  function isMicToggle(element) {
    const label = labelOf(element);
    return (
      label.includes('turn off microphone') ||
      label.includes('turn on microphone') ||
      label.includes('mute microphone') ||
      label.includes('unmute microphone')
    );
  }

  /** @param {Element} element */
  function micEnabledFrom(element) {
    const label = labelOf(element);
    if (label.includes('turn on microphone') || label.includes('unmute microphone')) return false;
    if (label.includes('turn off microphone') || label.includes('mute microphone')) return true;
    const muted = element.getAttribute('data-is-muted');
    if (muted === 'true') return false;
    if (muted === 'false') return true;
    return null;
  }

  function controlRoot() {
    return (
      document.querySelector('[aria-label="Call controls" i]') ||
      document.querySelector('[aria-label="Meeting controls" i]') ||
      document.body
    );
  }

  /**
   * Local Meet microphone. True when Meet is listening, false when Meet is muted.
   * @returns {boolean | null}
   */
  function readMicEnabled() {
    const root = controlRoot();
    const toggles = [...root.querySelectorAll('button, [role="button"]')].filter(isMicToggle);
    const visible = toggles.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const chosen = visible.length ? visible : toggles;
    if (chosen.length) {
      const states = chosen.map(micEnabledFrom).filter((state) => state !== null);
      if (states.length && states.every((state) => state === states[0])) return states[0];
      if (states.length) return states[states.length - 1];
    }
    return null;
  }

  const PRESENT_END_GRACE_MS = 2000;
  /** @type {number} */
  let presentingAbsentSince = 0;

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0;
  }

  function isLocalPresentingLabel(label) {
    if (!label) return false;
    return (
      label.includes('stop presenting') ||
      label.includes('stop sharing') ||
      label.includes('you are presenting') ||
      label.includes("you're presenting") ||
      label.includes('you’re presenting')
    );
  }

  /**
   * True only while the local user is presenting. A remote "someone is presenting"
   * banner does not match the local Stop presenting control.
   * @returns {boolean}
   */
  function readLocalPresenting() {
    const labelled = document.querySelectorAll('[aria-label], [data-tooltip]');
    for (const element of labelled) {
      if (isLocalPresentingLabel(labelOf(element)) && isVisible(element)) return true;
    }
    const controls = document.querySelectorAll('button, [role="button"]');
    for (const element of controls) {
      const text = (element.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (isLocalPresentingLabel(text) && isVisible(element)) return true;
    }
    return false;
  }

  function publishMic() {
    const micEnabled = readMicEnabled();
    if (typeof micEnabled !== 'boolean' || micEnabled === lastMic) return;
    lastMic = micEnabled;
    chrome.runtime.sendMessage({ type: 'MIC_STATE', target: 'background', micEnabled }).catch(() => {});
  }

  function publishPresenting() {
    const localPresenting = readLocalPresenting();
    if (localPresenting) {
      presentingAbsentSince = 0;
      if (lastPresenting === true) return;
      lastPresenting = true;
      console.log('[MeetDetector] LOCAL_PRESENTATION_STARTED');
      chrome.runtime.sendMessage({ type: 'PRESENT_STATE', target: 'background', localPresenting: true }).catch(() => {});
      return;
    }
    if (lastPresenting !== true) return;
    const now = Date.now();
    if (!presentingAbsentSince) presentingAbsentSince = now;
    // Meet rebuilds the toolbar while the picker is open. One missed read must not
    // cancel the display capture and leave the canvas on the Meet tab.
    if (now - presentingAbsentSince < PRESENT_END_GRACE_MS) return;
    presentingAbsentSince = 0;
    lastPresenting = false;
    console.log('[MeetDetector] LOCAL_PRESENTATION_STOPPED');
    chrome.runtime.sendMessage({ type: 'PRESENT_STATE', target: 'background', localPresenting: false }).catch(() => {});
  }

  function publishSignals() {
    publishMic();
    publishPresenting();
  }

  function schedulePublish() {
    if (publishTimer) return;
    publishTimer = setTimeout(() => {
      publishTimer = 0;
      publishSignals();
    }, 200);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'MEET_STATUS') return undefined;
    sendResponse({
      ok: true,
      isMeet: true,
      inCall: inCall(),
      meetingCode: meetingCode(),
      title: document.title,
      micEnabled: readMicEnabled(),
      localPresenting: readLocalPresenting()
    });
    return undefined;
  });

  const observer = new MutationObserver(schedulePublish);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-label', 'data-tooltip', 'data-is-muted']
  });
  setInterval(publishSignals, MIC_POLL_MS);
  publishSignals();
})();
