// Screen capture module for the Electron app.
//
// Uses Electron's desktopCapturer API to fetch screen sources,
// locate the correct display (or fall back to the primary screen),
// and generate a crisp JPEG thumbnail of the display. Also provides
// a check to ensure the target game window is active before capturing,
// as well as disk persistence and inspection capabilities.

const fs = require('fs');
const path = require('path');
const { desktopCapturer } = require('electron');
const logger = require('./logger');

let screenshotsDir = null;
let lastScreenshot = null;

function init(dir) {
  screenshotsDir = dir;
  try {
    if (screenshotsDir && !fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  } catch (err) {
    logger.error(`[screenshot] Failed to create screenshots dir: ${err.message}`);
  }
}

function getScreenshotsDir() {
  return screenshotsDir;
}

function pruneOldScreenshots(maxCount = 30) {
  if (!screenshotsDir || !fs.existsSync(screenshotsDir)) return;
  try {
    const files = fs.readdirSync(screenshotsDir)
      .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'))
      .map(f => {
        const fullPath = path.join(screenshotsDir, f);
        const stat = fs.statSync(fullPath);
        return { name: f, fullPath, time: stat.mtimeMs };
      })
      .sort((a, b) => b.time - a.time);

    if (files.length > maxCount) {
      for (let i = maxCount; i < files.length; i++) {
        try {
          fs.unlinkSync(files[i].fullPath);
        } catch {}
      }
    }
  } catch (err) {
    logger.debug(`[screenshot] prune error: ${err.message}`);
  }
}

async function captureScreen(displayId, options = {}) {
  const {
    bypassGameCheck = false,
    saveToDisk = true,
    quality = 85,
    thumbnailSize = { width: 1920, height: 1080 }
  } = options;

  try {
    // Game window validation (unless bypassed for manual UI testing)
    if (!bypassGameCheck) {
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
    }

    // Capture the screen with high resolution
    const screenSources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize
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

    const buffer = targetSource.thumbnail.toJPEG(quality);
    const base64 = buffer.toString('base64');
    const { width, height } = targetSource.thumbnail.getSize();
    const timestamp = Date.now();

    let savedFilePath = null;
    let savedFileName = null;

    if (saveToDisk && screenshotsDir) {
      try {
        if (!fs.existsSync(screenshotsDir)) {
          fs.mkdirSync(screenshotsDir, { recursive: true });
        }
        const iso = new Date(timestamp).toISOString().replace(/[:.]/g, '-');
        savedFileName = `screenshot-${iso}.jpg`;
        savedFilePath = path.join(screenshotsDir, savedFileName);
        fs.writeFileSync(savedFilePath, buffer);
        pruneOldScreenshots(30);
      } catch (saveErr) {
        logger.error(`[screenshot] Failed to save screenshot to disk: ${saveErr.message}`);
      }
    }

    const result = {
      base64,
      width,
      height,
      filePath: savedFilePath,
      fileName: savedFileName,
      timestamp,
      sizeBytes: buffer.length
    };

    lastScreenshot = result;
    return result;
  } catch (err) {
    logger.error(`[screenshot] Capture error: ${err.message}`);
    return null;
  }
}

function getLastScreenshot() {
  if (lastScreenshot) return lastScreenshot;

  // Try to load most recent screenshot from disk
  if (!screenshotsDir || !fs.existsSync(screenshotsDir)) return null;
  try {
    const files = fs.readdirSync(screenshotsDir)
      .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'))
      .map(f => {
        const fullPath = path.join(screenshotsDir, f);
        const stat = fs.statSync(fullPath);
        return { name: f, fullPath, time: stat.mtimeMs, size: stat.size };
      })
      .sort((a, b) => b.time - a.time);

    if (files.length > 0) {
      const latest = files[0];
      const buffer = fs.readFileSync(latest.fullPath);
      lastScreenshot = {
        base64: buffer.toString('base64'),
        filePath: latest.fullPath,
        fileName: latest.name,
        timestamp: Math.round(latest.time),
        sizeBytes: latest.size,
        width: 1920,
        height: 1080
      };
      return lastScreenshot;
    }
  } catch (err) {
    logger.debug(`[screenshot] getLastScreenshot disk read error: ${err.message}`);
  }
  return null;
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

module.exports = {
  init,
  captureScreen,
  getLastScreenshot,
  getScreenshotsDir,
  getDisplays
};

