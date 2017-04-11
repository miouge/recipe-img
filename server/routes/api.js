
var logger = require("../logger")(); // logger iséo
var express = require('express');
var router = express.Router();
var models = require('../models/db_api');
var auth = require("./auth.js");
var util = require('../util');
var compression = require('compression');

// define the home page route (based on .../api )

//------------------------------------------------

router.all( '*', auth.requireAuthenticationD );

// ----------------------- API TECHNIQUES  ----------------------

// enregistrement de statistique
var recordStatistics = function() {

    console.log( "starting timer to display statistics usage of api each hour..." );
    
    var statistics = {};
    
    setInterval( function(){
        logger.trace( "api usage statistics : %j", statistics );
    }, 60 * 60000 );
    
    // all requests to this router will first hit this middleware
    router.use( function(req, res, next) {
        
        //logger.trace('<<api route>> : %s %s %s', req.method, req.url, req.path );
        
        var api = req.path.substring(1);
        
        // recording api usage statistics ...
        if( statistics[ api ] == undefined )
        {
            statistics[ api ] = 1;
        }
        else
        {
            statistics[ api ] = statistics[ api ] + 1;
        }
        
        next();
    });
    
    router.get( '/statistics', function(req, res) {
    
        delete statistics[ "statistics" ];
        util.wrapAnswer( req.query.callback, res, { "statistics" : statistics } , 200 );
        // raz
        statistics = {};
    });
};
//recordStatistics();

// simulation de fuite mémoire
var testMemoryLeak = function() {

    console.log( "starting fake memory leak on api ..." );

    var memwatch = require('memwatch-next');
    
    //var hd = new memwatch.HeapDiff();
    
    // When V8 performs a garbage collection (technically, we're talking about a full GC with heap compaction), memwatch will emit a stats event.
    // V8 has its own idea of when it's best to perform a GC, and under a heavy load, it may defer this action for some time. 
    memwatch.on('stats', function( stats ) {
        logger.warn(  'GC detected : ', stats );
        console.error('GC detected : ', stats );
        
        //var diff = hd.end(); // heapdiff
    });
    
    // listener for the ‘leak’ event:
    // A leak event will be emitted when your heap usage has increased for five consecutive garbage collections
    memwatch.on('leak', function(info) {
        logger.warn(  'Memory leak detected : ', info );
        console.error('Memory leak detected : ', info );
        process.exit(1);
    });

    // setInterval( function(){
    //     logger.warn( "force V8 to operate garbage collection");
    //     memwatch.gc();
    // }, 2 * 60000 );

    var memleak = [];

    // all requests to this router will first hit this middleware
    router.use( function(req, res, next) {
        
        // simulation d'une fuite mémoire
        //memleak.push(function() { return req.headers; });
        
        next();
    });
};
//testMemoryLeak();

// ----------------------- API SPECIFIQUES  ----------------------

router.get( '/userinfo', function(req, res) {

    models.getUserInfo( req.user,
        function( json, status ) {
        util.wrapAnswer( req.query.callback, res, json, status );
    });

});

router.get( '/physicals', function(req, res) {

    models.getPhysicals( req.user,
        function( json, status ) {
        util.wrapAnswer( req.query.callback, res, json, status );
    });

});

router.get( '/timezones', function(req, res) {

    models.getTimezones( req.user,
        function( json, status ) {
        util.wrapAnswer( req.query.callback, res, json, status );
    });
});

router.get( '/equipment_models', function(req, res) {

    models.getEquipmentModels( req.user,
        function( json, status ) {
        util.wrapAnswer( req.query.callback, res, json, status );
    });
});

router.get( '/languages', function(req, res) {

    models.getLanguages( req.user,
        function( json, status ) {
        util.wrapAnswer( req.query.callback, res, json, status );
    });
});

router.get( '/sites', function(req, res) {

    models.getSites( req.user,
        function( json, status ) {
        util.wrapAnswer( req.query.callback, res, json, status );
    });

});

router.get( '/measures', function(req, res) {

    models.getMeasures( req.user,
        function( json, status ) {
        util.wrapAnswer( req.query.callback, res, json, status );
    });

});

router.get( '/lastfla', function(req, res) {

    models.getLastFla( req.user,
        function( json, status ) {
        util.wrapAnswer( req.query.callback, res, json, status );
    });

});

router.get( '/equipmentfla', function(req, res) {

    models.getEquipmentFla( req.user,
        function( json, status ) {
        util.wrapAnswer( req.query.callback, res, json, status );
    });

});

router.get( '/histodata', compression() ); // reply gzip encoded
router.get( '/histodata', function(req, res) {

    models.getHistoData( req.user, req.query.idaggrs, req.query.start, req.query.end,
        function( json, status ) {
        util.wrapAnswer( req.query.callback, res, json, status );
    });
});

router.get( '/chartaggreg', function(req, res) {

    models.getChartAggreg( req.user,
        function( json, status ) {
        util.wrapAnswer( req.query.callback, res, json, status );
    });
});

// ------------------ ACCES A CERTAINES TABLES ------------------

function tableGate( req, res ) {
    
    logger.trace( "tableGate >> req.route.path=%s req.method=%s", req.route.path, req.method );

    // on stocke en tant que nouvelle propriété dans la requete le nom suposé de la table
    req.table = req.route.path.substring(1);
    
    // le module à charger dépend de la table à accéder
    var module = require('../models' + req.route.path +'.js' ); 
    
    var jsonP;
    
    if( req.method == 'GET' )
    {
        if( req.query != undefined )
        {
            if( req.query.action != undefined )
            {
                // traitement des redirections pour les requête jsonp de type get avec le paramètre action positionné
                
                switch( req.query.action )
                {
                    case "create" :  { jsonP ="POST"  ; logger.trace( "tableGate >> req.query.action=%s", req.query.action ); break; }
                    case "update" :  { jsonP ="PUT"   ; logger.trace( "tableGate >> req.query.action=%s", req.query.action ); break; }
                    case "delete" :  { jsonP ="DELETE"; logger.trace( "tableGate >> req.query.action=%s", req.query.action ); break; }
                    default       :  { break; }
                }
            }
        }
        
        if( jsonP == undefined )
        {
            if( module.tableSelect != undefined )
            {
                module.tableSelect( req, function( json, status ) {
                    util.wrapAnswer( req.query.callback, res, json, status );
                });
                return;
            }
        }
    }

    if(( req.method == 'POST' )||( jsonP == "POST" ))
    {
        if( module.tableInsert != undefined )
        {
            module.tableInsert( req, function( json, status ) {
                util.wrapAnswer( req.query.callback, res, json, status );
            });
            return;
        }
    }

    if(( req.method == 'PUT' )||( jsonP == "PUT" ))
    {
        if( module.tableUpdate != undefined )
        {
            module.tableUpdate( req, function( json, status ) {
                util.wrapAnswer( req.query.callback, res, json, status );
            });
            return;
        }
    }

    if(( req.method == 'DELETE' )||( jsonP == "DELETE" ))
    {
        if( module.tableDelete != undefined )
        {
            module.tableDelete( req, function( json, status ) {
                util.wrapAnswer( req.query.callback, res, json, status );
            });
            return;
        }
    }
    
    // si on arrive jusqu'ici : alors methode non traitée
    util.wrapAnswer( req.query.callback, res, {}, 404 );
}

router.all( '/customer', tableGate );

router.all( '/equipment_assignment', tableGate );

router.all( '/login', tableGate );

router.all( '/measure', tableGate );

router.all( '/aggreg', tableGate );

router.all( '/site', tableGate );

// ---------------------------------------------

module.exports = router;