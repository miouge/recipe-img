
var logger = require("../logger")(); // logger iséo

var pg = require('pg');
var db_global = require('./db_global');

var connectionString  = db_global.getConnectionString();
var isPgConnectionKO  = db_global.isPgConnectionKO;
var handleQueryError  = db_global.handleQueryError;
var parseReqRecord    = db_global.parseReqRecord;
//var toSqlInsertString = db_global.toSqlInsertString;
var toSqlUpdateString = db_global.toSqlUpdateString;
//var removeRecordField = db_global.removeRecordField;

// ------------------ ACCES A LA TABLE ----------------------

var pk = "idsite"; // primary key autoincrementable de la table

module.exports.tableSelect = function( req, callback ) {

    var idcust = req.user.idcust;
    
    /* table : mot clé qui sert :
       1- à identifier l'objet de parametre qui correspond a un enregistrement de la table qui est transmis par la requete,
       2- à nommer l'objet racine pour la réponse
       3- à nommer la table 
    */
    var table = req.table;

    // get a pg client from the connection pool
    pg.connect( connectionString, function( err, client, done ) {
        
        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }
        
        // request ...
        
        var params = [ idcust ];
        
        var sql = "SELECT DISTINCT s.idsite, s.* "; // il faut faire un distinct sinon il y a une ligne par cairnet + 1 ligne par cairsens
        
        // seulement les sites qui ont un equipement assigné a notre identifiant de customer
        
        sql += "FROM site s, equipment_assignment ea ";
        sql += "WHERE ea.idsite = s.idsite ";
        sql += "AND ea.idcust = $1 ";
        sql += "ORDER BY s.idsite";

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
    
    // get a pg client from the connection pool
    pg.connect( connectionString, function( err, client, done ) {
        
        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }
        
        // request ...
        
        record[ "dateupdate" ] = "autofilled"; // ajout de la propriété si elle n'est pas déja présente dans record
        
        var params = [];
        var sql = "UPDATE " + table + toSqlUpdateString( record, pk, params ) + " RETURNING " + pk + ", *";

        //logger.trace( "request : %s params : %j", sql, params );
        
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
