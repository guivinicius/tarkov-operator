let sink = null;

function setSink(fn) {
  sink = fn;
}

function log(level, message) {
  if (level === "debug") {
    if (process.env.NODE_ENV !== "development" && !process.env.DEBUG_LOGS) {
      return;
    }
  }
  if (sink) {
    sink({ level, message, time: Date.now() });
  } else {
    // Fallback if no sink is set
    console.log(`[${level}] ${message}`);
  }
}

module.exports = {
  setSink,
  debug: (msg) => log("debug", msg),
  info: (msg) => log("info", msg),
  warn: (msg) => log("warn", msg),
  error: (msg) => log("error", msg),
};
