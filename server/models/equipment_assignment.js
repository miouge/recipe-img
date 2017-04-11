
var logger = require("../logger")(); // logger iséo

var pg = require('pg');
var db_global = require('./db_global');

var connectionString  = db_global.getConnectionString();
var isPgConnectionKO  = db_global.isPgConnectionKO;
var handleQueryError  = db_global.handleQueryError;
var parseReqRecord    = db_global.parseReqRecord;
var toSqlInsertString = db_global.toSqlInsertString;
var toSqlUpdateString = db_global.toSqlUpdateString;
var removeRecordField = db_global.removeRecordField;

// ------------------ ACCES A LA TABLE ----------------------

var pk = "idass"; // primary key autoincrementable de la table

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
        
        var sql = "SELECT ";
        sql += "equipment_assignment.idass, equipment_assignment.*, ";
        sql += "site.idsite _idsite, site.tagloc, ";
        sql += "equipment_model.type, equipment_model.model, equipment_model.manufacturer, equipment_model.version, equipment_model.imageid ";
        sql += "from equipment_assignment ";
        
        sql += "left outer join site "; // même pour les equipements qui ne sont pas affecté a un idsite
        sql += "on site.idsite = equipment_assignment.idsite ";
        
        sql += "inner join equipment_model "; // inner join : jointure classique
        sql += "on equipment_model.idmod = equipment_assignment.idmod ";
        
        sql += "WHERE equipment_assignment.idcust = $1 ";
        
        //logger.trace( "request : %s", sql );
        
        var query = client.query( sql , params );
        
        query.on( 'error', function( error ) {
            logger.error( "on request : %s", sql );
            logger.error( error.message );
            handleQueryError( done, callback, error.message );
        });
        
        query.on( 'row', function( row, results ) {

            row[ "site" ] = {
                "idsite" : row[ "_idsite" ],
                "tagloc" : row[ "tagloc" ]
            };
            delete row[ "_idsite" ];
            delete row[ "tagloc" ];

            row[ "equipment_model" ] = {
                "type" : row[ "type" ],
                "model" : row[ "model" ],
                "manufacturer" : row[ "manufacturer" ],
                "version" : row[ "version" ],
                "imageid" : row[ "imageid" ]
            };
            delete row[ "type" ];
            delete row[ "model" ];
            delete row[ "manufacturer" ];
            delete row[ "version" ];
            delete row[ "imageid" ];

            //logger.trace( "%j", row );
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

module.exports.tableInsert = function( req, callback ) {
    
    var table = req.table;

    var record = parseReqRecord( req, table );
    var idcust = req.user.idcust;
    
    if( record == undefined )
    {
        callback(  { "success" : false, "error" : "record object not found" }, 500 );
        return;
    }
    
    // get a pg client from the connection pool
    pg.connect( connectionString, function( err, client, done ) {
        
        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }
        
        removeRecordField( record, "tagloc_serial_number" );
        removeRecordField( record, "model" );
        record[ "idcust" ] = idcust; // insertion pour ce user
        record[ "dateupdate" ] = "autofilled"; // ajout de la propriété si elle n'est pas déja présente dans record

        // request ...

        var params = [];
        var sql = "INSERT INTO " + table + toSqlInsertString( record, pk, params ) + " RETURNING " + pk + ", *";
        
        //logger.trace( "request : %s params : %s", sql );
        
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
            answer[ table ] = result.rows[0]; // on renvoie la clé primaire de l'enregistrement
            callback( answer, 200 );
        });
    });
};

module.exports.tableDelete = function( req, callback ) {
    
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

        var params = [ record[ pk ] ];
        var sql = "UPDATE equipment_assignment SET parent=null, idsite=null where parent=$1";

        //logger.trace( "request : %s params %s", sql, params );
        
        var query = client.query( sql, params );
        
        query.on( 'error', function( error ) {
            logger.error( "on request : %s", sql );
            logger.error( error.message );
            handleQueryError( done, callback, error.message );
        });
        
        query.on( 'end', function( result ) {
            
            var params2 = [ record[ "idass" ] ];
            var sql2 = "DELETE FROM equipment_assignment WHERE idass = $1";
            
            //logger.trace( "request : %s params %s", sql2, params2 );
            
            var query2 = client.query( sql2, params2 );
            
            query2.on( 'error', function( error ) {
                logger.error( "on request : %s, params : %s", sql2, params2 );
                logger.error( error.message );
                handleQueryError( done, callback, error.message );
            });
            
            query2.on( 'end', function( result ) {
                done();
                var answer = { "success" : true };
                callback( answer, 200 );
            });
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
