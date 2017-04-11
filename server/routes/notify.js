
var logger = require("../logger")(); // logger iséo
var express = require('express');
var router = express.Router();
var modelsG = require('../models/db_api');
//var modelsA = require('../models/db_auth');
var sio = require('../socket_io')();

// define the home page route (based on .../notify )

//------------------------------------------------

// simple logger for this router's requests
// all requests to this router will first hit this middleware
router.use( function(req, res, next) {
    //logger.trace('<<notify route>> : %s %s %s', req.method, req.url, req.path );
    next();
});

router.post( '/integration', function( req, res ) {
    
    //logger.trace( "incoming integration notify post ... rcv %j", req.body.idsite );

    res.end("nodeJs acknowledge : notify received.\n"); // réponse
    
    if( req.body.idsite != undefined ) {
        
        //logger.trace("integration notify received : this one list %d site(s)", req.body.idsite.length );
            
        if( req.body.idsite.length > 0 ) {
            
            /* on liste les lsessionid des users connectés qui faudrait notifier */
            
            modelsG.getNotifyTarget( req.body.idsite, function( lsessionids ) {
         
                lsessionids.forEach( function( item, index, array ) {
                        
                    // pour chaque session user a notifier, on essaie de relayer la notification par socket IO
                    sio.send( item.lsessionid,
                        { notification : "newfla" }, // objet envoyé, l'attribut timestamp est rajouté dans la fonction send()
                        function()  {
                        
                            // the lsessionid is not associated to any socket io link
                            // purge the session table from this lsessionid
                            // no don't do it because the socket link can just be broken
                            // modelsA.destroySession( item.lsessionid, function() {} );
                    }); 
                });
            });
        }
    }
});

router.post( '/alert', function( req, res ) {
    
    logger.trace( "incoming alert notify post ... rcv %j", req.body.idsite );

    res.end("nodeJs acknowledge : notify received.\n"); // réponse
    
    if( req.body.idsite != undefined ) {
        
        //logger.trace("integration notify received : this one list %d site(s)", req.body.idsite.length );
            
        if( req.body.idsite.length > 0 ) {
            
            /* on liste les lsessionid des users connectés qui faudrait notifier */
            
            modelsG.getNotifyTarget( req.body.idsite, function( lsessionids ) {
         
                lsessionids.forEach( function( item, index, array ) {
                        
                    // pour chaque session user a notifier, on essaie de relayer la notification par socket IO
                    sio.send( item.lsessionid,
                        { notification : "newalert" }, // objet envoyé, l'attribut timestamp est rajouté dans la fonction send()
                        function()  {
                        
                            // the lsessionid is not associated to any socket io link
                            // purge the session table from this lsessionid
                            // no don't do it because the socket link can just be broken
                            // modelsA.destroySession( item.lsessionid, function() {} );
                    }); 
                });
            });
        }
    }
});

router.post( '/creation', function( req, res ) {
    
    logger.trace( "incoming creation notify post ... rcv %j", req.body.idsite );

    res.end("nodeJs acknowledge : notify received.\n"); // réponse
    
    if( req.body.idsite != undefined ) {
        
        //logger.trace("integration notify received : this one list %d site(s)", req.body.idsite.length );
            
        if( req.body.idsite.length > 0 ) {
            
            /* on liste les lsessionid des users connectés qui faudrait notifier */
            
            modelsG.getNotifyTarget( req.body.idsite, function( lsessionids ) {
         
                lsessionids.forEach( function( item, index, array ) {
                        
                    // pour chaque session user a notifier, on essaie de relayer la notification par socket IO
                    sio.send( item.lsessionid,
                        { notification : "newmeas" }, // objet envoyé, l'attribut timestamp est rajouté dans la fonction send()
                        function()  {
                        
                            // the lsessionid is not associated to any socket io link
                            // purge the session table from this lsessionid
                            // no don't do it because the socket link can just be broken
                            // modelsA.destroySession( item.lsessionid, function() {} );
                    }); 
                });
            });
        }
    }
});

module.exports = router;