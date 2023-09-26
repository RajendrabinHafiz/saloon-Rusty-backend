const mysql = require('mysql');
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'rustysaloon'
});

connection.connect((err) => {
    if (err) {
        console.error('error connecting: ' + err.stack);
        return;
    }
    console.log('connected as id ' + connection.threadId);
});

async function UpdateBalance(userid, amount, win){
    try {
    const q = connection.query('SELECT * FROM users WHERE steamid = ?', [userid], (err, results) => {
        if (err) console.log(err);
        if (results.length > 0) {
            const user = results;
            let newbalance = 0;
            if (win) {
                newbalance = user.balance += amount;
            } else {
                newbalance = user.balance -= amount;
            }
            const q2 = connection.query('UPDATE users SET balance = ? WHERE steamid = ?', [newbalance, userid], (err, results) => {
                if (err) throw err;
                return true;
            });
        } else {
            return false;
        }
    }
    );
    } catch (err) {
        console.log(err);
    }


}

async function GetBalance(userid) {
    const q = await connection.query('SELECT * FROM users WHERE steamid = ',[userid], (err, results) => {
        if(results == undefined) {
            return;
        }
        if(results.length > 0 ){
            return results;
        }else if (results.length < 1){
            console.log('no user found');
            return;
        }
        
    




    })};

async function GetUserInfo(userid, steamname, steamavatar) {
    
        const q = connection.query('SELECT * FROM users WHERE steamid = ?', [userid], (err, results) => {
            if(results == undefined) {
                return;
            }
            if(results.length > 0 ){
                return;
            }else if (results.length < 1){
                connection.query('INSERT INTO users (steamid, username, avatar) VALUES (?, ?, ?)', [userid, steamname, steamavatar], (err, results) => {
                    if(err) throw err;
                }
            )
                    
            }
        });
}




module.exports = {GetUserInfo, UpdateBalance, GetBalance};

