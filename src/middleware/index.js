const auth = require('./auth');
const errorHandler = require('./error');
const usage = require('./usage');

module.exports = {
  ...auth,
  ...usage,
  errorHandler,
};
