const CryptoJS = require("crypto-js");
const crypto = require("crypto");

const user = require("../user");
const db = require("../ndb");



const io = require('../io').io();

var _this = {};

const towersLevel = {
    easy: 2 / 3,
    medium: 1 / 2,
    hard: 1 / 3
};

const towersMaxReward = 200 * 10;

let calcReward = (type, level) => {
    return (1 / ((towersLevel[type]) ** level)) * (1 - 0.03 * level);
}


let getRndInteger = (min, max) => {
    return Math.floor(Math.random() * (max + 1 - min)) + min;
}

let fairRound = (from, to) => { // 0-14
    const secret = crypto.randomBytes(32).toString('hex');
    const ticket = [getRndInteger(from, to), getRndInteger(from, to), getRndInteger(from, to), getRndInteger(from, to), getRndInteger(from, to), getRndInteger(from, to), getRndInteger(from, to), getRndInteger(from, to)];
    const hashAsString = CryptoJS.SHA256(`${secret}:${ticket}`); // ROLL ID
    const hash = hashAsString.toString(CryptoJS.enc.Hex);

    return {
        type: "towers",
        hash: hash,
        ticket: ticket,
        secret: secret,
    };
}

io.sockets.on("connection", function (socket) {
    console.log("New connection: " + socket);
    socket.on("createTowers", async function (data) {
        module.exports.create(socket, data);
    });

    socket.on("towersCheckAlternative", async function (data) {
        module.exports.checkAlternative(socket, data);
    });

    socket.on("towersCashout", () => {
        module.exports.cashout(socket);
    });
    socket.on("towersConnect", async () => {
        let userId = user.getId(socket);
        if (userId) {

            let towersInfo = (db.query("SELECT towers FROM users WHERE id = ?", [userId]));
            if (towersInfo && Object.keys(JSON.parse(towersInfo)).length > 0) {

                towersInfo = JSON.parse(towersInfo);


                user.sendToUser(userId, "towersCheckAlternativeResponse", {
                    rightAnswer: true,
                    done: false,
                    level: towersInfo.currentLevel,
                    mode: towersInfo.level,
                    answers: towersInfo.answers,
                    bet: towersInfo.betValue
                });
            }
        };
        socket.emit("towersHistory", history);
        /*
        socket.emit("towersConnect", {
            balance: (Math.floor(user.information(userId, "balance") * 100) / 100)
        });
        */
    })
});


let history = [];

const Mutex = require('async-mutex').Mutex;
const betMutex = new Mutex();

