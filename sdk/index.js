const { createClient, SuperQueuesClient } = require('./lib/client');
const { SuperQueuesError, ErrorCodes } = require('./lib/errors');

module.exports = {
  createClient,
  SuperQueuesClient,
  SuperQueuesError,
  ErrorCodes,
};
