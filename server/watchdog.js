
var logger = require("./logger")(); // logger iséo
var moment  = require('moment');
var momentz = require('moment-timezone');
var pg = require('pg');
var sio = require('./socket_io')();
var util = require('./util.js');

var db_global = require('./models/db_global');
var connectionString  = db_global.getConnectionString();
var isPgConnectionKO  = db_global.isPgConnectionKO;
var handleQueryError  = db_global.handleQueryError;

function watchDog() {

    this.init = function()
    {
        // 1°) - on programme une heure d'arret automatique (le server sera alors relancé par le processus parent )
        
        var now =  moment.utc();
        //var stopdate = moment.utc().endOf( 'hour'   );
        //var stopdate = moment.utc().endOf( 'minute' );
        var stopdate = moment.utc({ // default to today
            hour: 23,
            minute: 45,
            seconds: 0,
            milliseconds: 0
        });
        
        var ttlms = stopdate.valueOf() - now.valueOf();
        while( ttlms < 0 ) 
        {
            stopdate.add( 1, 'day' );
            ttlms = stopdate.valueOf() - now.valueOf();
        }

        console.log( "auto-shutdown scheduled at %s UTC (TTL =%d sec)", stopdate.format('YYYY/MM/DD HH:mm:ss'), util.round(ttlms/1000) );
        logger.info( "auto-shutdown scheduled at %s UTC (TTL =%d sec)", stopdate.format('YYYY/MM/DD HH:mm:ss'), util.round(ttlms/1000) );

        setTimeout( function(){
            
  		    logger.info( "auto-shutdown as scheduled.");
  		    process.exit(0);
  		    
        }, ttlms );
        
        // 2°) - on lance une boucle chargée de faire des requetes de test sur la base
        
        var pendingCount = 0; // nb de requetes de test non terminée
        setInterval( function(){
            
            //console.log( 'query test ...');
            
            if( pendingCount > 0 )
            {
      		    logger.info( "auto-shutdown (as query test pendingCount=%d)", pendingCount );
      		    process.exit(0);
            } 

            pendingCount++; // on commence une requete de test
            
            // get a pg client from the connection pool
            pg.connect( connectionString, function( err, client, done ) {
                
                // handle the error of connection
                if( isPgConnectionKO( err, done )) { return; }
        
                // on obtient l'age en seconde du dernier access client
                var query = client.query( "select ROUND( EXTRACT( EPOCH FROM MIN( CURRENT_TIMESTAMP - dateaccess ))) lastaccess from session" );

                query.on( 'error', function( error ) {
                    logger.error( "ERROR : " + error.message );
                    handleQueryError( done );
                });
                
                query.on( 'row', function( row, results ) {
                    logger.trace( "query test ok : active sio count =%d last access = %d", sio.getActiveSessionsCount(), row.lastaccess );
                });
                
                query.on( 'end', function() {
                    done(); // release the connection
                    pendingCount--; // this query is not pending any more
                });
            });
        }, 5 * 60000 ); // test toutes les 5 minutes
    };
}

logger.info( "watchdog object created." );

var wd = new watchDog();  // construction de l'objet pour la gestion du watchdog

module.exports = function() {
    return wd; // retourne l'instance crée
};

