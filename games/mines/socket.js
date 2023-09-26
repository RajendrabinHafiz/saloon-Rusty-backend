module.exports = class {

    constructor(params) {
        params.inject(this);
    }

    async injectEventHandlers(socket) {
        try {
            socket.on("mines:create", (data) => this.on_create(socket, data));
            socket.on("mines:info", (data) => this.on_info(socket, data));
            socket.on("mines:step", (data) => this.on_step(socket, data));
            socket.on("mines:cashout", (data) => this.on_cashout(socket, data));
            socket.on("mines:setUserSeed", (data) => this.on_setUserSeed(socket, data));
            socket.on("mines:setServerSeed", (data) => this.on_setServerSeed(socket, data));
        } catch (err) {
            console.log('ERRRR!');
        }
    }

    async on_create(socket, data) {
        if (!data) return;
        const userId = this.externalModules.user.getId(socket);
        if (!userId) return;

        if (!global.settings.minesEnabled) return socket.emit("message", {
            type: "error",
            msg: `Game is disabled at the moment!`
        });

        const betAmount = Math.round(parseFloat(data.betAmount) * 100);
        if (isNaN(betAmount) || betAmount <= 0 || betAmount > 100000) return;

        const mineCount = parseInt(data.mineCount);
        if (isNaN(mineCount) || mineCount < 1 || mineCount > 24) return;

        const cd = this.modules.cache.getCooldown(`SOCKET_USER_MINES_CREATE|${userId}`, 1);
        if (cd > 0) return socket.emit("message", {
            type: "error",
            msg: `Calm down!`
        })

        this.gamemodes.mines.game.create({
            socket,
            userId,
            betAmount,
            mineCount
        })
    }

    async on_info(socket, data) {
        const userId = this.externalModules.user.getId(socket);
        let publicSeedData = { userSeed: '', serverSeed: '', nonce: 0 };
        let game = null;
        
        if (userId) {
            game = await this.gamemodes.mines.game.getGame(userId);
            if (game) game = this.gamemodes.mines.game.getUserGame({ game, showSecrets: false });

            let seedData = await this.gamemodes.mines.db.getUserSeedData(userId);
            let nonce = 0;
            const lastNonceSql = await this.gamemodes.mines.db.getLastNonceSql(userId);
            if (lastNonceSql.length > 0) nonce = lastNonceSql[0].nonce;

            publicSeedData = {
                userSeed: seedData.minesUserSeed,
                serverSeed: this.gamemodes.mines.fairness.getHashedServerSeed(seedData.minesServerSeed),
                nonce
            };
        }

        socket.emit("mines:info", {
            game,
            history: this.gamemodes.mines.game.history,
            seedData: publicSeedData
        });
    }

    async on_step(socket, data) {
        if (!data) return;
        const userId = this.externalModules.user.getId(socket);
        if (!userId) return;

        if (!global.settings.minesEnabled) return socket.emit("message", {
            type: "error",
            msg: `Game is disabled at the moment!`
        });


        const offset = parseInt(data.offset);

        const cd = this.modules.cache.getCooldown(`SOCKET_USER_MINES_STEP|${userId}`, 0.1);
        if (cd > 0) return socket.emit("message", {
            type: "error",
            msg: `Calm down!`
        })

        this.gamemodes.mines.game.step({ socket, userId, offset })
    }

    async on_cashout(socket, data) {
        const userId = this.externalModules.user.getId(socket);
        if (!userId) return;

        if (!global.settings.minesEnabled) return socket.emit("message", {
            type: "error",
            msg: `Game is disabled at the moment!`
        });


        const cd = this.modules.cache.getCooldown(`SOCKET_USER_MINES_CASHOUT|${userId}`, 0.1);
        if (cd > 0) return socket.emit("message", {
            type: "error",
            msg: `Calm down!`
        });

        this.gamemodes.mines.game.cashout({ socket, userId })
    }

    async on_setUserSeed(socket, data) {
        if (!data) return;
        const userId = this.externalModules.user.getId(socket);
        if (!userId) return;

        const userSeed = data;
        if (userSeed == null || userSeed == undefined || userSeed.length > 64) return;

        const updated = await this.modules.db.exec("UPDATE users SET minesUserSeed = ? WHERE id = ?", [userSeed, userId]);
        if (updated) return socket.emit("message", {
            type: "success",
            msg: `The new seed has been saved!`
        });
    }

    async on_setServerSeed(socket, data) {
        if (!data) return;
        const userId = this.externalModules.user.getId(socket);
        if (!userId) return;

        const newServerSeed = await this.gamemodes.mines.db.generateServerSeed(userId);
        const hashedNewServerSeed = this.gamemodes.mines.fairness.getHashedServerSeed(newServerSeed)

        socket.emit("mines:setServerSeed", hashedNewServerSeed);
        return socket.emit("message", {
            type: "success",
            msg: `Server seed has been changed!`
        });
    }

}