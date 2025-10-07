const fs = require('fs');
const path = require('path');

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL] || LOG_LEVELS.info;

function formatLog(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

function writeLog(level, message, meta = {}) {
  if (LOG_LEVELS[level] > currentLogLevel) return;

  const logMessage = formatLog(level, message, meta);
  
  // Console output with colors
  const colors = {
    error: '\x1b[31m',
    warn: '\x1b[33m',
    info: '\x1b[36m',
    debug: '\x1b[90m'
  };
  
  const reset = '\x1b[0m';
  console.log(`${colors[level] || ''}${logMessage}${reset}`);

  // Write to file if in production
  if (process.env.NODE_ENV === 'production') {
    const logDir = path.join(__dirname, '../../../logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, `${level}.log`);
    fs.appendFileSync(logFile, logMessage + '\n');
  }
}

const logger = {
  error: (message, meta) => writeLog('error', message, meta),
  warn: (message, meta) => writeLog('warn', message, meta),
  info: (message, meta) => writeLog('info', message, meta),
  debug: (message, meta) => writeLog('debug', message, meta)
};

module.exports = { logger };

