import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function mountSpa(app, { mountPath, distDirectory, unavailableMessage }) {
  const patterns = [mountPath, `${mountPath}/`, `${mountPath}/*`];
  if (fs.existsSync(path.join(distDirectory, 'index.html'))) {
    app.use(mountPath, express.static(distDirectory, { index: false }));
    app.get(patterns, (req, res) => res.sendFile(path.join(distDirectory, 'index.html')));
  } else {
    app.get(patterns, (req, res) => res.status(503).send(unavailableMessage));
  }
}

export function mountStaticApps(app) {
  mountSpa(app, {
    mountPath: '/tracker',
    distDirectory: path.join(repositoryRoot, 'project-tracker/dist'),
    unavailableMessage: 'Project Tracker build is not available.',
  });
  app.get('/', (req, res) => res.redirect(302, '/app/'));
  mountSpa(app, {
    mountPath: '/app',
    distDirectory: path.join(repositoryRoot, 'frontend/dist'),
    unavailableMessage: 'Fiona app build is not available.',
  });
}