module.exports = {
    inject: (args) => {
        _this = args;
    },
    create: async (socket, data) => {
        if (!data) return;
        const userId = user.getId(socket);
        if (!userId) return socket.emit("message", {
            type: "error",
            msg: "Please log in!"
        });

       


       



        const towerLevels = Object.keys(towersLevel);
        const level = data.level;
        if (typeof level !== 'string' || !towerLevels.includes(level)) return;

        const betAmount = parseInt(data.amount);
        if (isNaN(betAmount) || betAmount <= 0 || betAmount > 100000) return;

        const release = await betMutex.acquire();
        try {

            let towersInfo = (await db.query("SELECT towers FROM users WHERE id = ?", [userId]))[0].towers;
            if (towersInfo && Object.keys(JSON.parse(towersInfo)).length > 0) return socket.emit("message", {
                type: "error",
                msg: `Already in towers!`
            });


            try {
                await console.log({ way: 'OUT', userId, amount: betAmount, transactionType: 'BET_TOWERS', alterType: 'BET', alterName: 'TOWERS' });
            } catch (err) {
                return socket.emit("message", {
                    type: "error",
                    msg: "Insufficient funds!"
                });
            }

            let fairRoundRound = fairRound(1, data.level == "medium" ? 2 : 3);


            // if (user.information(userId, "wager") >= Number(data.betValue)) {
            //     user.update(userId, "wager", (-1 * Number(-data.betValue)), 3);
            // } else {
            //     user.update(userId, "wager", 0, 2);
            // }
            // user.update(userId, "xp", Number(data.betValue), 3);

            towersInfo = {
                fairRound: fairRoundRound,
                betValue: betAmount,
                level,
                currentLevel: 0,
                answers: [],
            }
            ////user.update(userId, "towers", towersInfo, 0);
            await db.query("UPDATE users SET towers = ? WHERE id = ?", [JSON.stringify(towersInfo), userId]);
            ////db.Query(`UPDATE users SET towers='${JSON.stringify(towersInfo)}' WHERE id="${userId}"`);

            user.sendToUser(userId, "createTowersResponse", {
                level: 0,
            });
        } catch (err) {

        } finally {
            release();
        }


    },

    checkAlternative: async (socket, data) => {
        if (!data) return;
        const userId = user.getId(socket);
        if (!userId) return;


        

        const release = await betMutex.acquire();
        try {
            let towersInfo = (await db.query("SELECT towers FROM users WHERE id = ?", [userId]))[0].towers;
            if (!towersInfo || Object.keys(JSON.parse(towersInfo)).length == 0) return socket.emit("message", {
                type: "error",
                msg: `No game!`
            });
            towersInfo = JSON.parse(towersInfo);

            const alternative = parseInt(data.alternative);

            if (isNaN(alternative) || alternative < 1 || alternative > (towersInfo.level == "medium" ? 2 : 3)) return;


            const passed = (towersInfo.level == "hard" && alternative == towersInfo.fairRound.ticket[towersInfo.currentLevel]) || (towersInfo.level != "hard" && alternative != towersInfo.fairRound.ticket[towersInfo.currentLevel]);
            if (passed) {
                towersInfo.currentLevel += 1;
                towersInfo.answers.push(alternative);

                await db.exec(`UPDATE users SET towers = ? WHERE id = ?`, [JSON.stringify(towersInfo), userId]);

                const currentMultiplier = calcReward(towersInfo.level, towersInfo.currentLevel);
                const potentialMultiplier = calcReward(towersInfo.level, towersInfo.currentLevel + 1);

                const riskPayoutRate = currentMultiplier;

                const nextWinnings = Math.floor(towersInfo.amount * potentialMultiplier);

                if (towersInfo.currentLevel == towersInfo.fairRound.ticket.length || nextWinnings >= towersMaxReward) {
                    const winnings = Math.floor(towersInfo.betValue * currentMultiplier);

                    await db.exec(`UPDATE users SET towers="{}" WHERE id = ?`, [userId]);
                    await console.log({ way: 'IN', userId, amount: winnings, transactionType: 'BET_TOWERS_WINNINGS' });
                    await console.log({ userId, game: 'TOWERS', betAmount: towersInfo.betValue, betTo: '', won: true, betWinner: `${towersInfo.level.toUpperCase()}-${towersInfo.currentLevel}`, multiplier: currentMultiplier, winnings, riskPayoutRate });
                    user.logLeaderboardTicket(userId, "TOWERS", winnings);

                    user.sendMsg(userId, {
                        type: "success",
                        msg: `Congratulations, you completed towers and got ${(winnings / 100).toFixed(2)} coins!`
                    });
                    user.sendToUser(userId, "towersCheckAlternativeResponse", {
                        rightAnswer: true,
                        done: true,
                        tickets: towersInfo.fairRound.ticket,
                        level: towersInfo.currentLevel,
                        mode: towersInfo.level,
                        answers: towersInfo.answers,
                        bet: towersInfo.betValue
                    });


                    history.unshift({
                        winnings,
                        username: user.information(userId, "username"),
                        betValue: towersInfo.betValue,
                        timestamp: Date.now()
                    });
                    if (history.length > 13) {
                        history.pop();
                    }

                    io.emit("towersHistory", history);

                    //db.Query(`INSERT INTO gamehistory (mode, userId, betvalue, winnings, altInfo) VALUES ("towers", "${userId}", "${towersInfo.betValue * 100}", "${currentbalance * 100}", "${towersInfo.level}-${towersInfo.currentLevel}")`);

                   
                    if (user.information(userId, "muted") == 0) {
                        user.sendToUser(userId, "towersSound", {
                            type: "win"
                        });
                    }

                } else {
                    user.sendToUser(userId, "towersCheckAlternativeResponse", {
                        rightAnswer: true,
                        done: false,
                        level: towersInfo.currentLevel,
                        mode: towersInfo.level,
                        answers: towersInfo.answers,
                        bet: towersInfo.betValue
                    });

                    if (user.information(userId, "muted") == 0) {
                        user.sendToUser(userId, "towersSound", {
                            type: "advance"
                        });
                    }

                   
                }

            } else {
                await db.exec(`UPDATE users SET towers = "{}" WHERE id = ?`, [userId]);
                
                user.sendToUser(userId, "towersCheckAlternativeResponse", {
                    rightAnswer: false,
                    tickets: towersInfo.fairRound.ticket,
                    level: towersInfo.currentLevel,
                    mode: towersInfo.level,
                    bet: towersInfo.betValue
                });

                history.unshift({
                    winnings: -towersInfo.betValue,
                    username: user.information(userId, "username"),
                    betValue: towersInfo.betValue,
                    timestamp: Date.now()
                });
                if (history.length > 13) {
                    history.pop();
                }

                const riskPayoutRate = calcReward(towersInfo.level, towersInfo.currentLevel + 1);
                await console.log({ userId, game: 'TOWERS', betAmount: towersInfo.betValue, betTo: `${towersInfo.level.toUpperCase()}-${towersInfo.currentLevel}`, won: false, betWinner: '', riskPayoutRate });
                user.logLeaderboardTicket(userId, "TOWERS", towersInfo.betValue);

                io.emit("towersHistory", history);

               

                if (user.information(userId, "muted") == 0) {
                    user.sendToUser(userId, "towersSound", {
                        type: "loose"
                    });
                }

            }
        } catch (err) {

        } finally {
            release();
        }


    },

    cashout: async (socket) => {
        let userId = user.getId(socket);
        if (!userId) return;

        

        


        const release = await betMutex.acquire();
        try {
            let towersInfo = (await db.query("SELECT towers FROM users WHERE id = ?", [userId]))[0].towers;
            if (!towersInfo || Object.keys(JSON.parse(towersInfo)).length == 0) return socket.emit("message", {
                type: "error",
                msg: `No game!`
            });
            towersInfo = JSON.parse(towersInfo);

            if (towersInfo.currentLevel == 0) return user.sendMsg(userId, {
                type: "error",
                msg: "You cannot cashout at once!"
            });

            const currentMultiplier = calcReward(towersInfo.level, towersInfo.currentLevel);
            const winnings = Math.floor(towersInfo.betValue * currentMultiplier);


            const riskPayoutRate = currentMultiplier;

            await db.exec(`UPDATE users SET towers = "{}" WHERE id = ?`, [userId]);
            await console.log({ way: 'IN', userId, amount: winnings, transactionType: 'BET_TOWERS_WINNINGS' });
            await console.log({ userId, game: 'TOWERS', betAmount: towersInfo.betValue, betTo: '', won: true, betWinner: `${towersInfo.level.toUpperCase()}-${towersInfo.currentLevel}`, multiplier: currentMultiplier, winnings, riskPayoutRate });


            let leaderboardTickets = winnings;

            /*
            user.update(userId, "balance", Number(currentbalance), 3);
            user.update(userId, "withdrawableBalance", Math.floor((currentbalance - Number(towersInfo.betValue)) * 100), 3);
            */

            // user.sendMsg(userId, {
            //     type: "success",
            //     msg: "Successful cashout from towers, won " + currentbalance + " coins"
            // });


            user.sendToUser(userId, "towersCheckAlternativeResponse", {
                rightAnswer: false,
                tickets: towersInfo.fairRound.ticket,
                level: towersInfo.currentLevel,
                mode: towersInfo.level,
                bet: towersInfo.betValue,
            });


            history.unshift({
                winnings,
                username: user.information(userId, "username"),
                betValue: towersInfo.betValue,
                timestamp: Date.now()
            });
            if (history.length > 13) {
                history.pop();
            }


            user.logLeaderboardTicket(userId, "TOWERS", leaderboardTickets);
            io.emit("towersHistory", history);

            // db.Query(`INSERT INTO gamehistory (mode, userId, betvalue, winnings, altInfo) VALUES ("towers", "${userId}", "${towersInfo.betValue * 100}", "${currentbalance * 100}", "${towersInfo.level}-${towersInfo.currentLevel}")`);

            if (user.information(userId, "muted") == 0) {
                user.sendToUser(userId, "towersSound", {
                    type: "win"
                });
            }
        } catch (err) {

        } finally {
            release();
        }

    }
}