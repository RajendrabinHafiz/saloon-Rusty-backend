// CRYPTO
const CryptoJS = require("crypto-js");
const crypto = require("crypto");

const user = require("../user.js");
const io = require("../io").io();
const db = require("../ndb.js");

var _this;

var crashInfo = {
  fairRound: "",
  players: [],
  tempPlayers: [],
  playerLen: 0,
  counter: 10,
  status: "closed",
};

let calcTicket = () => {
  var currentNumber = 100 * Math.pow(104 * Math.random(), -1);
  return Number((Math.floor(currentNumber) % 120 == 0 ? 1 : currentNumber).toFixed(4));
};

function fairRound() {
  // 0-14
  const secret = crypto.randomBytes(32).toString("hex");
  const ticket = calcTicket();
  const hashAsString = CryptoJS.SHA256(`${secret}:${ticket}`); // ROLL ID
  const hash = hashAsString.toString(CryptoJS.enc.Hex);

  return {
    type: "crash",
    hash: hash,
    ticket: ticket,
    secret: secret,
  };
}

let calcY = (ms) => {
  // return (Math.E ** (0.065 * x)).toFixed(2);
  var r = 0.000065;
  return Math.round(100 * Math.pow(Math.E, r * ms)) / 100;
};
let inverseGrowth = (result) => {
  var c = 16666.666667;
  return c * Math.log(0.01 * result * 100);
};

let checkForCashout = async (y) => {
  for (var player in crashInfo.players) {
      if (crashInfo.players[player].cashedout == true) {
        continue;
      }
      if (crashInfo.players[player].autocashout != "None" && crashInfo.players[player].autocashout <= y) {
      crashInfo.players[player].cashedout = true;
      const winnings = crashInfo.players[player].autocashout * crashInfo.players[player].amount;
      crashInfo.players[player].balance += winnings - crashInfo.players[player].amount;
      user.sendToUser(player, "cashoutResponse", {
        status: "success",
      });

      // io.emit("crashPlayers", crashInfo.players);

      let sms1 = "You win " + Math.floor(winnings) + "$!";
      io.emit("message", {
        type: "success",
        msg: sms1,
      });
      let sms2 = "You have " + Math.floor(crashInfo.players[player].balance) + "$ remined!";
      io.emit("message", {
        type: "success",
        msg: sms2,
      });
    }
  }
};

const maxBet = 100000;
const minCashout = 1.01;
const origin_balance = 1000;
let update_crashplayer = {
  username: "test",
  avatar: "avatar",
  amount: 0,
  autocashout: 0,
  betnum: 0,                   
  balance: 0,
  resetloss: true,
  resetwin: true,
  loss: 0,
  win: 0,                  
  cashedout: false,
}
const Mutex = require("async-mutex").Mutex;
const betMutex = new Mutex();

let crashHistory = [];

let getRndInteger = (min, max) => {
  return Math.floor(Math.random() * (max + 1 - min)) + min;
};

io.sockets.on("connection", (socket) => {
  socket.on("crashConnected", () => {
    if (crashInfo.status && crashInfo.status != "off") {
      const userId = user.getId(socket);
      socket.emit("crashConnect", {
        hash: crashInfo.fairRound.hash,
        history: crashHistory,
        bets: crashInfo.players,
        balance: userId ? Math.floor(user.information(userId, "balance") * 100) / 100 : 0,
      });

      if (crashInfo.startTime) {
        var elapsed = Date.now() - crashInfo.startTime;
        if (crashInfo.gameDuration - elapsed > 0) {
          var y = calcY(elapsed);
          socket.emit("crashGraph", { x: elapsed / 1000, y: y });
        }
      } else {
        socket.emit("crashCounter", {
          hash: crashInfo.fairRound.hash,
          counter: crashInfo.counter,
        });
      }

      /*
            if (userId) {
                for (var player in crashInfo.players) {
                    if (player == userId) {
                        if (!crashInfo.players[player].cashedOut) {
                            socket.emit("crashPlayer", {
                                amount: crashInfo.players[player].amount,
                                autocashout: crashInfo.players[player].autocashout,
                            });
                        }
                        break;
                    }
                }
            }
            */
    }
  });

  socket.on("crashPlaceBet", (data) => {
    if (!data) return;
    module.exports.join(socket, data);
  });

  socket.on("crashCashout", async () => {
    const userId = user.getId(socket);
    if (!userId) return;

    if (crashInfo.status != "closed")
      return socket.emit("message", {
        type: "error",
        msg: "Round is not started yet!",
      });
    if (crashInfo.status == "crashed")
      return socket.emit("message", {
        type: "error",
        msg: "Round is closed!",
      });

    if (!crashInfo.players[`${userId}`])
      return socket.emit("message", {
        type: "error",
        msg: "You do not have a bet in the round!",
      });

    if (crashInfo.players[`${userId}`].cashedOut)
      return socket.emit("message", {
        type: "error",
        msg: "Already cashed out!",
      });

    var elapsed = Date.now() - crashInfo.startTime;
    var y = calcY(elapsed);
    crashInfo.players[`${userId}`].cashedOut = y;

    const playerData = crashInfo.players[`${userId}`];
    io.emit("crashPlayerCashedOut", {
      username: playerData.username,
      avatar: playerData.avatar,
      cashedOut: playerData.cashedOut,
    });

    const winnings = parseFloat((playerData.cashedOut * playerData.amount).toFixed(2));

    // io.emit("crashPlayers", crashInfo.players);
    // user.sendMsg(userId, {
    //   type: "success",
    //   msg: `You won ${winnings.toFixed(2)} coins!`,
    // });
    // socket.emit("cashoutResponse", {
    //   status: "success",
    // });

    /*
        if (user.information(userId, "muted") == 0) {
            socket.emit("sound", {
                type: "win"
            });
        }
        */

    //db.Query(`INSERT INTO gamehistory (mode, userId, amount, winnings, altInfo) VALUES ("crash", "${userId}", "${crashInfo.players[`${userId}`].amount * 100}", "${winnings * 100}", "${crashInfo.players[`${userId}`].cashedOut}x")`)
  });
});

