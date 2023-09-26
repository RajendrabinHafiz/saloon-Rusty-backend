const mysql = require('mysql');
var pool = mysql.createPool({
    connectionLimit: 150,
    connectTimeout: 15 * 1000,
    acquireTimeout: 15 * 1000,
    timeout: 15 * 1000,
    host: "localhost",
    user: "root",
    password: "",
    database: "rustysaloon",
    charset: 'utf8_general_ci'
});



var util = require('util')

pool.getConnection((err, connection) => {
    if (err) {
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.error('Database connection was closed.')
        }
        if (err.code === 'ER_CON_COUNT_ERROR') {
            console.error('Database has too many connections.')
        }
        if (err.code === 'ECONNREFUSED') {
            console.error('Database connection was refused.')
        }
    }
    if (connection) connection.release()
    return
})


pool.query = util.promisify(pool.query)

function mysql_real_escape_string (str) {
    if (typeof str != 'string')
        return str;

    return str.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, function (char) {
        switch (char) {
            case "\0":
                return "\\0";
            case "\x08":
                return "\\b";
            case "\x09":
                return "\\t";
            case "\x1a":
                return "\\z";
            case "\n":
                return "\\n";
            case "\r":
                return "\\r";
            case "\"":
            case "'":
            case "\\":
            case "%":
                return "\\"+char; // prepends a backslash to backslash, percent,
                                  // and double/single quotes
        }
    });
}

function rawDataPacketToObject(rawDataPacket) {
    let new_object = Object.assign({}, rawDataPacket);
    return new_object;
}

async function select(table, column, id) {

    let sql = "SELECT * FROM ?? WHERE ?? = ?";
    id = mysql_real_escape_string(id);
    let inserts = [table, column, id];
    sql = mysql.format(sql, inserts);

    let resRaw = await pool.query(sql).catch(err => { console.log('SELECT ERROR!'); console.log(err); return []; });
    if (resRaw.length > 0) {
        let res = rawDataPacketToObject(resRaw[0]);
        return res;
    }
    else {
        return null;
    }

}


async function query(command, params) {

    if (params !== null && params !== undefined && params.length > 0)
        params.forEach(param => {
            param = mysql_real_escape_string(param);
        });

    let sql = mysql.format(command, params);

    //console.log(sql)

    let resRaw = await pool.query(sql).catch(err => { console.log('QUERY ERROR!'); console.log(err); return []; });
    if (resRaw.length > 0) {

        if (resRaw.length == 1) {
            let resArr = [];
            let res = rawDataPacketToObject(resRaw[0]);
            resArr.push(res);
            return resArr;
        }
        else {
            let resArr = [];
            for (let i = 0; i < resRaw.length; i++) {
                let res = rawDataPacketToObject(resRaw[i]);
                resArr.push(res);
            }
            return resArr;
        }
    }
    else {
        return [];
    }

}

async function call(func, params) {

    if (params !== null && params !== undefined && params.length > 0)
        params.forEach(param => {
            param = mysql_real_escape_string(param);
        });

    let result = { success: false, query: '', params: {} };

    try {
        let sql = mysql.format('CALL ' + func, params);

        result.query = sql;


        let resRaw = await pool.query(sql);

        let resRawObj = rawDataPacketToObject(resRaw);

        if (resRaw.length == undefined || resRaw.length < 2) {
            return result;
        }
        let callResult = rawDataPacketToObject(resRaw[0][0]);
        result.params = callResult;
        result.success = callResult['@flag'] == 1;
    } catch (err) {
        console.log(err);
    } finally {
        return result;
    }


    /*
    let result = {success: false, query: '', params: {}};

    let sql = mysql.format('CALL ' + func, params);

    result.query = sql;
    
    let resRaw = await pool.query(sql);

    let resRawObj = rawDataPacketToObject(resRaw);

    if (resRaw.length == undefined || resRaw.length < 2) {
        return result;
    }
    let callResult = rawDataPacketToObject(resRaw[0][0]);
    result.params = callResult;
    result.success = callResult['@flag'] == 1;
 
    return result;
    */


}

async function exec(command, params) {

    if (params !== null && params !== undefined && params.length > 0)
        params.forEach(param => {
            param = mysql_real_escape_string(param);
        });

    let sql = mysql.format(command, params);

    let resRaw = await pool.query(sql).catch(err => { console.log('EXEC ERROR!'); console.log(command); console.log(params); console.log(err); return {}; });

    let res = rawDataPacketToObject(resRaw);

    return res.affectedRows > 0;

}

async function insert(command, params) {

    if (params !== null && params !== undefined && params.length > 0)
        params.forEach(param => {
            param = mysql_real_escape_string(param);
        });

    let sql = mysql.format(command, params);

    let resRaw = await pool.query(sql).catch(err => { console.log('INSERT ERROR!'); console.log(command); console.log(params); console.log(err); return false; });

    let res = rawDataPacketToObject(resRaw);
    if (res.affectedRows == 0) throw new Error(`Couldn't be inserted!`);

    return res.insertId;

}


function rowToSet(row) {
    let keys = Object.keys(row);
    let setVariables = keys.join(' = ?, ') + ' = ?'
    let setParams = keys.map(key => row[key]);
    return { setVariables: setVariables, setParams: setParams };
}


module.exports = {

    pool: pool,
    select: select,
    query: query,
    call: call,
    exec: exec,
    insert: insert,
    rowToSet: rowToSet
    /*
    select(table, column, id) {
        
        let sql = "SELECT * FROM ?? WHERE ?? = ?";
        let inserts = [table, column, id];
        sql = mysql.format(sql, inserts);
        
        await pool.query(sql, function (err, result, fields) {
            if (err) throw new Error(err)
            
            console.log(result[0].personaName);
            return result;
        });
        
    },
    
    query(sql, objects) {
        
        
    },
    
    pool : pool
    */

}