var { Server } = require("socket.io");
var io = null;

exports.io = function () {
  return io;
};

exports.initialize = function (server) {
  return (io = new Server(server));
};
