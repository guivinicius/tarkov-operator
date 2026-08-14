// Screen capture module for the Electron app.
//
// Uses Electron's desktopCapturer API to fetch screen sources,
// locate the correct display (or fall back to the primary screen),
// and generate a base64 JPEG thumbnail of the display. Also provides
// a check to ensure the target game window is active before capturing.

const { desktopCapturer } = require('electron');
const logger = require('./logger');

async function captureScreen(displayId) {
  try {
    // Game window validation
    const windowSources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 1, height: 1 }
    });

    const isTarkovOpen = windowSources.some(source => {
      const name = source.name.toLowerCase();
      return name.includes('escapefromtarkov');
    });

    if (!isTarkovOpen) {
      logger.info('[screenshot] Game not detected, skipping');
      return null;
    }

    // Capture the screen
    const screenSources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 }
    });

    if (screenSources.length === 0) {
      logger.error('[screenshot] No screen sources found');
      return null;
    }

    let targetSource = null;
    if (displayId) {
      targetSource = screenSources.find(source => source.display_id === displayId);
    }
    
    if (!targetSource) {
      targetSource = screenSources[0];
    }

    const buffer = targetSource.thumbnail.toJPEG(60);
    const base64 = buffer.toString('base64');
    const { width, height } = targetSource.thumbnail.getSize();

    return {
      base64,
      width,
      height
    };
  } catch (err) {
    logger.error(`[screenshot] Capture error: ${err.message}`);
    return null;
  }
}

async function getDisplays() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 }
    });

    return sources.map(source => ({
      id: source.display_id,
      name: source.name
    }));
  } catch (err) {
    logger.error(`[screenshot] getDisplays error: ${err.message}`);
    return [];
  }
}

module.exports = { captureScreen, getDisplays };
