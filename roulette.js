const CryptoJS = require("crypto-js");
const crypto = require("crypto");

const user = require("./user");
const db = require("./ndb");

const io = require('./io').io();

const ROULETTE_TIMER_INTERVAL = 20 * 1000;

let _this = {};

var rouletteInfo = {
    id: Date.now(),
    status: "closed",
    fairRound: "",
    startedAt: new Date().getTime(),
    ROULETTE_TIMER_INTERVAL,
    remainingTime: ROULETTE_TIMER_INTERVAL,
    players: {
        yellow: {},
        red: {},
        green: {},
        black: {},
    }
};
var rouletteHistory = [];
let lastRound = {};

const Mutex = require('async-mutex').Mutex;
const betMutex = new Mutex();

const maxBet = 100000;


let getRndInteger = (min, max) => {
    return Math.floor(Math.random() * (max + 1 - min)) + min;
}

let fairRound = (from, to) => { // 0-14
    const secret = crypto.randomBytes(32).toString('hex');
    const ticket = getRndInteger(from, to);
    const hashAsString = CryptoJS.SHA256(`${secret}:${ticket}`); // ROLL ID
    const hash = hashAsString.toString(CryptoJS.enc.Hex);

    return {
        type: "roulette",
        hash: hash,
        ticket: ticket,
        secret: secret,
        indicator: (getRndInteger(5, 95) / 100)
    };
}

io.sockets.on("connection", (socket) => {
    socket.on("roulettePlaceBet", async (data) => {
        if (!data) return;
        let userId = user.getId(socket);
        console.log("roulettePlaceBet", userId, data);
        if (!userId) return socket.emit("message", {
            type: "error",
            msg: "sssss"
        });

        const betAmount = parseInt(data.amount);
        if (isNaN(betAmount) || betAmount <= 0 || betAmount > maxBet) return;

        const betColor = data.color;
        const availableColors = ['red', 'green', 'black', 'yellow'];
        if (!availableColors.includes(data.color)) return;

        if ((betColor == "red" && rouletteInfo.players.black[userId]) || (betColor == "black" && rouletteInfo.players.red[userId]))
            return socket.emit("message", {
                type: "error",
                msg: "You cannot bet on both red and black!"
            });

        var userTotalBetAmount = 0;
        for (var current in rouletteInfo.players) {
            if (rouletteInfo.players[current][userId]) {
                userTotalBetAmount += rouletteInfo.players[current][userId].amount;
            }
        }
        if (userTotalBetAmount + betAmount > maxBet) return socket.emit("message", {
            type: "error",
            msg: `Max bet is ${(maxBet / 100).toFixed(2)}!`,
        });

        const userData = (await db.query("SELECT username, avatar FROM users WHERE id = ?", [userId]))[0];

        const release = await betMutex.acquire();
        try {
            if (rouletteInfo.status != "open") return socket.emit("message", {
                type: "info",
                msg: "Round is closed!"
            });

            await console.log({ way: 'OUT', userId, amount: betAmount, transactionType: 'BET_ROULETTE', alterType: 'BET', alterName: 'ROULETTE' });

            try {

                join(data.color, userId, userData.username, userData.avatar, betAmount);
                socket.emit("roulettePlaceBetRes", {
                    color: data.color,
                    amount: betAmount,
                });
            } catch (err) {
                console.log('games-roulette-errors', `Something happened while adding user bet!`);
                console.log('games-roulette-errors', err.name)
                console.log('games-roulette-errors', err.stack)
                return socket.emit("message", {
                    type: "error",
                    msg: "Something went wrong, ur funds are taken!"
                });
            }
        } catch (err) {
            return socket.emit("message", {
                type: "error",
                msg: "Insufficient funds!"
            });
        } finally {
            release();
        }



    });

    socket.on("rouletteConnected", () => {
        socket.emit("rouletteConnect", {
            id: rouletteInfo.id,
            startedAt: rouletteInfo.startedAt,
            remainingTime: rouletteInfo.remainingTime,
            ROULETTE_TIMER_INTERVAL,
            counter: rouletteInfo.counter,
            hash: rouletteInfo.fairRound.hash,
            spinnerActive: rouletteInfo.status == "closed" ? rouletteInfo.end : 0,
            fairRound: rouletteInfo.status == "closed" ? rouletteInfo.fairRound : lastRound,
            players: rouletteInfo.players,
            history: rouletteHistory,
            balance: (Math.floor(user.information(user.getId(socket), "balance") * 100) / 100)
        });
    })
});


