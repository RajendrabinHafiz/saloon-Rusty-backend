const Mutex = require('async-mutex').Mutex;

module.exports = class {

    constructor(params) {
        params.inject(this);

        this.defs = {
            HOUSE_EDGE: 5, //%
            MAX_HISTORY_LENGTH: 20
        };

        this.games = {};
        this.history = this.modules.cache.fileGet('gamemodes-mines-history')

        this.mutexes = {};
    }

    getUserMutex(userId) {
        if (this.mutexes.hasOwnProperty(userId)) return this.mutexes[userId];
        else {
            this.mutexes[userId] = new Mutex();
            return this.mutexes[userId];
        }
    }

    getUserGame({ game, showSecrets }) {
        let userGame = JSON.parse(JSON.stringify(game));
        userGame.squares.forEach((square) => {
            square.multiplier = 0;
            square.openByUser = JSON.parse(JSON.stringify(square.open));
            if (showSecrets) square.open = true;
            delete square.id;
            delete square.gameId;
            delete square.step;
            delete square.openAt;
            delete square.offset;
            if (!showSecrets) delete square.isMine;
        });
        if (!showSecrets) {
            userGame.isCompleted = false;
            userGame.serverSeed = this.gamemodes.mines.fairness.getHashedServerSeed(userGame.serverSeed);
        }
        else {
            userGame.isCompleted = true;
        }
        userGame.isActive = true;
        return userGame;
    }
    async getGame(userId) {
        let game = {};
        if (this.games[userId]) {
            game = this.games[userId];
        } else {
            game = await this.gamemodes.mines.db.getGame(userId);
            this.games[userId] = game;
        }

        return game;
    }

    async create({ socket, userId, betAmount, mineCount }) {
        const userBalance = (await this.modules.db.query("SELECT balance FROM users WHERE ?", [{
            id: userId
        }]))[0].balance;

        if (userBalance < betAmount) return socket.emit("message", {
            type: "error",
            msg: 'Insufficient funds!'
        });

        const release = await this.getUserMutex(userId).acquire();
        try {
            await this.gamemodes.mines.db.createGame({ userId, betAmount, mineCount });
            const game = await this.getGame(userId);
            //const newBalance = await this.repositories.user.getBalance(userId);
            const newServerSeed = await this.gamemodes.mines.db.generateServerSeed(userId);
            
            socket.emit("mines:setGame", {
                gameData: this.getUserGame({ game, showSecrets: false }),
                newBalance: -1,
                newServerSeed: this.gamemodes.mines.fairness.getHashedServerSeed(newServerSeed)
            });
        } catch (err) {
            socket.emit("message", {
                type: "error",
                msg: err.message
            });

        } finally {
            release();
        }

    }

    calculatePayoutRate(mineCount, spacesCleared) {
        if (!spacesCleared) return 0;
        let rate = 1;
        for (let i = 0; i < spacesCleared; i++) {
            let remainingSquareCount = 25 - i;
            let winProbability = (remainingSquareCount - mineCount) / (remainingSquareCount);
            rate *= (1 / winProbability);
        }
        const houseEdgeMultiplier = (1 - (this.defs.HOUSE_EDGE / 100));
        rate *= houseEdgeMultiplier;
        return Math.floor(rate * 100) / 100;
    }

    async step({ socket, userId, offset }) {
        const release = await this.getUserMutex(userId).acquire();
        try {
            let game = await this.getGame(userId);
            if (!game) throw new Error("There is no any open game!");
            if (game.completed) throw new Error("Game is already done!");

            const square = game.squares[offset];
            if (square.open) throw new Error("Square is already open!");
            square.open = true;
            await this.gamemodes.mines.db.updateStep({ gameId: game.id, offset, isMine: square.isMine });
            if (square.isMine) return await this.finalizeGame({ socket, game, won: false, squareOffset: offset });

            game.spacesCleared++;
            const newPayoutRate = this.calculatePayoutRate(game.mineCount, game.spacesCleared);
            game.payoutRate = newPayoutRate;
            square.multiplier = newPayoutRate;

            this.sendSquareData({socket, game, offset});
            
            let availableSquareCount = (25 - game.spacesCleared - game.mineCount);
            if (availableSquareCount <= 0) return await this.finalizeGame({ socket, game, won: true });

            

        } catch(err) {
            socket.emit("message", {
                type: "error",
                msg: err.message
            });
        } finally {
            release();
        }
    }

    async cashout({ socket, userId }) {
        const release = await this.getUserMutex(userId).acquire();
        try {
            let game = await this.getGame(userId);
            if (!game) throw new Error("There is no any open game!");
            if (game.completed) throw new Error("Game is already done!");
            if (game.spacesCleared == 0) throw new Error("You can't cashout now!");

            await this.finalizeGame({socket, game, won: true});
        } catch(err) {
            socket.emit("message", {
                type: "error",
                msg: err.message
            });
        } finally {
            release();
        }
    }

    async sendSquareData({socket, game, offset}) {
        socket.emit("mines:setSquare", {
            offset,
            square: game.squares[offset],
            payoutRate: game.payoutRate
        })
    }

    async finalizeGame({ socket, game, won, squareOffset }) {
        game.completed = true;

        let winnings = 0;

        //if (won) winnings = Math.floor(game.betAmount * game.payoutRate * 100) / 100;
        if (won) winnings = Math.floor(game.betAmount * game.payoutRate);
        await this.gamemodes.mines.db.closeGame({ gameId: game.id, won, winnings });
        if (won) {
            // Real Function
            //await this.repositories.user.increaseBalance(game.userId, winnings);
            //newBalance = await this.repositories.user.getBalance(game.userId);
            await this.repositories.user.updateBalance({way: 'IN', userId: game.userId, amount: winnings, transactionType: 'BET_MINES_WINNINGS' });
        }
        const riskPayoutRate = this.calculatePayoutRate(game.mineCount, won ? game.spacesCleared : (game.spacesCleared + 1));
        const leaderboardTickets = won ? winnings : Math.floor(game.betAmount * (game.payoutRate || 1));
        await this.repositories.user.finalizeBet({ userId: game.userId, game: 'MINES', betAmount: game.betAmount, betTo: '', won, betWinner: `SPACES CLEARED ${game.spacesCleared} - ${game.payoutRate}x`, multiplier: won ? game.payoutRate : 0, winnings, riskPayoutRate});
                
    
        this.externalModules.user.logLeaderboardTicket(game.userId, "MINES", leaderboardTickets);

        const finalizedGame = this.getUserGame({ game, showSecrets: true });
        if (squareOffset > 0) this.sendSquareData({socket, game, offset: squareOffset});
        setTimeout(() => {
            socket.emit("mines:setGame", {
                gameData: finalizedGame,
                newBalance: -1
            });
            this.pushHistory({userId: game.userId, game: finalizedGame, won, winnings});
        }, 800);

        delete this.games[game.userId];
    }

    async pushHistory({userId, game, won, winnings}) {
        //console.log(socket.handshake.session.passport.user)
        const userData = (await this.modules.db.query("SELECT username, avatar FROM users WHERE id = ?", [userId]))[0];
        const historyData = {
            user: { name: userData.username, avatar: userData.avatar },
            betAmount: game.betAmount,
            won,
            winnings,
            spacesCleared: game.spacesCleared,
            minesCount: game.mineCount,
            payoutRate: game.payoutRate,
            timestamp: new Date()
        };
        this.history.unshift(historyData);
        if (this.history.length > this.defs.MAX_HISTORY_LENGTH) this.history = this.history.slice(0, this.defs.MAX_HISTORY_LENGTH);
        this.modules.cache.fileSet("gamemodes-mines-history", this.history);
        this.modules.io.emit("mines:pushHistory", historyData);
    }
}