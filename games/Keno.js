module.exports = class {

    constructor() {
        this.name = 'Keno';
        this.title = 'Keno';
        this.aliases = ['keno'];
        this.description = 'Play Keno!';
        this.usage = 'keno <amount>';
        this.example = 'keno 100';
        this.cooldown = 5000;
        this.permissions = ['SEND_MESSAGES', 'EMBED_LINKS'];
    }
    

    async play(user, bet, numbers) {
        if (bet < 10) return 'You must bet at least 0.1 coins!';
        if (bet > 1000000) return 'You cannot bet more than 1,000,000 coins!';
        if (numbers.length < 1) return 'You must select at least 1 number!';
        if (numbers.length > 10) return 'You cannot select more than 10 numbers!';
        if (numbers.some(n => n < 1 || n > 80)) return 'You can only select numbers between 1 and 80!';
        if (numbers.some(n => !Number.isInteger(n))) return 'You can only select whole numbers!';
        if (numbers.some((n, i) => numbers.indexOf(n) !== i)) return 'You cannot select the same number twice!';
        let balance = await user.getBalance();
        if (bet > balance) return 'You do not have enough coins!';
        let results = [];
        for (let i = 0; i < 20; i++) {
            let num = Math.floor(Math.random() * 80) + 1;
            if (!results.includes(num)) results.push(num);
        }
        let won = 0;
        for (let i = 0; i < numbers.length; i++) {
            if (results.includes(numbers[i])) won++;
        }
        let payout = 0;
        switch (won) {
            case 1:
                payout = 1;
                break;
            case 2:
                payout = 2;
                break;
            case 3:
                payout = 3;
                break;
            case 4:
                payout = 4;
                break;
            case 5:
                payout = 5;
                break;
            case 6:
                payout = 6;
                break;
            case 7:
                payout = 7;
                break;
            case 8:
                payout = 8;
                break;
            case 9:
                payout = 9;
                break;
            case 10:
                payout = 10;
                break;
        }
        let amount = payout * bet;
        if (amount > 0) {
            await user.addBalance(amount);
            return `You won ${amount} coins!`;
        } else {
            return 'You lost!';
        }
    
        
    




    }
}