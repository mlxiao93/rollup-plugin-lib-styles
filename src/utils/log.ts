
import fs from 'fs';
import path from 'path';
import { format } from 'util';

const isProduction = process.env.NODE_ENV == 'production';

const logPath = path.resolve(__dirname, 'log.log');
clearLog();
const logFile = fs.createWriteStream(logPath, { flags: 'a' });

export function log(...args: Parameters<typeof format>) {
  if (isProduction) return;
  logFile.write(`${format(...args)}\n`)
}

export function clearLog() {
  if (isProduction) return;
  try {
    fs.unlinkSync(logPath);
  // eslint-disable-next-line no-empty
  } catch {}
}
