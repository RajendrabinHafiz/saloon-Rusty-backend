// CRYPTO
const CryptoJS = require("crypto-js");
const crypto = require("crypto");

const user = require("../user");
const db = require("../ndb");


const io = require('../io').io();

var _this;

const GAME_TIMER_INTERVAL = 20 * 1000;
let game = {
    players: {
        red: {},
        black: {},
        green: {},
        yellow: {},
    },
    GAME_TIMER_INTERVAL,
    remainingTime: GAME_TIMER_INTERVAL,
    startedAt: new Date().getTime(),
    status: "closed",
    counter: 200,
    fairRound: "",
};
let colorReward = {
    red: 2,
    black: 3,
    green: 5,
    yellow: 50,
}
let history = [];
const maxBet = 100000;

const wheelColors = ["yellow", "green", "red", "black", "red", "black", "red", "black", "red", "green", "red", "green", "red", "black", "red", "black", "red", "black", "red", "green", "red", "green", "red", "black", "red", "black", "red", "black", "red", "black", "red", "black", "red", "green", "red", "green", "red", "black", "red", "black", "red", "black", "red", "green", "red", "green", "red", "black", "red", "black", "red", "black", "red", "green"];

const Mutex = require('async-mutex').Mutex;
const betMutex = new Mutex();

// 26 
// 17
// 10
// 1

// 10 / 54

// röd -20
// black -5
// green 

// 1 --> 2
// 0.5 --> 1.5

// Så 26 / 54 att gå + 1/3 av bet

// Och 17 / 54 att gå +- 0

// Lämnar 11 / 54 till - 100%

// 54 in total

let getRndInteger = (min, max) => {
    return Math.floor(Math.random() * (max + 1 - min)) + min;
}

let fairRound = () => { // 0-14
    const secret = crypto.randomBytes(32).toString('hex');
    const ticket = getRndInteger(1, 54);
    const hashAsString = CryptoJS.SHA256(`${secret}:${ticket}`); // ROLL ID
    const hash = hashAsString.toString(CryptoJS.enc.Hex);

    return {
        type: "teamup",
        hash: hash,
        ticket: ticket,
        secret: secret,
    };
}

let getWinningColor = (ticket) => {
    return wheelColors[ticket - 1];
}

