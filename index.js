require("dotenv").config()
const express = require("express");
const app = express();
var passport = require("passport");
var session = require("express-session");
var passportSteam = require("passport-steam");
var SteamStrategy = passportSteam.Strategy;

var port = 3009;
const cors = require("cors");
app.use(
  cors({
    origin: "*", //should be changed to frontend url
    credentials: true,
  })
);
const jwt = require("jsonwebtoken");
const { GetUserInfo, GetBalance, UpdateBalance } = require("./db");
const { query, exec } = require("./ndb");
const http = require("http");
const server = http.createServer(app);
const io = require("./io").initialize(server);

//testing the poker before making it.
const cards = {
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  J: 10,
  Q: 10,
  K: 10,
  A: 11,
};
const suits = ["C", "D", "H", "S"];
//change deck everytime a game is played
const deck = [];
const createDeck = () => {
  for (const card in cards) {
    for (const suit in suits) {
      deck.push(card + suit);
    }
  }
  return deck;
};
const shuffle = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const Hand = require("./PokerSolver").Hand;

const game = {
  players: [],
  deck: shuffle(deck),
};
const pokergame = require("./games/Poker");

const user = require("./user");

// Spin up the server
server.listen(port, () => {
  console.log("Listening, port " + port);
});

server.on("error", (e) => {
    console.error("server error", e)
})

passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((user, done) => {
  done(null, user);
});
// Initiate Strategy
passport.use(
  new SteamStrategy(
    {
      returnURL: "http://localhost:" + 3009 + "/api/auth/steam/return", //should use a different domain for production
      realm: "http://localhost:" + 3009 + "/",
      apiKey: process.env.STEAM_API_KEY, //should be steam web api key
    },
    function (identifier, profile, done) {
      process.nextTick(function () {
        profile.identifier = identifier;
        return done(null, profile);
      });
    }
  )
);
app.use(
  session({
    secret: "123123123", //should be changed to a random string
    saveUninitialized: true,
    resave: false,
    cookie: {
      maxAge: 3600000,
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.get("/token", (req, res) => {
  res.send(req.user);
});
app.get("/", (req, res) => {
  //give frontend user info
  res.send(req.user);
});
app.get("/api/auth/steam", passport.authenticate("steam", { failureRedirect: "/" }), function (req, res) {
  res.redirect("/");
});
app.get("/api/auth/steam/return", passport.authenticate("steam", { failureRedirect: "/" }), function (req, res) {
  const jwtsigned = jwt.sign({ userid: req.user.id, displayName: req.user.displayName }, "verysecuresalt");
  //console.log(req.user.id)

  GetUserInfo(req.user.id, req.user.displayName, req.user.photos[0].value);
  const getuserid = select("users", "steamid", req.user.id);
  getuserid.then((result) => {
    const userid = result.id;

    const getusertoken = select("user_sessions", "userId", userid);

    getusertoken.then((result) => {
      console.log("user_result: " + result);
      if (result) {
        query("UPDATE user_sessions SET authToken = ? WHERE userId = ?", [jwtsigned, userid]);
      } else {
        query("INSERT INTO user_sessions (userId, authToken, ipAddress, userAgent, lastUpdate) VALUES (?, ?, ?, ?, ?)", [userid, jwtsigned, req.ip || "0", req.headers["user-agent"], 1020022020]);
      }
    });
  });
  res.redirect("http://localhost:3000?authorization=" + jwtsigned);
});

const { select, insert } = require("./ndb");
app.get("/api/getUser", async (req, res) => {
  jwt.verify(req["headers"]["token"], "verysecuresalt", function (err, decodedToken) {
    if (err) {
      console.log(err);
      res.json({ status: false, message: "Invalid token" });
    }
    console.log(req["headers"]["authToken"]);
    console.log(decodedToken);
    username = decodedToken.displayName;
    let id = decodedToken.userid;

    const userquery = select("users", "steamid", decodedToken.userid);
    //db.Query(`UPDATE users SET balance="${balance}" WHERE steamid="${userid}"`);

    userquery
      .then((user) => {
        res.json({ status: true, ...user });
      })
      .catch((err) => {
        res.json({ status: false, message: "User not found" });
      });
  });
});

let playercards = [];
io.on("connection", (socket) => {
  socket.emit("authPlease");

  socket.on("authorization", async (data) => {
    if (!data || socket.authorized) return;
    socket.authorized = true;

    let auth = false;
    console.log("auth " + data.authToken);
    let authToken = data.authToken;
    if (authToken && typeof authToken == "string" && authToken.length >= 10) {
      auth = true;
    }

    if (auth) {
      const userSql = query("SELECT * FROM user_sessions INNER JOIN users ON users.id = user_sessions.userId WHERE user_sessions.authToken = ?", [authToken]);
      userSql.then((result) => {
        console.log('userSql result', result)
        if (result.length > 0) {
          const targetUser = result[0];
          console.log("targetuser " + targetUser);
          user.addNew(socket, targetUser.steamid).then((info) => {
            if (!info) return;
            socket.user = info;
            socket.join("user-" + info.id);
            ////chat.getUsersInRoom(info.id);
            socket.emit("userData", {
              id: info.id,
              steamid: info.steamid,
              username: info.username,
              avatar: info.avatar,
              rank: info.rank,
              withdrawOk: info.withdrawOk == 1,
            });
            socket.emit("balance", info.balance);
          });
        }
      });
    }

    socket.emit("inited", true);
    user.sendUsers();
  });

  if (socket.handshake != undefined && socket.handshake.session != undefined && socket.handshake.session.passport != undefined && socket.handshake.session.passport.user != undefined) {
  } else {
  }

  socket.on("playpoker", (data) => {});
  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
  socket.on("playpokergame", (data) => {
    createDeck();
    game.deck = shuffle(deck);

    for (let i = 0; i < 5; i++) {
      playercards.push(game.deck.pop());
    }
    socket.emit("playpokergame:cards", playercards);
  });
  socket.on("playpokergame:deal", (data) => {
    const userid = data.userid;
    const bet = data.bet;
    const cards = data.cards;

    //get 5 cards
    const playercards = [cards];
    console.log(playercards);
    for (let i = 0; i < 6 - cards.length; i++) {
      playercards.push(game.deck.pop());
    }
    console.log(playercards);
    const playerhand = Hand.solve(playercards);
    //check if player has a winning hand
    if (
      playerhand.name === "Royal Flush" ||
      playerhand.name === "Straight Flush" ||
      playerhand.name === "Four of a Kind" ||
      playerhand.name === "Full House" ||
      playerhand.name === "Flush" ||
      playerhand.name === "Straight" ||
      playerhand.name === "Three of a Kind" ||
      playerhand.name === "Two Pair" ||
      playerhand.name === "Pair"
    ) {
      //if Royal Flush
      if (playerhand.name === "Royal Flush") {
        balance += bet * 250;
        socket.emit("playpoker:win", { balance: balance, bet: bet, hand: playerhand.name, playercards: playercards });
        UpdateBalance(userid, balance, true);
      }
      //if Straight Flush
      else if (playerhand.name === "Straight Flush") {
        balance += bet * 50;
        socket.emit("playpoker:win", { balance: balance, bet: bet, hand: playerhand.name, playercards: playercards });
        UpdateBalance(userid, balance, true);
      }
      //if Four of a Kind
      else if (playerhand.name === "Four of a Kind") {
        balance += bet * 25;
        socket.emit("playpoker:win", { balance: balance, bet: bet, hand: playerhand.name, playercards: playercards });
        UpdateBalance(userid, balance, true);
      }
      //if Full House
      else if (playerhand.name === "Full House") {
        balance += bet * 9;
        socket.emit("playpoker:win", { balance: balance, bet: bet, hand: playerhand.name, playercards: playercards });
        UpdateBalance(userid, balance, true);
      }
      //if Flush
      else if (playerhand.name === "Flush") {
        balance += bet * 6;
        socket.emit("playpoker:win", { balance: balance, bet: bet, hand: playerhand.name, playercards: playercards });
        UpdateBalance(userid, balance, true);
      }
      //if Straight
      else if (playerhand.name === "Straight") {
        balance += bet * 4;
        socket.emit("playpoker:win", { balance: balance, bet: bet, hand: playerhand.name, playercards: playercards });
        UpdateBalance(userid, balance, true);
      }
      //if Three of a Kind
      else if (playerhand.name === "Three of a Kind") {
        balance += bet * 3;
        socket.emit("playpoker:win", { balance: balance, bet: bet, hand: playerhand.name, playercards: playercards });
        UpdateBalance(userid, balance, true);
      }
      //if Two Pair
      else if (playerhand.name === "Two Pair") {
        balance += bet * 2;
        socket.emit("playpoker:win", { balance: balance, bet: bet, hand: playerhand.name, playercards: playercards });
        UpdateBalance(userid, balance, true);
      } else {
        balance -= bet;
        socket.emit("playpoker:lose", { balance: balance, bet: bet, hand: playerhand.name, playercards: playercards });
        UpdateBalance(userid, balance, false);
      }
    } else {
      balance -= bet;
      socket.emit("playpoker:lose", { balance: balance, bet: bet, hand: playerhand.name, playercards: playercards });
      UpdateBalance(userid, balance, false);
    }
  });
});

io.on("error", (e) => {
    console.log(e)
})

const roulette = require("./roulette");
const wheelofpride = require("./games/50x");
const crash = require("./games/crash");

const towers = require("./games/towers");
const dice = require("./dice");

roulette.start();

crash.start();

towers.inject(io);

dice.inject(io);

wheelofpride.start();
