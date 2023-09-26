const CryptoJS = require("crypto-js");
const crypto = require("crypto");

const user = require('./user');
const io = require('./io').io();
const db = require('./ndb');



var _this = {};

let getRndInteger = (min, max) => {
    return Math.floor(Math.random() * (max + 1 - min)) + min;
}

let fairRound = () => {
    const secret = crypto.randomBytes(32).toString('hex');
    const ticket = getRndInteger(0, 9999);
    const hashAsString = CryptoJS.SHA256(`${secret}:${ticket}`); // ROLL ID
    const hash = hashAsString.toString(CryptoJS.enc.Hex);

    return {
        type: "dice",
        hash: hash,
        ticket: ticket,
        secret: secret,
    };
}
const houseEdge = 0.95;
let diceHistory = [];

io.sockets.on("connection", (socket) => {
    console.log("New connection: " + socket);
    socket.on("diceStart", async (data) => {
        if (!data) return;
        startDice(socket, data);
    });

    socket.on("diceConnect", () => {
        socket.emit("diceHistory", diceHistory);

        const userId = user.getId(socket);
        if (userId) socket.emit("diceConnect", { balance: (Math.floor(user.information(userId, "balance") * 100) / 100) });
    })
});

let startDice = async (socket, data) => {
    const userId = user.getId(socket);
    if (userId) {
        

        

        const betAmount = parseInt(data.amount);
        if (isNaN(betAmount) || betAmount <= 0 || betAmount > 100000) return;

        if (betAmount < 10) return socket.emit("message", {
            type: "error",
            msg: `Min bet is 0.10 coins!`
        });

        if (betAmount > 100000) return socket.emit("message", {
            type: "error",
            msg: `Max bet is 1000.00 coins!`
        });

        const number = parseInt(data.number);
        if (isNaN(number) || number < 600 || number > 9900) return;

        const type = data.type;
        if (type !== "under" && type !== "over") return;

        try {
            await console.log({ way: 'OUT', userId, amount: betAmount, transactionType: 'BET_DICE', alterType: 'BET', alterName: 'DICE' });
        } catch (err) {
            return socket.emit("message", {
                type: "error",
                msg: "Insufficient funds!"
            });
        }


        let localRound = fairRound();
        let won = (type == "under" && number > localRound.ticket) || (type == "over" && number < localRound.ticket) ;

        const multiplier = calcMultiplier(type, number);

        const winnings = won ? Math.floor(betAmount * multiplier * 100) / 100 : 0;
        let leaderboardWinningTickets = Math.floor((multiplier - 1) * Number(data.betValue) * 100) / 100;
        user.sendToUser(userId, "diceResponse", {
            fairRound: localRound,
            won
        });

        const riskPayoutRate = multiplier;
        if (won) {
            if (user.information(userId, "muted") == 0) {
                user.sendToUser(userId, "diceSound", {
                    type: "winning",
                });
            }
            // user.sendMsg(userId, {
            //     type: "success",
            //     msg: `You won ${Number(winningAmount).toFixed(2)}!`,
            // });

            await console.log({way: 'IN', userId, amount: winnings, transactionType: 'BET_DICE_WINNINGS' });
            await console.log({ userId, game: 'DICE', betAmount, betTo: `${type.toUpperCase()}-${number}`, won: true, betWinner: localRound.ticket, multiplier, winnings, riskPayoutRate});
                

            /*
            user.update(userId, "withdrawableBalance", Math.floor((winningAmount - updateBalance) * 100 * 1.5), 3);
            user.update(userId, "balance", Number(winningAmount), 3);
            db.Query(`INSERT INTO gamehistory (mode, userId, betvalue, winnings, altInfo) VALUES ("dice", "${userId}", "${updateBalance * 100}", "${winningAmount * 100}", "${data.type}-${data.number}")`);
            */
        
        } else {
           
            await console.log({ userId, game: 'DICE', betAmount, betTo: `${type.toUpperCase()}-${number}`, won: false, betWinner: localRound.ticket, riskPayoutRate});
             
            if (user.information(userId, "muted") == 0) {
                user.sendToUser(userId, "diceSound", {
                    type: "loose",
                });
            }

            /*
            const currentBalance = Math.floor(user.information(userId, "balance") * 100);
            if (!currentBalance) {
                await db.Query(`SELECT * FROM users WHERE id="${userId}"`).then((row) => {
                    if (row[0]) {
                        if ((Number(row[0].balance) * 100) < Number(row[0].withdrawableBalance)) {
                            user.update(userId, "withdrawableBalance", (Number(row[0].balance) * 100), 2);
                        }
                    }
                });
            } else {
                if (currentBalance < user.information(userId, "withdrawableBalance")) {
                    user.update(userId, "withdrawableBalance", currentBalance, 2);
                }
            }
            */

            //db.Query(`INSERT INTO gamehistory (mode, userId, betvalue, winnings, altInfo) VALUES ("dice", "${userId}", "${updateBalance * 100}", "${updateBalance * -100}", "${data.type}-${data.number}")`);
        }

        user.logLeaderboardTicket(userId, "DICE", won ? winnings : Math.floor(betAmount * (multiplier < 2 ? (multiplier - 1) : 1) ) );
        const currentHistory = {
            username: user.information(userId, "username"),
            avatar: user.information(userId, "avatar"),
            winnings,
            multiplier,
            betValue: betAmount,
            type: "dice",
            fairRound: localRound,
            betType: type,
            timestamp: Date.now()
        }

        diceHistory.unshift(currentHistory);
        if (diceHistory.length > 20) {
            diceHistory.pop();
        }
        io.emit("diceHistory", diceHistory);




    } else {
        user.sendMsg(userId, {
            type: "error",
            msg: "Not logged in!"
        }, socket.id);
    }
}

let calcMultiplier = (type, number) => {
    return Number(((10000 / ((type == "over" ? 10000 - number : number))) * houseEdge).toFixed(2));
}


module.exports = {
    startDice,
    inject: (args) => {
        _this = args;
    },
    getHistory: () => {
        return diceHistory;
    }
}