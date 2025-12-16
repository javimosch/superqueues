const auth = require('./auth');
const errorHandler = require('./error');

module.exports = {
  ...auth,
  errorHandler,
};
