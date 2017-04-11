
var logger = require("../logger")(); // logger iséo

var pg = require('pg');
var db_global = require('./db_global');
//var aSync = require('async');

var connectionString  = db_global.getConnectionString();
var isPgConnectionKO  = db_global.isPgConnectionKO;
var handleQueryError  = db_global.handleQueryError;
var parseReqRecord    = db_global.parseReqRecord;
//var toSqlInsertString = db_global.toSqlInsertString;
var toSqlUpdateString = db_global.toSqlUpdateString;
//var removeRecordField = db_global.removeRecordField;

// ------------------ ACCES A LA TABLE ----------------------

var pk = "idlog"; // primary key autoincrementable de la table

module.exports.tableSelect = function( req, callback ) {
    
    /* table : mot clé qui sert :
       1- à identifier l'objet de parametre qui correspond a un enregistrement de la table qui est transmis par la requete,
       2- à nommer l'objet racine pour la réponse
       3- à nommer la table 
    */
    var table = req.table;
    var idlog = req.user.idlog;

    // get a pg client from the connection pool
    pg.connect( connectionString, function( err, client, done ) {
        
        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }
        
        // request ...
        
        var params = [ idlog ];
        
        var sql = "SELECT ";
        sql += "l.idlog, l.*, lng.local_name, lng.english_name "; 
        sql += "from login l, language lng ";
        sql += "WHERE ";
        sql += "l.idlng = lng.idlng ";
        sql += "AND l.idlog = $1";
        
        //logger.trace( "request : %s", sql );
        
        var query = client.query( sql , params );
        
        query.on( 'error', function( error ) {
            logger.error( "on request : %s", sql );
            logger.error( error.message );
            handleQueryError( done, callback, error.message );
        });
        
        query.on( 'row', function( row, results ) {
            //logger.trace( "%j", row );
            
            row[ "language" ] = {
                "local_name" : row[ "local_name" ],
                "english_name" : row[ "english_name" ]
            };
            
            delete row[ "local_name"];
            delete row[ "english_name"];
            delete row[ "password"];
            
            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });
        
        query.on( 'end', function( result ) {
            
            done();
            //logger.trace( "tableSelect " + table + " return %d row(s)", result.rows.length );

            var answer = {};
            answer[ table ] = result.rows;
            callback( answer, 200 );
        });
    });
};

module.exports.tableUpdate = function( req, callback ) {
    
    var table = req.table;
    var idlog = req.user.idlog;
    var record = parseReqRecord( req, table );

    if( record == undefined )
    {
        callback(  { "success" : false, "error" : "record object not found" }, 500 );
        return;
    }
    if( isNaN( record[ pk ] ))
    {
        // on doit obligatoirement avoir une clé primaire identifiant une unique rangée
        callback(  { "success" : false, "error" : "invalid primay key" }, 500 );
        return;
    }
    
    logger.trace( "security check : update table login pk idlog =%d auth as idlog =%d", record[pk], req.user.idlog );
    if( record[pk] != idlog ) {
        // on essaie d'updater une autre ligne login que celle pour laquelle on est authentifié
        // opération non autorisée
        callback({ "success": false, "error": "forbidden" }, 403 );
        logger.warning( "security check : FAILED" );
    }

    // get a pg client from the connection pool
    pg.connect( connectionString, function( err, client, done ) {
        
        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }
        
        // request ...
        
        record[ "dateupdate" ] = "autofilled"; // ajout de la propriété si elle n'est pas déja présente dans record
        
        var params = [];
        var sql = "UPDATE " + table + toSqlUpdateString( record, pk, params ) + " RETURNING " + pk + ", *";
            
        //logger.trace( "request : %s", sql );
        
        var query = client.query( sql, params );
        
        query.on( 'error', function( error ) {
            logger.error( "on request : %s", sql );
            logger.error( error.message );
            handleQueryError( done, callback, error.message );
        });
        
        query.on( 'row', function( row, results ) {
            //logger.trace( "%j", row );
            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });
        
        query.on( 'end', function( result ) {
            done();
            
            var answer = {};
            answer[ table ] = result.rows[0]; // on renvoie généralement la clé primaire de l'enregistrement
            callback( answer, 200 );
        });
    });
};
