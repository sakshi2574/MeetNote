/**
 * Detects whether the current Google Meet tab is sitting in a live call.
 * Runs as a classic content script, so it cannot import the shared modules.
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

  function meetingCode() {
    const match = MEET_CODE_RE.exec(location.pathname);
    return match ? match[1].toLowerCase() : null;
  }

  function inCall() {
    return IN_CALL_SELECTORS.some((selector) => document.querySelector(selector) !== null);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'MEET_STATUS') return undefined;
    sendResponse({
      ok: true,
      isMeet: true,
      inCall: inCall(),
      meetingCode: meetingCode(),
      title: document.title
    });
    return undefined;
  });
})();