const tickRate = 150;
let crashRender = 0;
let callTick = (elapsed) => {
  var left = crashInfo.gameDuration - elapsed;
  var nextTick = Math.max(0, Math.min(left, tickRate));
  setTimeout(runTick, nextTick);
};

let tick = (elapsed, y) => {
  if (crashRender % 6 == 0) {
    io.emit("crashGraph", { x: elapsed / 1000, y: y });
  }
  callTick(elapsed);
};

let runTick = async () => {
  var elapsed = Date.now() - crashInfo.startTime;
  var y = calcY(elapsed);

  await checkForCashout(y);
  crashRender++;

  if (y >= crashInfo.fairRound.ticket) {
    crashInfo.status = "crashed";

    if (crashHistory.length >= 16) {
      crashHistory.pop();
    }
    crashHistory.unshift({
      coords: { x: elapsed / 1000, y: y },
      info: crashInfo,
      type: "crash",
    });
    io.emit("crashHistory", crashHistory);

    io.emit("crashCrashed", { x: elapsed / 1000, y: y });
    if(crashInfo.players[0]){
      if (crashInfo.players[0].cashedout == false){
        crashInfo.players[0].balance -= crashInfo.players[0].amount;
        let sms1 = "You losed " + Math.floor(crashInfo.players[0].amount) + " $!";
        io.emit("message", {
          type: "error",
          msg: sms1,
        });
        if (crashInfo.players[0].balance <= 0){
          io.emit("message", {
            type: "error",
            msg: "You losed all!",
          });
          // return;
        }
        else{
          let sms2 = "You remained " + Math.floor(crashInfo.players[0].balance) + " $!";
          io.emit("message", {
          type: "error",
          msg: sms2,
        });
      }
    }
    // if(crashInfo.players[0])
    // crashInfo.players[0].betnum--;
    // if(crashInfo.players[0] && crashInfo.players[0].betnum == 0)
    //   return;
    update_crashplayer.autocashout = crashInfo.players[0].autocashout;
    update_crashplayer.resetloss = crashInfo.players[0].resetloss;
    update_crashplayer.resetwin = crashInfo.players[0].resetwin;
    update_crashplayer.loss = crashInfo.players[0].loss;
    update_crashplayer.win = crashInfo.players[0].win;

    update_crashplayer.balance = crashInfo.players[0].balance;
    if(crashInfo.players[0].betnum != -10)
      update_crashplayer.betnum = crashInfo.players[0].betnum - 1;
    else
    update_crashplayer.betnum = -10;
    update_crashplayer.cashedout = false;
    
    if(crashInfo.players[0].cashedout){
      if(update_crashplayer.resetwin)
        update_crashplayer.amount = crashInfo.players[0].amount;
      else
        update_crashplayer.amount = crashInfo.players[0].amount * update_crashplayer.win / 100.0;
    }
    else{
      if(update_crashplayer.resetloss)
        update_crashplayer.amount = crashInfo.players[0].amount * 2;
      else
        update_crashplayer.amount = crashInfo.players[0].amount * update_crashplayer.loss / 100.0;
    }
    if(update_crashplayer.amount > update_crashplayer.balance || update_crashplayer.betnum == 0
        || update_crashplayer.balance <= 0){
          let sms = "Finished! Now you have " + Math.floor(update_crashplayer.balance) + "$!";
          join_state = false;
          io.emit("message", {
            type: "success",
            msg: sms,
          });
          io.emit("finished", update_crashplayer);
        }
    else    
      io.emit("betinfo", update_crashplayer);
    io.emit("crashPlayers", crashInfo.players);
  }
    
    for (var player in crashInfo.players) {
      let leaderboardTicketAmount = 0;
      let won = false;
      let multiplier = 0;
      let winnings = 0;
      if (crashInfo.players[player].cashedOut == false) {
        leaderboardTicketAmount = crashInfo.players[player].amount;
        //db.Query(`INSERT INTO gamehistory (mode, userId, amount, winnings, altInfo) VALUES ("crash", "${player}", "${crashInfo.players[player].amount * 100}", "${crashInfo.players[player].amount * -100}", "${crashInfo.players[player].autocashout}x")`)
      } else {
        won = true;
        multiplier = crashInfo.players[player].cashedOut;
        winnings = parseFloat((crashInfo.players[player].cashedOut * crashInfo.players[player].amount).toFixed(2));
        leaderboardTicketAmount = winnings;
      }

      const riskPayoutRate = won ? crashInfo.players[player].cashedOut : y;
    }

    setTimeout(function () {
      module.exports.start();
    }, 5000);

    return;
  }

  tick(elapsed, y);
};

