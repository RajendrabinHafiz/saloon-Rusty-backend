const user = require("../user");
const db = require("../ndb");
const { create } = require("./User");






const io = require("../io").io();

const cards = {
    '2':2,
    '3':3,
    '4':4,
    '5':5,
    '6':6,
    '7':7,
    '8':8,
    '9':9,
    '10':10,
    'J':10,
    'Q':10,
    'K':10,
    'A':11
}
const suits = [
    'C',
    'D',
    'H',
    'S'
]



const deck = [];
const createDeck = () => {
    
    for (const card in cards) {
        for (const suit in suits) {
            deck.push(card + suit);
        }
    }
    return deck;
}
const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}


const game = {
    players: [],
    deck: shuffle(deck),
    bet: 0,
}

module.exports = {


    async play(){


        createDeck();

        game.deck = shuffle(deck);

        io.socket.on('connection', (socket) => {
            socket.on('startbj', async (data) => {
            
                const userId = user.getId(socket);
                let dealers_cards = [];
                let player_cards = [];
                
                dealers_cards = [game.deck[0], game.deck[1]];
                player_cards = [game.deck[2], game.deck[3]];
                game.deck.splice(0, 4);
                let dealers_total = cards[dealers_cards[0][0]] + cards[dealers_cards[1][0]];
                let player_total = cards[player_cards[0][0]] + cards[player_cards[1][0]];

                if(player_total == 21){
                    //player wins
                }

                else if (dealers_total == 21){
                    //dealer wins
                }


                else{
                    //game continues
                }
                
            })
            
        })
    }


}