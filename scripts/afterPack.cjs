/**
 * electron-builder afterPack hook
 * Ensures node-pty native bindings are properly included
 */
module.exports = async function(context) {
  const { electronPlatformName, appOutDir } = context;
  
  console.log(`[AfterPack] Platform: ${electronPlatformName}`);
  console.log(`[AfterPack] Output directory: ${appOutDir}`);
  
  // node-pty binaries are already handled by asarUnpack config
  // This hook can be extended for additional post-build tasks
  
  return Promise.resolve();
};
