/**
 * Keeps the toolbar badge showing how many things are due in the next 48
 * hours. Read-only: it only ever GETs from the UStudy server.
 */
const DEFAULT_SERVER = 'http://localhost:3000';

async function refreshBadge() {
  const { server = DEFAULT_SERVER } = await chrome.storage.local.get('server');
  try {
    const responses = await Promise.all(
      ['not_started', 'in_progress'].map((s) => fetch(`${server}/api/assignments?status=${s}`, { credentials: 'include' })),
    );
    if (responses.some((r) => !r.ok)) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }
    const lists = await Promise.all(responses.map((r) => r.json()));
    const soon = lists
      .flatMap((l) => l.assignments)
      .filter((a) => new Date(a.dueAt) - Date.now() < 48 * 3_600_000).length;
    await chrome.action.setBadgeBackgroundColor({ color: '#3d6b37' });
    await chrome.action.setBadgeText({ text: soon ? String(soon) : '' });
  } catch {
    await chrome.action.setBadgeText({ text: '' });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('badge', { periodInMinutes: 30 });
  refreshBadge();
});
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'badge') refreshBadge();
});