let join_state = false;
module.exports = {
  inject: (args) => {
    _this = args;
  },
  start: async () => {
    crashInfo = {
      fairRound: fairRound(),
      players: [],
      tempPlayers: [],
      playerLen: 0,
      counter: 3,
      status: "open",
    };
    crashRender = 0;
    io.emit("crashCounter", {
      hash: crashInfo.fairRound.hash,
      counter: crashInfo.counter,
    });
    var timer = setInterval(async () => {
      crashInfo.counter--;
      if (crashInfo.counter <= 0) {
        const release = await betMutex.acquire();
        try {
          crashInfo.status = "open";
          clearInterval(timer);
          crashInfo.counter = 0;
          crashInfo.startTime = Date.now();
          crashInfo.gameDuration = Math.ceil(inverseGrowth(crashInfo.fairRound.ticket));
          io.emit("crashGraph", { x: crashInfo.counter, y: calcY(crashInfo.counter) });
          callTick(0);
        } catch {
        } finally {
          release();
        }
      } else {
        io.emit("crashCounter", {
          hash: crashInfo.fairRound.hash,
          counter: crashInfo.counter,
        });
      }
    }, 1000);
  },
  join: async (socket, data) => {
        const userId = 0;
    const betAmount = parseFloat(data.amount);
    if (isNaN(betAmount) || betAmount <= 0 || betAmount > maxBet)
      return socket.emit("message", {
        type: "error",
        msg: "Invalid bet amount!",
      });
    
    let autocashout = data.autocashout;
    if (isNaN(autocashout)) autocashout = minCashout;
    else {
      if (autocashout < minCashout && autocashout != 0)
        return socket.emit("message", {
          type: "error",
          msg: "Lowest cashout value is 1.01!",
        });
      else if (autocashout >= 999999) autocashout = 999999;
    }

    let nbet = data.betnum;
    if(!Number.isInteger(Number(nbet)) || nbet < 0)
      return socket.emit("message", {
        type: "error",
        msg: "Number of Bets should be non-negative integer!",
      });

    const release = await betMutex.acquire();

    try {
      if (crashInfo.status != "open") {
        return socket.emit("message", {
          type: "error",
          msg: "Crash is not open!",
        });
      }

      if (join_state) {
        crashInfo.players[0] = {
          username: "test",
          avatar: "avatar",
          amount: update_crashplayer.amount,
          autocashout: update_crashplayer.autocashout,
          betnum: update_crashplayer.betnum,                   
          balance: update_crashplayer.balance,
          resetloss: update_crashplayer.resetloss,
          resetwin: update_crashplayer.resetwin,
          loss: update_crashplayer.loss,
          win: update_crashplayer.win,                  
          cashedout: update_crashplayer.cashedout,
        }
      } else {
        crashInfo.players[0] =  {
          username: "test",
          avatar: "avatar",
          amount: betAmount,
          autocashout: autocashout == 0 ? "None" : autocashout,
          betnum: nbet == 0 ? -10 : nbet,                   
          balance: origin_balance,
          resetloss: data.resetloss,
          resetwin: data.resetwin,
          loss: data.loss,
          win: data.win,                  
          cashedout: false,
        };
        join_state = true;
      }

      user.sendMsg(userId, {
        type: "success",
        msg: "Placed bet!",
      });
      // io.emit("crashPlayers", crashInfo.players);
    } catch (err) {
      console.log("join error = " + err);
        
      return socket.emit("message", {
        type: "error",
        msg: "Insufficient funds!",
      });
    } finally {
      release();
    }
  },
  getHistory: () => {
    return crashHistory;
  },
  getCurrentHash: () => {
    return crashInfo.fairRound.hash;
  },
};
