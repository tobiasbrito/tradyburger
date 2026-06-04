const { handle } = require("../_lib/adapter.js");

module.exports = async function handler(req, res) {
  return handle(req, res);
};
