type Fields = unknown[];

function format(error: unknown): unknown {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : error;
}

export const logger = {
  debug: (message: string, ...args: Fields) => {
    if (process.env.LOG_LEVEL === 'debug') console.debug(`[DEBUG] ${message}`, ...args);
  },
  info: (message: string, ...args: Fields) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: Fields) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, error?: unknown, ...args: Fields) =>
    console.error(`[ERROR] ${message}`, format(error), ...args),
};
