var logger = require("./logger")(); // logger iséo

function socketIoMgr() {
    
    // liste des connections par socket io ouvertes 
    // clé : lsessionid  + @ + socket io id ( _sqCnSmIb33u3qfL2Ss98gwnPv0raDWDN_ @ SD630YCneGKijt9xAAAA )
    // valeur : handle sur la socket io
    
    this.activeSessions = {},
    
    this.getActiveSessionsCount = function() {

        return Object.keys( this.activeSessions).length;
    },
    
    this.get = function( callback )  {
        
        // on renvoi un tableau contenant les lsessionid ( _sqCnSmIb33u3qfL2Ss98gwnPv0raDWDN_ ) des sessions io active
        var lsessionids = [];
        
        for( var ref in this.activeSessions )
        {
            // pour chaque clé de la liste
            (function(){
                var refs = ref.split("@", 1); // separation lsessionid et socket id (mais on ne prend que le 1er champ)
                if( refs.length > 0 )
                {
                    lsessionids.push( refs[0] );
                }
            })();
        }

        return lsessionids;
    },
 
    this.send = function( lsessionid, message, callback )  {
        // envoi d'un message a l'attention de toutes les sessions io de cette session navigateur
        // (il peut y avoir plusieurs sessions io par session navigateur)
        
        var me = this;
        
        var count = 0;
        for( var ref in this.activeSessions )
        {
            // pour chaque clé de la liste
            
            (function(){
                
                var refs = ref.split("@", 1); // separation lsessionid et socket id (mais on ne prend que le 1er champ)
                
                if( refs.length > 0 )
                {
                    if( refs[0] == lsessionid ) {
                        
                        // c'est l'une des connections io de cette session navigateur
                        
                        var socket = me.activeSessions[ref];
                        message.timestamp =  new Date().toISOString("hh:mm:ss");
                        socket.emit( "server-message", message );
                        count++;
                    }
                }
            })();
        }
        
        if( count == 0 )
        {
            // si aucune socket io n'est active pour cette session
            callback();
        }
        else
        {
            logger.trace("socket io : %d message emitted for lsessionid %s", count, lsessionid );
        }
    },
 
    this.init = function( server, session, callback )  {
        
        var me = this;
        
        var io = require("socket.io").listen(server);
        //io.set('heartbeat interval', 25000 );
        //io.set('heartbeat timeout',  120000 ); // valeur par defaut 60 000
        
        var ios = require('socket.io-express-session');
        
        io.use( ios( session ) ); // same session than express
    
        /* middleware    
        io.use( function( socket, next ) {
            return next();
        });
        */
        
        io.sockets.on( "connection", function( socket ) {
        
            logger.trace( "socket io : connection ...");
            
            var user = undefined;
            
            if( socket.handshake ) {
                if( socket.handshake.session ) {
                    if( socket.handshake.session.passport ) {
                        if( socket.handshake.session.passport.user ) {
                            user = socket.handshake.session.passport.user;
                        }
                    }
                }
            }
        
            if( user == undefined ) {
                logger.error( "socket io : requester not authentified on passport");
                return new Error('Authentication failed');
            }
            else {
                
                // store the reference of the socket obj for { this lsessionid and this socket.id }
                
                var id = user + '@' + socket.id;
                me.activeSessions[ id ] = socket;
                socket.myId = id; // on le stocke aussi dans l'objet socket pour gérer la déconnexion
                
                var count = Object.keys(me.activeSessions).length;
                
                //logger.trace( "socket.handshake.session.passport.user (lsessionid) =%s socket.id =%s, now active io session count =%d", user, socket.id, count );
                logger.trace( "storing %s, now active io session count = %d", socket.myId, count );
                
                socket.on("disconnect", function( data ) {
                    
                    logger.trace("socket io : disconnect ...");
                    
                    delete me.activeSessions[ socket.myId ]; // supprime la session enregistée (propriété de l'objet)
                    
                    var count = Object.keys(me.activeSessions).length;
                    logger.trace( "socket io : deleting %s , now active session count = %d", socket.myId, count );
                });
            }
        });
        
        callback( this );
    };
}

logger.info( "socket io manager object created." );

var sio = new socketIoMgr();  // construction de l'objet pour la gestion des socket io

module.exports = function() {
    return sio; // retourne l'instance crée
};

