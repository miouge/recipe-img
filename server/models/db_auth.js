var logger = require("../logger")(); // logger iséo

var pg = require('pg');
var bcrypt = require('bcrypt-nodejs'); // npm install bcrypt-nodejs
var moment = require('moment');
var momentz = require('moment-timezone');

var db_global = require('./db_global');
var connectionString  = db_global.getConnectionString();
var isPgConnectionKO  = db_global.isPgConnectionKO;
var handleQueryError  = db_global.handleQueryError;

module.exports.checkAuthentification = function( username, password, callback ) {
    
    logger.trace( "checkAuthentification of %s / %s ...", username, password );

    // get a pg client from the connection pool
    pg.connect( connectionString, function(err, client, done) {
        
        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }
        
        var params = [ username ];
        
        var sql = "SELECT l.idlog, l.password, l.firstname, l.surname, l.tzdisplay , lg.english_name lng, c.idcust, ";
        sql +=    "to_char( c.dateend, 'yyyy/mm/dd hh24:mi:ss' ) dateendz "; // date d'expiration de l'abonnement au service
        sql +=    "FROM login l, language lg, customer c ";
        sql +=    "WHERE login = $1 ";
        sql +=    "AND l.idlng = lg.idlng ";
        sql +=    "AND l.idcust = c.idcust ";

        //logger.trace( "request : %s", sql );

        var query = client.query( sql, params );
        
        query.on( 'error', function( error ) {
            logger.error( "ERROR : " + error.message );
            handleQueryError( done, callback );
        });
        
        query.on( 'row', function( row, results ) {
            //logger.trace( "%j", row );
            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });
        
        query.on( 'end', function( result ) {
            
            //logger.trace( "record count = %d", result.rows.length );
            
            var isDateOK = true; // end of subscription date not reach
            var isUserOK = false; // user found into db
            var isPasswordOK = false; // password supplied is correct
            var firstname;
            var surname;
            var tzdisplay;
            var language;
            
            if( result.rows.length > 0 )
            {
                isUserOK = true;
                var idlog  = result.rows[0].idlog;
                var idcust = result.rows[0].idcust;
                
                // verification du password 
                if( result.rows[0].password.length == 0 )
                {
                    // champ password vide en db : autorisation accordée !
                    isPasswordOK = true;
                }
                else
                {
                    if( result.rows[0].password.length <= 20 )
                    {
                        // comparaison d'un password stocké en clair
                        if( password == result.rows[0].password )
                        {
                            isPasswordOK = true;
                        }
                    }
                    else
                    {
                        // comparaison du password fournie avec la version encrytée en bdd
                        isPasswordOK = bcrypt.compareSync( password, result.rows[0].password );
                    }
                }
                
                // verification de la date de fin d'abonnement au service
                isDateOK = true;
                if( result.rows[0].dateendz != null )
                {
                    // il y a une date de fin abonnement spécifiée pour ce client
                    var endof = moment.tz( result.rows[0].dateendz, 'YYYY/MM/DD HH:mm:ss', "UTC"); // chaine UTC => moment.tz UTC
                    //logger.trace("date de fin d'abonnement au service : %s", endof.format('YYYY/MM/DD HH:mm:ss') );
                    
                    var now = moment.tz();
                    //console.log("date actuelle : %s", now.format('YYYY/MM/DD HH:mm:ss') );
                    
                    if( now > endof )
                    {
                        // l'abonnement au service est expiré
                        logger.trace("the end of subscription date (%s UTC) is reached", endof.format('YYYY/MM/DD HH:mm:ss') );
                        isDateOK = false;
                    }
                }
            }
            
            if( isPasswordOK )
            {
                firstname = result.rows[0].firstname;
                surname   = result.rows[0].surname;
                tzdisplay = result.rows[0].tzdisplay;
                language = result.rows[0].lng;
            }
            
            done();
            callback( isUserOK, isPasswordOK, isDateOK, idlog, idcust, firstname, surname, tzdisplay, language );
        });
    });
};