async function start() {


    rouletteInfo = {
        id: Date.now(),
        status: "open",
        startedAt: new Date().getTime(),
        ROULETTE_TIMER_INTERVAL,
        remainingTime: ROULETTE_TIMER_INTERVAL,
        fairRound: fairRound(0, 14),
        counter: 20,
        players: {
            yellow: {},
            red: {},
            green: {},
            black: {},
        }
    };

    io.emit("rouletteTimer", {
        hash: rouletteInfo.fairRound.hash,
        remainingTime: rouletteInfo.remainingTime,
        counter: rouletteInfo.counter,
        spinning: false
    });

    io.emit("rouletteStart", {
        remainingTime: rouletteInfo.remainingTime,
    });

    var timer = setInterval(async () => {
        const now = new Date().getTime();
        rouletteInfo.remainingTime = ROULETTE_TIMER_INTERVAL - (now - rouletteInfo.startedAt);

        io.emit("rouletteTimer", {
            hash: rouletteInfo.fairRound.hash,
            remainingTime: rouletteInfo.remainingTime,
            counter: rouletteInfo.counter,
            spinning: false,
        });


        if (rouletteInfo.remainingTime > 0) return;
        clearInterval(timer);

        const release = await betMutex.acquire();
        try {
            rouletteInfo.status = "closed";
            rouletteInfo.end = Date.now();
        } catch { } finally { release(); }
        io.emit("rouletteTimer", {
            hash: rouletteInfo.fairRound.hash,
            counter: rouletteInfo.counter,
            spinning: true,
        })
        io.emit("rouletteSpin", { round: rouletteInfo.fairRound, startedAt: Date.now() });

        setTimeout(() => {
            if (rouletteHistory.length >= 100) rouletteHistory.pop();
            rouletteInfo.type = "roulette";
            rouletteHistory.unshift(rouletteInfo);
            giveRewards();
        }, 7 * 1000);

        /* Old shit code */
        /*
        var timer2 = setInterval(() => {
            rouletteInfo.counter--;
            if (rouletteInfo.counter <= 0) {
                clearInterval(timer2);
 
                if (rouletteHistory.length >= 100) {
                    rouletteHistory.pop();
                }
                rouletteInfo.type = "roulette";
                rouletteHistory.unshift(rouletteInfo);
                module.exports.giveRewards();
            }
            io.emit("rouletteTimer", {
                hash: rouletteInfo.fairRound.hash,
                counter: rouletteInfo.counter,
                spinning: true,
            })
        }, 1000);
        */

    }, 1000);

}

async function join(color, id, username, avatar, amount) {
    const colorBets = rouletteInfo.players[color];
    if (colorBets[id]) {
        colorBets[id].amount += amount;
        //rouletteInfo.players[color][id].amount = Math.floor(rouletteInfo.players[color][id].bet * 100) / 100;
    } else {
        colorBets[id] = {
            amount,
            username: username,
            avatar: avatar
        };
    }

    io.emit("roulettePlayers", rouletteInfo.players);
}

async function giveRewards() {
    const winningColor = rouletteInfo.fairRound.ticket == 0 ? "green" : rouletteInfo.fairRound.ticket <= 7 ? "red" : "black";
    for (var color in rouletteInfo.players) {
        for (var player in rouletteInfo.players[color]) {
            var currentPlayer = rouletteInfo.players[color][player];
            const colorMultiplier = (color == "green" ? 14 : 2);
            let leaderboardWinningTickets = Math.floor(currentPlayer.amount * colorMultiplier);
            const riskPayoutRate = colorMultiplier;
            if (color == winningColor) {
                let winnings = Math.floor(currentPlayer.amount * colorMultiplier);
                
                rouletteInfo.players[winningColor][player].winnings = winnings;
                await console.log({ way: 'IN', userId: player, amount: winnings, transactionType: 'BET_ROULETTE_WINNINGS' });
                await console.log({ userId: player, game: 'ROULETTE', betAmount: currentPlayer.amount, betTo: winningColor.toUpperCase(), won: true, betWinner: winningColor.toUpperCase(), multiplier: colorMultiplier, winnings, riskPayoutRate });
                user.logLeaderboardTicket(player, "ROULETTE", leaderboardWinningTickets);

                //db.Query(`INSERT INTO gamehistory (mode, userId, betvalue, winnings, altInfo) VALUES ("roulette", "${player}", "${Number(currentPlayer.bet) * 100}", "${winnings * 100}", "${color}")`);
            } else {

                /*
                const currentBalance = Math.floor(user.information(player, "balance") * 100);
                if (!currentBalance) {
                    await db.Query(`SELECT * FROM users WHERE id="${player}"`).then((row) => {
                        if (row[0]) {
                            if ((Number(row[0].balance) * 100) < Number(row[0].withdrawableBalance)) {
                                user.update(player, "withdrawableBalance", (Number(row[0].balance) * 100), 2);
                            }
                        }
                    });
                } else {
                    if (currentBalance < user.information(player, "withdrawableBalance")) {
                        user.update(player, "withdrawableBalance", currentBalance, 2);
                    }
                }
                */

                await console.log({ userId: player, game: 'ROULETTE', betAmount: currentPlayer.amount, betTo: color.toUpperCase(), won: false, betWinner: winningColor.toUpperCase(), riskPayoutRate });
                user.logLeaderboardTicket(player, "ROULETTE", currentPlayer.amount);
                // db.Query(`INSERT INTO gamehistory (mode, userId, betvalue, winnings, altInfo) VALUES ("roulette", "${player}", "${Number(currentPlayer.bet) * 100}", "${Number(currentPlayer.bet) * -100}", "${color}")`);

            }

        }
    }



    io.emit("roulettePlayers", rouletteInfo.players);
    io.emit("rouletteDone");
    lastRound = JSON.parse(JSON.stringify(rouletteInfo.fairRound))
    delete lastRound.players;
    setTimeout(() => {
        io.emit("rouletteReset", {
            history: rouletteHistory,
            info: rouletteInfo.fairRound
        });
        start();

    }, 2000)
}

function getHistory() {
    return rouletteHistory;
}

function getCurrentHash() {
    return rouletteInfo.fairRound.hash
}



module.exports = {
    inject: function (args) {
        _this = args;
    },
    start,
    getHistory,
    getCurrentHash
};