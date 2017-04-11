
var logger = require("../logger")(); // logger iséo

var pg = require('pg');
var db_global = require('./db_global');
var aSync = require('async');

var connectionString = db_global.getConnectionString();
var isPgConnectionKO = db_global.isPgConnectionKO;
var handleQueryError = db_global.handleQueryError;
var parseReqRecord = db_global.parseReqRecord;
//var toSqlInsertString = db_global.toSqlInsertString;
var toSqlUpdateString = db_global.toSqlUpdateString;
//var removeRecordField = db_global.removeRecordField;

// fonction de connection pour l'async/waterfall
var connect = function( cb ) {

    pg.connect(connectionString, function(err, client, done) {
        
        return cb( err, client, done ); // erreur, parametre 1, parametre2
    });
};


function post_update_flag_alert( idcust ) {

    logger.trace( "post traitement on flag alert update (idcust=%d) ... ", idcust );

    var selectSite = function( client, done, cb ) { // param 1, param 2 ..., cb 

            // on se procure tout les idsites de ce customer
            
            var params = [idcust];

            var request = "SELECT DISTINCT idsite "; // sinon il y a 1 ligne par cairnet + les lignes des cairsens
            request += "FROM equipment_assignment ea ";
            request += "WHERE ea.idcust = $1 ";
            request += "AND COALESCE( ea.status, 0 ) >= 2 ";
            request += "ORDER BY idsite asc ";
    
            //logger.trace( "request : %s", sql );
    
            var query = client.query( request, params);
    
            query.on('error', function(err) {
                
                err[ 'request' ] = request; // on sauvegarde le texte de la requete
                return cb( err, client, done ); // erreur, parametre 1, parametre2
            });
    
            query.on('row', function(row, results) {
                results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
            });
    
            query.on('end', function(result) {
                //logger.trace("%d idsites found for idcust %s", result.rows.length, idcust );
                // on passe a la methode suivante ou a la gestion d'erreur
                return cb( null, client, done, result.rows ); // erreur, parametre 1, parametre2
            });            
    };

    var insertJobAlert = function( client, done, idsites, cb ) { // param 1, param 2 ..., cb

            // idsites est un tableau d'objet exemple { idsite : 41 } 
            
            if( idsites.length > 0 )
            {
                // on prepare une requete d'insertion multiple
                var request =  "INSERT INTO job_alert( asker, idsite ) VALUES ";
                
                idsites.forEach( function( item, index, array ) {
                    
                    if( index > 0 ) request += ",";
                    request += "('NodeJS'," + item.idsite + ")";
                });
                // logger.trace( "request : %s", request );
            }
            
            if( request )
            {
                var params = [];
                var query = client.query( request, params);
        
                query.on('error', function(err) {
                    err[ 'request' ] = request; // on sauvegarde le texte de la requete
                    return cb( err, client, done ); // erreur, parametre 1, parametre2
                });
        
                query.on('end', function(result) {
                    logger.info( "request : %s : OK", request );
                    // on passe a la methode suivante ou a la gestion d'erreur
                    return cb( null, client, done ); // erreur, parametre 1, parametre2
                });
            }
            else
            {
                // on passe a la methode suivante ou a la gestion d'erreur
                return cb( null, client, done ); // erreur, parametre 1, parametre2
            }
    };

    aSync.waterfall(
        [
            connect,
            selectSite,
            insertJobAlert
        ],
        function( err, client, done, response ) {
            
            if( client ) {
                // release the connection
                done();
            }         
            
            if( err ) {
                
                logger.error( "in waterfall happen an error !" );
                
                if( err.request )
                {
                    logger.error( "request <%s>", err.request );
                }
                if( err.message )
                {
                    logger.error( "message <%s>", err.message );
                }
            }
        }
    );
}

// ------------------ ACCES A LA TABLE ----------------------

var pk = "idcust"; // primary key autoincrementable de la table

module.exports.tableSelect = function(req, callback) {

    /* table : mot clé qui sert :
       1- à identifier l'objet de parametre qui correspond a un enregistrement de la table qui est transmis par la requete,
       2- à nommer l'objet racine pour la réponse
       3- à nommer la table 
    */
    var table = req.table;
    var idcust = req.user.idcust;

    // get a pg client from the connection pool
    pg.connect(connectionString, function(err, client, done) {

        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }

        // request ...

        var params = [idcust];

        var sql = "SELECT idcust, * FROM customer where idcust = $1";

        //logger.trace( "request : %s", sql );

        var query = client.query(sql, params);

        query.on('error', function(error) {
            logger.error("on request : %s", sql);
            logger.error(error.message);
            handleQueryError( done, callback, error.message );
        });

        query.on('row', function(row, results) {
            //logger.trace( "%j", row );
            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });

        query.on('end', function(result) {

            done();
            //logger.trace( "tableSelect " + table + " return %d row(s)", result.rows.length );

            var answer = {};
            answer[table] = result.rows;
            callback(answer, 200);
        });
    });
};

module.exports.tableUpdate = function(req, callback) {

    var table = req.table;
    var idcust = req.user.idcust;
    var record = parseReqRecord(req, table);

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

    logger.trace( "security check : update table customer pk idcust =%d auth as idcust =%d", record[pk], req.user.idcust );
    if (record[pk] != idcust) {
        // on essaie d'updater une autre ligne que celle pour laquelle on est authentifié
        // opération non autorisée
        callback({ "success": false, "error": "forbidden" }, 403);
        logger.warning( "security check : FAILED" );
    }

    // get a pg client from the connection pool
    pg.connect(connectionString, function(err, client, done) {

        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }

        // request ...

        record["dateupdate"] = "autofilled"; // ajout de la propriété si elle n'est pas déja présente dans record

        var params = [];
        var sql = "UPDATE " + table + toSqlUpdateString(record, pk, params) + " RETURNING " + pk + ", *";

        //logger.trace( "request : %s", sql );

        var query = client.query(sql, params);

        query.on('error', function(error) {
            logger.error("on request : %s", sql);
            logger.error(error.message);
            handleQueryError( done, callback, error.message );
        });

        query.on('row', function(row, results) {
            //logger.trace( "%j", row );
            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });

        query.on('end', function(result) {
            done();
            
            var answer = {};
            answer[table] = result.rows[0]; // on renvoie généralement la clé primaire de l'enregistrement
            callback(answer, 200);
            
            if( record.hasOwnProperty("flag_alert")) {
                // si le flag_alert est présent dans la requete d'update
                post_update_flag_alert( req.user.idcust );
            }
        });
    });
};
