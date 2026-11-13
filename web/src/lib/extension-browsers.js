export const BROWSER_IDS = ['chrome', 'edge', 'brave', 'opera', 'opera-gx'];

export const DOWNLOADS = {
  chromium: '/downloads/ustudy-extension.zip'
};

function chromiumSteps({ extensionsUrl, developerMode, pin }) {
  return [
    { title: 'Unzip the extension', body: 'In your Downloads folder, right-click ustudy-extension.zip and choose Extract All. Keep the extracted folder somewhere safe: the browser runs the extension from that folder.' },
    { title: 'Open the extensions page', body: `Type ${extensionsUrl} into your address bar and press Enter.` },
    { title: 'Turn on Developer mode', body: developerMode },
    { title: 'Load and pin the extension', body: `Click Load unpacked and choose the folder you extracted (the one that contains manifest.json). Then pin UStudy so it stays visible using ${pin}.` }
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

export function detectBrowser({ userAgent = '', brands = [], hasBraveApi = false, mobile = false } = {}) {
  // Check for mobile devices first - they can't load extensions this way
  if (mobile || userAgent.includes('Android') || userAgent.includes('Mobile') || userAgent.includes('iPhone') || userAgent.includes('iPad')) {
    return null;
  }

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

export function guideUrl(id) {
  return '/extension-guide.html?browser=' + id;
}

export function browserFromQuery(search, fallback) {
  const params = new URLSearchParams(search);
  const browser = params.get('browser');

  if (browser && BROWSER_IDS.includes(browser)) {
    return browser;
  }

  return fallback;
}
