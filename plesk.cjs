import('./backend/src/server.js').catch((error) => {
  console.error('Fiona startup failed:', error.code || error.message);
  process.exitCode = 1;
});