io.sockets.on("connection", function (socket) {
    socket.on("WOFPlacebet", (data) => {
        if (!data) return;
        module.exports.placebet(data, socket);
    });
    socket.on("WOFConnect", () => {
        socket.emit("WOFConnect", {
            id: game.id,
            counter: game.counter,
            hash: game.fairRound.hash,
            players: game.players,
            remainingTime: game.remainingTime,
            GAME_TIMER_INTERVAL,
            balance: (Math.floor(user.information(user.getId(socket), "balance") * 100) / 100),
            history: history,
            end: game.end,
            fairRound: game.end ? game.fairRound : "",
            color: game.end ? getWinningColor(game.fairRound.ticket) : false,
            userId: user.getId(socket),
        });
    })
});
module.exports = {
    inject: (args) => {
        _this = args;
    },
    start: () => {
        


        game = {
            id: Date.now(),
            players: {
                red: {},
                black: {},
                green: {},
                yellow: {},
            },
            status: "open",
            GAME_TIMER_INTERVAL,
            remainingTime: GAME_TIMER_INTERVAL,
            startedAt: new Date().getTime(),
            counter: 20,
            fairRound: fairRound(),
        };

        io.emit("WOFPlayers", game.players);
        io.emit("WOFStart", {
            remainingTime: game.remainingTime,
        });

        let timer = setInterval(() => {
            const now = new Date().getTime();
            game.remainingTime = GAME_TIMER_INTERVAL - (now - game.startedAt);

            io.emit("WOFCounter", {
                remainingTime: game.remainingTime,
                counter: game.counter,
                hash: game.fairRound.hash
            });

            if (game.remainingTime > 0) return;
            clearInterval(timer);

            module.exports.spin();

        }, 1000);


    },
    spin: async () => {
        const release = await betMutex.acquire();
        try {
            game.status = "closed";
            game.end = Date.now();
            io.emit("WOFSpin", {
                fairRound: game.fairRound,
                color: getWinningColor(game.fairRound.ticket)
            });
        } catch {

        } finally {
            release();
        }
        setTimeout(() => {
            module.exports.giveRewards();
        }, 5000);
    },
    giveRewards: async () => {
        var winningColor = getWinningColor(game.fairRound.ticket);



        for (var color in game.players) {
            for (var player in game.players[color]) {
                const colorMultiplier = colorReward[color];
                const currentPlayer = game.players[color][player];

                if (color == winningColor) {

                    let winnings = Math.floor(currentPlayer.amount * colorMultiplier);
                    let leaderboardWinningTickets = winnings;

                    /*
                    user.update(game.players[winningColor][player].id, "balance", Number(winningAmount), 3);
                    user.update(game.players[winningColor][player].id, "withdrawableBalance", Math.floor((winningAmount - Number(game.players[winningColor][player].amount)) * 100 * 1.5), 3);
                    */
                    const riskPayoutRate = colorMultiplier;
                    await console.log({ way: 'IN', userId: player, amount: winnings, transactionType: 'BET_50X_WINNINGS', alterType: 'BET', alterName: '50X' });
                    await console.log({ userId: player, game: '50X', betAmount: currentPlayer.amount, betTo: winningColor.toUpperCase(), won: true, betWinner: winningColor.toUpperCase(), multiplier: colorMultiplier, winnings, riskPayoutRate });
                    user.logLeaderboardTicket(player, "50X", leaderboardWinningTickets);

                    //db.Query(`INSERT INTO gamehistory (mode, userId, betvalue, winnings, altInfo) VALUES ("50x", "${player}", "${game.players[winningColor][player].amount * 100}", "${winningAmount * 100}", "${color}")`);

                    // user.sendMsg(game.players[winningColor][player].id, {
                    //     type: "success",
                    //     msg: `You won ${winningAmount.toFixed(2)}!`
                    // });
                } else {

                    /*
                    const currentBalance = Math.floor(user.information(game.players[color][player].id, "balance") * 100);
                    if (!currentBalance) {
                        await db.Query(`SELECT * FROM users WHERE id="${game.players[color][player].id}"`).then((row) => {
                            if (row[0]) {
                                if ((Number(row[0].balance) * 100) < Number(row[0].withdrawableBalance)) {
                                    user.update(game.players[color][player].id, "withdrawableBalance", (Number(row[0].balance) * 100), 2);
                                }
                            }
                        });
                    } else {
                        if (currentBalance < user.information(game.players[color][player].id, "withdrawableBalance")) {
                            user.update(game.players[color][player].id, "withdrawableBalance", currentBalance, 2);
                        }
                    }
                    */

                    const riskPayoutRate = colorMultiplier;
                    await console.log({ userId: player, game: '50X', betAmount: currentPlayer.amount, betTo: color.toUpperCase(), won: false, betWinner: winningColor.toUpperCase(), riskPayoutRate });
                    user.logLeaderboardTicket(player, "50X", currentPlayer.amount);

                    //db.Query(`INSERT INTO gamehistory (mode, userId, betvalue, winnings, altInfo) VALUES ("50x", "${player}", "${game.players[color][player].amount * 100}", "${game.players[color][player].amount * -100}", "${color}")`);
                }

            }
        }

        game.fairRound.color = winningColor;
        if (history.length >= 100) {
            history.pop();
        }
        game.type = "50x";
        history.unshift(game);
        io.emit("WOFHistory", history, game.fairRound);

        setTimeout(() => {
            module.exports.start();
        }, 2000)
    },
    placebet: async (data, socket) => { // DATA (bet & color) och SOCKET
        let userId = user.getId(socket);
        if (!userId) return socket.emit("message", {
            type: "error",
            msg: "Please log in!"
        });

        const availableColors = ['red', 'black', 'green', 'yellow']
        const color = data.color;
        if (!availableColors.includes(color)) return;

        const betAmount = parseInt(data.amount);
        if (isNaN(betAmount) || betAmount <= 0 || betAmount >= 100000) return socket.emit("message", {
            type: "error",
            msg: "Bad bet value!"
        });


        const userTotalBetValue = (game.players.red[userId] ? game.players.red[userId].amount : 0) + (game.players.black[userId] ? game.players.black[userId].amount : 0) + (game.players.green[userId] ? game.players.green[userId].amount : 0) + (game.players.yellow[userId] ? game.players.yellow[userId].amount : 0)
        if (userTotalBetValue + betAmount > maxBet) return socket.emit("message", {
            type: "error",
            msg: `Max bet is ${(maxBet / 100).toFixed(2)}!`
        });


        const userData = (await db.query("SELECT username, avatar FROM users WHERE id = ?", [userId]))[0];
        
        const release = await betMutex.acquire();
        try {
            if (game.status == "closed") return socket.emit("message", {
                type: "error",
                msg: "Round is closed!"
            });
            await console.log({ way: 'OUT', userId, amount: betAmount, transactionType: 'BET_50X', alterType: 'BET', alterName: '50X' });

            try {
                if (game.players[data.color][userId]) {
                    game.players[data.color][userId].amount += betAmount;
                } else {
                    game.players[data.color][userId] = {
                        id: userId,
                        username: userData.username,
                        avatar: userData.avatar,
                        amount: betAmount
                    };
                }
                io.emit("WOFPlayers", game.players);
            } catch (err) {
                console.log('games-wof-errors', `Something happened while adding user bet!`);
                console.log('games-wof-errors', err.name)
                console.log('games-wof-errors', err.stack)
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

        // let times = 0;
        // for(var color in game.players) {
        //     if(game.players[color][userId]) times++;
        // }
        // if(times == 0 || (times == 1 && game.players[data.color][userId])) {
        //     user.update(userId, "withdrawableBalance", Math.floor((data.amount) * 100), 3);
        // }


    },
    getHistory: () => {
        return history;
    },
    getCurrentHash: () => {
        return game.fairRound.hash
    }
}



