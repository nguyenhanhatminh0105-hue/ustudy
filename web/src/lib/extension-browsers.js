export const BROWSER_IDS = ['chrome', 'edge', 'brave', 'opera', 'opera-gx'];

export const DOWNLOADS = {
  chromium: '/downloads/ustudy-extension.zip'
};

function chromiumSteps({ extensionsUrl, developerMode, pin }) {
  return [
    {
      title: 'Unzip it',
      body: "On Windows, right-click ustudy-extension.zip in your Downloads folder and choose Extract All. On a Mac, double-click it. Then move the ustudy-extension folder into Documents, so it isn't cleaned up with your downloads: your browser runs UStudy Garden from that folder.",
    },
    { title: 'Open your extensions page', body: 'Paste this into the address bar and press Enter:', copy: extensionsUrl },
    {
      title: 'Turn on Developer mode',
      body: developerMode,
      note: "Developer mode only lets your browser run extensions that aren't from its store. It doesn't change anything else. Your browser may remind you it's on; that's normal. If you turn it off later, UStudy Garden switches off too.",
    },
    { title: 'Load it and pin it', body: `Click Load unpacked and choose the ustudy-extension folder in Documents. Then pin UStudy Garden so it stays in view, using ${pin}.` },
  ];
}

export const BROWSERS = {
  chrome: {
    name: 'Google Chrome',
    download: 'chromium',
    extensionsUrl: 'chrome://extensions',
    steps: chromiumSteps({
      extensionsUrl: 'chrome://extensions',
      developerMode: 'Click the Developer mode switch in the top right corner.',
      pin: 'the puzzle-piece icon next to the address bar'
    })
  },
  edge: {
    name: 'Microsoft Edge',
    download: 'chromium',
    extensionsUrl: 'edge://extensions',
    steps: chromiumSteps({
      extensionsUrl: 'edge://extensions',
      developerMode: 'In Edge, Developer mode is a switch in the left-hand panel. On narrow windows, open the menu at the top left first.',
      pin: 'the puzzle-piece icon next to the address bar'
    })
  },
  brave: {
    name: 'Brave',
    download: 'chromium',
    extensionsUrl: 'brave://extensions',
    steps: chromiumSteps({
      extensionsUrl: 'brave://extensions',
      developerMode: 'Click the Developer mode switch in the top right corner.',
      pin: 'the puzzle-piece icon next to the address bar'
    })
  },
  opera: {
    name: 'Opera',
    download: 'chromium',
    extensionsUrl: 'opera://extensions',
    steps: chromiumSteps({
      extensionsUrl: 'opera://extensions',
      developerMode: 'Click the Developer mode switch in the top right corner.',
      pin: 'the cube icon at the right of the address bar'
    })
  },
  'opera-gx': {
    name: 'Opera GX',
    download: 'chromium',
    extensionsUrl: 'opera://extensions',
    steps: chromiumSteps({
      extensionsUrl: 'opera://extensions',
      developerMode: 'Click the Developer mode switch in the top right corner.',
      pin: 'the cube icon at the right of the address bar'
    })
  }
};

/** Phones and tablets can't install extensions this way. */
export function isPhone({ userAgent = '', mobile = false } = {}) {
  return Boolean(mobile) || /Android|Mobile|iPhone|iPad/.test(userAgent);
}

export function detectBrowser({ userAgent = '', brands = [], hasBraveApi = false, mobile = false } = {}) {
  if (isPhone({ userAgent, mobile })) return null;

  // Firefox is not supported (return null)
  if (userAgent.includes('Firefox/') && !userAgent.includes('FxiOS')) {
    return null;
  }

  // Check for Opera GX (brands must include 'Opera GX')
  if (brands.includes('Opera GX')) {
    return 'opera-gx';
  }

  // Check for Opera (brands or OPR/ in UA)
  if (brands.includes('Opera') || userAgent.includes('OPR/')) {
    return 'opera';
  }

  // Check for Edge (brands or Edg/ in UA)
  if (brands.includes('Microsoft Edge') || userAgent.includes('Edg/')) {
    return 'edge';
  }

  // Check for Brave (brands or hasBraveApi)
  if (brands.includes('Brave') || hasBraveApi) {
    return 'brave';
  }

  // Check for Chrome (brands or Chrome/ in UA, but not CriOS on iPhone)
  if ((brands.includes('Google Chrome') || userAgent.includes('Chrome/')) && !userAgent.includes('CriOS')) {
    return 'chrome';
  }

  // Unsupported browser
  return null;
}

export function guideUrl(id, { downloaded = false } = {}) {
  return `/extension-guide.html?browser=${id}${downloaded ? '&downloaded=1' : ''}`;
}

export function browserFromQuery(search, fallback) {
  const params = new URLSearchParams(search);
  const browser = params.get('browser');

  if (browser && BROWSER_IDS.includes(browser)) {
    return browser;
  }

  return fallback;
}