module.exports.createSession = function( idlog, sessionid, callback ) {
    
    logger.info( "createNewSession for idlog=%d sessionid=%s ...", idlog, sessionid );

    // get a pg client from the connection pool
    pg.connect( connectionString, function(err, client, done) {
        
        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }
        
        var lsessionid = '_' + sessionid + '_'; // pour differencier le sessionid de notre sessionid authentifié
        
        // on efface une précédente session pour ce username
        // on efface un précédent login pour cette session
        
        var params = [ idlog, lsessionid ];
        var query = client.query("DELETE FROM session where idlog = $1 OR lsessionid = $2", params );
        
        query.on( 'error', function( error ) {
            logger.error( "ERROR : " + error.message );
            handleQueryError( done, callback );
        });

        var params2 = [ idlog, lsessionid ];
        var query2 = client.query( "INSERT INTO session( idlog, lsessionid, datecreate, dateaccess ) values( $1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP )", params2,
        function( error ) {
            if( error )
            {
                logger.warn( "insert %j : ERROR", params );
                logger.warn( "request : %s", query.text );
                logger.warn( "error : %s", error.message );
            }
            else
            {
                //logger.trace( "insert %j : OK", params );
            }
        });

        query2.on( 'end', function( result ) {
            
            done();
            callback( lsessionid );
        });
    });
};

module.exports.destroySession = function( lsessionid, callback ) {
    
    logger.info( "destroy session for lsessionid = %s ...", lsessionid );

    // get a pg client from the connection pool
    pg.connect( connectionString, function(err, client, done) {
        
        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }

        // on efface la session
        
        var params = [ lsessionid ];
        var query = client.query("DELETE FROM session where lsessionid = $1", params );
        
        query.on( 'error', function( error ) {
            logger.trace( "ERROR : " + error.message );
            handleQueryError( done, callback );
        });
        
        query.on( 'end', function( result ) {
            
            done();
            callback( false ); // return no error
        });
    });
};

module.exports.getInfoFromSession = function( lsessionid, callback ) {
    
    // logger.trace( "getInfoFromSession for %s ...", lsessionid );

    // get a pg client from the connection pool
    pg.connect( connectionString, function(err, client, done) {
        
        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }

        var params = [ lsessionid ];

        var sql = "SELECT s.lsessionid, l.idlog, l.login, l.firstname, l.surname, l.tzdisplay, c.idcust ";
        sql +=    "FROM session s, login l, customer c ";
        sql +=    "WHERE s.lsessionid = $1 ";
        sql +=    "AND s.idlog = l.idlog ";
        sql +=    "AND c.idcust = l.idcust ";

        //logger.trace( "request : %s", sql );
        
        var query = client.query( sql, params );
        
        query.on( 'error', function( error ) {
            logger.trace( "ERROR : " + error.message );
            handleQueryError( done, callback );
        });
        
        query.on( 'row', function( row, results ) {
            //logger.trace( "%j", row );
            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });
        
        query.on( 'end', function( result ) {
            
            //logger.trace( "record count = %d", result.rows.length );
            
            var answer;

            if( result.rows.length > 0 ) {
                
                answer = result.rows[0];
                
                // update date of last access
                
                var query2 = client.query( "UPDATE session set dateaccess = CURRENT_TIMESTAMP WHERE lsessionid = $1", [lsessionid] );
                
                query2.on( 'end', function( result ) {

                    done();
                    callback( answer );
                });
            }
            else
            {
                done();
                callback( answer );
            }
        });
    });
};

module.exports.getActivity = function( lsessionids, callback ) {
    
    //logger.trace( "getActivity ..." );

    // get a pg client from the connection pool
    pg.connect( connectionString, function(err, client, done) {
        
        // handle the error of connection
        if( isPgConnectionKO( err, done, callback )) { return; }

        var params = [ lsessionids ]; // lsessionids est déja un tableau de lsessionids

        var sql = "SELECT c.company, l.login, l.firstname, l.surname, s.datecreate, s.dateaccess, l.idlog, c.idcust ";
        sql +=    "FROM session s ";
        sql +=    "INNER JOIN login l ON s.idlog = l.idlog ";
        sql +=    "INNER JOIN customer c ON c.idcust = l.idcust ";
        sql +=    "WHERE s.lsessionid = ANY ($1) ";
        sql +=    "ORDER BY c.idcust ASC ";

        //logger.trace( "request : %s", sql );
        
        var query = client.query( sql, params );
        
        query.on( 'error', function( error ) {
            logger.trace( "ERROR : " + error.message );
            handleQueryError( done, callback );
        });
        
        query.on( 'row', function( row, results ) {
            logger.trace( "%j", row );
            results.addRow(row); // accumule les records dans l'objets result, cela permettra d'utiliser result.rows[] dans le gestionnaire de l'event 'end'
        });
        
        query.on( 'end', function( result ) {
            done();
            callback( { activity : result.rows } );
        });
    });
};