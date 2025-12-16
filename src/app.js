const express = require('express');
const path = require('path');
const v1Routes = require('./routes/v1');
const { errorHandler } = require('./middleware');

function createApp() {
  const app = express();
  
  app.use(express.json());
  
  app.use(express.static(path.join(__dirname, 'public')));
  
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  });
  
  app.use('/v1', v1Routes);
  
  app.get('/healthz', (req, res) => {
    res.json({ status: 'ok' });
  });
  
  app.use(errorHandler);
  
  return app;
}

module.exports = createApp;
