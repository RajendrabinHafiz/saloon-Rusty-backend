
const _ = require("underscore");
const crypto = require("crypto");

module.exports = class {

    constructor(params) {
        params.inject(this);
    }

    getHashedServerSeed(seed) {
        return crypto.createHash('sha512').update(seed).digest('hex');
    }

    generateHmac(seed, update) {
        return crypto
            .createHmac("sha256", update)
            .update(seed)
            .digest("hex");
    }


    saltWithClientSeed(seed, update) {
        return crypto
            .createHmac("sha512", seed)
            .update(update)
            .digest("hex");
    }

    buildGroup(groupSize, hash) {
        let randomNumbers = [];
        let shuffleNonce = 0;

        do {
            const newHash = this.generateHmac(hash, shuffleNonce.toString());

            const tempArr = this.seedToBytes(newHash);
            const randomArr = randomNumbers.concat(
                this.bytesToNumbers(tempArr, groupSize, newHash.length * 4)
            );
            randomNumbers = randomArr;
            shuffleNonce += 1;
        } while (randomNumbers.length < groupSize);

        if (randomNumbers.length > groupSize) {
            randomNumbers = randomNumbers.slice(0, groupSize);
        }

        const shuffled = this.shuffleGroup(randomNumbers, groupSize);
        return shuffled;
    }

    seedToBytes(hash) {
        const chunkierBoy = _.chunk(hash.split(""), 2).map(bytePair => {
            const twoBytes = bytePair.join("");
            return parseInt(twoBytes, 16);
        });
        return chunkierBoy;
    }
    
    //Expects an array of bytes from seedToBytes function and either 256 or 512
    //for the hashLength (character length of either SHA256 or SHA512 hash).
    bytesToNumbers(byteArr, groupSize, hashLength) {
        const chunkyBoy = _.chunk(byteArr, 4).map(numArr => {
            const numA = numArr[0] / Math.pow(hashLength, 1);
            const numB = numArr[1] / Math.pow(hashLength, 2);
            const numC = numArr[2] / Math.pow(hashLength, 3);
            const numD = numArr[3] / Math.pow(hashLength, 4);
            return numA + numB + numC + numD;
        });
        return chunkyBoy;
    }

    shuffleGroup(randomNumbers, groupSize) {
        const shuffledNumbers = _.range(groupSize);
    
        let randIndex = 0;
        for (let i = groupSize - 1; i > 0; i--) {
            const j = Math.floor(randomNumbers[randIndex] * (i + 1));
    
            const tmp = shuffledNumbers[j];
            shuffledNumbers[j] = shuffledNumbers[i];
            shuffledNumbers[i] = tmp;
            randIndex += 1;
        }
        return shuffledNumbers;
    }
    
    setOrderedGroup(minesCount, shuffledGroup) {
        let orderedGroup = new Array(25);
    
        if (minesCount < 1) minesCount = 1;
        if (minesCount > 24) minesCount = 24;
    
        shuffledGroup.map((card, i) => {
            if (i < minesCount)  orderedGroup[card] = true;
            else orderedGroup[card] = false;
        });
    
        return orderedGroup;
    }
    
    generateSquares({mineCount, serverSeed, clientSeed, nonce}) {
        const noncedSeed = `${clientSeed} - ${nonce}`;
        const hash = this.saltWithClientSeed(serverSeed, noncedSeed);
        const shuffledGroup = this.buildGroup(25, hash);
     
        return this.setOrderedGroup(mineCount, shuffledGroup);
    }
 
}

