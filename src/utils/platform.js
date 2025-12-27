/**
 * Platform detection utilities
 */

// Detect the operating system
export function getOS() {
  const platform = window.navigator.platform.toLowerCase();
  const userAgent = window.navigator.userAgent.toLowerCase();

  if (platform.includes('mac') || userAgent.includes('mac')) {
    return 'macos';
  } else if (platform.includes('linux') || userAgent.includes('linux')) {
    return 'linux';
  } else if (platform.includes('win') || userAgent.includes('win')) {
    return 'windows';
  }
  
  return 'unknown';
}

export function isMac() {
  return getOS() === 'macos';
}

export function isLinux() {
  return getOS() === 'linux';
}

export function isWindows() {
  return getOS() === 'windows';
}

// Get platform-specific info
export function getPlatformInfo() {
  const os = getOS();
  
  return {
    os,
    isMac: os === 'macos',
    isLinux: os === 'linux',
    isWindows: os === 'windows',
    supportsPipx: os === 'macos' || os === 'linux',
    pipxInstallMethod: os === 'macos' ? 'brew' : 'apt',
  };
}
