
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

//router.all('*', auth.requireAuthentication );
//router.use(compression()); // reply will be gzip encoded

//------------------------------------------------

/* static serving of the backbone SPA */
var path = '../client/backbone';

router.use('/', express.static( path ));

logger.info( "appli path [%s]", path );
console.log( "appli path [%s]", path );

module.exports = router;