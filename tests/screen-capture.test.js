const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const screenCapture = require("../src/screen-capture");

test("screenCapture: init and getScreenshotsDir create and return directory", (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tarkov-test-screenshots-"));
  t.after(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  screenCapture.init(tmpDir);
  assert.strictEqual(screenCapture.getScreenshotsDir(), tmpDir);
  assert.strictEqual(fs.existsSync(tmpDir), true);
});

test("screenCapture: getLastScreenshot retrieves latest file from disk", (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tarkov-test-screenshots-"));
  t.after(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  screenCapture.init(tmpDir);

  // Write a fake screenshot file
  const testFile = path.join(tmpDir, "screenshot-2026-08-15_18-00-00.jpg");
  fs.writeFileSync(testFile, Buffer.from("fake-jpeg-data"));

  const last = screenCapture.getLastScreenshot();
  assert.ok(last, "Should return a screenshot record");
  assert.strictEqual(last.fileName, "screenshot-2026-08-15_18-00-00.jpg");
  assert.strictEqual(Buffer.from(last.base64, "base64").toString(), "fake-jpeg-data");
});
