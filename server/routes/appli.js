
var express = require('express');
var router = express.Router();
var compression = require('compression');

// define the home page route (based on .../appli )

//------------------------------------------------

// simple logger for this router's requests
// all requests to this router will first hit this middleware
router.use( function(req, res, next) {
    //logger.trace('<<appli route>> : sessionID = %s remote_ip =%s', req.sessionID, req._remoteAddress );
    next();
});

var logger = require("../logger")(); // logger iséo
var auth = require("./auth.js");

router.all('*', auth.requireAuthentication );
router.use(compression()); // reply will be gzip encoded

//------------------------------------------------

/* Répertoire statique pour les sources ExtJs de l'appli */

// toggle manually this switch
//var version = 'production';
var version = 'testing';

if( version == 'production' )
{
    var path = '../../client/build/production';
}
else
{
    var path = '../../client/build/testing';
}

router.use('/', express.static( path ));

logger.info( "extjs appli path [%s]", path );
console.log( "extjs appli path [%s]", path );

module.exports = router;