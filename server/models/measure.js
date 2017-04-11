
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

// ------------------ ACCES A LA TABLE ----------------------

var pk = "idmeas"; // primary key autoincrementable de la table

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
    // ToDo : limiter l'accès  a un idmeas seulement
    
    // get a pg client from the connection pool
    pg.connect( connectionString, function( err, client, done ) {
        
        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }
        
        // request ...
        
        var params = [ idcust ];
        
        var sql = "SELECT m.idmeas, m.* ";
        
        // seulement certaine measures
        
        sql += "FROM site s, measure m, equipment_assignment ea ";
        sql += "WHERE ea.idass = m.idass ";
        sql +=  "AND ea.idsite = s.idsite ";
        sql +=  "AND COALESCE( ea.status, 0 ) >= 2 ";
        sql +=  "AND ea.idcust = $1 ";
        
        sql += "ORDER BY m.idmeas";

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
    
    var idmeas = record[ pk ];

    var securityCheck = function( client, done, cb ) { // param 1, param 2 ..., cb 
    
        // on verifie que l'idmeas spécifié fait bien partie du scope de ce client
    
        var params = [idmeas, idcust];

        var request = "SELECT m.idmeas ";
        request += "FROM measure m ";
        request += "INNER JOIN equipment_assignment ea ON ea.idass = m.idass ";
        request += "WHERE m.idmeas = $1 AND ea.idcust = $2";

        //logger.trace( "request : %s", request );

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
                logger.warn( "securityCheck FAIL this idmeas is not with the customer scope !" );
                var err = {};
                err[ 'message' ] = "forbidden idmeas";
                return cb( err, client, done, 403 ); // erreur, parametre 1, parametre2
            }
            
            // logger.trace( "securityCheck OK idmeas = %j", result.rows );
            // on passe a la methode suivante ou a la gestion d'erreur
            return cb( null, client, done ); // erreur, parametre 1, parametre2
        });            
    };

    var update = function( client, done, cb ) { // param 1, param 2 ..., cb

        // update request for this idmeas ...
        
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
