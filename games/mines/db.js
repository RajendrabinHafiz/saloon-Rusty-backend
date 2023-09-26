module.exports = class {

    constructor(params) {
        params.inject(this);
    }

    async getSquares(gameId) {
        return await this.modules.db.query("SELECT * FROM mines_game_squares WHERE gameId = ? ORDER BY id ASC", [gameId]);
    }

    async getGame(userId) {
        const dbGameSql = (await this.modules.db.query("SELECT * FROM mines_games WHERE userId = ? AND state = 'PLAYING'", [userId]));
        if (dbGameSql.length == 0) return null;

        const dbGame = dbGameSql[0];
        let dbSquares = await this.getSquares(dbGame.id);
        
        return {
            id: dbGame.id,
            userId: dbGame.userId,
            isCompleted: false,
            betAmount: dbGame.betAmount,
            mineCount: dbGame.mineCount,
            serverSeed: dbGame.serverSeed,
            squares: dbSquares,
            spacesCleared: dbGame.spacesCleared,
            nonce: dbGame.nonce,
            payoutRate: this.gamemodes.mines.game.calculatePayoutRate(dbGame.mineCount, dbGame.spacesCleared)
        }
    }


    

    async createMines({ gameId, mines }) {
        for (let i = 0; i < 25; i++) {
            const insertSuccess = await this.modules.db.exec("INSERT INTO mines_game_squares SET ?", [
                {
                    gameId,
                    offset: i,
                    isMine: mines[i]
                }
            ]);
            if (!insertSuccess) {
                console.log('mines-errors', `Game Id #${gameId} -- Mine couldn't be inserted to the database, offset: ${i}`);
                throw new Error("Mine creation error in database!");
            }
        }
    }

    async getLastNonceSql(userId) {
        return (await this.modules.db.query("SELECT nonce FROM mines_games WHERE userId = ? AND state = 'CLOSED' ORDER BY createdAt DESC LIMIT 1", [userId]));
    }

    async generateServerSeed(userId) {
        const serverSeed = this.repositories.random.generateRandomString(32);
        const updated = await this.modules.db.exec("UPDATE users SET minesServerSeed = ? WHERE id = ?", [serverSeed, userId]);
        if (!updated) throw new Error("Server seed couldn't be updated!");

        return serverSeed;
    }

    async getUserSeedData(userId) {
        let seedData = (await this.modules.db.query("SELECT minesUserSeed, minesServerSeed FROM users WHERE id = ?", [userId]))[0];
        if (!seedData.minesServerSeed) seedData.minesServerSeed = await this.generateServerSeed(userId);
        return seedData;
    }
    
    async createGame({userId, betAmount, mineCount}) {
        //Real Function
        //await this.repositories.user.decreaseBalance(userId, betAmount);
        
        await this.repositories.user.updateBalance({way: 'OUT', userId, amount: betAmount, transactionType: 'BET_MINES', alterType: 'BET', alterName: 'MINES' });

        console.log('gamemodes-mines-db', `[START] User #${userId} bet ${betAmount / 100} with ${mineCount} mines`)

        let seedData =  await this.gamemodes.mines.db.getUserSeedData(userId);
        const userSeed = seedData.minesUserSeed;
        const serverSeed = seedData.minesServerSeed; //this.repositories.random.generateRandomString(32);
        let nonce = 0;

        const userHasOpenGame = (await this.modules.db.query("SELECT COUNT(1) as count FROM mines_games WHERE userId = ? AND state = 'PLAYING'", [userId]))[0].count > 0;
        if (userHasOpenGame) throw new Error("You have already an open game!");

        const lastNonceSql = await this.getLastNonceSql(userId);
        if (lastNonceSql.length > 0) nonce = (lastNonceSql[0].nonce + 1);

        const mines = this.gamemodes.mines.fairness.generateSquares({ mineCount, serverSeed, userSeed, nonce });
        const gameId = await this.modules.db.insert("INSERT INTO mines_games SET ?", [
            {
                userId,
                nonce,
                betAmount,
                mineCount,
                serverSeed,
                userSeed,
                createdAt: Math.floor(Date.now() / 1000)
            }
        ]);

        if (!gameId) throw new Error("Something went wrong while creating game!");

        await this.createMines({ gameId, mines });

        console.log('gamemodes-mines-db', `[END] User #${userId}'s game has been created successfully!`)
    }

    async updateStep({gameId, offset, isMine}) {
         const squareUpdated = await this.modules.db.exec("UPDATE mines_game_squares SET open = 1, openAt = ? WHERE gameId = ? AND offset = ?", [Math.floor(Date.now() / 1000), gameId, offset]);
        if (!squareUpdated) console.log("gamemodes-mines-db-error", `Square couldn't be updated -- Game Id ${gameId}, offset ${offset}`);

        if (isMine) return;
        const gameUpdated = await this.modules.db.exec("UPDATE mines_games SET spacesCleared = spacesCleared + 1 WHERE id = ?", [gameId]);
        if (!gameUpdated) {
            console.log("gamemodes-mines-db-error", `Game couldn't be updated! -- $${gameId}`);
            throw new Error("Something went wrong while updating the db!");
        }
    }

    async closeGame({gameId, won, winnings}) {
        const gameUpdated = await this.modules.db.exec("UPDATE mines_games SET state = 'CLOSED', won = ?, winnings = ? WHERE id = ?", [won, winnings, gameId]);
        if (!gameUpdated) {
            console.log("gamemodes-mines-db-error", `Game couldn't be closed! -- ${JSON.stringify(gameId)}`);
            throw new Error("Something went wrong while updating the db!");
        }
    }
}

