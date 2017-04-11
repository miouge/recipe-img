
var logger = require("../logger")(); // logger iséo

var pg = require('pg');
var db_global = require('./db_global');
var aSync = require('async');

var connectionString  = db_global.getConnectionString();
var isPgConnectionKO  = db_global.isPgConnectionKO;
var handleQueryError  = db_global.handleQueryError;
var parseReqRecord    = db_global.parseReqRecord;
//var toSqlInsertString = db_global.toSqlInsertString;
var toSqlUpdateString = db_global.toSqlUpdateString;
//var removeRecordField = db_global.removeRecordField;

// fonction de connection pour l'async/waterfall
var connect = function( cb ) {

    pg.connect(connectionString, function(err, client, done) {
        
        return cb( err, client, done ); // erreur, parametre 1, parametre2
    });
};

function post_update_alert_setting( idaggr ) {

    logger.trace( "post traitement on alert setting update (idaggr=%d) ... ", idaggr );

    var selectSite = function( client, done, cb ) { // param 1, param 2 ..., cb 

            // on se procure l'idsite de cette aggreg pour poster un job de controle d'alerte
            // mais seulement si le flag_alert du customer = true
            
            var params = [idaggr];

            var request = "SELECT ea.idsite ";
            request += "FROM measure m ";
            request += "INNER JOIN equipment_assignment ea ON ea.idass = m.idass ";
            request += "INNER JOIN customer c ON c.idcust = ea.idcust ";
            request += "INNER JOIN aggreg a ON a.idmeas = m.idmeas ";
            request += "WHERE a.idaggr = $1 ";
            request += "AND COALESCE( c.flag_alert, false ) = true ";
            request += "AND COALESCE( ea.status, 0 ) >= 2 ";

            //logger.trace( "request : %s", request );
    
            var query = client.query( request, params);
    
            query.on('error', function(err) {
                
                err[ 'request' ] = request; // on sauvegarde le texte de la requete
                return cb( err, client, done ); // erreur, parametre 1, parametre2
            });
    
            query.on('row', function(row, results) {
                results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
            });
    
            query.on('end', function(result) {
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
                //logger.trace( "request : %s", request );
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
        function(err, client, done, response){
            
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

var pk = "idaggr"; // primary key autoincrementable de la table

module.exports.tableSelect = function( req, callback ) {

    /* table : mot clé qui sert :
       1- à identifier l'objet de parametre qui correspond a un enregistrement de la table qui est transmis par la requete,
       2- à nommer l'objet racine pour la réponse
       3- à nommer la table 
    */

    var table = req.table;
    var idcust = req.user.idcust;
    //var record = parseReqRecord( req, table );    
    //logger.trace( "record = %j", record );
    // ToDo : limiter l'accès  a un idaggr seulement
    
    // get a pg client from the connection pool
    pg.connect( connectionString, function( err, client, done ) {
        
        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }
        
        // request ...
        
        var params = [ idcust ];
        
        var sql = "SELECT a.idaggr, a.* ";
        
        // seulement la portion visible pour client
        
        sql += "FROM equipment_assignment ea ";
        sql += "INNER JOIN measure m on m.idass = ea.idass ";
        sql += "INNER JOIN aggreg a on a.idmeas = m.idmeas ";
        sql += "WHERE ";
        sql += "COALESCE( ea.status, 0 ) >= 2 ";
        sql += "AND ea.idcust = $1 ";
        sql += "ORDER BY a.idaggr";

        //logger.trace( "request : %s", sql );
        
        var query = client.query( sql , params );
        
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
            logger.trace( "tableSelect " + table + " return %d row(s)", result.rows.length );

            var answer = {};
            answer[ table ] = result.rows;
            callback( answer, 200 );
        });
    });
};

module.exports.tableUpdate = function( req, callback ) {
    
    var table = req.table;
    var idcust = req.user.idcust;    
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
    
    var idaggr = record[ pk ];

    var securityCheck = function( client, done, cb ) { // param 1, param 2 ..., cb 
    
        // on verifie que l'idaggr spécifié fait bien partie du scope de ce client
    
        var params = [idaggr, idcust];

        var request = "SELECT a.idaggr ";
        
        request += "FROM equipment_assignment ea ";
        request += "INNER JOIN measure m on m.idass = ea.idass ";
        request += "INNER JOIN aggreg a on a.idmeas = m.idmeas ";
        request += "WHERE ";
        request +=  "COALESCE( ea.status, 0 ) >= 2 ";
        request +=  "AND  a.idaggr = $1 ";
        request +=  "AND ea.idcust = $2 ";

        logger.trace( "request : %s", request );

        var query = client.query( request, params );

        query.on('error', function(err) {
            
            err[ 'request' ] = request; // on sauvegarde le texte de la requete
            return cb( err, client, done ); // erreur, parametre 1, parametre2
        });

        query.on('row', function(row, results) {
            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });

        query.on('end', function(result) {
            
            if( result.rows.length == 0 )
            {
                // la mesure ne fait pas partie du scope de ce client
                logger.warn( "securityCheck FAIL this idaggr is not with the customer scope !" );
                var err = {};
                err[ 'message' ] = "forbidden idaggr";
                return cb( err, client, done, 403 ); // erreur, parametre 1, parametre2
            }
            
            // logger.trace( "securityCheck OK idaggr = %j", result.rows );
            // on passe a la methode suivante ou a la gestion d'erreur
            return cb( null, client, done ); // erreur, parametre 1, parametre2
        });            
    };

    var update = function( client, done, cb ) { // param 1, param 2 ..., cb

        // update request for this idaggr ...
        
        record[ "dateupdate" ] = "autofilled"; // ajout de la propriété si elle n'est pas déja présente dans record
        
        var params = [];
        var request = "UPDATE " + table + toSqlUpdateString( record, pk, params ) + " RETURNING " + pk + ", *";
            
        //logger.trace( "request : %s", request );
        
        var query = client.query( request, params );
     
        query.on('error', function(err) {
            
            err[ 'request' ] = request; // on sauvegarde le texte de la requete
            return cb( err, client, done ); // erreur, parametre 1, parametre2
        });
        
        query.on( 'row', function( row, results ) {

            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });
        
        query.on('end', function(result) {
            
            var answer = {};
            answer[ table ] = result.rows[0]; // on renvoie la clé primaire de l'enregistrement puis la valeur de tous les champs
                        
            if( record.hasOwnProperty("alert_level")|| record.hasOwnProperty("alert_duration")) {
                
                // au moins une modification sur le réglage du seuil d'alerte
                // est présent dans la requête d'update
                // on lance un post-traitement (résolution asynchrone)
                post_update_alert_setting( record[ pk ] );
            }
            
            // on passe a la methode suivante ou a la gestion d'erreur
            return cb( null, client, done, 200, answer ); // erreur, parametre 1, parametre2
        });           
    };

    aSync.waterfall(
        [
            connect,
            securityCheck,
            update
        ],
        function(err, client, done, httpcode, answer ){
            
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
                if( httpcode )
                {
                    callback( answer, httpcode );
                }
                else
                {
                    callback( answer, 500 );
                }
            }
            else
            {
                callback( answer, httpcode );
            }
        }
    );    
};
